import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatView } from './components/ChatView'
import { CommandPalette } from './components/CommandPalette'
import { ScheduledTasksView } from './components/ScheduledTasksView'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { ClaudeInstallModal } from './components/app/ClaudeInstallModal'
import { EmptyMainState } from './components/app/EmptyMainState'
import { TeamView } from './components/team/TeamView'
import { useTeamStore } from './store/teamStore'
import { useI18n } from './hooks/useI18n'
import { useClaudeStream } from './hooks/useClaudeStream'
import { useAgentTeamStream } from './hooks/useAgentTeam'
import { useAppDesktopEffects } from './hooks/useAppDesktopEffects'
import { useInstallationCheck } from './hooks/useInstallationCheck'
import { useSidebarLayout } from './hooks/useSidebarLayout'
import { useSubagentStreams } from './hooks/useSubagentStreams'
import { buildQuickPanelProjects, normalizeSelectedFolder, sanitizeEnvVars } from './lib/claudeRuntime'
import { getShortcutLabel, getCurrentPlatform } from './lib/shortcuts'
import { buildSessionFileLockState } from './lib/sessionLocks'
import { useScheduledTasksStore } from './store/scheduledTasks'
import { DEFAULT_PROJECT_PATH, getProjectNameFromPath, useSessionsStore, type PermissionMode } from './store/sessions'

function normalizeProjectKey(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '~') return '~'

  const normalized = trimmed.replace(/\\/g, '/')
  if (normalized === '/') return normalized
  return normalized.replace(/\/+$/, '').toLowerCase()
}

