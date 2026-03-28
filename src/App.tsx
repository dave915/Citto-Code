import { CommandPalette } from './components/CommandPalette'
import { Sidebar } from './components/Sidebar'
import { AppMainContent } from './components/app/AppMainContent'
import { ClaudeInstallModal } from './components/app/ClaudeInstallModal'
import { useAppController } from './hooks/useAppController'
import { getShortcutLabel } from './lib/shortcuts'

export default function App() {
  const controller = useAppController()

  return (
    <div className="flex h-screen overflow-hidden bg-claude-sidebar font-sans">
      {!controller.sidebarCollapsed && (
        <div className="relative flex-shrink-0" style={{ width: `${controller.sidebarWidth}px` }}>
          <Sidebar
            sessions={controller.sessions}
            activeSessionId={controller.activeSession?.id ?? null}
            sessionLockState={controller.sessionFileLockState}
            sidebarMode={controller.sidebarMode}
            onSelectSession={controller.handleSelectSession}
            onRenameSession={(id, name) => controller.updateSession(id, () => ({ name }))}
            onToggleFavorite={(id) => controller.updateSession(id, (session) => ({ favorite: !session.favorite }))}
            onNewSession={controller.handleNewSession}
            onReorderSessions={controller.reorderSessions}
            onRemoveSession={controller.handleRemoveSession}
            onSelectFolder={(sessionId) => controller.handleSelectFolder(sessionId)}
            onOpenSchedule={controller.openSchedulePanel}
            onOpenSettings={controller.openSettingsPanel}
            scheduleOpen={controller.scheduleOpen}
            newSessionShortcutLabel={getShortcutLabel(controller.shortcutConfig, 'newSession', controller.shortcutPlatform)}
            settingsShortcutLabel={getShortcutLabel(controller.shortcutConfig, 'openSettings', controller.shortcutPlatform)}
          />
          <div
            onMouseDown={controller.handleSidebarResizeStart}
            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-claude-border/80"
          />
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        <AppMainContent
          activePanel={controller.activePanel}
          activeSession={controller.activeSession}
          defaultProjectPath={controller.defaultProjectPath}
          sidebarMode={controller.sidebarMode}
          sidebarCollapsed={controller.sidebarCollapsed}
          shortcutConfig={controller.shortcutConfig}
          shortcutPlatform={controller.shortcutPlatform}
          messageJumpTarget={controller.messageJumpTarget}
          activeSessionConflictDetails={controller.activeSessionConflictDetails}
          onToggleSidebar={controller.handleToggleSidebar}
          onCloseTeamPanel={controller.closeTeamPanel}
          onCloseSessionTeamPanel={controller.closeSessionTeamPanel}
          onCloseSchedulePanel={controller.closeSchedulePanel}
          onCloseSettingsPanel={controller.closeSettingsPanel}
          onOpenSessionTeamPanel={controller.openSessionTeamPanel}
          onInjectTeamSummary={controller.handleInjectTeamSummary}
          onLinkActiveSessionTeam={controller.setLinkedTeamIdForActiveSession}
          onSidebarModeChange={controller.setSidebarMode}
          onSelectSession={controller.handleSelectSession}
          onNewSession={() => {
            void controller.handleNewSession()
          }}
          onSend={controller.handleSend}
          onSendBtw={controller.handleBtwSend}
          onAbort={controller.handleAbort}
          onDismissModelSwitchNotice={controller.dismissActiveSessionModelSwitchNotice}
          onPermissionModeChange={controller.setActiveSessionPermissionMode}
          onPlanModeChange={controller.setActiveSessionPlanMode}
          onModelChange={controller.setActiveSessionModel}
          onPermissionRequestAction={controller.claudeStream.handlePermissionRequestAction}
          onQuestionResponse={controller.handleQuestionResponse}
          startTeamDiscussion={controller.startTeamDiscussion}
          continueTeamDiscussion={controller.continueTeamDiscussion}
          abortTeamDiscussion={controller.abortTeamDiscussion}
        />
      </main>

      {controller.installationStatus && !controller.installationStatus.installed && !controller.installationDismissed && (
        <ClaudeInstallModal
          installationStatus={controller.installationStatus}
          onRetry={controller.refreshInstallationStatus}
          onClose={controller.dismissInstallation}
        />
      )}

      <CommandPalette
        open={controller.commandPaletteOpen}
        sessions={controller.sessions}
        onClose={controller.closeCommandPalette}
        onNewSession={() => {
          void controller.handleNewSession()
        }}
        onOpenSettings={controller.openSettingsPanel}
        onSelectSession={controller.handleSelectSession}
        onSelectMessage={controller.handleSelectMessageResult}
      />
    </div>
  )
}
