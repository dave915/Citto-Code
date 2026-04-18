import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SelectedFile } from '../../../electron/preload'
import type { HtmlPreviewElementCapture, HtmlPreviewElementSelection } from '../../lib/toolcalls/types'
import { buildPreviewSelectionKey } from '../chat/chatViewUtils'
import {
  buildHtmlPreviewBridgeScript,
  buildHtmlPreviewDocument,
  buildSuggestedSavePath,
  getFileName,
  getPreviewMinimumHeight,
  injectHtmlPreviewBridge,
  inlineHtmlPreviewAssets,
  isViewportSizedPreview,
  resolvePreviewFrameHeight,
} from './htmlPreviewDocument'

type HtmlPreviewMessagePayload = {
  __claudeHtmlPreview?: unknown
  previewId?: unknown
  height?: unknown
  action?: unknown
  enabled?: unknown
  element?: unknown
  elements?: unknown
  url?: unknown
  navigationMode?: unknown
  captureBounds?: unknown
}

export type HtmlPreviewNavigationMode = 'load' | 'push' | 'replace' | 'pop' | 'unknown'

type UseHtmlPreviewControllerOptions = {
  html?: string | null
  path?: string | null
  url?: string | null
  downloadRootPath?: string | null
  onElementSelect?: (payload: HtmlPreviewElementCapture) => void
  onLocationChange?: (payload: {
    url: string
    proxyUrl: string
    navigationMode: HtmlPreviewNavigationMode
  }) => void
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

function normalizeNavigationMode(value: unknown): HtmlPreviewNavigationMode {
  return value === 'load' || value === 'push' || value === 'replace' || value === 'pop'
    ? value
    : 'unknown'
}

type PreviewCaptureBounds = {
  left: number
  top: number
  width: number
  height: number
}

function isPreviewCaptureBounds(value: unknown): value is PreviewCaptureBounds {
  if (!value || typeof value !== 'object') return false
  const bounds = value as Partial<PreviewCaptureBounds>
  return (
    Number.isFinite(bounds.left)
    && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.width)
    && Number.isFinite(bounds.height)
  )
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampCaptureRect(rect: PreviewCaptureBounds, iframeRect: DOMRect) {
  const horizontalPadding = clampNumber(rect.width * 1.1, 96, 220)
  const topPadding = clampNumber(rect.height * 1.45, 96, 220)
  const bottomPadding = clampNumber(rect.height * 1.65, 120, 240)
  const left = Math.max(0, Math.floor(iframeRect.left + rect.left - horizontalPadding + window.scrollX))
  const top = Math.max(0, Math.floor(iframeRect.top + rect.top - topPadding + window.scrollY))
  const right = Math.ceil(iframeRect.left + rect.left + rect.width + horizontalPadding + window.scrollX)
  const bottom = Math.ceil(iframeRect.top + rect.top + rect.height + bottomPadding + window.scrollY)
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

function sanitizeCaptureFilePart(value: string | null | undefined): string {
  const normalized = (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.slice(0, 40)
}

function buildPreviewCaptureName(selection: HtmlPreviewElementSelection) {
  const parts = [
    'preview-selection',
    sanitizeCaptureFilePart(selection.tagName),
    sanitizeCaptureFilePart(selection.id),
    sanitizeCaptureFilePart(selection.text),
    sanitizeCaptureFilePart(selection.className?.split(/\s+/).filter(Boolean)[0] ?? ''),
  ].filter(Boolean)

  return `${parts.join('-') || 'preview-selection'}.png`
}

function mapProxyUrlToTargetUrl(proxyUrl: string, targetUrl: string | null, proxyOrigin: string | null): string {
  if (!targetUrl || !proxyOrigin) return proxyUrl

  try {
    const resolvedProxyUrl = new URL(proxyUrl)
    if (resolvedProxyUrl.origin !== proxyOrigin) return proxyUrl

    const resolvedTargetUrl = new URL(targetUrl)
    return new URL(
      `${resolvedProxyUrl.pathname}${resolvedProxyUrl.search}${resolvedProxyUrl.hash}`,
      `${resolvedTargetUrl.protocol}//${resolvedTargetUrl.host}`,
    ).toString()
  } catch {
    return proxyUrl
  }
}

export function useHtmlPreviewController({
  html,
  path,
  url,
  downloadRootPath,
  onElementSelect,
  onLocationChange,
  selectedElements = [],
  hoveredSelectionKey = null,
}: UseHtmlPreviewControllerOptions) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const previewIdRef = useRef(`html-preview-${Math.random().toString(36).slice(2)}`)
  const previewProxySessionIdRef = useRef<string | null>(null)
  const previewProxyOriginRef = useRef<string | null>(null)
  const targetUrlRef = useRef<string | null>(url?.trim() || null)
  const urlLoadTimerRef = useRef<number | null>(null)
  const [sourceHtml, setSourceHtml] = useState(html ?? '')
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [iframeRenderKey, setIframeRenderKey] = useState(0)
  const previewUrl = url?.trim() || null
  const isUrlPreview = Boolean(previewUrl)
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [isFrameLoading, setIsFrameLoading] = useState(isUrlPreview)
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
  const selectionPreviewPath = isUrlPreview ? null : (path ?? null)
  const bridgeScript = useMemo(
    () => buildHtmlPreviewBridgeScript(previewIdRef.current, selectionPreviewPath),
    [selectionPreviewPath],
  )
  const srcDoc = useMemo(
    () => (isUrlPreview ? null : injectHtmlPreviewBridge(documentHtml, previewIdRef.current, selectionPreviewPath)),
    [documentHtml, isUrlPreview, selectionPreviewPath],
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

  const stopPreviewProxySession = useCallback(async () => {
    const sessionId = previewProxySessionIdRef.current
    previewProxySessionIdRef.current = null
    previewProxyOriginRef.current = null
    if (!sessionId) return
    await window.claude.stopPreviewProxy({ sessionId }).catch(() => {})
  }, [])

  const captureSelectedElement = useCallback(async (
    selection: HtmlPreviewElementSelection,
    captureBounds: PreviewCaptureBounds,
  ): Promise<SelectedFile | null> => {
    const iframeElement = iframeRef.current
    if (!iframeElement) return null

    const iframeRect = iframeElement.getBoundingClientRect()
    if (iframeRect.width <= 0 || iframeRect.height <= 0) return null

    postPreviewMessage({ action: 'prepare-capture' })
    await waitForNextFrame()

    try {
      return await window.claude.capturePreviewElement({
        ...clampCaptureRect(captureBounds, iframeRect),
        suggestedName: buildPreviewCaptureName(selection),
      }).catch(() => null)
    } finally {
      postPreviewMessage({ action: 'finish-capture' })
    }
  }, [postPreviewMessage])

  const reloadUrlPreviewFrame = useCallback(() => {
    setIsFrameLoading(true)
    setIframeRenderKey((current) => current + 1)
  }, [])

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
    targetUrlRef.current = previewUrl
  }, [previewUrl])

  useEffect(() => {
    if (urlLoadTimerRef.current !== null) {
      window.clearTimeout(urlLoadTimerRef.current)
      urlLoadTimerRef.current = null
    }
    setIsFrameLoading(isUrlPreview)
  }, [isUrlPreview, previewUrl])

  useEffect(() => () => {
    if (urlLoadTimerRef.current !== null) {
      window.clearTimeout(urlLoadTimerRef.current)
    }
    void stopPreviewProxySession()
  }, [stopPreviewProxySession])

  useEffect(() => {
    if (((!path && !isUrlPreview) || (isUrlPreview && !iframeUrl)) && isSelectMode) {
      setIsSelectMode(false)
    }
  }, [iframeUrl, isSelectMode, isUrlPreview, path])

  useEffect(() => {
    let cancelled = false
    setDocumentHtml(fallbackDocument)
    setFrameHeight(minimumFrameHeight)

    if (isUrlPreview) {
      return () => {
        cancelled = true
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
  }, [fallbackDocument, isUrlPreview, minimumFrameHeight, path, sourceHtml])

  useEffect(() => {
    if (!isUrlPreview || !previewUrl) {
      setIframeUrl(null)
      setIsFrameLoading(false)
      previewProxyOriginRef.current = null
      void stopPreviewProxySession()
      return
    }

    let cancelled = false
    const existingSessionId = previewProxySessionIdRef.current

    const syncPreviewProxy = async () => {
      const session = existingSessionId
        ? await window.claude.updatePreviewProxy({
          sessionId: existingSessionId,
          targetUrl: previewUrl,
          bridgeScript,
        }).catch(() => null)
        : await window.claude.startPreviewProxy({
          targetUrl: previewUrl,
          bridgeScript,
        }).catch(() => null)

      if (cancelled) {
        if (!existingSessionId && session?.sessionId) {
          await window.claude.stopPreviewProxy({ sessionId: session.sessionId }).catch(() => {})
        }
        return
      }

      if (!session) {
        setIframeUrl(null)
        setIsFrameLoading(false)
        if (existingSessionId) {
          await stopPreviewProxySession()
        }
        return
      }

      previewProxySessionIdRef.current = session.sessionId
      targetUrlRef.current = session.targetUrl
      try {
        previewProxyOriginRef.current = new URL(session.proxyUrl).origin
      } catch {
        previewProxyOriginRef.current = null
      }
      setIframeUrl(session.proxyUrl)
      if (existingSessionId) {
        reloadUrlPreviewFrame()
      }
    }

    void syncPreviewProxy()

    return () => {
      cancelled = true
    }
  }, [bridgeScript, isUrlPreview, previewUrl, reloadUrlPreviewFrame, stopPreviewProxySession])

  useEffect(() => {
    setFrameHeight((current) => (current < minimumFrameHeight ? minimumFrameHeight : current))
  }, [minimumFrameHeight])

  useEffect(() => {
    if (!path || !watchRootPath) return undefined

    let activeWatchId: string | null = null
    let cancelled = false

    const handleRefresh = async () => {
      if (cancelled) return

      if (isUrlPreview) {
        reloadUrlPreviewFrame()
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
  }, [isUrlPreview, path, reloadUrlPreviewFrame, watchRootPath])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!event.data || typeof event.data !== 'object') return

      const payload = event.data as HtmlPreviewMessagePayload
      if (payload.__claudeHtmlPreview !== true) return
      if (payload.previewId !== previewIdRef.current) return
      if (payload.action === 'location-change') {
        if (typeof payload.url === 'string' && payload.url.trim()) {
          const proxyUrl = payload.url.trim()
          const resolvedUrl = mapProxyUrlToTargetUrl(
            proxyUrl,
            targetUrlRef.current,
            previewProxyOriginRef.current,
          )
          setIframeUrl(proxyUrl)
          onLocationChange?.({
            url: resolvedUrl,
            proxyUrl,
            navigationMode: normalizeNavigationMode(payload.navigationMode),
          })
        }
        return
      }
      if (payload.action === 'element-selected') {
        if (onElementSelect && isPreviewSelectionPayload(payload.element)) {
          const selection = {
            previewPath: selectionPreviewPath,
            ...payload.element,
          }
          const selectionKey = buildPreviewSelectionKey(selection)
          const alreadySelected = selectedElements.some((entry) => buildPreviewSelectionKey(entry) === selectionKey)
          if (alreadySelected || !isPreviewCaptureBounds(payload.captureBounds)) {
            onElementSelect({
              selection,
              captureFile: null,
            })
            return
          }

          void captureSelectedElement(selection, payload.captureBounds).then((captureFile) => {
            onElementSelect({
              selection,
              captureFile,
            })
          })
        }
        return
      }
      if (payload.action === 'escape') {
        setIsFullscreen(false)
        return
      }

      const nextHeight = typeof payload.height === 'number' ? payload.height : Number(payload.height)
      const resolvedHeight = resolvePreviewFrameHeight({
        isUrlPreview,
        isViewportLayout,
        measuredHeight: nextHeight,
        minimumFrameHeight,
      })
      if (resolvedHeight === null) return
      setFrameHeight(resolvedHeight)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [captureSelectedElement, isUrlPreview, isViewportLayout, minimumFrameHeight, onElementSelect, onLocationChange, selectedElements, selectionPreviewPath])

  useEffect(() => {
    if (!srcDoc && !iframeUrl) return
    syncInteractivePreviewState()
  }, [iframeUrl, srcDoc, syncInteractivePreviewState])

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
    if (isUrlPreview) {
      if (!iframeUrl) return
      reloadUrlPreviewFrame()
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
  }, [html, iframeUrl, isUrlPreview, path, reloadUrlPreviewFrame])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((value) => !value)
  }, [])

  const clearSelectMode = useCallback(() => {
    setIsSelectMode(false)
  }, [])

  const toggleSelectMode = useCallback(() => {
    if (isUrlPreview && !iframeUrl) return
    if (!path && !isUrlPreview) return
    setIsSelectMode((value) => !value)
  }, [iframeUrl, isUrlPreview, path])

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
    if (!srcDoc && !iframeUrl) return
    if (!isUrlPreview) {
      try {
        iframeRef.current?.contentWindow?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      } catch {
        // Ignore cross-origin or transient load failures during preview scroll reset.
      }
    }
    postPreviewMessage({ action: 'request-measure' })
    syncInteractivePreviewState()
  }, [iframeUrl, isUrlPreview, postPreviewMessage, srcDoc, syncInteractivePreviewState])

  return {
    canSelectElements: !isUrlPreview || Boolean(iframeUrl),
    documentHtml,
    frameHeight,
    handleIframeLoad,
    iframeRenderKey,
    iframeRef,
    iframeUrl,
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