export default function App() {
  const { language, t } = useI18n()
  const messageJumpTokenRef = useRef(0)
  const {
    sessions,
    activeSessionId,
    defaultProjectPath,
    sidebarMode,
    addSession,
    removeSession,
    setActiveSession,
    setSidebarMode,
    addUserMessage,
    startAssistantMessage,
    appendThinkingChunk,
    appendTextChunk,
    addBtwCard,
    appendBtwCardChunk,
    updateBtwCard,
    appendSubagentText,
    addToolCall,
    resolveToolCall,
    updateSubagent,
    setStreaming,
    setClaudeSessionId,
    setError,
    setPendingPermission,
    setPendingQuestion,
    setTokenUsage,
    setLastCost,
    updateSession,
    setPermissionMode,
    setPlanMode,
    setModel,
    commitStreamEnd,
    setLinkedTeamId,
    envVars,
    themeId,
    notificationMode,
    uiFontSize,
    uiZoomPercent,
    quickPanelEnabled,
    shortcutConfig,
    claudeBinaryPath,
  } = useSessionsStore()

  const { setActiveTeam, teams: agentTeams } = useTeamStore()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  /** 현재 세션과 연결된 팀 패널 열기 (ChatView 내 Team 버튼으로 진입) */
  const [sessionTeamOpen, setSessionTeamOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [messageJumpTarget, setMessageJumpTarget] = useState<{
    sessionId: string
    messageId: string
    token: number
  } | null>(null)
  const { sidebarWidth, sidebarCollapsed, handleSidebarResizeStart, handleToggleSidebar } = useSidebarLayout()

  const activeSession = activeSessionId ? sessions.find((session) => session.id === activeSessionId) ?? null : null
  const sessionFileLockState = useMemo(() => buildSessionFileLockState(sessions), [sessions])
  const quickPanelProjects = useMemo(() => buildQuickPanelProjects(sessions), [sessions])
  const quickPanelProjectsSignature = useMemo(
    () => quickPanelProjects.map((project) => project.path).join('\n'),
    [quickPanelProjects],
  )
  const shortcutPlatform = getCurrentPlatform()
  const sanitizedEnvVars = sanitizeEnvVars(envVars)
  const scheduledTasks = useScheduledTasksStore((state) => state.tasks)
  const applyScheduledTaskAdvance = useScheduledTasksStore((state) => state.applyAdvance)
  const updateScheduledTaskRunSnapshot = useScheduledTasksStore((state) => state.updateRunRecordSnapshot)
  const scheduledTasksSyncPayload = useMemo(
    () => scheduledTasks.map((task) => ({
      id: task.id,
      name: task.name,
      prompt: task.prompt,
      projectPath: task.projectPath,
      permissionMode: task.permissionMode,
      frequency: task.frequency,
      enabled: task.enabled,
      hour: task.hour,
      minute: task.minute,
      weeklyDay: task.weeklyDay,
      skipDays: task.skipDays,
      quietHoursStart: task.quietHoursStart,
      quietHoursEnd: task.quietHoursEnd,
      nextRunAt: task.nextRunAt,
    })),
    [scheduledTasks],
  )
  const activeSessionConflict = activeSessionId ? sessionFileLockState[activeSessionId] : null
  const activeSessionConflictDetails = activeSessionConflict?.hasConflict
    ? {
        paths: activeSessionConflict.conflictingPaths,
        sessionNames: activeSessionConflict.conflictingSessionIds
          .map((sessionId) => sessions.find((session) => session.id === sessionId)?.name ?? t('app.anotherSession'))
          .filter((value, index, array) => array.indexOf(value) === index),
      }
    : null

  const {
    installationStatus,
    installationDismissed,
    refreshInstallationStatus,
    dismissInstallation,
  } = useInstallationCheck(claudeBinaryPath)

  const {
    handleAbort,
    handleBtwSend,
    handleModelChange,
    handlePermissionRequestAction,
    handleQuestionResponse,
    handleRemoveSession,
    handleSelectFolder,
    handleSend,
    handleSendForSession,
    scheduledTaskRunMetaBySessionRef,
    scheduledTaskSessionByRunRef,
  } = useClaudeStream({
    sessions,
    activeSessionId,
    defaultProjectPath,
    sanitizedEnvVars,
    claudeBinaryPath,
    notificationMode,
    addUserMessage,
    startAssistantMessage,
    appendThinkingChunk,
    appendTextChunk,
    addBtwCard,
    appendBtwCardChunk,
    updateBtwCard,
    addToolCall,
    resolveToolCall,
    setStreaming,
    setClaudeSessionId,
    setError,
    setPendingPermission,
    setPendingQuestion,
    setTokenUsage,
    setLastCost,
    updateSession,
    setPermissionMode,
    setModel,
    commitStreamEnd,
    removeSession,
  })

  const hasUnsafeReloadState = useMemo(
    () => (
      sessions.some((session) => session.isStreaming || Boolean(session.pendingPermission) || Boolean(session.pendingQuestion))
      || sessions.some((session) =>
        session.messages.some((message) => message.btwCards?.some((card) => card.isStreaming)),
      )
    ),
    [sessions],
  )

  const {
    startDiscussion: startTeamDiscussion,
    continueDiscussion: continueTeamDiscussion,
    abortDiscussion: abortTeamDiscussion,
  } = useAgentTeamStream(
    sanitizedEnvVars,
    claudeBinaryPath || undefined,
    language,
  )

  useSubagentStreams({
    sessions,
    appendSubagentText,
    updateSubagent,
  })

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    if (!messageJumpTarget) return

    const timer = window.setTimeout(() => {
      setMessageJumpTarget((current) => (current?.token === messageJumpTarget.token ? null : current))
    }, 1600)

    return () => window.clearTimeout(timer)
  }, [messageJumpTarget])

  const closeOverlayPanels = () => {
    setSettingsOpen(false)
    setScheduleOpen(false)
    setTeamOpen(false)
    setSessionTeamOpen(false)
    setCommandPaletteOpen(false)
  }

  const openSettingsPanel = () => {
    setCommandPaletteOpen(false)
    setScheduleOpen(false)
    setTeamOpen(false)
    setSettingsOpen(true)
  }

  const openSchedulePanel = () => {
    setSettingsOpen(false)
    setCommandPaletteOpen(false)
    setTeamOpen(false)
    setScheduleOpen(true)
  }

  const openTeamPanel = () => {
    setSettingsOpen(false)
    setScheduleOpen(false)
    setCommandPaletteOpen(false)
    setSessionTeamOpen(false)
    setTeamOpen(true)
  }

  /** ChatView 헤더의 Team 버튼 → 현재 세션과 연결된 팀 패널 열기 */
  const openSessionTeamPanel = useCallback(() => {
    if (!activeSession) return
    setSettingsOpen(false)
    setScheduleOpen(false)
    setTeamOpen(false)
    setCommandPaletteOpen(false)
    const linkedTeam = activeSession.linkedTeamId
      ? agentTeams.find((team) => team.id === activeSession.linkedTeamId) ?? null
      : null
    const isSameProject = linkedTeam
      ? normalizeProjectKey(linkedTeam.cwd) === normalizeProjectKey(activeSession.cwd)
      : false

    setActiveTeam(isSameProject ? linkedTeam?.id ?? null : null)
    setSessionTeamOpen(true)
  }, [activeSession, agentTeams, setActiveTeam])

  /** 팀 토론 완료 후 결과 요약을 현재 세션에 주입 */
  const handleInjectTeamSummary = useCallback((summary: string) => {
    if (!activeSession) return
    setSessionTeamOpen(false)
    handleSend(summary, [])
  }, [activeSession, handleSend])

  async function handleNewSession(cwdOverride?: string): Promise<string> {
    closeOverlayPanels()
    const fallbackPath = defaultProjectPath.trim() || DEFAULT_PROJECT_PATH
    const folder = normalizeSelectedFolder(cwdOverride)
      ?? normalizeSelectedFolder(await window.claude.selectFolder({
        defaultPath: fallbackPath,
        title: t('app.selectProjectFolderTitle'),
      }))
    const cwd = folder || fallbackPath
    const name = getProjectNameFromPath(cwd)
    return addSession(cwd, name)
  }

  function handleSelectSession(sessionId: string) {
    closeOverlayPanels()
    setMessageJumpTarget(null)
    setActiveSession(sessionId)
  }

  function handleSelectMessageResult(sessionId: string, messageId: string) {
    messageJumpTokenRef.current += 1
    closeOverlayPanels()
    setMessageJumpTarget({
      sessionId,
      messageId,
      token: messageJumpTokenRef.current,
    })
    setActiveSession(sessionId)
  }

  useAppDesktopEffects({
    themeId,
    uiFontSize,
    uiZoomPercent,
    hasUnsafeReloadState,
    quickPanelProjects,
    quickPanelProjectsSignature,
    scheduledTasksSyncPayload,
    quickPanelEnabled,
    shortcutConfig,
    shortcutPlatform,
    sessions,
    activeSession,
    defaultProjectPath,
    addSession,
    setPermissionMode,
    setPlanMode,
    onToggleSidebar: handleToggleSidebar,
    openSettingsPanel,
    toggleCommandPalette: () => setCommandPaletteOpen((open) => !open),
    handleNewSession,
    handleSendForSession,
    applyScheduledTaskAdvance,
    updateScheduledTaskRunSnapshot,
    scheduledTaskRunMetaBySessionRef,
    scheduledTaskSessionByRunRef,
    closeOverlayPanels,
  })

  return (
    <div className="flex h-screen overflow-hidden bg-claude-sidebar font-sans">
      {!sidebarCollapsed && (
        <div className="relative flex-shrink-0" style={{ width: `${sidebarWidth}px` }}>
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            sessionLockState={sessionFileLockState}
            sidebarMode={sidebarMode}
            onSelectSession={handleSelectSession}
            onRenameSession={(id, name) => updateSession(id, () => ({ name }))}
            onToggleFavorite={(id) => updateSession(id, (session) => ({ favorite: !session.favorite }))}
            onNewSession={handleNewSession}
            onRemoveSession={handleRemoveSession}
            onSelectFolder={(sessionId) => handleSelectFolder(sessionId)}
            onOpenSchedule={openSchedulePanel}
            onOpenSettings={openSettingsPanel}
            scheduleOpen={scheduleOpen}
            newSessionShortcutLabel={getShortcutLabel(shortcutConfig, 'newSession', shortcutPlatform)}
            settingsShortcutLabel={getShortcutLabel(shortcutConfig, 'openSettings', shortcutPlatform)}
          />
          <div
            onMouseDown={handleSidebarResizeStart}
            className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-claude-border/80"
          />
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        {teamOpen ? (
          <TeamView
            defaultCwd={activeSession?.cwd ?? defaultProjectPath}
            startDiscussion={startTeamDiscussion}
            continueDiscussion={continueTeamDiscussion}
            abortDiscussion={abortTeamDiscussion}
            onClose={() => setTeamOpen(false)}
          />
        ) : sessionTeamOpen && activeSession ? (
          <TeamView
            defaultCwd={activeSession.cwd}
            startDiscussion={startTeamDiscussion}
            continueDiscussion={continueTeamDiscussion}
            abortDiscussion={abortTeamDiscussion}
            embedded
            onClose={() => setSessionTeamOpen(false)}
            onInjectSummary={handleInjectTeamSummary}
            onTeamLinked={(teamId) => setLinkedTeamId(activeSession.id, teamId)}
          />
        ) : scheduleOpen ? (
          <ScheduledTasksView
            defaultProjectPath={activeSession?.cwd ?? defaultProjectPath}
            onClose={() => setScheduleOpen(false)}
            onSelectSession={handleSelectSession}
          />
        ) : settingsOpen ? (
          <SettingsPanel
            onClose={() => setSettingsOpen(false)}
            onSidebarModeChange={setSidebarMode}
            projectPath={activeSession?.cwd ?? null}
          />
        ) : activeSession ? (
          <ChatView
            key={activeSession.id}
            session={activeSession}
            fileConflict={activeSessionConflictDetails}
            jumpToMessageId={messageJumpTarget?.sessionId === activeSession.id ? messageJumpTarget.messageId : null}
            jumpToMessageToken={messageJumpTarget?.sessionId === activeSession.id ? messageJumpTarget.token : 0}
            onSend={handleSend}
            onSendBtw={handleBtwSend}
            onAbort={handleAbort}
            sidebarMode={sidebarMode}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={handleToggleSidebar}
            sidebarShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleSidebar', shortcutPlatform)}
            filesShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleFiles', shortcutPlatform)}
            sessionInfoShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleSessionInfo', shortcutPlatform)}
            onPermissionModeChange={(mode: PermissionMode) => setPermissionMode(activeSession.id, mode)}
            onPlanModeChange={(value: boolean) => setPlanMode(activeSession.id, value)}
            onModelChange={(model) => handleModelChange(activeSession.id, model)}
            onPermissionRequestAction={handlePermissionRequestAction}
            onQuestionResponse={handleQuestionResponse}
            permissionShortcutLabel={getShortcutLabel(shortcutConfig, 'cyclePermissionMode', shortcutPlatform)}
            bypassShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleBypassPermissions', shortcutPlatform)}
            onOpenTeam={openSessionTeamPanel}
          />
        ) : (
          <EmptyMainState sidebarMode={sidebarMode} onNewSession={() => { void handleNewSession() }} />
        )}
      </main>

      {installationStatus && !installationStatus.installed && !installationDismissed && (
        <ClaudeInstallModal
          installationStatus={installationStatus}
          onRetry={refreshInstallationStatus}
          onClose={dismissInstallation}
        />
      )}

      <CommandPalette
        open={commandPaletteOpen}
        sessions={sessions}
        onClose={() => setCommandPaletteOpen(false)}
        onNewSession={() => {
          void handleNewSession()
        }}
        onOpenSettings={openSettingsPanel}
        onSelectSession={handleSelectSession}
        onSelectMessage={handleSelectMessageResult}
      />
    </div>
  )
}
