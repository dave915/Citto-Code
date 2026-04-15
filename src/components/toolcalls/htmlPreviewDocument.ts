function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[a-z]:\//i.test(normalized)) return `file:///${encodeURI(normalized)}`
  if (normalized.startsWith('/')) return `file://${encodeURI(normalized)}`
  return `file:///${encodeURI(normalized)}`
}

function getBaseHref(filePath: string | null | undefined): string | null {
  if (!filePath) return null
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  const directoryPath = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : normalized
  return toFileUrl(directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`)
}

function getRemoteBaseHref(previewUrl: string): string {
  try {
    return new URL('.', previewUrl).toString()
  } catch {
    return previewUrl
  }
}

function isInlineBlockedUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    !normalized ||
    normalized.startsWith('#') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('javascript:') ||
    normalized.startsWith('http:') ||
    normalized.startsWith('https:')
  )
}

function fileUrlToPath(url: URL): string | null {
  if (url.protocol !== 'file:') return null
  const pathname = decodeURIComponent(url.pathname)
  if (/^\/[a-z]:\//i.test(pathname)) return pathname.slice(1)
  return pathname
}

function resolveLocalPreviewAssetPath(documentPath: string | null | undefined, assetRef: string | null): string | null {
  if (!documentPath || !assetRef || isInlineBlockedUrl(assetRef)) return null
  const baseHref = getBaseHref(documentPath)
  if (!baseHref) return null

  try {
    return fileUrlToPath(new URL(assetRef, baseHref))
  } catch {
    return null
  }
}

export function buildHtmlPreviewDocument(html: string, filePath: string | null | undefined): string {
  const normalizedHtml = normalizeNewlines(html)
  const hasBaseTag = /<base[\s>]/i.test(normalizedHtml)
  const baseHref = getBaseHref(filePath)
  const headAdditions = [
    '<meta charset="utf-8">',
    baseHref && !hasBaseTag ? `<base href="${baseHref}">` : null,
  ].filter(Boolean).join('\n')

  if (/<head[\s>]/i.test(normalizedHtml)) {
    return normalizedHtml.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${headAdditions}`)
  }

  if (/<html[\s>]/i.test(normalizedHtml)) {
    return normalizedHtml.replace(/<html(\s[^>]*)?>/i, (match) => `${match}\n<head>\n${headAdditions}\n</head>`)
  }

  return `<!doctype html>
<html>
  <head>
    ${headAdditions}
  </head>
  <body>
${normalizedHtml}
  </body>
</html>`
}

function isRemoteAssetRefBlocked(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    !normalized ||
    normalized.startsWith('#') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('javascript:') ||
    normalized.startsWith('mailto:') ||
    normalized.startsWith('tel:')
  )
}

function rewriteRemoteAssetValue(value: string, previewUrl: string): string {
  if (isRemoteAssetRefBlocked(value)) return value

  try {
    return new URL(value, previewUrl).toString()
  } catch {
    return value
  }
}

function rewriteRemoteSrcSet(value: string, previewUrl: string): string {
  return value
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim()
      if (!trimmed) return trimmed

      const firstWhitespace = trimmed.search(/\s/)
      if (firstWhitespace < 0) {
        return rewriteRemoteAssetValue(trimmed, previewUrl)
      }

      const urlPart = trimmed.slice(0, firstWhitespace)
      const descriptor = trimmed.slice(firstWhitespace)
      return `${rewriteRemoteAssetValue(urlPart, previewUrl)}${descriptor}`
    })
    .join(', ')
}

