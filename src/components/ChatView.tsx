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
import { useChatViewJumpState } from '../hooks/useChatViewJumpState'
import {
  useChatViewLayout,
  type ChatViewRightPanel,
} from '../hooks/useChatViewLayout'
import { InputArea } from './InputArea'
import { SubagentDrilldownView } from './SubagentDrilldownView'
import { BranchCreateModal } from './chat/BranchCreateModal'
import { AgentStatusBar } from './chat/AgentStatusBar'
import { ChatHeader } from './chat/ChatHeader'
import { ChatMessagePane } from './chat/ChatMessagePane'
import { ChatSidePanel } from './chat/ChatSidePanel'
import type { GitDiffResult, GitLogEntry, GitStatusEntry, SelectedFile } from '../../electron/preload'
import {
  buildDefaultSavePath,
  buildSessionExportFileName,
  type SessionExportFormat,
} from '../lib/sessionExport'
import {
  buildGitDraft,
  type GitDraftAction,
} from '../lib/gitUtils'
import { getCurrentPlatform } from '../lib/shortcuts'
import { useChatOpenWith } from '../hooks/useChatOpenWith'
import {
  buildAskAboutSelectionDraft,
  buildChatViewDerivedState,
  buildSessionExportContent,
  type AskAboutSelectionPayload,
  type FileConflict,
} from './chat/chatViewUtils'

type Props = {
  session: Session
  fileConflict?: FileConflict | null
  jumpToMessageId?: string | null
  jumpToMessageToken?: number
  onSend: (text: string, files: SelectedFile[]) => void
  onSendBtw: (text: string, files: SelectedFile[]) => void
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
  onOpenTeam?: () => void
}

const HEADER_OPEN_WITH_MIN_WIDTH = 640
const HEADER_SESSION_ACTION_MIN_WIDTH = 700
const HEADER_GIT_ACTION_MIN_WIDTH = 756
const HEADER_FILE_ACTION_MIN_WIDTH = 812

export function ChatView({
  session, fileConflict, jumpToMessageId, jumpToMessageToken, onSend, onSendBtw, onAbort, onPermissionRequestAction, onQuestionResponse, sidebarMode, sidebarCollapsed, onToggleSidebar,
  sidebarShortcutLabel, filesShortcutLabel, sessionInfoShortcutLabel,
  onPermissionModeChange, onPlanModeChange, onModelChange, permissionShortcutLabel, bypassShortcutLabel,
  onOpenTeam,
}: Props) {
  const { language, t } = useI18n()
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
  const toggleBtwCard = useSessionsStore((state) => state.toggleBtwCard)
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
          onToggleBranchMenu={handleToggleBranchMenu}
          onBranchQueryChange={gitPanel.setBranchQuery}
          onSelectBranch={handleSelectBranch}
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
          onToggleSessionPanel={toggleSessionPanel}
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

        {drillTarget ? (
          <SubagentDrilldownView
            session={session}
            toolUseId={drillTarget.toolUseId}
            title={drillTarget.title}
            onBack={() => setDrillTarget(null)}
            onSendToMain={onSend}
            onSendBtwToMain={onSendBtw}
            permissionMode={session.permissionMode}
            planMode={session.planMode}
            model={session.model}
            onPermissionModeChange={onPermissionModeChange}
            onPlanModeChange={onPlanModeChange}
            onModelChange={onModelChange}
            permissionShortcutLabel={permissionShortcutLabel}
            bypassShortcutLabel={bypassShortcutLabel}
            onOpenTeam={onOpenTeam}
            hasLinkedTeam={Boolean(session.linkedTeamId)}
          />
        ) : (
          <>
            <ChatMessagePane
              session={session}
              isNewSession={isNewSession}
              fileConflict={fileConflict}
              fileConflictLabel={fileConflictLabel}
              conflictSessionLabel={conflictSessionLabel}
              highlightedMessageId={highlightedMessageId}
              activeHtmlPreviewMessageId={activeHtmlPreviewMessageId}
              hideHtmlPreview={hideHtmlPreview}
              showErrorCard={showErrorCard}
              messageRefs={messageRefs}
              bottomRef={bottomRef}
              onSend={(text) => onSend(text, [])}
              onAbort={onAbort}
              onAskAboutSelection={handleAskAboutSelection}
              onToggleBtwCard={(cardId) => toggleBtwCard(session.id, cardId)}
            />
            <InputArea
              cwd={session.cwd}
              promptHistory={promptHistory}
              onSend={onSend}
              onSendBtw={onSendBtw}
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
              topSlot={(
                <AgentStatusBar
                  session={session}
                  onDrillDown={(target) => setDrillTarget(target)}
                />
              )}
              onOpenTeam={onOpenTeam}
              hasLinkedTeam={Boolean(session.linkedTeamId)}
            />
          </>
        )}
      </div>

      {rightPanel !== 'none' && (
        <div
          onMouseDown={handleFilePanelResizeStart}
          className="w-1.5 cursor-col-resize bg-transparent hover:bg-claude-border/80 transition-colors flex-shrink-0"
        />
      )}

      <ChatSidePanel
        visible={rightPanel !== 'none'}
        title={sidePanelTitle}
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
        onGitLogResizeStart={(event) => handleGitLogResizeStart(event, gitPanel.gitSidebarRef.current?.clientHeight ?? 0)}
        onGitCommitResizeStart={(event) => handleGitCommitResizeStart(event, gitPanel.gitSidebarRef.current?.clientHeight ?? 0)}
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
