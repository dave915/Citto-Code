import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import { matchShortcut } from '../lib/shortcuts'

export type ChatViewRightPanel = 'files' | 'session' | 'git' | 'preview'

type Params = {
  openPanels: ChatViewRightPanel[]
  setOpenPanels: Dispatch<SetStateAction<ChatViewRightPanel[]>>
  filesShortcutLabel: string
  sessionInfoShortcutLabel: string
  showPreviewPane: boolean
  showGitPreviewPane: boolean
  showHtmlPreviewPane: boolean
}

const INITIAL_RIGHT_PANEL_WIDTH = 290
const INITIAL_SESSION_PANEL_WIDTH = 290
const INITIAL_EXPLORER_WIDTH = 290
const INITIAL_GIT_LOG_PANEL_HEIGHT = 260
const INITIAL_GIT_COMMIT_PANEL_HEIGHT = 116
const RIGHT_PANEL_MAX_WIDTH_RATIO = 0.85
const GIT_INTERNAL_RESIZE_HANDLE_TOTAL = 12
const GIT_MIN_LOG_PANEL_HEIGHT = 72
const GIT_MIN_STATUS_PANEL_HEIGHT = 64
const GIT_MIN_COMMIT_PANEL_HEIGHT = 84

export function useChatViewLayout({
  openPanels,
  setOpenPanels,
  filesShortcutLabel,
  sessionInfoShortcutLabel,
  showPreviewPane,
  showGitPreviewPane,
  showHtmlPreviewPane,
}: Params) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mainPaneRef = useRef<HTMLDivElement>(null)
  const prevFilePanelOpenRef = useRef(false)
  const prevShowPreviewPaneRef = useRef(false)
  const prevShowGitPreviewPaneRef = useRef(false)
  const filePanelWidthBeforePreviewRef = useRef<number | null>(null)
  const gitPanelWidthBeforePreviewRef = useRef<number | null>(null)
  const [filePanelWidth, setFilePanelWidth] = useState(INITIAL_RIGHT_PANEL_WIDTH)
  const [explorerWidth, setExplorerWidth] = useState(INITIAL_EXPLORER_WIDTH)
  const [gitLogPanelHeight, setGitLogPanelHeight] = useState(INITIAL_GIT_LOG_PANEL_HEIGHT)
  const [gitCommitPanelHeight, setGitCommitPanelHeight] = useState(INITIAL_GIT_COMMIT_PANEL_HEIGHT)
  const [mainPaneWidth, setMainPaneWidth] = useState(0)
  const filePanelOpen = openPanels.includes('files')
  const sessionPanelOpen = openPanels.includes('session')
  const gitPanelOpen = openPanels.includes('git')
  const previewPanelOpen = openPanels.includes('preview')

  const getRightPanelMaxWidth = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
    return Math.max(INITIAL_SESSION_PANEL_WIDTH, Math.floor(containerWidth * RIGHT_PANEL_MAX_WIDTH_RATIO))
  }, [])

  const togglePanel = useCallback((panel: ChatViewRightPanel) => {
    setOpenPanels((current) => (
      current.includes(panel)
        ? current.filter((entry) => entry !== panel)
        : [...current, panel]
    ))
  }, [setOpenPanels])

  const toggleFilePanel = useCallback(() => {
    togglePanel('files')
  }, [togglePanel])

  const toggleGitPanel = useCallback(() => {
    togglePanel('git')
  }, [togglePanel])

  const toggleSessionPanel = useCallback(() => {
    togglePanel('session')
  }, [togglePanel])

  const togglePreviewPanel = useCallback(() => {
    togglePanel('preview')
  }, [togglePanel])

  useEffect(() => {
    const node = mainPaneRef.current
    if (!node) return

    const updateWidth = () => {
      setMainPaneWidth(node.clientWidth)
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchShortcut(event, filesShortcutLabel)) {
        event.preventDefault()
        toggleFilePanel()
        return
      }

      if (matchShortcut(event, sessionInfoShortcutLabel)) {
        event.preventDefault()
        toggleSessionPanel()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filesShortcutLabel, sessionInfoShortcutLabel, toggleFilePanel, toggleSessionPanel])

  useEffect(() => {
    const wasFilePanelOpen = prevFilePanelOpenRef.current
    const wasShowingPreview = prevShowPreviewPaneRef.current
    prevFilePanelOpenRef.current = filePanelOpen
    prevShowPreviewPaneRef.current = showPreviewPane

    if (!filePanelOpen) {
      prevShowPreviewPaneRef.current = false
      filePanelWidthBeforePreviewRef.current = null
      return
    }

    if (!showPreviewPane) {
      if (wasFilePanelOpen && wasShowingPreview && filePanelWidthBeforePreviewRef.current !== null) {
        setFilePanelWidth(Math.min(filePanelWidthBeforePreviewRef.current, getRightPanelMaxWidth()))
        filePanelWidthBeforePreviewRef.current = null
      }
      return
    }

    if (wasFilePanelOpen && wasShowingPreview) {
      return
    }

    filePanelWidthBeforePreviewRef.current = filePanelWidth
    const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
    const targetWidth = Math.min(
      Math.floor(containerWidth * RIGHT_PANEL_MAX_WIDTH_RATIO),
      Math.max(explorerWidth + 260, Math.floor(containerWidth / 2)),
    )
    setFilePanelWidth(targetWidth)
  }, [explorerWidth, filePanelOpen, filePanelWidth, getRightPanelMaxWidth, showPreviewPane])

  useEffect(() => {
    const wasShowingGitPreview = prevShowGitPreviewPaneRef.current
    prevShowGitPreviewPaneRef.current = showGitPreviewPane

    if (!gitPanelOpen) {
      prevShowGitPreviewPaneRef.current = false
      gitPanelWidthBeforePreviewRef.current = null
      return
    }

    if (!showGitPreviewPane) {
      if (wasShowingGitPreview && gitPanelWidthBeforePreviewRef.current !== null) {
        setFilePanelWidth(Math.min(gitPanelWidthBeforePreviewRef.current, getRightPanelMaxWidth()))
        gitPanelWidthBeforePreviewRef.current = null
      }
      return
    }

    if (wasShowingGitPreview) {
      return
    }

    gitPanelWidthBeforePreviewRef.current = filePanelWidth
    const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
    const targetWidth = Math.min(
      Math.floor(containerWidth * RIGHT_PANEL_MAX_WIDTH_RATIO),
      Math.max(explorerWidth + 180, Math.floor(containerWidth / 2)),
    )
    setFilePanelWidth((current) => Math.max(current, targetWidth))
  }, [explorerWidth, filePanelWidth, getRightPanelMaxWidth, gitPanelOpen, showGitPreviewPane])

  useEffect(() => {
    if (!sessionPanelOpen || openPanels.length !== 1) return
    setFilePanelWidth((current) => Math.max(current, INITIAL_SESSION_PANEL_WIDTH))
  }, [openPanels.length, sessionPanelOpen])

  useEffect(() => {
    if (!previewPanelOpen || !showHtmlPreviewPane) return

    const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
    const targetWidth = Math.min(
      getRightPanelMaxWidth(),
      Math.max(420, Math.floor(containerWidth / 2)),
    )
    setFilePanelWidth((current) => Math.max(current, targetWidth))
  }, [getRightPanelMaxWidth, previewPanelOpen, showHtmlPreviewPane])

  const attachResizeListeners = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    onPointerMove: (event: PointerEvent) => void,
    cursor: 'col-resize' | 'row-resize',
  ) => {
    if (event.button !== 0) return

    const target = event.currentTarget
    const pointerId = event.pointerId
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    const cleanup = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
      window.removeEventListener('blur', cleanup)
      target.removeEventListener('lostpointercapture', cleanup)

      try {
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId)
        }
      } catch {
        // Ignore stale pointer capture cleanup.
      }
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      onPointerMove(moveEvent)
    }

    const handlePointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return
      cleanup()
    }

    document.body.style.cursor = cursor
    document.body.style.userSelect = 'none'

    try {
      target.setPointerCapture(pointerId)
    } catch {
      // Pointer capture can fail if the pointer is already inactive.
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    window.addEventListener('blur', cleanup)
    target.addEventListener('lostpointercapture', cleanup)
    event.preventDefault()
  }, [])

  const handleFilePanelResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = event.clientX
    const startWidth = filePanelWidth
    const minimumWidth = previewPanelOpen
      ? 360
      : showPreviewPane || showGitPreviewPane
        ? Math.max(320, explorerWidth + 140)
        : explorerWidth
    const maximumWidth = getRightPanelMaxWidth()

    attachResizeListeners(event, (moveEvent) => {
      const nextWidth = Math.min(maximumWidth, Math.max(minimumWidth, startWidth - (moveEvent.clientX - startX)))
      setFilePanelWidth(nextWidth)
    }, 'col-resize')
  }, [
    attachResizeListeners,
    explorerWidth,
    filePanelWidth,
    getRightPanelMaxWidth,
    previewPanelOpen,
    showGitPreviewPane,
    showPreviewPane,
  ])

  const handleExplorerResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = event.clientX
    const startWidth = explorerWidth

    attachResizeListeners(event, (moveEvent) => {
      const nextWidth = Math.min(filePanelWidth - 260, Math.max(180, startWidth - (moveEvent.clientX - startX)))
      setExplorerWidth(nextWidth)
    }, 'col-resize')
  }, [attachResizeListeners, explorerWidth, filePanelWidth])

  const handleGitLogResizeStart = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    sidebarHeight: number,
  ) => {
    const startY = event.clientY
    const startHeight = gitLogPanelHeight
    const maxHeight = Math.max(
      GIT_MIN_LOG_PANEL_HEIGHT,
      sidebarHeight - gitCommitPanelHeight - GIT_INTERNAL_RESIZE_HANDLE_TOTAL - GIT_MIN_STATUS_PANEL_HEIGHT,
    )

    attachResizeListeners(event, (moveEvent) => {
      const nextHeight = Math.min(
        maxHeight,
        Math.max(GIT_MIN_LOG_PANEL_HEIGHT, startHeight + (moveEvent.clientY - startY)),
      )
      setGitLogPanelHeight(nextHeight)
    }, 'row-resize')
  }, [attachResizeListeners, gitCommitPanelHeight, gitLogPanelHeight])

  const handleGitCommitResizeStart = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    sidebarHeight: number,
  ) => {
    const startY = event.clientY
    const startHeight = gitCommitPanelHeight
    const maxHeight = Math.max(
      GIT_MIN_COMMIT_PANEL_HEIGHT,
      sidebarHeight - gitLogPanelHeight - GIT_INTERNAL_RESIZE_HANDLE_TOTAL - GIT_MIN_STATUS_PANEL_HEIGHT,
    )

    attachResizeListeners(event, (moveEvent) => {
      const nextHeight = Math.min(
        maxHeight,
        Math.max(GIT_MIN_COMMIT_PANEL_HEIGHT, startHeight - (moveEvent.clientY - startY)),
      )
      setGitCommitPanelHeight(nextHeight)
    }, 'row-resize')
  }, [attachResizeListeners, gitCommitPanelHeight, gitLogPanelHeight])

  return {
    containerRef,
    mainPaneRef,
    filePanelWidth,
    explorerWidth,
    gitLogPanelHeight,
    gitCommitPanelHeight,
    mainPaneWidth,
    toggleFilePanel,
    toggleGitPanel,
    togglePreviewPanel,
    toggleSessionPanel,
    handleFilePanelResizeStart,
    handleExplorerResizeStart,
    handleGitLogResizeStart,
    handleGitCommitResizeStart,
  }
}
