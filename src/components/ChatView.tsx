import type { SidebarMode, Session, PermissionMode } from '../store/sessions'
import { useSessionsStore } from '../store/sessions'
import { useI18n } from '../hooks/useI18n'
import { useChatViewController } from '../hooks/useChatViewController'
import { BranchCreateModal } from './chat/BranchCreateModal'
import { ChatHeader } from './chat/ChatHeader'
import { ChatSidePanel } from './chat/ChatSidePanel'
import { ChatViewMainContent } from './chat/ChatViewMainContent'
import type { SelectedFile } from '../../electron/preload'
import type { FileConflict } from './chat/chatViewUtils'

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
  onDismissModelSwitchNotice: () => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
  onOpenTeam?: () => void
}

export function ChatView({
  session,
  fileConflict,
  jumpToMessageId,
  jumpToMessageToken,
  onSend,
  onSendBtw,
  onAbort,
  onPermissionRequestAction,
  onQuestionResponse,
  sidebarCollapsed,
  onToggleSidebar,
  sidebarShortcutLabel,
  filesShortcutLabel,
  sessionInfoShortcutLabel,
  onDismissModelSwitchNotice,
  onPermissionModeChange,
  onPlanModeChange,
  onModelChange,
  permissionShortcutLabel,
  bypassShortcutLabel,
  onOpenTeam,
}: Props) {
  const { language, t } = useI18n()
  const toggleBtwCard = useSessionsStore((state) => state.toggleBtwCard)

  const controller = useChatViewController({
    fileConflict,
    filesShortcutLabel,
    jumpToMessageId,
    jumpToMessageToken,
    language,
    session,
    sessionInfoShortcutLabel,
    t,
  })

  return (
    <div ref={controller.containerRef} className="flex h-full bg-claude-bg">
      <div ref={controller.mainPaneRef} className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          isNewSession={controller.isNewSession}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          sidebarShortcutLabel={sidebarShortcutLabel}
          sessionCwd={session.cwd}
          gitStatus={controller.gitPanel.gitStatus}
          branchMenuRef={controller.gitPanel.branchMenuRef}
          branchSearchInputRef={controller.gitPanel.branchSearchInputRef}
          branchMenuOpen={controller.gitPanel.branchMenuOpen}
          branchQuery={controller.gitPanel.branchQuery}
          filteredGitBranches={controller.gitPanel.filteredGitBranches}
          gitBranchesLoading={controller.gitPanel.gitBranchesLoading}
          gitActionLoading={controller.gitPanel.gitActionLoading}
          gitLoading={controller.gitPanel.gitLoading}
          onToggleBranchMenu={controller.handleToggleBranchMenu}
          onBranchQueryChange={controller.gitPanel.setBranchQuery}
          onSelectBranch={controller.handleSelectBranch}
          onDeleteBranch={controller.gitPanel.handleDeleteGitBranch}
          onOpenBranchCreateModal={controller.gitPanel.handleOpenBranchCreateModal}
          onInitGitRepo={controller.gitPanel.handleInitGitRepo}
          onPullGit={controller.gitPanel.handlePullGit}
          onPushGit={controller.gitPanel.handlePushGit}
          showHeaderOpenWithAction={controller.showHeaderOpenWithAction}
          openWithMenuRef={controller.openWithMenuRef}
          openWithMenuOpen={controller.openWithMenuOpen}
          openWithLoading={controller.openWithLoading}
          openWithApps={controller.openWithApps}
          defaultOpenWithApp={controller.defaultOpenWithApp}
          preferredOpenWithAppId={controller.preferredOpenWithAppId}
          onDefaultOpen={controller.handleDefaultOpen}
          onToggleOpenWithMenu={controller.toggleOpenWithMenu}
          onOpenWith={controller.handleOpenWith}
          sessionPanelOpen={controller.sessionPanelOpen}
          sessionInfoShortcutLabel={sessionInfoShortcutLabel}
          previewPanelOpen={controller.previewPanelOpen}
          previewAvailable={controller.previewAvailable}
          gitAvailable={controller.gitAvailable}
          gitPanelOpen={controller.gitPanelOpen}
          filePanelOpen={controller.filePanelOpen}
          filesShortcutLabel={filesShortcutLabel}
          onTogglePanel={controller.togglePanel}
          onHeaderDoubleClick={controller.handleHeaderDoubleClick}
        />

        <ChatViewMainContent
          bottomRef={controller.bottomRef}
          bypassShortcutLabel={bypassShortcutLabel}
          conflictSessionLabel={controller.conflictSessionLabel}
          drillTarget={controller.drillTarget}
          externalDraft={controller.externalDraft}
          fileConflict={fileConflict}
          fileConflictLabel={controller.fileConflictLabel}
          hasLinkedTeam={Boolean(session.linkedTeamId)}
          highlightedMessageId={controller.highlightedMessageId}
          isNewSession={controller.isNewSession}
          messageRefs={controller.messageRefs}
          previewSelectionResetToken={controller.previewSelectionResetToken}
          promptHistory={controller.promptHistory}
          onAbort={onAbort}
          onAskAboutSelection={controller.handleAskAboutSelection}
          onCloseDrilldown={() => controller.setDrillTarget(null)}
          onDismissModelSwitchNotice={onDismissModelSwitchNotice}
          onModelChange={onModelChange}
          onOpenTeam={onOpenTeam}
          onOpenDrilldown={controller.setDrillTarget}
          onPermissionModeChange={onPermissionModeChange}
          onPermissionRequestAction={onPermissionRequestAction}
          onPreviewSelectionDraftsChange={controller.setSelectedPreviewElements}
          onPreviewSelectionHoverChange={controller.setHoveredPreviewSelectionKey}
          onPlanModeChange={onPlanModeChange}
          onQuestionResponse={onQuestionResponse}
          onSend={onSend}
          onSendBtw={onSendBtw}
          onToggleBtwCard={(cardId) => toggleBtwCard(session.id, cardId)}
          permissionShortcutLabel={permissionShortcutLabel}
          session={session}
          showErrorCard={controller.showErrorCard}
        />
      </div>

      {controller.sidePanelVisible && (
        <div
          onPointerDown={controller.handleFilePanelResizeStart}
          className="w-1.5 flex-shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-claude-border/80"
        />
      )}

      <ChatSidePanel
        visible={controller.sidePanelVisible}
        openPanels={controller.openPanels}
        showPreviewPane={controller.showPreviewPane}
        showGitPreviewPane={controller.showGitPreviewPane}
        explorerWidth={controller.explorerWidth}
        panelWidth={controller.filePanelWidth}
        session={session}
        userMessageCount={controller.userMessageCount}
        assistantMessageCount={controller.assistantMessageCount}
        promptHistoryCount={controller.promptHistory.length}
        contextUsagePercent={controller.contextUsagePercent}
        exportingFormat={controller.exportingFormat}
        copyingFormat={controller.copyingFormat}
        exportStatus={controller.exportStatus}
        exportError={controller.exportError}
        stagedGitEntryCount={controller.stagedGitEntryCount}
        fileExplorer={controller.fileExplorer}
        gitPanel={controller.gitPanel}
        activeHtmlPreviewSource={controller.activeHtmlPreviewSource}
        htmlPreviewSources={controller.htmlPreviewSources}
        selectedHtmlPreviewSourceId={controller.selectedHtmlPreviewSourceId}
        hideHtmlPreview={controller.hideHtmlPreview}
        htmlPreviewIsStreaming={session.isStreaming && controller.activeHtmlPreviewSource?.messageId === session.currentAssistantMsgId}
        onPreviewElementSelection={controller.handlePreviewElementSelection}
        onSelectHtmlPreviewSource={controller.handleSelectHtmlPreviewSource}
        onClearSelectedPreviewElements={controller.clearSelectedPreviewElements}
        selectedPreviewElements={controller.selectedPreviewElements}
        hoveredPreviewSelectionKey={controller.hoveredPreviewSelectionKey}
        onCreateDraft={controller.handleCreateGitDraft}
        onExplorerResizeStart={controller.handleExplorerResizeStart}
        onGitLogResizeStart={(event) => controller.handleGitLogResizeStart(event, controller.gitPanel.gitSidebarRef.current?.clientHeight ?? 0)}
        onGitCommitResizeStart={(event) => controller.handleGitCommitResizeStart(event, controller.gitPanel.gitSidebarRef.current?.clientHeight ?? 0)}
        gitLogPanelHeight={controller.gitLogPanelHeight}
        gitCommitPanelHeight={controller.gitCommitPanelHeight}
        onCompact={() => onSend('/compact', [])}
        onExportSession={controller.handleExportSession}
        onCopySessionExport={controller.handleCopySessionExport}
      />

      <BranchCreateModal
        open={controller.gitPanel.branchCreateModalOpen}
        branchCreateInputRef={controller.gitPanel.branchCreateInputRef}
        gitNewBranchName={controller.gitPanel.gitNewBranchName}
        gitActionLoading={controller.gitPanel.gitActionLoading}
        onClose={() => controller.gitPanel.setBranchCreateModalOpen(false)}
        onNameChange={controller.gitPanel.setGitNewBranchName}
        onCreate={controller.gitPanel.handleCreateGitBranch}
      />
    </div>
  )
}
