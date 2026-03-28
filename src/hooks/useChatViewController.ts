import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type {
  GitDiffResult,
  GitLogEntry,
  GitStatusEntry,
} from '../../electron/preload'
import { buildGitDraft, type GitDraftAction } from '../lib/gitUtils'
import { getCurrentPlatform } from '../lib/shortcuts'
import {
  buildDefaultSavePath,
  buildSessionExportFileName,
  type SessionExportFormat,
} from '../lib/sessionExport'
import { useChatOpenWith } from './useChatOpenWith'
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
  buildAskAboutSelectionDraft,
  buildChatViewDerivedState,
  buildSessionExportContent,
  type AskAboutSelectionPayload,
  type FileConflict,
} from '../components/chat/chatViewUtils'
import type { AppLanguage, TranslationKey } from '../lib/i18n'

const HEADER_OPEN_WITH_MIN_WIDTH = 640
const HEADER_SESSION_ACTION_MIN_WIDTH = 700
const HEADER_GIT_ACTION_MIN_WIDTH = 756
const HEADER_FILE_ACTION_MIN_WIDTH = 812

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
  const [rightPanel, setRightPanel] = useState<ChatViewRightPanel>('none')
  const [externalDraft, setExternalDraft] = useState<{ id: number; text: string } | null>(null)
  const [exportingFormat, setExportingFormat] = useState<SessionExportFormat | null>(null)
  const [copyingFormat, setCopyingFormat] = useState<SessionExportFormat | null>(null)
  const [sessionExportStatus, setSessionExportStatus] = useState<string | null>(null)
  const [sessionExportError, setSessionExportError] = useState<string | null>(null)
  const [drillTarget, setDrillTarget] = useState<{ toolUseId: string; title: string } | null>(null)

  const preferredOpenWithAppId = useSessionsStore((state) => state.preferredOpenWithAppId)
  const setPreferredOpenWithAppId = useSessionsStore((state) => state.setPreferredOpenWithAppId)

  const filePanelOpen = rightPanel === 'files'
  const sessionPanelOpen = rightPanel === 'session'
  const gitPanelOpen = rightPanel === 'git'
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
  })

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
    activeHtmlPreviewMessageId,
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

  const openTargetPath = session.cwd || '~'
  const effectiveMainPaneWidth = mainPaneWidth || Number.POSITIVE_INFINITY
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
  const showHeaderGitAction = gitPanelOpen || effectiveMainPaneWidth >= HEADER_GIT_ACTION_MIN_WIDTH
  const showHeaderFileAction = filePanelOpen || effectiveMainPaneWidth >= HEADER_FILE_ACTION_MIN_WIDTH
  const stagedGitEntryCount = gitPanel.stagedGitEntryCount
  const sidePanelTitle = filePanelOpen
    ? t('sidePanel.fileExplorer')
    : gitPanelOpen
      ? 'Git'
      : t('sidePanel.sessionInfo')

  useEffect(() => {
    setExportingFormat(null)
    setCopyingFormat(null)
    setSessionExportStatus(null)
    setSessionExportError(null)
    setDrillTarget(null)
  }, [session.id])

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

  const handleAskAboutSelection = (payload: AskAboutSelectionPayload) => {
    setExternalDraft({
      id: Date.now(),
      text: buildAskAboutSelectionDraft(payload, t),
    })
  }

  const handleExportSession = async (format: SessionExportFormat) => {
    const suggestedName = buildSessionExportFileName(session, format)
    const content = buildSessionExportContent(format, session, language)

    setExportingFormat(format)
    setSessionExportStatus(null)
    setSessionExportError(null)

    try {
      const result = await window.claude.saveTextFile({
        suggestedName,
        defaultPath: buildDefaultSavePath(session.cwd, suggestedName),
        content,
        filters: format === 'markdown'
          ? [{ name: 'Markdown', extensions: ['md'] }]
          : [{ name: 'JSON', extensions: ['json'] }],
      })

      if (result.ok) {
        setSessionExportStatus(result.path ? t('chatView.savedPath', { path: result.path }) : t('chatView.sessionSaved'))
        return
      }

      if (!result.canceled) {
        setSessionExportError(result.error ?? t('chatView.exportFailed'))
      }
    } catch {
      setSessionExportError(t('chatView.exportFailed'))
    } finally {
      setExportingFormat(null)
    }
  }

  const handleCopySessionExport = async (format: SessionExportFormat) => {
    const content = buildSessionExportContent(format, session, language)

    setCopyingFormat(format)
    setSessionExportStatus(null)
    setSessionExportError(null)

    try {
      await navigator.clipboard.writeText(content)
      setSessionExportStatus(t('chatView.clipboardCopied', { format: format === 'markdown' ? 'Markdown' : 'JSON' }))
    } catch {
      setSessionExportError(t('chatView.clipboardFailed'))
    } finally {
      setCopyingFormat(null)
    }
  }

  const handleCreateGitDraft = (
    action: GitDraftAction,
    payload: {
      entry: GitStatusEntry | null
      commit: GitLogEntry | null
      gitDiff: GitDiffResult | null
    },
  ) => {
    const draft = buildGitDraft(action, payload, language)
    if (!draft) return
    setExternalDraft({ id: Date.now(), text: draft })
  }

  const handleHeaderDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select, [data-no-drag="true"]')) return
    void window.claude.toggleWindowMaximize()
  }

  return {
    activeHtmlPreviewMessageId,
    assistantMessageCount,
    bottomRef,
    conflictSessionLabel,
    containerRef,
    contextUsagePercent,
    copyingFormat,
    defaultOpenWithApp,
    drillTarget,
    explorerWidth,
    exportError: sessionExportError,
    exportStatus: sessionExportStatus,
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
    highlightedMessageId,
    isNewSession,
    mainPaneRef,
    messageRefs,
    openWithApps,
    openWithLoading,
    openWithMenuOpen,
    openWithMenuRef,
    preferredOpenWithAppId,
    promptHistory,
    rightPanel,
    sessionPanelOpen,
    setDrillTarget,
    showErrorCard,
    showGitPreviewPane,
    showHeaderFileAction,
    showHeaderGitAction,
    showHeaderOpenWithAction,
    showHeaderSessionAction,
    showPreviewPane,
    sidePanelTitle,
    stagedGitEntryCount,
    toggleFilePanel,
    toggleGitPanel,
    toggleOpenWithMenu,
    toggleSessionPanel,
    userMessageCount,
  }
}
