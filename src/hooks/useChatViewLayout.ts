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

export type ChatViewRightPanel = 'none' | 'files' | 'session' | 'git' | 'preview'

type Params = {
  rightPanel: ChatViewRightPanel
  setRightPanel: Dispatch<SetStateAction<ChatViewRightPanel>>
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

export function useChatViewLayout({
  rightPanel,
  setRightPanel,
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
  const filePanelOpen = rightPanel === 'files'
  const sessionPanelOpen = rightPanel === 'session'
  const gitPanelOpen = rightPanel === 'git'
  const previewPanelOpen = rightPanel === 'preview'

  const getRightPanelMaxWidth = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
    return Math.max(INITIAL_SESSION_PANEL_WIDTH, Math.floor(containerWidth * RIGHT_PANEL_MAX_WIDTH_RATIO))
  }, [])

  const toggleFilePanel = useCallback(() => {
    setRightPanel((current) => (current === 'files' ? 'none' : 'files'))
  }, [setRightPanel])

  const toggleGitPanel = useCallback(() => {
    setRightPanel((current) => (current === 'git' ? 'none' : 'git'))
  }, [setRightPanel])

  const toggleSessionPanel = useCallback(() => {
    setRightPanel((current) => (current === 'session' ? 'none' : 'session'))
  }, [setRightPanel])

  const togglePreviewPanel = useCallback(() => {
    setRightPanel((current) => (current === 'preview' ? 'none' : 'preview'))
  }, [setRightPanel])

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
    if (!sessionPanelOpen) return
    setFilePanelWidth(INITIAL_SESSION_PANEL_WIDTH)
  }, [sessionPanelOpen])

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
    const maxHeight = Math.max(120, sidebarHeight - gitCommitPanelHeight - 180)

    attachResizeListeners(event, (moveEvent) => {
      const nextHeight = Math.min(maxHeight, Math.max(96, startHeight + (moveEvent.clientY - startY)))
      setGitLogPanelHeight(nextHeight)
    }, 'row-resize')
  }, [attachResizeListeners, gitCommitPanelHeight, gitLogPanelHeight])

  const handleGitCommitResizeStart = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    sidebarHeight: number,
  ) => {
    const startY = event.clientY
    const startHeight = gitCommitPanelHeight
    const maxHeight = Math.max(108, sidebarHeight - gitLogPanelHeight - 180)

    attachResizeListeners(event, (moveEvent) => {
      const nextHeight = Math.min(maxHeight, Math.max(92, startHeight - (moveEvent.clientY - startY)))
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
