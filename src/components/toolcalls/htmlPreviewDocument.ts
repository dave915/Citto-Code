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

export function injectHtmlPreviewBridge(documentHtml: string, previewId: string): string {
  const bridgeScript = `<script>
(() => {
  const previewId = ${JSON.stringify(previewId)};
  let rafId = 0;

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
    postEscape();
  };

  window.addEventListener('load', scheduleMeasure);
  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('DOMContentLoaded', scheduleMeasure);
  window.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keydown', handleKeyDown, true);

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
