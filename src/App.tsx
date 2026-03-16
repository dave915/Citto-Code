import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatView } from './components/ChatView'
import { CommandPalette } from './components/CommandPalette'
import { ScheduledTasksView } from './components/ScheduledTasksView'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { ClaudeInstallModal } from './components/app/ClaudeInstallModal'
import { EmptyMainState } from './components/app/EmptyMainState'
import { useI18n } from './hooks/useI18n'
import { useClaudeStream } from './hooks/useClaudeStream'
import { useAppDesktopEffects } from './hooks/useAppDesktopEffects'
import { useInstallationCheck } from './hooks/useInstallationCheck'
import { useSidebarLayout } from './hooks/useSidebarLayout'
import { buildQuickPanelProjects, normalizeSelectedFolder, sanitizeEnvVars } from './lib/claudeRuntime'
import { getShortcutLabel, getCurrentPlatform } from './lib/shortcuts'
import { buildSessionFileLockState } from './lib/sessionLocks'
import { useScheduledTasksStore } from './store/scheduledTasks'
import { DEFAULT_PROJECT_PATH, getProjectNameFromPath, useSessionsStore, type PermissionMode } from './store/sessions'

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
    setPlanMode,
    setModel,
    commitStreamEnd,
    envVars,
    themeId,
    notificationMode,
    uiFontSize,
    uiZoomPercent,
    quickPanelEnabled,
    shortcutConfig,
    claudeBinaryPath,
  } = useSessionsStore()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
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
  const hasUnsafeReloadState = useMemo(
    () => sessions.some((session) => session.isStreaming || Boolean(session.pendingPermission) || Boolean(session.pendingQuestion)),
    [sessions],
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
    setCommandPaletteOpen(false)
  }

  const openSettingsPanel = () => {
    setCommandPaletteOpen(false)
    setScheduleOpen(false)
    setSettingsOpen(true)
  }

  const openSchedulePanel = () => {
    setSettingsOpen(false)
    setCommandPaletteOpen(false)
    setScheduleOpen(true)
  }

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
        {scheduleOpen ? (
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
