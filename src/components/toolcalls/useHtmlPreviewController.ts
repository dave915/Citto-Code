import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HtmlPreviewElementSelection } from '../../lib/toolcalls/types'
import { buildPreviewSelectionKey } from '../chat/chatViewUtils'
import {
  buildHtmlPreviewDocument,
  buildRemoteHtmlPreviewDocument,
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
  enabled?: unknown
  element?: unknown
  elements?: unknown
}

type UseHtmlPreviewControllerOptions = {
  html?: string | null
  path?: string | null
  url?: string | null
  downloadRootPath?: string | null
  onElementSelect?: (payload: HtmlPreviewElementSelection) => void
  selectedElements?: HtmlPreviewElementSelection[]
  hoveredSelectionKey?: string | null
}

function getWatchRootPath(filePath: string | null | undefined): string | null {
  const normalized = filePath?.replace(/\\/g, '/').trim() ?? ''
  if (!normalized) return null
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return null
  return normalized.slice(0, lastSlash) || '/'
}

function isPreviewSelectionPayload(value: unknown): value is Omit<HtmlPreviewElementSelection, 'previewPath'> {
  if (!value || typeof value !== 'object') return false
  return typeof (value as { selector?: unknown }).selector === 'string'
}

export function useHtmlPreviewController({
  html,
  path,
  url,
  downloadRootPath,
  onElementSelect,
  selectedElements = [],
  hoveredSelectionKey = null,
}: UseHtmlPreviewControllerOptions) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const previewIdRef = useRef(`html-preview-${Math.random().toString(36).slice(2)}`)
  const urlLoadTimerRef = useRef<number | null>(null)
  const urlRetryTimerRef = useRef<number | null>(null)
  const [sourceHtml, setSourceHtml] = useState(html ?? '')
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [iframeRenderKey, setIframeRenderKey] = useState(0)
  const previewUrl = url?.trim() || null
  const isUrlPreview = Boolean(previewUrl)
  const [isFrameLoading, setIsFrameLoading] = useState(isUrlPreview)
  const [hasInteractiveUrlDocument, setHasInteractiveUrlDocument] = useState(false)
  const watchRootPath = useMemo(() => getWatchRootPath(path), [path])
  const isViewportLayout = useMemo(
    () => (isUrlPreview ? true : isViewportSizedPreview(sourceHtml)),
    [isUrlPreview, sourceHtml],
  )
  const [windowHeight, setWindowHeight] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 0))
  const minimumFrameHeight = useMemo(
    () => getPreviewMinimumHeight(isViewportLayout, windowHeight),
    [isViewportLayout, windowHeight],
  )
  const [frameHeight, setFrameHeight] = useState(minimumFrameHeight)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fallbackDocument = useMemo(
    () => buildHtmlPreviewDocument(sourceHtml, path),
    [path, sourceHtml],
  )
  const [documentHtml, setDocumentHtml] = useState(fallbackDocument)
  const usesInteractiveDocument = !isUrlPreview || hasInteractiveUrlDocument
  const srcDoc = useMemo(
    () => (usesInteractiveDocument ? injectHtmlPreviewBridge(documentHtml, previewIdRef.current, path ?? null) : null),
    [documentHtml, path, usesInteractiveDocument],
  )
  const selectedElementBridgePayload = useMemo(() => (
    selectedElements.map((selection) => ({
      key: buildPreviewSelectionKey(selection),
      selector: selection.selector,
      pathHint: selection.pathHint,
      tagName: selection.tagName,
      id: selection.id,
      className: selection.className,
      text: selection.text,
      href: selection.href,
      ariaLabel: selection.ariaLabel,
    }))
  ), [selectedElements])

  const applyUrlPreviewDocument = useCallback((nextHtml: string, nextUrl: string) => {
    setDocumentHtml(buildRemoteHtmlPreviewDocument(nextHtml, nextUrl))
    setHasInteractiveUrlDocument(true)
    setIframeRenderKey((current) => current + 1)
  }, [])

  const postPreviewMessage = useCallback((payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({
      __claudeHtmlPreview: true,
      previewId: previewIdRef.current,
      ...payload,
    }, '*')
  }, [])

  const syncInteractivePreviewState = useCallback(() => {
    postPreviewMessage({
      action: 'toggle-select-mode',
      enabled: isSelectMode,
    })
    postPreviewMessage({
      action: 'sync-selected-elements',
      elements: selectedElementBridgePayload,
    })
    postPreviewMessage({
      action: 'highlight-selection',
      key: hoveredSelectionKey,
    })
  }, [hoveredSelectionKey, isSelectMode, postPreviewMessage, selectedElementBridgePayload])

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
    setSourceHtml(html ?? '')
  }, [html])

  useEffect(() => {
    if (urlLoadTimerRef.current !== null) {
      window.clearTimeout(urlLoadTimerRef.current)
      urlLoadTimerRef.current = null
    }
    if (urlRetryTimerRef.current !== null) {
      window.clearTimeout(urlRetryTimerRef.current)
      urlRetryTimerRef.current = null
    }
    setHasInteractiveUrlDocument(false)
    setIsFrameLoading(isUrlPreview)
  }, [isUrlPreview, previewUrl])

  useEffect(() => () => {
    if (urlLoadTimerRef.current !== null) {
      window.clearTimeout(urlLoadTimerRef.current)
    }
    if (urlRetryTimerRef.current !== null) {
      window.clearTimeout(urlRetryTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (((!path && !isUrlPreview) || (isUrlPreview && !hasInteractiveUrlDocument)) && isSelectMode) {
      setIsSelectMode(false)
    }
  }, [hasInteractiveUrlDocument, isSelectMode, isUrlPreview, path])

  useEffect(() => {
    let cancelled = false
    setDocumentHtml(fallbackDocument)
    setFrameHeight(minimumFrameHeight)

    if (isUrlPreview) {
      const loadUrlPreviewDocument = async () => {
        if (!previewUrl) return

        const previewDocument = await window.claude.readPreviewUrl(previewUrl).catch(() => null)
        if (cancelled) return

        if (previewDocument?.html) {
          setIsFrameLoading(true)
          applyUrlPreviewDocument(previewDocument.html, previewDocument.url)
          return
        }

        urlRetryTimerRef.current = window.setTimeout(() => {
          urlRetryTimerRef.current = null
          void loadUrlPreviewDocument()
        }, 600)
      }

      void loadUrlPreviewDocument()

      return () => {
        cancelled = true
        if (urlRetryTimerRef.current !== null) {
          window.clearTimeout(urlRetryTimerRef.current)
          urlRetryTimerRef.current = null
        }
      }
    }

    void inlineHtmlPreviewAssets(sourceHtml, path)
      .then((nextSrcDoc) => {
        if (!cancelled) setDocumentHtml(nextSrcDoc)
      })
      .catch(() => {
        if (!cancelled) setDocumentHtml(fallbackDocument)
      })

    return () => {
      cancelled = true
    }
  }, [applyUrlPreviewDocument, fallbackDocument, isUrlPreview, minimumFrameHeight, path, previewUrl, sourceHtml])

  useEffect(() => {
    setFrameHeight((current) => (current < minimumFrameHeight ? minimumFrameHeight : current))
  }, [minimumFrameHeight])

  useEffect(() => {
    if (!path || !watchRootPath) return undefined

    let activeWatchId: string | null = null
    let cancelled = false

    const handleRefresh = async () => {
      if (isUrlPreview) {
        if (!previewUrl) return
        const previewDocument = await window.claude.readPreviewUrl(previewUrl).catch(() => null)
        if (cancelled || !previewDocument?.html) return
        setIsFrameLoading(true)
        applyUrlPreviewDocument(previewDocument.html, previewDocument.url)
        return
      }

      const file = await window.claude.readFile(path).catch(() => null)
      if (!cancelled && file?.content !== undefined) {
        setSourceHtml(file.content)
      }
    }

    const unsubscribe = window.claude.onPreviewFileChanged((event) => {
      if (event.watchId !== activeWatchId) return
      void handleRefresh()
    })

    void window.claude.watchPreviewFiles({ rootPath: watchRootPath })
      .then(({ watchId }) => {
        if (cancelled) {
          if (watchId) void window.claude.unwatchPreviewFiles({ watchId })
          return
        }
        activeWatchId = watchId
      })

    return () => {
      cancelled = true
      unsubscribe()
      if (activeWatchId) {
        void window.claude.unwatchPreviewFiles({ watchId: activeWatchId })
      }
    }
  }, [applyUrlPreviewDocument, isUrlPreview, path, previewUrl, watchRootPath])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!event.data || typeof event.data !== 'object') return

      const payload = event.data as HtmlPreviewMessagePayload
      if (payload.__claudeHtmlPreview !== true) return
      if (payload.previewId !== previewIdRef.current) return
      if (payload.action === 'element-selected') {
        if (onElementSelect && isPreviewSelectionPayload(payload.element)) {
          onElementSelect({
            previewPath: path ?? null,
            ...payload.element,
          })
        }
        return
      }
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
  }, [minimumFrameHeight, onElementSelect, path])

  useEffect(() => {
    if (!srcDoc) return
    syncInteractivePreviewState()
  }, [srcDoc, syncInteractivePreviewState])

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
    if (isUrlPreview) {
      const resolvedDownloadRootPath = downloadRootPath ?? await window.claude.selectFolder(
        downloadRootPath ? { defaultPath: downloadRootPath } : undefined,
      )
      if (!resolvedDownloadRootPath) return
      await window.claude.saveZipArchive({
        sourcePath: resolvedDownloadRootPath,
      })
      return
    }

    await window.claude.saveTextFile({
      suggestedName: getFileName(path),
      defaultPath: buildSuggestedSavePath(path),
      content: documentHtml,
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    })
  }, [documentHtml, downloadRootPath, isUrlPreview, path])

  const refreshPreview = useCallback(async () => {
    if (urlRetryTimerRef.current !== null) {
      window.clearTimeout(urlRetryTimerRef.current)
      urlRetryTimerRef.current = null
    }

    if (isUrlPreview) {
      if (!previewUrl) return
      setIsFrameLoading(true)

      const previewDocument = await window.claude.readPreviewUrl(previewUrl).catch(() => null)
      if (!previewDocument?.html) {
        setIsFrameLoading(false)
        return
      }

      applyUrlPreviewDocument(previewDocument.html, previewDocument.url)
      return
    }

    if (path) {
      const file = await window.claude.readFile(path).catch(() => null)
      if (file?.content !== undefined) {
        setSourceHtml(file.content)
      }
      return
    }

    setSourceHtml(html ?? '')
  }, [applyUrlPreviewDocument, html, isUrlPreview, path, previewUrl])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((value) => !value)
  }, [])

  const clearSelectMode = useCallback(() => {
    setIsSelectMode(false)
  }, [])

  const toggleSelectMode = useCallback(() => {
    if (isUrlPreview && !hasInteractiveUrlDocument) return
    if (!path && !isUrlPreview) return
    setIsSelectMode((value) => !value)
  }, [hasInteractiveUrlDocument, isUrlPreview, path])

  const handleIframeLoad = useCallback(() => {
    if (isUrlPreview) {
      if (urlLoadTimerRef.current !== null) {
        window.clearTimeout(urlLoadTimerRef.current)
      }
      urlLoadTimerRef.current = window.setTimeout(() => {
        setIsFrameLoading(false)
        urlLoadTimerRef.current = null
      }, 120)
    }
    if (!srcDoc) return
    postPreviewMessage({ action: 'request-measure' })
    syncInteractivePreviewState()
  }, [isUrlPreview, postPreviewMessage, srcDoc, syncInteractivePreviewState])

  return {
    canSelectElements: !isUrlPreview || hasInteractiveUrlDocument,
    documentHtml,
    frameHeight,
    handleIframeLoad,
    iframeRenderKey,
    iframeRef,
    isFrameLoading,
    isFullscreen,
    isSelectMode,
    isUrlPreview,
    previewUrl,
    refreshPreview,
    srcDoc,
    clearSelectMode,
    handleDownload,
    toggleSelectMode,
    toggleFullscreen,
  }
}
