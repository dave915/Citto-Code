import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../hooks/useI18n'

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

function getFileName(filePath: string | null | undefined): string {
  const normalized = filePath?.replace(/\\/g, '/').trim() ?? ''
  if (!normalized) return 'html-preview.html'
  const lastSegment = normalized.split('/').filter(Boolean).pop() ?? 'html-preview.html'
  return lastSegment.toLowerCase().endsWith('.html') || lastSegment.toLowerCase().endsWith('.htm')
    ? lastSegment
    : `${lastSegment}.html`
}

function buildSuggestedSavePath(filePath: string | null | undefined): string | undefined {
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

function isViewportSizedPreview(html: string): boolean {
  const normalized = normalizeNewlines(html)
  const hasViewportHeight = /(?:min-height|height)\s*:\s*100(?:d|s|l)?vh/i.test(normalized)
  const hasFixedLayout = /position\s*:\s*fixed/i.test(normalized) || /inset\s*:\s*0/i.test(normalized)
  const hidesOverflow = /overflow\s*:\s*hidden/i.test(normalized)
  return hasViewportHeight && (hasFixedLayout || hidesOverflow)
}

function getPreviewMinimumHeight(isViewportLayout: boolean, windowHeight: number): number {
  if (!isViewportLayout) return 420
  if (!windowHeight || !Number.isFinite(windowHeight)) return 620
  return Math.max(560, Math.min(Math.round(windowHeight * 0.72), 920))
}

export function HtmlPreview({
  html,
  path,
}: {
  html: string
  path?: string | null
}) {
  const { language } = useI18n()
  const isMacOs = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const previewIdRef = useRef(`html-preview-${Math.random().toString(36).slice(2)}`)
  const isViewportLayout = useMemo(() => isViewportSizedPreview(html), [html])
  const [windowHeight, setWindowHeight] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 0))
  const minimumFrameHeight = useMemo(
    () => getPreviewMinimumHeight(isViewportLayout, windowHeight),
    [isViewportLayout, windowHeight],
  )
  const [frameHeight, setFrameHeight] = useState(minimumFrameHeight)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fallbackDocument = useMemo(
    () => buildHtmlPreviewDocument(html, path),
    [html, path],
  )
  const [documentHtml, setDocumentHtml] = useState(fallbackDocument)
  const srcDoc = useMemo(
    () => injectHtmlPreviewBridge(documentHtml, previewIdRef.current),
    [documentHtml],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const updateWindowHeight = () => {
      setWindowHeight(window.innerHeight)
    }

    updateWindowHeight()
    window.addEventListener('resize', updateWindowHeight)
    return () => window.removeEventListener('resize', updateWindowHeight)
  }, [])

  useEffect(() => {
    let cancelled = false
    setDocumentHtml(fallbackDocument)
    setFrameHeight(minimumFrameHeight)

    void inlineHtmlPreviewAssets(html, path)
      .then((nextSrcDoc) => {
        if (!cancelled) setDocumentHtml(nextSrcDoc)
      })
      .catch(() => {
        if (!cancelled) setDocumentHtml(fallbackDocument)
      })

    return () => {
      cancelled = true
    }
  }, [fallbackDocument, html, minimumFrameHeight, path])

  useEffect(() => {
    setFrameHeight((current) => (current < minimumFrameHeight ? minimumFrameHeight : current))
  }, [minimumFrameHeight])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!event.data || typeof event.data !== 'object') return

      const payload = event.data as {
        __claudeHtmlPreview?: unknown
        previewId?: unknown
        height?: unknown
        action?: unknown
      }

      if (payload.__claudeHtmlPreview !== true) return
      if (payload.previewId !== previewIdRef.current) return
      if (payload.action === 'escape') {
        setIsFullscreen(false)
        return
      }

      const nextHeight = typeof payload.height === 'number' ? payload.height : Number(payload.height)
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return
      setFrameHeight(Math.max(minimumFrameHeight, Math.min(Math.ceil(nextHeight), 1600)))
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [minimumFrameHeight])

  useEffect(() => {
    if (!isFullscreen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isFullscreen])

  const handleDownload = async () => {
    await window.claude.saveTextFile({
      suggestedName: getFileName(path),
      defaultPath: buildSuggestedSavePath(path),
      content: documentHtml,
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    })
  }

  const previewTitle = language === 'en' ? 'Live HTML preview' : 'HTML 실행 미리보기'
  const downloadLabel = language === 'en' ? 'Download code' : '코드 다운로드'
  const openLabel = language === 'en' ? 'Open in browser' : '브라우저에서 열기'
  const maximizeLabel = isFullscreen
    ? (language === 'en' ? 'Exit fullscreen' : '최대화 해제')
    : (language === 'en' ? 'Maximize' : '최대화')

  const renderHeaderActions = () => (
    <div className="no-drag flex flex-shrink-0 items-center gap-2" data-no-drag="true">
      <button
        type="button"
        onClick={() => { void handleDownload() }}
        className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
      >
        {downloadLabel}
      </button>
      {path ? (
        <button
          type="button"
          onClick={() => { void window.claude.openInBrowser(path) }}
          className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
        >
          {openLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setIsFullscreen((value) => !value)}
        className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
      >
        {maximizeLabel}
      </button>
    </div>
  )

  const renderHeader = (fullscreen: boolean) => {
    if (fullscreen) {
      return (
        <div className="draggable-region flex h-12 items-center gap-2 border-b border-claude-border/70 bg-claude-panel px-4">
          {isMacOs ? <div className="w-[52px] flex-shrink-0" aria-hidden="true" /> : null}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-claude-text/90">{previewTitle}</div>
          </div>
          {renderHeaderActions()}
        </div>
      )
    }

    return (
      <div className="draggable-region flex items-center justify-between gap-3 border-b border-claude-border/70 bg-claude-panel px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-claude-text/90">{previewTitle}</div>
        </div>
        {renderHeaderActions()}
      </div>
    )
  }

  const renderIframe = (fullscreen: boolean) => (
    <iframe
      ref={iframeRef}
      title={path ? `${path} preview` : 'html-preview'}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-modals"
      style={fullscreen ? undefined : { height: `${frameHeight}px` }}
      className={fullscreen ? 'block h-full w-full bg-white' : 'block w-full bg-white'}
    />
  )

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-claude-border/70 bg-claude-bg">
        {renderHeader(false)}
        {!isFullscreen ? renderIframe(false) : null}
      </div>

      {isFullscreen && typeof document !== 'undefined'
        ? createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col bg-claude-bg">
            {renderHeader(true)}
            <div className="min-h-0 flex-1 bg-white">
              {renderIframe(true)}
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}
