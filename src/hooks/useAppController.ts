import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SelectedFile } from '../../electron/preload'
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
import { summarizeSessionTitleFromPrompt } from '../lib/sessionUtils'
import { nanoid } from '../store/nanoid'
import { DEFAULT_PROJECT_PATH, getProjectNameFromPath, useSessionsStore, type PermissionMode, type Session } from '../store/sessions'

type PendingSessionDraft = {
  id: string
  cwd: string
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
}

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
    reorderSessions,
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
  const [pendingSessionDraft, setPendingSessionDraft] = useState<PendingSessionDraft | null>(null)
  const [messageJumpTarget, setMessageJumpTarget] = useState<{
    sessionId: string
    messageId: string
    token: number
  } | null>(null)
  const { sidebarWidth, sidebarCollapsed, handleSidebarResizeStart, handleToggleSidebar } = useSidebarLayout()

  const activeSession = activeSessionId ? sessions.find((session) => session.id === activeSessionId) ?? null : null
  const pendingSessionView = useMemo<Session | null>(() => {
    if (!pendingSessionDraft) return null

    return {
      id: pendingSessionDraft.id,
      sessionId: null,
      name: getProjectNameFromPath(pendingSessionDraft.cwd),
      favorite: false,
      cwd: pendingSessionDraft.cwd,
      messages: [],
      isStreaming: false,
      currentAssistantMsgId: null,
      error: null,
      pendingPermission: null,
      pendingQuestion: null,
      tokenUsage: null,
      lastCost: undefined,
      permissionMode: pendingSessionDraft.permissionMode,
      planMode: pendingSessionDraft.planMode,
      model: pendingSessionDraft.model,
      modelSwitchNotice: null,
      checkpointRestoreState: null,
      checkpoints: [],
      linkedTeamId: null,
    }
  }, [pendingSessionDraft])
  const sessionViewSession = pendingSessionView ?? activeSession
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
      model: task.model,
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

  useEffect(() => {
    if (!pendingSessionDraft || !activeSessionId) return
    setPendingSessionDraft(null)
  }, [activeSessionId, pendingSessionDraft])

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

  const resolveSessionCwd = useCallback(async (cwdOverride?: string) => {
    const fallbackPath = defaultProjectPath.trim() || DEFAULT_PROJECT_PATH
    const folder = normalizeSelectedFolder(cwdOverride)
      ?? normalizeSelectedFolder(await window.claude.selectFolder({
        defaultPath: fallbackPath,
        title: t('app.selectProjectFolderTitle'),
      }))
    return folder || fallbackPath
  }, [defaultProjectPath, t])

  const createSessionRecord = useCallback((options: {
    cwd: string
    name: string
    permissionMode?: PermissionMode
    planMode?: boolean
    model?: string | null
  }): string => {
    setPendingSessionDraft(null)
    const sessionId = addSession(options.cwd, options.name)

    if (options.permissionMode && options.permissionMode !== 'default') {
      setPermissionMode(sessionId, options.permissionMode)
    }
    if (options.planMode) {
      setPlanMode(sessionId, true)
    }
    if (options.model) {
      setModel(sessionId, options.model)
    }

    return sessionId
  }, [addSession, setModel, setPermissionMode, setPlanMode])

  const openPendingSessionDraft = useCallback(async (cwdOverride?: string): Promise<void> => {
    panels.closeOverlayPanels()
    setMessageJumpTarget(null)
    const cwd = await resolveSessionCwd(cwdOverride)
    setActiveSession(null)
    setPendingSessionDraft({
      id: nanoid(),
      cwd,
      permissionMode: 'default',
      planMode: false,
      model: null,
    })
  }, [panels, resolveSessionCwd, setActiveSession])

  const createSessionFromUserPrompt = useCallback(async (prompt: string, cwdOverride?: string): Promise<string> => {
    const cwd = await resolveSessionCwd(cwdOverride)
    return createSessionRecord({
      cwd,
      name: summarizeSessionTitleFromPrompt(prompt, getProjectNameFromPath(cwd)),
    })
  }, [createSessionRecord, resolveSessionCwd])

  const startPendingDraftConversation = useCallback(async (
    draft: PendingSessionDraft,
    text: string,
    files: SelectedFile[],
  ) => {
    const sessionId = createSessionRecord({
      cwd: draft.cwd,
      name: summarizeSessionTitleFromPrompt(text, getProjectNameFromPath(draft.cwd)),
      permissionMode: draft.permissionMode,
      planMode: draft.planMode,
      model: draft.model,
    })
    await claudeStream.handleSendForSession(sessionId, text, files)
  }, [claudeStream, createSessionRecord])

  const handleSelectSession = useCallback((sessionId: string) => {
    panels.closeOverlayPanels()
    setMessageJumpTarget(null)
    setPendingSessionDraft(null)
    setActiveSession(sessionId)
  }, [panels, setActiveSession])

  const handleSelectMessageResult = useCallback((sessionId: string, messageId: string) => {
    messageJumpTokenRef.current += 1
    panels.closeOverlayPanels()
    setPendingSessionDraft(null)
    setMessageJumpTarget({
      sessionId,
      messageId,
      token: messageJumpTokenRef.current,
    })
    setActiveSession(sessionId)
  }, [panels, setActiveSession])

  const handleSend = useCallback(async (text: string, files: SelectedFile[]) => {
    if (pendingSessionDraft) {
      await startPendingDraftConversation(pendingSessionDraft, text, files)
      return
    }
    await claudeStream.handleSend(text, files)
  }, [claudeStream, pendingSessionDraft, startPendingDraftConversation])

  const handleBtwSend = useCallback(async (text: string, files: SelectedFile[]) => {
    if (pendingSessionDraft) {
      await startPendingDraftConversation(pendingSessionDraft, text, files)
      return
    }
    await claudeStream.handleBtwSend(text, files)
  }, [claudeStream, pendingSessionDraft, startPendingDraftConversation])

  const handlePermissionModeChange = useCallback((mode: PermissionMode) => {
    if (pendingSessionDraft) {
      setPendingSessionDraft((current) => (current ? { ...current, permissionMode: mode } : current))
      return
    }
    if (!activeSession) return
    setPermissionMode(activeSession.id, mode)
  }, [activeSession, pendingSessionDraft, setPermissionMode])

  const handlePlanModeChange = useCallback((value: boolean) => {
    if (pendingSessionDraft) {
      setPendingSessionDraft((current) => (current ? { ...current, planMode: value } : current))
      return
    }
    if (!activeSession) return
    setPlanMode(activeSession.id, value)
  }, [activeSession, pendingSessionDraft, setPlanMode])

  const handleModelChange = useCallback((model: string | null) => {
    if (pendingSessionDraft) {
      setPendingSessionDraft((current) => (current ? { ...current, model } : current))
      return
    }
    if (!activeSession) return
    claudeStream.handleModelChange(activeSession.id, model)
  }, [activeSession, claudeStream, pendingSessionDraft])

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
    shortcutTarget: pendingSessionDraft
      ? {
          permissionMode: pendingSessionDraft.permissionMode,
          planMode: pendingSessionDraft.planMode,
        }
      : activeSession
        ? {
            permissionMode: activeSession.permissionMode,
            planMode: activeSession.planMode,
          }
        : null,
    defaultProjectPath,
    addSession,
    applyPermissionMode: handlePermissionModeChange,
    applyPlanMode: handlePlanModeChange,
    setModel,
    onToggleSidebar: handleToggleSidebar,
    openSettingsPanel: panels.openSettingsPanel,
    toggleCommandPalette: panels.toggleCommandPalette,
    createSessionFromUserPrompt,
    openPendingSessionDraft,
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
    handleBtwSend,
    handleInjectTeamSummary,
    handleNewSession: openPendingSessionDraft,
    handleRemoveSession: claudeStream.handleRemoveSession,
    handleQuestionResponse: claudeStream.handleQuestionResponse,
    handleSelectFolder: claudeStream.handleSelectFolder,
    handleSelectMessageResult,
    handleSelectSession,
    handleSend,
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
    settingsInitialTab: panels.settingsInitialTab,
    settingsOpen: panels.settingsOpen,
    sessionViewSession,
    sessionFileLockState,
    sessions,
    setActiveSessionPermissionMode: handlePermissionModeChange,
    setActiveSessionPlanMode: handlePlanModeChange,
    setActiveSessionModel: handleModelChange,
    dismissActiveSessionModelSwitchNotice: () => {
      if (!activeSession) return
      updateSession(activeSession.id, () => ({ modelSwitchNotice: null }))
    },
    setLinkedTeamIdForActiveSession: (teamId: string) => {
      if (!activeSession) return
      setLinkedTeamId(activeSession.id, teamId)
    },
    setSidebarMode,
    reorderSessions,
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
