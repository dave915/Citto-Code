import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildHtmlPreviewDocument,
  buildSuggestedSavePath,
  getFileName,
  getPreviewMinimumHeight,
  injectHtmlPreviewBridge,
  inlineHtmlPreviewAssets,
  isViewportSizedPreview,
} from './htmlPreviewDocument'

type HtmlPreviewMessagePayload = {
  __claudeHtmlPreview?: unknown
  previewId?: unknown
  height?: unknown
  action?: unknown
}

type UseHtmlPreviewControllerOptions = {
  html: string
  path?: string | null
}

export function useHtmlPreviewController({
  html,
  path,
}: UseHtmlPreviewControllerOptions) {
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
    if (typeof window === 'undefined') return undefined

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!event.data || typeof event.data !== 'object') return

      const payload = event.data as HtmlPreviewMessagePayload
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
    if (!isFullscreen || typeof document === 'undefined' || typeof window === 'undefined') return undefined

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

  const handleDownload = useCallback(async () => {
    await window.claude.saveTextFile({
      suggestedName: getFileName(path),
      defaultPath: buildSuggestedSavePath(path),
      content: documentHtml,
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    })
  }, [documentHtml, path])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((value) => !value)
  }, [])

  return {
    documentHtml,
    frameHeight,
    iframeRef,
    isFullscreen,
    srcDoc,
    handleDownload,
    toggleFullscreen,
  }
}
