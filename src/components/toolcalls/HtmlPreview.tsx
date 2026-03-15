import { useEffect, useMemo, useRef, useState } from 'react'

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

function buildHtmlPreviewDocument(html: string, filePath: string | null | undefined): string {
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

function injectHtmlPreviewBridge(documentHtml: string, previewId: string): string {
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

  window.addEventListener('load', scheduleMeasure);
  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('DOMContentLoaded', scheduleMeasure);

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

async function inlineHtmlPreviewAssets(html: string, filePath: string | null | undefined): Promise<string> {
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

export function HtmlPreview({
  html,
  path,
}: {
  html: string
  path?: string | null
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const previewIdRef = useRef(`html-preview-${Math.random().toString(36).slice(2)}`)
  const [frameKey, setFrameKey] = useState(0)
  const [frameHeight, setFrameHeight] = useState(420)
  const fallbackSrcDoc = useMemo(
    () => injectHtmlPreviewBridge(buildHtmlPreviewDocument(html, path), previewIdRef.current),
    [html, path],
  )
  const [srcDoc, setSrcDoc] = useState(fallbackSrcDoc)

  useEffect(() => {
    let cancelled = false
    setSrcDoc(fallbackSrcDoc)
    setFrameHeight(420)

    void inlineHtmlPreviewAssets(html, path)
      .then((nextSrcDoc) => {
        if (!cancelled) setSrcDoc(injectHtmlPreviewBridge(nextSrcDoc, previewIdRef.current))
      })
      .catch(() => {
        if (!cancelled) setSrcDoc(fallbackSrcDoc)
      })

    return () => {
      cancelled = true
    }
  }, [fallbackSrcDoc, html, path])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!event.data || typeof event.data !== 'object') return

      const payload = event.data as {
        __claudeHtmlPreview?: unknown
        previewId?: unknown
        height?: unknown
      }

      if (payload.__claudeHtmlPreview !== true) return
      if (payload.previewId !== previewIdRef.current) return

      const nextHeight = typeof payload.height === 'number' ? payload.height : Number(payload.height)
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return
      setFrameHeight(Math.max(420, Math.min(Math.ceil(nextHeight), 1600)))
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <div className="overflow-hidden rounded-lg border border-claude-border/70 bg-claude-bg">
      <div className="flex items-center justify-between gap-3 border-b border-claude-border/70 bg-claude-panel px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-claude-text/90">HTML 실행 미리보기</div>
        </div>
        <div className="flex items-center gap-2">
          {path ? (
            <button
              type="button"
              onClick={() => { void window.claude.openInBrowser(path) }}
              className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
            >
              브라우저에서 열기
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setFrameKey((value) => value + 1)}
            className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
          >
            다시 실행
          </button>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        key={frameKey}
        title={path ? `${path} preview` : 'html-preview'}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-forms allow-modals"
        style={{ height: `${frameHeight}px` }}
        className="block w-full bg-white"
      />
    </div>
  )
}
