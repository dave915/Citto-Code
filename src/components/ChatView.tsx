import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { Session, PermissionMode, SidebarMode } from '../store/sessions'
import { useSessionsStore } from '../store/sessions'
import { useFileExplorer } from '../hooks/useFileExplorer'
import { useGitPanel } from '../hooks/useGitPanel'
import { useI18n } from '../hooks/useI18n'
import { InputArea } from './InputArea'
import { BranchCreateModal } from './chat/BranchCreateModal'
import { ChatHeader } from './chat/ChatHeader'
import { ChatMessagePane } from './chat/ChatMessagePane'
import { ChatSidePanel } from './chat/ChatSidePanel'
import type { GitDiffResult, GitLogEntry, GitStatusEntry, SelectedFile } from '../../electron/preload'
import {
  buildDefaultSavePath,
  buildSessionExportFileName,
  buildSessionJsonExport,
  buildSessionMarkdownExport,
  calculateContextUsagePercentFromTokens,
  estimateContextUsagePercent,
  type SessionExportFormat,
} from '../lib/sessionExport'
import {
  buildGitDraft,
  type GitDraftAction,
} from '../lib/gitUtils'
import { matchShortcut } from '../lib/shortcuts'
import { useChatOpenWith } from '../hooks/useChatOpenWith'

type AskAboutSelectionPayload = {
  kind: 'diff' | 'code'
  path: string
  startLine: number
  endLine: number
  code: string
  prompt?: string
}

type Props = {
  session: Session
  fileConflict?: {
    paths: string[]
    sessionNames: string[]
  } | null
  jumpToMessageId?: string | null
  jumpToMessageToken?: number
  onSend: (text: string, files: SelectedFile[]) => void
  onAbort: () => void
  onPermissionRequestAction: (action: 'once' | 'always' | 'deny') => void
  onQuestionResponse: (answer: string | null) => void
  sidebarMode: SidebarMode
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  sidebarShortcutLabel: string
  filesShortcutLabel: string
  sessionInfoShortcutLabel: string
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
}

const INITIAL_RIGHT_PANEL_WIDTH = 290
const INITIAL_SESSION_PANEL_WIDTH = 290
const INITIAL_EXPLORER_WIDTH = 290
const INITIAL_GIT_LOG_PANEL_HEIGHT = 260
const INITIAL_GIT_COMMIT_PANEL_HEIGHT = 116
const RIGHT_PANEL_MAX_WIDTH_RATIO = 0.85
const HEADER_OPEN_WITH_MIN_WIDTH = 640
const HEADER_SESSION_ACTION_MIN_WIDTH = 700
const HEADER_GIT_ACTION_MIN_WIDTH = 756
const HEADER_FILE_ACTION_MIN_WIDTH = 812

