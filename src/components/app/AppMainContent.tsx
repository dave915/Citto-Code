import type { SelectedFile } from '../../../electron/preload'
import { ChatView } from '../ChatView'
import { ScheduledTasksView } from '../ScheduledTasksView'
import { SettingsPanel } from '../SettingsPanel'
import { WorkflowsView } from '../WorkflowsView'
import { EmptyMainState } from './EmptyMainState'
import { TeamView } from '../team/TeamView'
import { getShortcutLabel } from '../../lib/shortcuts'
import type {
  PermissionMode,
  Session,
  ShortcutConfig,
  ShortcutPlatform,
  SidebarMode,
} from '../../store/sessions'
import type { AppOverlayPanel } from '../../hooks/useAppPanels'
import type { SettingsTab } from '../settings/shared'

type MessageJumpTarget = {
  sessionId: string
  messageId: string
  token: number
} | null

type SessionConflictDetails = {
  paths: string[]
  sessionNames: string[]
} | null

type Props = {
  activePanel: AppOverlayPanel
  activeSession: Session | null
  sessionViewSession: Session | null
  defaultProjectPath: string
  sidebarMode: SidebarMode
  sidebarCollapsed: boolean
  shortcutConfig: ShortcutConfig
  shortcutPlatform: ShortcutPlatform
  messageJumpTarget: MessageJumpTarget
  activeSessionConflictDetails: SessionConflictDetails
  onToggleSidebar: () => void
  onCloseTeamPanel: () => void
  onCloseSessionTeamPanel: () => void
  onCloseSchedulePanel: () => void
  onCloseWorkflowPanel: () => void
  onCloseSettingsPanel: () => void
  settingsInitialTab: SettingsTab
  onOpenSessionTeamPanel: () => void
  onInjectTeamSummary: (summary: string) => void
  onLinkActiveSessionTeam: (teamId: string) => void
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onSend: (text: string, files: SelectedFile[]) => void
  onSendBtw: (text: string, files: SelectedFile[]) => void
  onAbort: () => void
  onDismissModelSwitchNotice: () => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
  onPermissionRequestAction: (action: 'once' | 'always' | 'deny') => void
  onQuestionResponse: (answer: string | null) => void
  startTeamDiscussion: (teamId: string, task: string, files?: SelectedFile[]) => Promise<void>
  continueTeamDiscussion: (teamId: string) => Promise<void>
  abortTeamDiscussion: (teamId: string) => Promise<void>
}

export function AppMainContent({
  activePanel,
  activeSession,
  sessionViewSession,
  defaultProjectPath,
  sidebarMode,
  sidebarCollapsed,
  shortcutConfig,
  shortcutPlatform,
  messageJumpTarget,
  activeSessionConflictDetails,
  onToggleSidebar,
  onCloseTeamPanel,
  onCloseSessionTeamPanel,
  onCloseSchedulePanel,
  onCloseWorkflowPanel,
  onCloseSettingsPanel,
  settingsInitialTab,
  onOpenSessionTeamPanel,
  onInjectTeamSummary,
  onLinkActiveSessionTeam,
  onSelectSession,
  onNewSession,
  onSend,
  onSendBtw,
  onAbort,
  onDismissModelSwitchNotice,
  onPermissionModeChange,
  onPlanModeChange,
  onModelChange,
  onPermissionRequestAction,
  onQuestionResponse,
  startTeamDiscussion,
  continueTeamDiscussion,
  abortTeamDiscussion,
}: Props) {
  const displaySession = sessionViewSession ?? activeSession
  const activeCwd = displaySession?.cwd ?? activeSession?.cwd ?? defaultProjectPath

  if (activePanel === 'team') {
    return (
      <TeamView
        defaultCwd={activeCwd}
        startDiscussion={startTeamDiscussion}
        continueDiscussion={continueTeamDiscussion}
        abortDiscussion={abortTeamDiscussion}
        onClose={onCloseTeamPanel}
      />
    )
  }

  if (activePanel === 'sessionTeam' && activeSession) {
    return (
      <TeamView
        defaultCwd={activeSession.cwd}
        startDiscussion={startTeamDiscussion}
        continueDiscussion={continueTeamDiscussion}
        abortDiscussion={abortTeamDiscussion}
        embedded
        onClose={onCloseSessionTeamPanel}
        onInjectSummary={onInjectTeamSummary}
        onTeamLinked={onLinkActiveSessionTeam}
      />
    )
  }

  if (activePanel === 'schedule') {
    return (
      <ScheduledTasksView
        defaultProjectPath={activeCwd}
        onClose={onCloseSchedulePanel}
        onSelectSession={onSelectSession}
      />
    )
  }

  if (activePanel === 'workflow') {
    return (
      <WorkflowsView
        defaultProjectPath={activeCwd}
        onClose={onCloseWorkflowPanel}
      />
    )
  }

  if (activePanel === 'settings') {
    return (
      <SettingsPanel
        onClose={onCloseSettingsPanel}
        projectPath={displaySession?.cwd ?? activeSession?.cwd ?? null}
        initialTab={settingsInitialTab}
      />
    )
  }

  if (!displaySession) {
    return <EmptyMainState sidebarMode={sidebarMode} onNewSession={onNewSession} />
  }

  return (
    <ChatView
      key={displaySession.id}
      session={displaySession}
      fileConflict={displaySession.id === activeSession?.id ? activeSessionConflictDetails : null}
      jumpToMessageId={messageJumpTarget?.sessionId === displaySession.id ? messageJumpTarget.messageId : null}
      jumpToMessageToken={messageJumpTarget?.sessionId === displaySession.id ? messageJumpTarget.token : 0}
      onSend={onSend}
      onSendBtw={onSendBtw}
      onAbort={onAbort}
      onDismissModelSwitchNotice={onDismissModelSwitchNotice}
      sidebarMode={sidebarMode}
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={onToggleSidebar}
      sidebarShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleSidebar', shortcutPlatform)}
      filesShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleFiles', shortcutPlatform)}
      sessionInfoShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleSessionInfo', shortcutPlatform)}
      onPermissionModeChange={onPermissionModeChange}
      onPlanModeChange={onPlanModeChange}
      onModelChange={onModelChange}
      onPermissionRequestAction={onPermissionRequestAction}
      onQuestionResponse={onQuestionResponse}
      permissionShortcutLabel={getShortcutLabel(shortcutConfig, 'cyclePermissionMode', shortcutPlatform)}
      bypassShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleBypassPermissions', shortcutPlatform)}
      onOpenTeam={displaySession.id === activeSession?.id ? onOpenSessionTeamPanel : undefined}
    />
  )
}
