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

export function injectHtmlPreviewBridge(documentHtml: string, previewId: string, previewPath: string | null): string {
  const bridgeScript = `<script>
(() => {
  const previewId = ${JSON.stringify(previewId)};
  const previewPath = ${JSON.stringify(previewPath)};
  let rafId = 0;
  let hoveredElement = null;
  let hoveredOutline = '';
  let hoveredOutlineOffset = '';
  let hoveredBoxShadow = '';
  let selectionEnabled = false;
  let emphasizedKey = null;
  let emphasizedElement = null;
  let emphasizedAnimation = null;
  const selectedElements = new Map();
  const prefersReducedMotion = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  const HOVER_OUTLINE = '2px solid #12d64f';
  const SELECTED_OUTLINE = '2px solid #12d64f';
  const SELECTED_OUTLINE_OFFSET = '2px';
  const SELECTED_BOX_SHADOW = '0 0 0 4px rgba(18, 214, 79, 0.18)';
  const MUTED_SELECTED_OUTLINE = '1px solid rgba(18, 214, 79, 0.40)';
  const MUTED_SELECTED_BOX_SHADOW = '0 0 0 2px rgba(18, 214, 79, 0.08)';
  const EMPHASIZED_SELECTED_OUTLINE = '2px solid #12d64f';
  const EMPHASIZED_SELECTED_BOX_SHADOW = '0 0 0 4px rgba(18, 214, 79, 0.20), 0 0 14px 4px rgba(18, 214, 79, 0.18)';
  const EMPHASIZED_SELECTED_BOX_SHADOW_PEAK = '0 0 0 5px rgba(18, 214, 79, 0.26), 0 0 18px 6px rgba(18, 214, 79, 0.22)';

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

  const captureInlineStyles = (element) => ({
    outline: element.style.outline,
    outlineOffset: element.style.outlineOffset,
    boxShadow: element.style.boxShadow,
  });

  const restoreInlineStyles = (element, styles) => {
    element.style.outline = styles.outline;
    element.style.outlineOffset = styles.outlineOffset;
    element.style.boxShadow = styles.boxShadow;
  };

  const findSelectedEntryByElement = (element) => {
    for (const entry of selectedElements.values()) {
      if (entry.element === element) return entry;
    }
    return null;
  };

  const paintSelectedElement = (element) => {
    element.style.outline = SELECTED_OUTLINE;
    element.style.outlineOffset = SELECTED_OUTLINE_OFFSET;
    element.style.boxShadow = SELECTED_BOX_SHADOW;
  };

  const paintMutedSelectedElement = (element) => {
    element.style.outline = MUTED_SELECTED_OUTLINE;
    element.style.outlineOffset = '2px';
    element.style.boxShadow = MUTED_SELECTED_BOX_SHADOW;
  };

  const paintEmphasizedSelectedElement = (element) => {
    element.style.outline = EMPHASIZED_SELECTED_OUTLINE;
    element.style.outlineOffset = '3px';
    element.style.boxShadow = EMPHASIZED_SELECTED_BOX_SHADOW;
  };

  const paintCurrentSelectionStates = () => {
    for (const [key, entry] of selectedElements.entries()) {
      if (!entry.element || !entry.element.isConnected) continue;
      if (emphasizedKey && key === emphasizedKey) {
        paintEmphasizedSelectedElement(entry.element);
        continue;
      }
      if (emphasizedKey) {
        paintMutedSelectedElement(entry.element);
        continue;
      }
      paintSelectedElement(entry.element);
    }
  };

  const isOutsideViewport = (element) => {
    if (!element || typeof element.getBoundingClientRect !== 'function') return false;
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    return (
      rect.bottom <= 0
      || rect.top >= viewportHeight
      || rect.right <= 0
      || rect.left >= viewportWidth
    );
  };

  const stopEmphasis = () => {
    if (emphasizedAnimation) {
      emphasizedAnimation.cancel();
      emphasizedAnimation = null;
    }
    emphasizedElement = null;
    paintCurrentSelectionStates();
  };

  const syncEmphasizedSelection = () => {
    stopEmphasis();
    if (!emphasizedKey) return;

    const selectedEntry = selectedElements.get(emphasizedKey);
    if (!selectedEntry || !selectedEntry.element || !selectedEntry.element.isConnected) return;

    emphasizedElement = selectedEntry.element;
    if (isOutsideViewport(emphasizedElement)) {
      emphasizedElement.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
    paintCurrentSelectionStates();

    if (!prefersReducedMotion && typeof emphasizedElement.animate === 'function') {
      emphasizedAnimation = emphasizedElement.animate(
        [
          {
            outlineOffset: '3px',
            boxShadow: EMPHASIZED_SELECTED_BOX_SHADOW,
          },
          {
            outlineOffset: '5px',
            boxShadow: EMPHASIZED_SELECTED_BOX_SHADOW_PEAK,
          },
          {
            outlineOffset: '3px',
            boxShadow: EMPHASIZED_SELECTED_BOX_SHADOW,
          },
        ],
        {
          duration: 700,
          iterations: 2,
          easing: 'ease-out',
          fill: 'forwards',
        }
      );
    }
  };

  const clearHover = () => {
    if (!hoveredElement) return;
    const selectedEntry = findSelectedEntryByElement(hoveredElement);
    if (selectedEntry) {
      if (selectedElements.get(emphasizedKey)?.element === hoveredElement) {
        paintEmphasizedSelectedElement(hoveredElement);
      } else if (emphasizedKey) {
        paintMutedSelectedElement(hoveredElement);
      } else {
        paintSelectedElement(hoveredElement);
      }
    } else {
      hoveredElement.style.outline = hoveredOutline;
      hoveredElement.style.outlineOffset = hoveredOutlineOffset;
      hoveredElement.style.boxShadow = hoveredBoxShadow;
    }
    hoveredElement = null;
    hoveredOutline = '';
    hoveredOutlineOffset = '';
    hoveredBoxShadow = '';
  };

  const setHoveredElement = (element) => {
    if (!element || hoveredElement === element) return;
    if (findSelectedEntryByElement(element)) {
      clearHover();
      return;
    }
    clearHover();
    hoveredElement = element;
    hoveredOutline = element.style.outline;
    hoveredOutlineOffset = element.style.outlineOffset;
    hoveredBoxShadow = element.style.boxShadow;
    element.style.outline = HOVER_OUTLINE;
    element.style.outlineOffset = SELECTED_OUTLINE_OFFSET;
    element.style.boxShadow = '';
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

  const buildSelectionKey = (elementInfo) => [
    previewPath || '',
    elementInfo.pathHint || '',
    elementInfo.selector || '',
    elementInfo.tagName || '',
    elementInfo.id || '',
    elementInfo.href || '',
  ].join('::');

  const buildPathHint = (element) => {
    if (!document.body) return null;
    const parts = [];
    let current = element;
    while (current && current !== document.body && current.parentElement) {
      const parent = current.parentElement;
      const index = Array.prototype.indexOf.call(parent.children, current);
      if (index < 0) return null;
      parts.unshift(String(index));
      current = parent;
    }
    return parts.length > 0 ? parts.join('/') : null;
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
    const elementInfo = {
      selector: buildSelector(element),
      pathHint: buildPathHint(element),
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: typeof element.className === 'string' && element.className.trim() ? element.className.trim() : null,
      text: normalizeText(element.innerText || element.textContent || ''),
      href: typeof element.getAttribute === 'function' ? (element.getAttribute('href') || element.getAttribute('src') || null) : null,
      ariaLabel: typeof element.getAttribute === 'function' ? (element.getAttribute('aria-label') || null) : null,
    };
    parent.postMessage({
      __claudeHtmlPreview: true,
      previewId,
      action: 'element-selected',
      element: elementInfo,
    }, '*');
    return {
      key: buildSelectionKey(elementInfo),
      ...elementInfo,
    };
  };

  const removeSelectedKey = (key) => {
    const selectedEntry = selectedElements.get(key);
    if (!selectedEntry) return;
    if (emphasizedKey === key) {
      emphasizedKey = null;
      stopEmphasis();
    }
    if (hoveredElement === selectedEntry.element) {
      hoveredElement = null;
      hoveredOutline = '';
      hoveredOutlineOffset = '';
      hoveredBoxShadow = '';
    }
    if (selectedEntry.element && selectedEntry.element.isConnected) {
      restoreInlineStyles(selectedEntry.element, selectedEntry.styles);
    }
    selectedElements.delete(key);
  };

  const applySelectedElement = (key, element) => {
    const currentEntry = selectedElements.get(key);
    if (currentEntry && currentEntry.element === element) {
      paintCurrentSelectionStates();
      return;
    }
    if (currentEntry) {
      removeSelectedKey(key);
    }
    selectedElements.set(key, {
      element,
      styles: captureInlineStyles(element),
    });
    paintCurrentSelectionStates();
    if (emphasizedKey === key) {
      syncEmphasizedSelection();
    }
  };

  const resolveSelectionElement = (selection) => {
    if (!selection || typeof selection.selector !== 'string') return null;

    if (typeof selection.pathHint === 'string' && selection.pathHint) {
      let current = document.body;
      const segments = selection.pathHint.split('/');
      for (const segment of segments) {
        const index = Number(segment);
        if (!current || !Number.isInteger(index) || index < 0 || index >= current.children.length) {
          current = null;
          break;
        }
        const next = current.children[index];
        current = next instanceof HTMLElement ? next : null;
      }
      if (current instanceof HTMLElement) {
        return current;
      }
    }

    const candidates = Array.from(document.querySelectorAll(selection.selector)).filter((candidate) => candidate instanceof HTMLElement);
    if (candidates.length === 0) return null;

    const expectedText = normalizeText(selection.text);
    const expectedHref = typeof selection.href === 'string' ? selection.href : null;
    const expectedClassName = typeof selection.className === 'string' ? selection.className.trim() : null;
    const expectedId = typeof selection.id === 'string' ? selection.id : null;
    const expectedTagName = typeof selection.tagName === 'string' ? selection.tagName.toLowerCase() : null;

    return candidates.find((candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      if (expectedTagName && candidate.tagName.toLowerCase() !== expectedTagName) return false;
      if (expectedId && candidate.id !== expectedId) return false;
      if (expectedClassName) {
        const candidateClassName = typeof candidate.className === 'string' ? candidate.className.trim() : '';
        if (candidateClassName !== expectedClassName) return false;
      }
      if (expectedHref) {
        const candidateHref = candidate.getAttribute('href') || candidate.getAttribute('src') || null;
        if (candidateHref !== expectedHref) return false;
      }
      if (expectedText) {
        const candidateText = normalizeText(candidate.innerText || candidate.textContent || '');
        if (candidateText !== expectedText) return false;
      }
      return true;
    }) || candidates[0] || null;
  };

  const syncSelectedElements = (nextSelections) => {
    const nextItems = Array.isArray(nextSelections) ? nextSelections : [];
    const nextKeys = new Set();

    for (const selection of nextItems) {
      if (!selection || typeof selection !== 'object' || typeof selection.key !== 'string') continue;
      nextKeys.add(selection.key);
      const element = resolveSelectionElement(selection);
      if (!element) {
        removeSelectedKey(selection.key);
        continue;
      }
      applySelectedElement(selection.key, element);
    }

    for (const key of Array.from(selectedElements.keys())) {
      if (!nextKeys.has(key)) {
        removeSelectedKey(key);
      }
    }

    syncEmphasizedSelection();
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
    const selection = postElementSelection(element);
    if (selectedElements.has(selection.key)) {
      removeSelectedKey(selection.key);
      return;
    }
    applySelectedElement(selection.key, element);
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

    if (payload.action === 'sync-selected-elements') {
      syncSelectedElements(payload.elements);
      return;
    }

    if (payload.action === 'highlight-selection') {
      emphasizedKey = typeof payload.key === 'string' && payload.key ? payload.key : null;
      syncEmphasizedSelection();
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
