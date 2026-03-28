import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTeamStore } from '../store/teamStore'
import { useI18n } from './useI18n'
import { useAppPanels } from './useAppPanels'
import { useClaudeStream } from './useClaudeStream'
import { useAgentTeamStream } from './useAgentTeam'
import { useAppDesktopEffects } from './useAppDesktopEffects'
import { useInstallationCheck } from './useInstallationCheck'
import { useSidebarLayout } from './useSidebarLayout'
import { useSubagentStreams } from './useSubagentStreams'
import { buildQuickPanelProjects, normalizeSelectedFolder, sanitizeEnvVars } from '../lib/claudeRuntime'
import { getCurrentPlatform } from '../lib/shortcuts'
import { buildSessionFileLockState } from '../lib/sessionLocks'
import { useScheduledTasksStore } from '../store/scheduledTasks'
import { DEFAULT_PROJECT_PATH, getProjectNameFromPath, useSessionsStore, type PermissionMode } from '../store/sessions'

function normalizeProjectKey(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '~') return '~'

  const normalized = trimmed.replace(/\\/g, '/')
  if (normalized === '/') return normalized
  return normalized.replace(/\/+$/, '').toLowerCase()
}

export function useAppController() {
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

  const panels = useAppPanels()
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

  const installation = useInstallationCheck(claudeBinaryPath)

  const claudeStream = useClaudeStream({
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

  const teamStream = useAgentTeamStream(
    sanitizedEnvVars,
    claudeBinaryPath || undefined,
    language,
  )

  useSubagentStreams({
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

  const openSessionTeamPanel = useCallback(() => {
    if (!activeSession) return
    const linkedTeam = activeSession.linkedTeamId
      ? agentTeams.find((team) => team.id === activeSession.linkedTeamId) ?? null
      : null
    const isSameProject = linkedTeam
      ? normalizeProjectKey(linkedTeam.cwd) === normalizeProjectKey(activeSession.cwd)
      : false

    setActiveTeam(isSameProject ? linkedTeam?.id ?? null : null)
    panels.openSessionTeamPanel()
  }, [activeSession, agentTeams, panels, setActiveTeam])

  const handleInjectTeamSummary = useCallback((summary: string) => {
    if (!activeSession) return
    panels.closeSessionTeamPanel()
    claudeStream.handleSend(summary, [])
  }, [activeSession, claudeStream, panels])

  const handleNewSession = useCallback(async (cwdOverride?: string): Promise<string> => {
    panels.closeOverlayPanels()
    const fallbackPath = defaultProjectPath.trim() || DEFAULT_PROJECT_PATH
    const folder = normalizeSelectedFolder(cwdOverride)
      ?? normalizeSelectedFolder(await window.claude.selectFolder({
        defaultPath: fallbackPath,
        title: t('app.selectProjectFolderTitle'),
      }))
    const cwd = folder || fallbackPath
    const name = getProjectNameFromPath(cwd)
    return addSession(cwd, name)
  }, [addSession, defaultProjectPath, panels, t])

  const handleSelectSession = useCallback((sessionId: string) => {
    panels.closeOverlayPanels()
    setMessageJumpTarget(null)
    setActiveSession(sessionId)
  }, [panels, setActiveSession])

  const handleSelectMessageResult = useCallback((sessionId: string, messageId: string) => {
    messageJumpTokenRef.current += 1
    panels.closeOverlayPanels()
    setMessageJumpTarget({
      sessionId,
      messageId,
      token: messageJumpTokenRef.current,
    })
    setActiveSession(sessionId)
  }, [panels, setActiveSession])

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
    openSettingsPanel: panels.openSettingsPanel,
    toggleCommandPalette: panels.toggleCommandPalette,
    handleNewSession,
    handleSendForSession: claudeStream.handleSendForSession,
    applyScheduledTaskAdvance,
    updateScheduledTaskRunSnapshot,
    scheduledTaskRunMetaBySessionRef: claudeStream.scheduledTaskRunMetaBySessionRef,
    scheduledTaskSessionByRunRef: claudeStream.scheduledTaskSessionByRunRef,
    closeOverlayPanels: panels.closeOverlayPanels,
  })

  return {
    activePanel: panels.activePanel,
    activeSession,
    activeSessionConflictDetails,
    claudeStream,
    closeCommandPalette: panels.closeCommandPalette,
    closeSchedulePanel: panels.closeSchedulePanel,
    closeSessionTeamPanel: panels.closeSessionTeamPanel,
    closeSettingsPanel: panels.closeSettingsPanel,
    closeTeamPanel: panels.closeTeamPanel,
    commandPaletteOpen: panels.commandPaletteOpen,
    defaultProjectPath,
    dismissInstallation: installation.dismissInstallation,
    handleAbort: claudeStream.handleAbort,
    handleBtwSend: claudeStream.handleBtwSend,
    handleInjectTeamSummary,
    handleNewSession,
    handleRemoveSession: claudeStream.handleRemoveSession,
    handleQuestionResponse: claudeStream.handleQuestionResponse,
    handleSelectFolder: claudeStream.handleSelectFolder,
    handleSelectMessageResult,
    handleSelectSession,
    handleSend: claudeStream.handleSend,
    handleSidebarResizeStart,
    handleToggleSidebar,
    installationDismissed: installation.installationDismissed,
    installationStatus: installation.installationStatus,
    messageJumpTarget,
    openSchedulePanel: panels.openSchedulePanel,
    openSessionTeamPanel,
    openSettingsPanel: panels.openSettingsPanel,
    refreshInstallationStatus: installation.refreshInstallationStatus,
    scheduleOpen: panels.scheduleOpen,
    sessionFileLockState,
    sessions,
    setActiveSessionPermissionMode: (mode: PermissionMode) => {
      if (!activeSession) return
      setPermissionMode(activeSession.id, mode)
    },
    setActiveSessionPlanMode: (value: boolean) => {
      if (!activeSession) return
      setPlanMode(activeSession.id, value)
    },
    setActiveSessionModel: (model: string | null) => {
      if (!activeSession) return
      claudeStream.handleModelChange(activeSession.id, model)
    },
    setLinkedTeamIdForActiveSession: (teamId: string) => {
      if (!activeSession) return
      setLinkedTeamId(activeSession.id, teamId)
    },
    setSidebarMode,
    shortcutConfig,
    shortcutPlatform,
    sidebarCollapsed,
    sidebarMode,
    sidebarWidth,
    startTeamDiscussion: teamStream.startDiscussion,
    continueTeamDiscussion: teamStream.continueDiscussion,
    abortTeamDiscussion: teamStream.abortDiscussion,
    updateSession,
  }
}
