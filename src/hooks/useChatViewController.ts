import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getCurrentPlatform } from '../lib/shortcuts'
import { useChatOpenWith } from './useChatOpenWith'
import { useChatViewActions } from './chatView/useChatViewActions'
import { useChatViewJumpState } from './useChatViewJumpState'
import {
  useChatViewLayout,
  type ChatViewRightPanel,
} from './useChatViewLayout'
import { useFileExplorer } from './useFileExplorer'
import { useGitPanel } from './useGitPanel'
import { useSessionsStore } from '../store/sessions'
import type { Session } from '../store/sessions'
import {
  buildChatViewDerivedState,
  buildPreviewSelectionKey,
  type HtmlPreviewSource,
  type FileConflict,
  type PreviewElementSelectionPayload,
} from '../components/chat/chatViewUtils'
import type { AppLanguage, TranslationKey } from '../lib/i18n'

const HEADER_OPEN_WITH_MIN_WIDTH = 640
const HEADER_SESSION_ACTION_MIN_WIDTH = 700
const HEADER_GIT_ACTION_MIN_WIDTH = 756
const HEADER_FILE_ACTION_MIN_WIDTH = 812
const dismissedHtmlPreviewActivityIdBySession = new Map<string, string>()

type Params = {
  fileConflict?: FileConflict | null
  filesShortcutLabel: string
  jumpToMessageId?: string | null
  jumpToMessageToken?: number
  language: AppLanguage
  session: Session
  sessionInfoShortcutLabel: string
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export function useChatViewController({
  fileConflict,
  filesShortcutLabel,
  jumpToMessageId,
  jumpToMessageToken,
  language,
  session,
  sessionInfoShortcutLabel,
  t,
}: Params) {
  const openWithMenuRef = useRef<HTMLDivElement>(null)
  const previousHtmlPreviewActivityIdRef = useRef<string | null>(null)
  const [rightPanel, setRightPanel] = useState<ChatViewRightPanel>('none')
  const [selectedHtmlPreviewSourceId, setSelectedHtmlPreviewSourceId] = useState<string | null>(null)
  const [selectedPreviewElements, setSelectedPreviewElements] = useState<PreviewElementSelectionPayload[]>([])
  const [hoveredPreviewSelectionKey, setHoveredPreviewSelectionKey] = useState<string | null>(null)
  const [previewSelectionResetToken, setPreviewSelectionResetToken] = useState(0)

  const preferredOpenWithAppId = useSessionsStore((state) => state.preferredOpenWithAppId)
  const setPreferredOpenWithAppId = useSessionsStore((state) => state.setPreferredOpenWithAppId)

  const filePanelOpen = rightPanel === 'files'
  const sessionPanelOpen = rightPanel === 'session'
  const gitPanelOpen = rightPanel === 'git'
  const previewPanelOpen = rightPanel === 'preview'
  const fileExplorer = useFileExplorer({
    cwd: session.cwd || '~',
    filePanelOpen,
  })
  const gitPanel = useGitPanel({
    cwd: session.cwd || '~',
    gitPanelOpen,
  })
  const showPreviewPane = fileExplorer.selectedEntry !== null
  const showGitPreviewPane = gitPanel.showGitPreviewPane

  const {
    bottomRef,
    messageRefs,
    highlightedMessageId,
  } = useChatViewJumpState({
    messages: session.messages,
    jumpToMessageId,
    jumpToMessageToken,
  })

  const {
    isNewSession,
    promptHistory,
    latestHtmlPreviewActivityId,
    htmlPreviewSources,
    hideHtmlPreview,
    showErrorCard,
    userMessageCount,
    assistantMessageCount,
    contextUsagePercent,
    fileConflictLabel,
    conflictSessionLabel,
  } = useMemo(() => buildChatViewDerivedState({
    session,
    fileConflict,
    t,
  }), [fileConflict, session, t])
  const hasActiveHtmlPreview = htmlPreviewSources.length > 0
  const activeHtmlPreviewSource = useMemo<HtmlPreviewSource | null>(() => {
    if (htmlPreviewSources.length === 0) return null
    return htmlPreviewSources.find((source) => source.id === selectedHtmlPreviewSourceId) ?? htmlPreviewSources[0]
  }, [htmlPreviewSources, selectedHtmlPreviewSourceId])
  const {
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
  } = useChatViewLayout({
    rightPanel,
    setRightPanel,
    filesShortcutLabel,
    sessionInfoShortcutLabel,
    showPreviewPane,
    showGitPreviewPane,
    showHtmlPreviewPane: hasActiveHtmlPreview,
  })

  const openTargetPath = session.cwd || '~'
  const effectiveMainPaneWidth = mainPaneWidth || Number.POSITIVE_INFINITY
  const {
    copyingFormat,
    drillTarget,
    exportError,
    exportStatus,
    exportingFormat,
    externalDraft,
    handleAskAboutSelection,
    handleCopySessionExport,
    handleCreateGitDraft,
    handleExportSession,
    handleHeaderDoubleClick,
    handlePreviewElementSelection,
    setDrillTarget,
  } = useChatViewActions({
    language,
    session,
    t,
  })
  const {
    openWithMenuOpen,
    openWithApps,
    openWithLoading,
    defaultOpenWithApp,
    handleDefaultOpen,
    handleOpenWith,
    toggleOpenWithMenu,
  } = useChatOpenWith({
    openWithMenuRef,
    openTargetPath,
    preferredOpenWithAppId,
    setPreferredOpenWithAppId,
  })

  const gitAvailable = gitPanel.gitAvailable
  const isMacPlatform = getCurrentPlatform() === 'mac'
  const showHeaderOpenWithAction = isMacPlatform && (openWithMenuOpen || effectiveMainPaneWidth >= HEADER_OPEN_WITH_MIN_WIDTH)
  const showHeaderSessionAction = sessionPanelOpen || effectiveMainPaneWidth >= HEADER_SESSION_ACTION_MIN_WIDTH
  const showHeaderPreviewAction = hasActiveHtmlPreview || previewPanelOpen
  const showHeaderGitAction = gitPanelOpen || effectiveMainPaneWidth >= HEADER_GIT_ACTION_MIN_WIDTH
  const showHeaderFileAction = filePanelOpen || effectiveMainPaneWidth >= HEADER_FILE_ACTION_MIN_WIDTH
  const stagedGitEntryCount = gitPanel.stagedGitEntryCount
  const sidePanelTitle = filePanelOpen
    ? t('sidePanel.fileExplorer')
    : previewPanelOpen
      ? t('common.preview')
      : gitPanelOpen
      ? 'Git'
      : t('sidePanel.sessionInfo')

  const togglePreviewPanel = useCallback(() => {
    setRightPanel((current) => {
      const nextOpen = current !== 'preview'

      if (latestHtmlPreviewActivityId) {
        if (nextOpen) {
          dismissedHtmlPreviewActivityIdBySession.delete(session.id)
        } else {
          dismissedHtmlPreviewActivityIdBySession.set(session.id, latestHtmlPreviewActivityId)
        }
      }

      return nextOpen ? 'preview' : 'none'
    })
  }, [latestHtmlPreviewActivityId, session.id, setRightPanel])

  useEffect(() => {
    previousHtmlPreviewActivityIdRef.current = null
    setSelectedHtmlPreviewSourceId(null)
    setSelectedPreviewElements([])
    setHoveredPreviewSelectionKey(null)
    setPreviewSelectionResetToken(0)
  }, [session.id])

  useEffect(() => {
    if (htmlPreviewSources.length === 0) {
      setSelectedHtmlPreviewSourceId(null)
      return
    }

    const hasSelectedSource = selectedHtmlPreviewSourceId
      ? htmlPreviewSources.some((source) => source.id === selectedHtmlPreviewSourceId)
      : false
    if (hasSelectedSource) return

    const defaultSource = htmlPreviewSources.find((source) => source.kind === 'url') ?? htmlPreviewSources[0]
    setSelectedHtmlPreviewSourceId(defaultSource.id)
  }, [htmlPreviewSources, selectedHtmlPreviewSourceId])

  const clearSelectedPreviewElements = useCallback(() => {
    setSelectedPreviewElements([])
    setHoveredPreviewSelectionKey(null)
    setPreviewSelectionResetToken((current) => current + 1)
  }, [])

  const handleSelectHtmlPreviewSource = useCallback((sourceId: string) => {
    setSelectedHtmlPreviewSourceId(sourceId)
    setSelectedPreviewElements([])
    setHoveredPreviewSelectionKey(null)
    setPreviewSelectionResetToken((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!hoveredPreviewSelectionKey) return
    const hasHoveredSelection = selectedPreviewElements.some((selection) => (
      buildPreviewSelectionKey(selection) === hoveredPreviewSelectionKey
    ))
    if (!hasHoveredSelection) {
      setHoveredPreviewSelectionKey(null)
    }
  }, [hoveredPreviewSelectionKey, selectedPreviewElements])

  useEffect(() => {
    const previousHtmlPreviewActivityId = previousHtmlPreviewActivityIdRef.current
    previousHtmlPreviewActivityIdRef.current = latestHtmlPreviewActivityId
    const dismissedPreviewActivityId = dismissedHtmlPreviewActivityIdBySession.get(session.id) ?? null
    const isDismissedCurrentPreview = Boolean(
      latestHtmlPreviewActivityId
      && dismissedPreviewActivityId === latestHtmlPreviewActivityId,
    )

    if (!hasActiveHtmlPreview && rightPanel === 'preview') {
      setRightPanel('none')
      return
    }

    if (rightPanel === 'preview' && isDismissedCurrentPreview) {
      setRightPanel('none')
      return
    }

    if (
      hasActiveHtmlPreview
      && rightPanel === 'none'
      && latestHtmlPreviewActivityId
      && latestHtmlPreviewActivityId !== previousHtmlPreviewActivityId
      && !isDismissedCurrentPreview
    ) {
      setRightPanel('preview')
    }
  }, [hasActiveHtmlPreview, latestHtmlPreviewActivityId, rightPanel, session.id, setRightPanel])

  const handleToggleBranchMenu = () => {
    gitPanel.setBranchMenuOpen((open) => {
      const nextOpen = !open
      if (nextOpen) {
        gitPanel.setBranchQuery('')
      }
      return nextOpen
    })
  }

  const handleSelectBranch = (name: string) => {
    gitPanel.setBranchMenuOpen(false)
    void gitPanel.handleSwitchGitBranch(name)
  }

  return {
    activeHtmlPreviewSource,
    assistantMessageCount,
    bottomRef,
    conflictSessionLabel,
    containerRef,
    contextUsagePercent,
    copyingFormat,
    defaultOpenWithApp,
    drillTarget,
    explorerWidth,
    exportError,
    exportStatus,
    exportingFormat,
    externalDraft,
    fileConflictLabel,
    fileExplorer,
    filePanelOpen,
    filePanelWidth,
    gitAvailable,
    gitCommitPanelHeight,
    gitLogPanelHeight,
    gitPanel,
    gitPanelOpen,
    handleAskAboutSelection,
    handleCopySessionExport,
    handleCreateGitDraft,
    handleDefaultOpen,
    handleExportSession,
    handleExplorerResizeStart,
    handleFilePanelResizeStart,
    handleGitCommitResizeStart,
    handleGitLogResizeStart,
    handleHeaderDoubleClick,
    handleOpenWith,
    handleSelectBranch,
    handleToggleBranchMenu,
    hideHtmlPreview,
    handlePreviewElementSelection,
    handleSelectHtmlPreviewSource,
    highlightedMessageId,
    hoveredPreviewSelectionKey,
    htmlPreviewSources,
    isNewSession,
    mainPaneRef,
    messageRefs,
    openWithApps,
    openWithLoading,
    openWithMenuOpen,
    openWithMenuRef,
    preferredOpenWithAppId,
    previewSelectionResetToken,
    previewPanelOpen,
    promptHistory,
    rightPanel,
    sessionPanelOpen,
    selectedPreviewElements,
    selectedHtmlPreviewSourceId,
    clearSelectedPreviewElements,
    setSelectedPreviewElements,
    setHoveredPreviewSelectionKey,
    setDrillTarget,
    showErrorCard,
    showGitPreviewPane,
    showHeaderPreviewAction,
    showHeaderFileAction,
    showHeaderGitAction,
    showHeaderOpenWithAction,
    showHeaderSessionAction,
    showPreviewPane,
    sidePanelTitle,
    stagedGitEntryCount,
    toggleFilePanel,
    toggleGitPanel,
    togglePreviewPanel,
    toggleOpenWithMenu,
    toggleSessionPanel,
    userMessageCount,
  }
}
