import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react'
import { matchShortcut } from '../lib/shortcuts'

export type ChatViewRightPanel = 'none' | 'files' | 'session' | 'git'

type Params = {
  rightPanel: ChatViewRightPanel
  setRightPanel: Dispatch<SetStateAction<ChatViewRightPanel>>
  filesShortcutLabel: string
  sessionInfoShortcutLabel: string
  showPreviewPane: boolean
  showGitPreviewPane: boolean
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

  const attachResizeListeners = useCallback((onMouseMove: (event: MouseEvent) => void) => {
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleFilePanelResizeStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = filePanelWidth
    const minimumWidth = showPreviewPane || showGitPreviewPane ? Math.max(320, explorerWidth + 140) : explorerWidth
    const maximumWidth = getRightPanelMaxWidth()

    attachResizeListeners((moveEvent) => {
      const nextWidth = Math.min(maximumWidth, Math.max(minimumWidth, startWidth - (moveEvent.clientX - startX)))
      setFilePanelWidth(nextWidth)
    })
  }, [
    attachResizeListeners,
    explorerWidth,
    filePanelWidth,
    getRightPanelMaxWidth,
    showGitPreviewPane,
    showPreviewPane,
  ])

  const handleExplorerResizeStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = explorerWidth

    attachResizeListeners((moveEvent) => {
      const nextWidth = Math.min(filePanelWidth - 260, Math.max(180, startWidth - (moveEvent.clientX - startX)))
      setExplorerWidth(nextWidth)
    })
  }, [attachResizeListeners, explorerWidth, filePanelWidth])

  const handleGitLogResizeStart = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    sidebarHeight: number,
  ) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = gitLogPanelHeight
    const maxHeight = Math.max(120, sidebarHeight - gitCommitPanelHeight - 180)

    attachResizeListeners((moveEvent) => {
      const nextHeight = Math.min(maxHeight, Math.max(96, startHeight + (moveEvent.clientY - startY)))
      setGitLogPanelHeight(nextHeight)
    })
  }, [attachResizeListeners, gitCommitPanelHeight, gitLogPanelHeight])

  const handleGitCommitResizeStart = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
    sidebarHeight: number,
  ) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = gitCommitPanelHeight
    const maxHeight = Math.max(108, sidebarHeight - gitLogPanelHeight - 180)

    attachResizeListeners((moveEvent) => {
      const nextHeight = Math.min(maxHeight, Math.max(92, startHeight - (moveEvent.clientY - startY)))
      setGitCommitPanelHeight(nextHeight)
    })
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
    toggleSessionPanel,
    handleFilePanelResizeStart,
    handleExplorerResizeStart,
    handleGitLogResizeStart,
    handleGitCommitResizeStart,
  }
}