export function ChatView({
  session, fileConflict, jumpToMessageId, jumpToMessageToken, onSend, onAbort, onPermissionRequestAction, onQuestionResponse, sidebarMode, sidebarCollapsed, onToggleSidebar,
  sidebarShortcutLabel, filesShortcutLabel, sessionInfoShortcutLabel,
  onPermissionModeChange, onPlanModeChange, onModelChange, permissionShortcutLabel, bypassShortcutLabel,
}: Props) {
  const { language, t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const mainPaneRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const messageHighlightTimerRef = useRef<number | null>(null)
  const openWithMenuRef = useRef<HTMLDivElement>(null)
  const prevFilePanelOpenRef = useRef(false)
  const prevShowPreviewPaneRef = useRef(false)
  const prevShowGitPreviewPaneRef = useRef(false)
  const filePanelWidthBeforePreviewRef = useRef<number | null>(null)
  const gitPanelWidthBeforePreviewRef = useRef<number | null>(null)
  const lastMsg = session.messages[session.messages.length - 1]
  const [rightPanel, setRightPanel] = useState<'none' | 'files' | 'session' | 'git'>('none')
  const [filePanelWidth, setFilePanelWidth] = useState(INITIAL_RIGHT_PANEL_WIDTH)
  const [explorerWidth, setExplorerWidth] = useState(INITIAL_EXPLORER_WIDTH)
  const [gitLogPanelHeight, setGitLogPanelHeight] = useState(INITIAL_GIT_LOG_PANEL_HEIGHT)
  const [gitCommitPanelHeight, setGitCommitPanelHeight] = useState(INITIAL_GIT_COMMIT_PANEL_HEIGHT)
  const [externalDraft, setExternalDraft] = useState<{ id: number; text: string } | null>(null)
  const [mainPaneWidth, setMainPaneWidth] = useState(0)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [exportingFormat, setExportingFormat] = useState<SessionExportFormat | null>(null)
  const [copyingFormat, setCopyingFormat] = useState<SessionExportFormat | null>(null)
  const [sessionExportStatus, setSessionExportStatus] = useState<string | null>(null)
  const [sessionExportError, setSessionExportError] = useState<string | null>(null)
  const preferredOpenWithAppId = useSessionsStore((state) => state.preferredOpenWithAppId)
  const setPreferredOpenWithAppId = useSessionsStore((state) => state.setPreferredOpenWithAppId)
  const fileExplorer = useFileExplorer({
    cwd: session.cwd || '~',
    filePanelOpen: rightPanel === 'files',
  })
  const gitPanel = useGitPanel({
    cwd: session.cwd || '~',
    gitPanelOpen: rightPanel === 'git',
  })
  const isNewSession = session.messages.length === 0
  const showPreviewPane = fileExplorer.selectedEntry !== null
  const filePanelOpen = rightPanel === 'files'
  const sessionPanelOpen = rightPanel === 'session'
  const gitPanelOpen = rightPanel === 'git'
  const openTargetPath = session.cwd || '~'
  const effectiveMainPaneWidth = mainPaneWidth || Number.POSITIVE_INFINITY
  const promptHistory = session.messages
    .filter((message) => message.role === 'user' && message.text.trim().length > 0)
    .map((message) => message.text)
  const lastAssistantMessage = [...session.messages].reverse().find((message) => message.role === 'assistant')
  const latestAssistantMessageId = lastAssistantMessage?.id ?? null
  const showErrorCard = Boolean(
    session.error &&
    session.error.trim() &&
    session.error.trim() !== (lastAssistantMessage?.text.trim() ?? '')
  )
  const userMessageCount = session.messages.filter((message) => message.role === 'user').length
  const assistantMessageCount = session.messages.filter((message) => message.role === 'assistant').length
  const totalCharacters = session.messages.reduce((sum, message) => sum + message.text.length, 0)
  const totalToolCalls = session.messages.reduce((sum, message) => sum + message.toolCalls.length, 0)
  const totalAttachments = session.messages.reduce((sum, message) => sum + (message.attachedFiles?.length ?? 0), 0)
  const contextUsagePercent = session.tokenUsage !== null
    ? calculateContextUsagePercentFromTokens(session.tokenUsage)
    : estimateContextUsagePercent(totalCharacters, totalToolCalls, totalAttachments)
  const fileConflictLabel = useMemo(() => {
    if (!fileConflict || fileConflict.paths.length === 0) return null
    const labels = fileConflict.paths.map((path) => path.split('/').filter(Boolean).pop() || path)
    if (labels.length === 1) return labels[0]
    if (labels.length === 2) return `${labels[0]}, ${labels[1]}`
    return language === 'en'
      ? `${labels[0]}, ${labels[1]}, ${t('chatView.otherSessions', { count: labels.length - 2 })}`
      : `${labels[0]}, ${labels[1]} 외 ${labels.length - 2}개`
  }, [fileConflict, language, t])
  const conflictSessionLabel = useMemo(() => {
    if (!fileConflict || fileConflict.sessionNames.length === 0) return t('app.anotherSession')
    if (fileConflict.sessionNames.length === 1) return fileConflict.sessionNames[0]
    return language === 'en'
      ? `${fileConflict.sessionNames[0]}, ${t('chatView.otherSessionCount', { count: fileConflict.sessionNames.length - 1 })}`
      : `${fileConflict.sessionNames[0]} 외 ${fileConflict.sessionNames.length - 1}개 세션`
  }, [fileConflict, language, t])
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
  const showGitPreviewPane = gitPanel.showGitPreviewPane
  const gitAvailable = gitPanel.gitAvailable
  const showHeaderOpenWithAction = openWithMenuOpen || effectiveMainPaneWidth >= HEADER_OPEN_WITH_MIN_WIDTH
  const showHeaderSessionAction = sessionPanelOpen || effectiveMainPaneWidth >= HEADER_SESSION_ACTION_MIN_WIDTH
  const showHeaderGitAction = gitPanelOpen || effectiveMainPaneWidth >= HEADER_GIT_ACTION_MIN_WIDTH
  const showHeaderFileAction = filePanelOpen || effectiveMainPaneWidth >= HEADER_FILE_ACTION_MIN_WIDTH
  const stagedGitEntryCount = gitPanel.stagedGitEntryCount
  const handleAskAboutSelection = ({ kind, path, startLine, endLine, code, prompt }: AskAboutSelectionPayload) => {
    const lineLabel = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`
    const nextText = [
      prompt?.trim()
        ? kind === 'diff'
          ? t('chatView.askAboutDiffWithPrompt')
          : t('chatView.askAboutCodeWithPrompt')
        : kind === 'diff'
          ? t('chatView.askAboutDiff')
          : t('chatView.askAboutCode'),
      '',
      `${t('chatView.file')}: ${path}`,
      `${t('chatView.line')}: ${lineLabel}`,
      '```',
      code,
      '```',
      ...(prompt?.trim() ? ['', `${t('chatView.request')}: ${prompt.trim()}`] : []),
    ].join('\n')

    setExternalDraft({ id: Date.now(), text: nextText })
  }

  const handleExportSession = async (format: SessionExportFormat) => {
    const suggestedName = buildSessionExportFileName(session, format)
    const content = format === 'markdown'
      ? buildSessionMarkdownExport(session, language)
      : buildSessionJsonExport(session)

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
    const content = format === 'markdown'
      ? buildSessionMarkdownExport(session, language)
      : buildSessionJsonExport(session)

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

  const getRightPanelMaxWidth = () => {
    const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
    return Math.max(INITIAL_SESSION_PANEL_WIDTH, Math.floor(containerWidth * RIGHT_PANEL_MAX_WIDTH_RATIO))
  }

  const toggleFilePanel = () => {
    if (filePanelOpen) {
      setRightPanel('none')
      return
    }

    setRightPanel('files')
  }

  const toggleGitPanel = () => {
    if (gitPanelOpen) {
      setRightPanel('none')
      return
    }

    setRightPanel('git')
  }

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages.length, lastMsg?.text?.length, lastMsg?.thinking?.length, lastMsg?.toolCalls.length])

  useEffect(() => {
    setExportingFormat(null)
    setCopyingFormat(null)
    setSessionExportStatus(null)
    setSessionExportError(null)
  }, [session.id])

  useEffect(() => {
    if (!jumpToMessageId || !jumpToMessageToken) return

    const targetNode = messageRefs.current[jumpToMessageId]
    if (!targetNode) return

    targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(jumpToMessageId)

    if (messageHighlightTimerRef.current != null) {
      window.clearTimeout(messageHighlightTimerRef.current)
    }

    messageHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === jumpToMessageId ? null : current))
      messageHighlightTimerRef.current = null
    }, 2200)
  }, [jumpToMessageId, jumpToMessageToken, session.messages.length])

  useEffect(() => () => {
    if (messageHighlightTimerRef.current != null) {
      window.clearTimeout(messageHighlightTimerRef.current)
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
        setRightPanel((open) => open === 'session' ? 'none' : 'session')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filePanelOpen, filesShortcutLabel, sessionInfoShortcutLabel])

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
      Math.max(explorerWidth + 260, Math.floor(containerWidth / 2))
    )
    setFilePanelWidth(targetWidth)
  }, [explorerWidth, filePanelOpen, filePanelWidth, showPreviewPane])

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
      Math.max(explorerWidth + 180, Math.floor(containerWidth / 2))
    )
    setFilePanelWidth((current) => Math.max(current, targetWidth))
  }, [explorerWidth, filePanelWidth, gitPanelOpen, showGitPreviewPane])

  useEffect(() => {
    if (!sessionPanelOpen) return
    setFilePanelWidth(INITIAL_SESSION_PANEL_WIDTH)
  }, [sessionPanelOpen])
  const handleFilePanelResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = filePanelWidth
    const minimumWidth = showPreviewPane || showGitPreviewPane ? Math.max(320, explorerWidth + 140) : explorerWidth
    const maximumWidth = getRightPanelMaxWidth()

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(maximumWidth, Math.max(minimumWidth, startWidth - (moveEvent.clientX - startX)))
      setFilePanelWidth(nextWidth)
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleExplorerResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = explorerWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(filePanelWidth - 260, Math.max(180, startWidth - (moveEvent.clientX - startX)))
      setExplorerWidth(nextWidth)
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleGitLogResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = gitLogPanelHeight
    const sidebarHeight = gitPanel.gitSidebarRef.current?.clientHeight ?? 0
    const maxHeight = Math.max(120, sidebarHeight - gitCommitPanelHeight - 180)

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = Math.min(maxHeight, Math.max(96, startHeight + (moveEvent.clientY - startY)))
      setGitLogPanelHeight(nextHeight)
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleGitCommitResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = gitCommitPanelHeight
    const sidebarHeight = gitPanel.gitSidebarRef.current?.clientHeight ?? 0
    const maxHeight = Math.max(108, sidebarHeight - gitLogPanelHeight - 180)

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = Math.min(maxHeight, Math.max(92, startHeight - (moveEvent.clientY - startY)))
      setGitCommitPanelHeight(nextHeight)
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div ref={containerRef} className="flex h-full bg-claude-bg">
      <div ref={mainPaneRef} className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          isNewSession={isNewSession}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          sidebarShortcutLabel={sidebarShortcutLabel}
          sessionCwd={session.cwd}
          gitStatus={gitPanel.gitStatus}
          branchMenuRef={gitPanel.branchMenuRef}
          branchSearchInputRef={gitPanel.branchSearchInputRef}
          branchMenuOpen={gitPanel.branchMenuOpen}
          branchQuery={gitPanel.branchQuery}
          filteredGitBranches={gitPanel.filteredGitBranches}
          gitBranchesLoading={gitPanel.gitBranchesLoading}
          gitActionLoading={gitPanel.gitActionLoading}
          gitLoading={gitPanel.gitLoading}
          onToggleBranchMenu={() => {
            gitPanel.setBranchMenuOpen((open) => {
              const nextOpen = !open
              if (nextOpen) gitPanel.setBranchQuery('')
              return nextOpen
            })
          }}
          onBranchQueryChange={gitPanel.setBranchQuery}
          onSelectBranch={(name) => {
            gitPanel.setBranchMenuOpen(false)
            void gitPanel.handleSwitchGitBranch(name)
          }}
          onDeleteBranch={gitPanel.handleDeleteGitBranch}
          onOpenBranchCreateModal={gitPanel.handleOpenBranchCreateModal}
          onInitGitRepo={gitPanel.handleInitGitRepo}
          onPullGit={gitPanel.handlePullGit}
          onPushGit={gitPanel.handlePushGit}
          showHeaderOpenWithAction={showHeaderOpenWithAction}
          openWithMenuRef={openWithMenuRef}
          openWithMenuOpen={openWithMenuOpen}
          openWithLoading={openWithLoading}
          openWithApps={openWithApps}
          defaultOpenWithApp={defaultOpenWithApp}
          preferredOpenWithAppId={preferredOpenWithAppId}
          onDefaultOpen={handleDefaultOpen}
          onToggleOpenWithMenu={toggleOpenWithMenu}
          onOpenWith={handleOpenWith}
          showHeaderSessionAction={showHeaderSessionAction}
          sessionPanelOpen={sessionPanelOpen}
          sessionInfoShortcutLabel={sessionInfoShortcutLabel}
          onToggleSessionPanel={() => setRightPanel((open) => open === 'session' ? 'none' : 'session')}
          gitAvailable={gitAvailable}
          showHeaderGitAction={showHeaderGitAction}
          gitPanelOpen={gitPanelOpen}
          onToggleGitPanel={toggleGitPanel}
          showHeaderFileAction={showHeaderFileAction}
          filePanelOpen={filePanelOpen}
          filesShortcutLabel={filesShortcutLabel}
          onToggleFilePanel={toggleFilePanel}
          onHeaderDoubleClick={handleHeaderDoubleClick}
        />

        <ChatMessagePane
          session={session}
          isNewSession={isNewSession}
          fileConflict={fileConflict}
          fileConflictLabel={fileConflictLabel}
          conflictSessionLabel={conflictSessionLabel}
          highlightedMessageId={highlightedMessageId}
          latestAssistantMessageId={latestAssistantMessageId}
          showErrorCard={showErrorCard}
          messageRefs={messageRefs}
          bottomRef={bottomRef}
          onSend={(text) => onSend(text, [])}
          onAbort={onAbort}
          onAskAboutSelection={handleAskAboutSelection}
        />
        {/* 입력창 (설정 툴바 포함) */}
        <InputArea
          cwd={session.cwd}
          promptHistory={promptHistory}
          onSend={onSend}
          onAbort={onAbort}
          isStreaming={session.isStreaming}
          pendingPermission={session.pendingPermission}
          onPermissionRequestAction={onPermissionRequestAction}
          pendingQuestion={session.pendingQuestion}
          onQuestionResponse={onQuestionResponse}
          permissionMode={session.permissionMode}
          planMode={session.planMode}
          model={session.model}
          onPermissionModeChange={onPermissionModeChange}
          onPlanModeChange={onPlanModeChange}
          onModelChange={onModelChange}
          permissionShortcutLabel={permissionShortcutLabel}
          bypassShortcutLabel={bypassShortcutLabel}
          externalDraft={externalDraft}
        />
      </div>

      {rightPanel !== 'none' && (
        <div
          onMouseDown={handleFilePanelResizeStart}
          className="w-1.5 cursor-col-resize bg-transparent hover:bg-claude-border/80 transition-colors flex-shrink-0"
        />
      )}

      <ChatSidePanel
        visible={rightPanel !== 'none'}
        title={filePanelOpen ? t('sidePanel.fileExplorer') : gitPanelOpen ? 'Git' : t('sidePanel.sessionInfo')}
        filePanelOpen={filePanelOpen}
        gitPanelOpen={gitPanelOpen}
        showPreviewPane={showPreviewPane}
        showGitPreviewPane={showGitPreviewPane}
        explorerWidth={explorerWidth}
        panelWidth={filePanelWidth}
        session={session}
        userMessageCount={userMessageCount}
        assistantMessageCount={assistantMessageCount}
        promptHistoryCount={promptHistory.length}
        contextUsagePercent={contextUsagePercent}
        exportingFormat={exportingFormat}
        copyingFormat={copyingFormat}
        exportStatus={sessionExportStatus}
        exportError={sessionExportError}
        stagedGitEntryCount={stagedGitEntryCount}
        fileExplorer={fileExplorer}
        gitPanel={gitPanel}
        onCreateDraft={handleCreateGitDraft}
        onExplorerResizeStart={handleExplorerResizeStart}
        onGitLogResizeStart={handleGitLogResizeStart}
        onGitCommitResizeStart={handleGitCommitResizeStart}
        gitLogPanelHeight={gitLogPanelHeight}
        gitCommitPanelHeight={gitCommitPanelHeight}
        onCompact={() => onSend('/compact', [])}
        onExportSession={handleExportSession}
        onCopySessionExport={handleCopySessionExport}
      />

      <BranchCreateModal
        open={gitPanel.branchCreateModalOpen}
        branchCreateInputRef={gitPanel.branchCreateInputRef}
        gitNewBranchName={gitPanel.gitNewBranchName}
        gitActionLoading={gitPanel.gitActionLoading}
        onClose={() => gitPanel.setBranchCreateModalOpen(false)}
        onNameChange={gitPanel.setGitNewBranchName}
        onCreate={gitPanel.handleCreateGitBranch}
      />
    </div>
  )
}