export function buildRemoteHtmlPreviewDocument(html: string, previewUrl: string): string {
  const normalizedHtml = normalizeNewlines(html)
  const baseHref = getRemoteBaseHref(previewUrl)

  if (typeof DOMParser === 'undefined') {
    if (/<head[\s>]/i.test(normalizedHtml)) {
      return normalizedHtml.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n<meta charset="utf-8">\n<base href="${baseHref}">`)
    }
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <base href="${baseHref}">
  </head>
  <body>
${normalizedHtml}
  </body>
</html>`
  }

  const parser = new DOMParser()
  const documentNode = parser.parseFromString(normalizedHtml, 'text/html')

  if (!documentNode.querySelector('meta[charset]')) {
    const charsetMeta = documentNode.createElement('meta')
    charsetMeta.setAttribute('charset', 'utf-8')
    documentNode.head.prepend(charsetMeta)
  }

  const existingBase = documentNode.querySelector('base')
  if (existingBase) {
    existingBase.setAttribute('href', baseHref)
  } else {
    const baseElement = documentNode.createElement('base')
    baseElement.setAttribute('href', baseHref)
    documentNode.head.prepend(baseElement)
  }

  const attributeSelectors = [
    '[src]',
    '[href]',
    '[poster]',
    'form[action]',
  ]
  const rewriteTargets = Array.from(documentNode.querySelectorAll<HTMLElement>(attributeSelectors.join(',')))
  for (const element of rewriteTargets) {
    for (const attributeName of ['src', 'href', 'poster', 'action']) {
      const value = element.getAttribute(attributeName)
      if (!value) continue
      element.setAttribute(attributeName, rewriteRemoteAssetValue(value, previewUrl))
    }
  }

  const srcSetTargets = Array.from(documentNode.querySelectorAll<HTMLElement>('[srcset]'))
  for (const element of srcSetTargets) {
    const srcSet = element.getAttribute('srcset')
    if (!srcSet) continue
    element.setAttribute('srcset', rewriteRemoteSrcSet(srcSet, previewUrl))
  }

  return `<!doctype html>\n${documentNode.documentElement.outerHTML}`
}

export function injectHtmlPreviewBridge(documentHtml: string, previewId: string): string {
  const bridgeScript = `<script>
(() => {
  const previewId = ${JSON.stringify(previewId)};
  let rafId = 0;
  let hoveredElement = null;
  let hoveredOutline = '';
  let selectionEnabled = false;

  const escapeSelectorToken = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  };

  const measureHeight = () => {
    const body = document.body;
    const doc = document.documentElement;
    const height = Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      body ? body.clientHeight : 0,
      doc ? doc.scrollHeight : 0,
      doc ? doc.offsetHeight : 0,
      doc ? doc.clientHeight : 0
    );

    parent.postMessage({
      __claudeHtmlPreview: true,
      previewId,
      height,
    }, '*');
  };

  const scheduleMeasure = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      measureHeight();
    });
  };

  const postEscape = () => {
    parent.postMessage({
      __claudeHtmlPreview: true,
      previewId,
      action: 'escape',
    }, '*');
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    if (selectionEnabled) {
      event.preventDefault();
      setSelectionEnabled(false);
      return;
    }
    postEscape();
  };

  const clearHover = () => {
    if (!hoveredElement) return;
    hoveredElement.style.outline = hoveredOutline;
    hoveredElement = null;
    hoveredOutline = '';
  };

  const setHoveredElement = (element) => {
    if (!element || hoveredElement === element) return;
    clearHover();
    hoveredElement = element;
    hoveredOutline = element.style.outline;
    element.style.outline = '2px solid #ff6b35';
  };

  const setSelectionEnabled = (enabled) => {
    selectionEnabled = enabled;
    if (!enabled) {
      clearHover();
    }
    const cursor = enabled ? 'crosshair' : '';
    if (document.documentElement) document.documentElement.style.cursor = cursor;
    if (document.body) document.body.style.cursor = cursor;
  };

  const buildSelector = (element) => {
    if (element.id) return '#' + escapeSelectorToken(element.id);

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 3) {
      const tagName = current.tagName.toLowerCase();
      const className = typeof current.className === 'string' ? current.className.trim() : '';
      const classTokens = className
        ? className.split(/\\s+/).filter(Boolean).slice(0, 2).map((token) => '.' + escapeSelectorToken(token)).join('')
        : '';
      parts.unshift(tagName + classTokens);
      current = current.parentElement;
      if (current && current.id) {
        parts.unshift('#' + escapeSelectorToken(current.id));
        break;
      }
    }
    return parts.join(' > ');
  };

  const normalizeText = (value) => {
    if (typeof value !== 'string') return null;
    const normalized = value.replace(/\\s+/g, ' ').trim();
    return normalized ? normalized.slice(0, 120) : null;
  };

  const postElementSelection = (element) => {
    parent.postMessage({
      __claudeHtmlPreview: true,
      previewId,
      action: 'element-selected',
      element: {
        selector: buildSelector(element),
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        className: typeof element.className === 'string' && element.className.trim() ? element.className.trim() : null,
        text: normalizeText(element.innerText || element.textContent || ''),
        href: typeof element.getAttribute === 'function' ? (element.getAttribute('href') || element.getAttribute('src') || null) : null,
        ariaLabel: typeof element.getAttribute === 'function' ? (element.getAttribute('aria-label') || null) : null,
      },
    }, '*');
  };

  const flashSelection = (element) => {
    const previousOutline = element.style.outline;
    element.style.outline = '2px solid #ff6b35';
    window.setTimeout(() => {
      if (element.isConnected) {
        element.style.outline = previousOutline;
      }
    }, 1200);
  };

  const handlePointerMove = (event) => {
    if (!selectionEnabled) return;
    const element = event.target instanceof HTMLElement ? event.target : null;
    if (!element) return;
    setHoveredElement(element);
  };

  const handleClick = (event) => {
    if (!selectionEnabled) return;
    const element = event.target instanceof HTMLElement ? event.target : null;
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    clearHover();
    flashSelection(element);
    setSelectionEnabled(false);
    postElementSelection(element);
  };

  const handleMessage = (event) => {
    if (event.source !== parent) return;
    const payload = event.data;
    if (!payload || typeof payload !== 'object') return;
    if (payload.__claudeHtmlPreview !== true) return;
    if (payload.previewId !== previewId) return;

    if (payload.action === 'toggle-select-mode') {
      setSelectionEnabled(Boolean(payload.enabled));
      return;
    }

    if (payload.action === 'request-measure') {
      scheduleMeasure();
    }
  };

  window.addEventListener('load', scheduleMeasure);
  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('DOMContentLoaded', scheduleMeasure);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('message', handleMessage);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('mousemove', handlePointerMove, true);
  document.addEventListener('click', handleClick, true);

  if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    document.fonts.ready.then(scheduleMeasure).catch(() => {});
  }

  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    if (document.documentElement) resizeObserver.observe(document.documentElement);
    if (document.body) resizeObserver.observe(document.body);
  }

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }

  setTimeout(scheduleMeasure, 0);
  setTimeout(scheduleMeasure, 120);
  setTimeout(scheduleMeasure, 500);
})();
</script>`

  if (/<\/body>/i.test(documentHtml)) {
    return documentHtml.replace(/<\/body>/i, `${bridgeScript}\n</body>`)
  }

  return `${documentHtml}\n${bridgeScript}`
}

export async function inlineHtmlPreviewAssets(html: string, filePath: string | null | undefined): Promise<string> {
  if (!filePath || typeof DOMParser === 'undefined') {
    return buildHtmlPreviewDocument(html, filePath)
  }

  const initialDocument = buildHtmlPreviewDocument(html, filePath)
  const parser = new DOMParser()
  const documentNode = parser.parseFromString(initialDocument, 'text/html')

  const stylesheetLinks = Array.from(documentNode.querySelectorAll('link[rel="stylesheet"][href]'))
  await Promise.all(
    stylesheetLinks.map(async (link) => {
      const href = link.getAttribute('href')
      const resolvedPath = resolveLocalPreviewAssetPath(filePath, href)
      if (!resolvedPath) return

      const file = await window.claude.readFile(resolvedPath)
      if (!file?.content) return

      const styleElement = documentNode.createElement('style')
      styleElement.setAttribute('data-inline-href', resolvedPath)
      styleElement.textContent = file.content
      link.replaceWith(styleElement)
    }),
  )

  const scriptElements = Array.from(documentNode.querySelectorAll('script[src]'))
  await Promise.all(
    scriptElements.map(async (script) => {
      const src = script.getAttribute('src')
      const resolvedPath = resolveLocalPreviewAssetPath(filePath, src)
      if (!resolvedPath) return

      const file = await window.claude.readFile(resolvedPath)
      if (!file?.content) return

      const inlineScript = documentNode.createElement('script')
      for (const attr of script.getAttributeNames()) {
        if (attr === 'src') continue
        const value = script.getAttribute(attr)
        if (value !== null) inlineScript.setAttribute(attr, value)
      }
      inlineScript.textContent = file.content
      script.replaceWith(inlineScript)
    }),
  )

  return `<!doctype html>\n${documentNode.documentElement.outerHTML}`
}

export function getFileName(filePath: string | null | undefined): string {
  const normalized = filePath?.replace(/\\/g, '/').trim() ?? ''
  if (!normalized) return 'html-preview.html'
  const lastSegment = normalized.split('/').filter(Boolean).pop() ?? 'html-preview.html'
  return lastSegment.toLowerCase().endsWith('.html') || lastSegment.toLowerCase().endsWith('.htm')
    ? lastSegment
    : `${lastSegment}.html`
}

export function buildSuggestedSavePath(filePath: string | null | undefined): string | undefined {
  if (!filePath) return undefined
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return undefined
  const dirPath = normalized.slice(0, lastSlash)
  const fileName = getFileName(filePath)
  const extensionIndex = fileName.lastIndexOf('.')
  const baseName = extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName
  const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : '.html'
  return `${dirPath}/${baseName}-download${extension}`
}

export function isViewportSizedPreview(html: string): boolean {
  const normalized = normalizeNewlines(html)
  const hasViewportHeight = /(?:min-height|height)\s*:\s*100(?:d|s|l)?vh/i.test(normalized)
  const hasFixedLayout = /position\s*:\s*fixed/i.test(normalized) || /inset\s*:\s*0/i.test(normalized)
  const hidesOverflow = /overflow\s*:\s*hidden/i.test(normalized)
  return hasViewportHeight && (hasFixedLayout || hidesOverflow)
}

export function getPreviewMinimumHeight(isViewportLayout: boolean, windowHeight: number): number {
  if (!isViewportLayout) return 420
  if (!windowHeight || !Number.isFinite(windowHeight)) return 620
  return Math.max(560, Math.min(Math.round(windowHeight * 0.72), 920))
}
