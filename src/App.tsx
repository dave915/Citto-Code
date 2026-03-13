import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useSessionsStore, findTabByClaudeSessionId, getProjectNameFromPath, DEFAULT_PROJECT_PATH } from './store/sessions'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsPanel } from './components/SettingsPanel'
import { CommandPalette } from './components/CommandPalette'
import { ScheduledTasksView } from './components/ScheduledTasksView'
import type { ClaudeInstallationStatus, ClaudeStreamEvent, RecentProject, SelectedFile } from '../electron/preload'
import type {
  NotificationMode,
  PermissionMode,
  PendingPermissionRequest,
  PendingQuestionRequest,
  Session,
} from './store/sessions'
import { useScheduledTasksStore } from './store/scheduledTasks'
import { getCurrentPlatform, getShortcutLabel, matchShortcut } from './lib/shortcuts'
import { applyTheme } from './lib/theme'

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
const SCHEDULED_TASK_WRITE_TOOL_NAMES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

function sanitizeEnvVars(envVars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(envVars).filter(([key, value]) => {
      const trimmed = value.trim()
      if (!trimmed) return false
      if (key === 'ANTHROPIC_API_KEY' && trimmed === 'your-key') return false
      if (key === 'ANTHROPIC_BASE_URL' && trimmed === 'https://api.example.com') return false
      return true
    })
  )
}

function isLocalModelSelection(model: string | null | undefined): boolean {
  if (!model) return false
  const normalized = model.trim().toLowerCase()
  if (!normalized) return false
  if (/^claude-/i.test(normalized)) return false
  if (normalized === 'sonnet' || normalized === 'opus' || normalized === 'haiku') return false
  return true
}

function isThinkingSignatureError(error: string | null | undefined): boolean {
  return (error?.toLowerCase() ?? '').includes('invalid signature in thinking block')
}

function resolveEnvVarsForModel(model: string | null | undefined, envVars: Record<string, string>): Record<string, string> | undefined {
  const resolved = { ...envVars }

  if (isLocalModelSelection(model)) {
    if (!resolved.ANTHROPIC_BASE_URL) resolved.ANTHROPIC_BASE_URL = DEFAULT_OLLAMA_BASE_URL
    if (!resolved.ANTHROPIC_AUTH_TOKEN) resolved.ANTHROPIC_AUTH_TOKEN = 'ollama'
    resolved.ANTHROPIC_API_KEY = ''
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined
}

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateSummary(value: string, maxLength = 180): string {
  const normalized = normalizeSummaryText(value)
  if (!normalized) return ''
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function extractScheduledTaskChangedPaths(toolCall: Session['messages'][number]['toolCalls'][number]): string[] {
  if (!SCHEDULED_TASK_WRITE_TOOL_NAMES.has(toolCall.toolName)) return []
  if (!toolCall.toolInput || typeof toolCall.toolInput !== 'object') return []

  const input = toolCall.toolInput as {
    file_path?: unknown
    notebook_path?: unknown
    path?: unknown
  }

  const candidate = input.file_path ?? input.notebook_path ?? input.path
  return typeof candidate === 'string' && candidate.trim() ? [candidate.trim()] : []
}

function getScheduledTaskChangedPaths(session: Session): string[] {
  const seen = new Set<string>()
  const paths: string[] = []

  for (const message of session.messages) {
    for (const toolCall of message.toolCalls) {
      for (const path of extractScheduledTaskChangedPaths(toolCall)) {
        const normalized = path.replace(/\\/g, '/').toLowerCase()
        if (seen.has(normalized)) continue
        seen.add(normalized)
        paths.push(path)
      }
    }
  }

  return paths
}

function getScheduledTaskSnapshotStatus(session: Session): 'running' | 'approval' | 'completed' | 'failed' {
  if (session.pendingPermission || session.pendingQuestion) return 'approval'
  if (session.isStreaming) return 'running'
  if (session.error?.trim()) return 'failed'
  return 'completed'
}

function getScheduledTaskSnapshotSummary(session: Session): string | null {
  if (session.pendingPermission?.toolName) {
    return `${session.pendingPermission.toolName} 권한 승인 대기 중입니다.`
  }

  if (session.pendingQuestion?.question) {
    return truncateSummary(session.pendingQuestion.question)
  }

  if (session.error?.trim()) {
    return truncateSummary(session.error) || '오류로 인해 자동 실행이 완료되지 않았습니다.'
  }

  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index]
    if (message.role !== 'assistant') continue
    const text = truncateSummary(message.text)
    if (text) return text
  }

  return session.isStreaming ? 'Claude가 결과를 생성하는 중입니다.' : null
}

function normalizeSelectedFolder(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const firstString = value.find((item): item is string => typeof item === 'string')
    return firstString ?? null
  }

  if (value && typeof value === 'object') {
    const candidate = (value as { path?: unknown; filePath?: unknown; filePaths?: unknown }).path
      ?? (value as { path?: unknown; filePath?: unknown; filePaths?: unknown }).filePath

    if (typeof candidate === 'string') {
      return candidate
    }

    const filePaths = (value as { filePaths?: unknown }).filePaths
    if (Array.isArray(filePaths)) {
      const firstString = filePaths.find((item): item is string => typeof item === 'string')
      return firstString ?? null
    }
  }

  return null
}

function summarizeNotificationBody(text: string | null | undefined): string {
  const normalized = text?.replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized) return '작업이 완료되었습니다.'
  if (normalized.length <= 120) return normalized
  return `${normalized.slice(0, 117)}...`
}

function isAppInBackground(): boolean {
  return document.visibilityState !== 'visible' || !document.hasFocus()
}

function shouldDeliverNotification(mode: NotificationMode): boolean {
  if (mode === 'off') return false
  if (mode === 'all') return true
  return isAppInBackground()
}

function mapPendingQuestionRequest(denial: { toolName: string; toolUseId: string; toolInput: unknown }): PendingQuestionRequest | null {
  if (denial.toolName !== 'AskUserQuestion' || !denial.toolInput || typeof denial.toolInput !== 'object') {
    return null
  }

  const questions = (denial.toolInput as { questions?: unknown }).questions
  if (!Array.isArray(questions) || questions.length === 0) return null

  const first = questions[0]
  if (!first || typeof first !== 'object') return null

  const question = typeof (first as { question?: unknown }).question === 'string'
    ? (first as { question: string }).question
    : ''
  if (!question.trim()) return null

  const optionsRaw = Array.isArray((first as { options?: unknown }).options)
    ? (first as { options: unknown[] }).options
    : []

  return {
    toolUseId: denial.toolUseId,
    question,
    header: typeof (first as { header?: unknown }).header === 'string'
      ? (first as { header: string }).header
      : undefined,
    multiSelect: Boolean((first as { multiSelect?: unknown }).multiSelect),
    options: optionsRaw
      .filter((option): option is Record<string, unknown> => typeof option === 'object' && option !== null)
      .map((option) => ({
        label: String(option.label ?? ''),
        description: typeof option.description === 'string' ? option.description : undefined,
      }))
      .filter((option) => option.label.trim().length > 0),
  }
}

function cycleClaudeCodeMode(
  permissionMode: PermissionMode,
  planMode: boolean,
  onPermissionModeChange: (mode: PermissionMode) => void,
  onPlanModeChange: (value: boolean) => void,
) {
  if (planMode) {
    onPlanModeChange(false)
    onPermissionModeChange('default')
    return
  }

  if (permissionMode === 'default') {
    onPermissionModeChange('acceptEdits')
    return
  }

  if (permissionMode === 'acceptEdits') {
    onPermissionModeChange('default')
    onPlanModeChange(true)
    return
  }

  onPermissionModeChange('default')
  onPlanModeChange(false)
}

type SessionFileLockState = {
  paths: string[]
  conflictingPaths: string[]
  conflictingSessionIds: string[]
  isLocked: boolean
  hasConflict: boolean
}

function isWriteLikeTool(toolName: string) {
  return ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)
}

function normalizeLockedFilePath(value: string): string {
  return value.replace(/\\/g, '/').trim().toLowerCase()
}

function extractEditableFilePaths(toolName: string, toolInput: unknown): string[] {
  if (!isWriteLikeTool(toolName) || !toolInput || typeof toolInput !== 'object') return []

  const record = toolInput as {
    file_path?: unknown
    notebook_path?: unknown
    path?: unknown
  }

  const candidate = record.file_path ?? record.notebook_path ?? record.path
  if (typeof candidate !== 'string' || !candidate.trim()) return []
  return [candidate.trim()]
}

function getSessionActiveEditPaths(session: Session): string[] {
  const paths = new Map<string, string>()

  if (session.pendingPermission && isWriteLikeTool(session.pendingPermission.toolName)) {
    for (const path of extractEditableFilePaths(session.pendingPermission.toolName, session.pendingPermission.toolInput)) {
      paths.set(normalizeLockedFilePath(path), path)
    }
  }

  if (!session.isStreaming || !session.currentAssistantMsgId) {
    return Array.from(paths.values())
  }

  const currentAssistantMessage = session.messages.find((message) => message.id === session.currentAssistantMsgId)
  if (!currentAssistantMessage) return Array.from(paths.values())

  for (const toolCall of currentAssistantMessage.toolCalls) {
    if (toolCall.status !== 'running' || !isWriteLikeTool(toolCall.toolName)) continue
    for (const path of extractEditableFilePaths(toolCall.toolName, toolCall.toolInput)) {
      paths.set(normalizeLockedFilePath(path), path)
    }
  }

  return Array.from(paths.values())
}

function buildSessionFileLockState(sessions: Session[]): Record<string, SessionFileLockState> {
  const stateBySessionId: Record<string, SessionFileLockState> = {}
  const ownersByPath = new Map<string, Array<{ sessionId: string; displayPath: string }>>()

  for (const session of sessions) {
    const paths = getSessionActiveEditPaths(session)
    stateBySessionId[session.id] = {
      paths,
      conflictingPaths: [],
      conflictingSessionIds: [],
      isLocked: paths.length > 0,
      hasConflict: false,
    }

    for (const path of paths) {
      const key = normalizeLockedFilePath(path)
      const owners = ownersByPath.get(key) ?? []
      owners.push({ sessionId: session.id, displayPath: path })
      ownersByPath.set(key, owners)
    }
  }

  for (const owners of ownersByPath.values()) {
    if (owners.length <= 1) continue
    for (const owner of owners) {
      const state = stateBySessionId[owner.sessionId]
      if (!state) continue
      state.hasConflict = true
      if (!state.conflictingPaths.includes(owner.displayPath)) {
        state.conflictingPaths.push(owner.displayPath)
      }
      for (const other of owners) {
        if (other.sessionId === owner.sessionId) continue
        if (!state.conflictingSessionIds.includes(other.sessionId)) {
          state.conflictingSessionIds.push(other.sessionId)
        }
      }
    }
  }

  return stateBySessionId
}

function buildQuickPanelProjects(sessions: Session[]): RecentProject[] {
  const seen = new Set<string>()
  const projects: RecentProject[] = []

  for (const session of sessions) {
    const cwd = session.cwd.trim()
    if (!cwd || seen.has(cwd)) continue
    seen.add(cwd)
    projects.push({
      path: cwd,
      name: getProjectNameFromPath(cwd),
      lastUsedAt: 0,
    })
  }

  return projects
}

export default function App() {
  const expandedSidebarWidthRef = useRef(290)
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
  const [sidebarWidth, setSidebarWidth] = useState(290)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [installationStatus, setInstallationStatus] = useState<ClaudeInstallationStatus | null>(null)
  const [installationDismissed, setInstallationDismissed] = useState(false)
  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) ?? null : null
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
    [sessions]
  )
  const activeSessionConflict = activeSessionId ? sessionFileLockState[activeSessionId] : null
  const activeSessionConflictDetails = activeSessionConflict?.hasConflict
    ? {
        paths: activeSessionConflict.conflictingPaths,
        sessionNames: activeSessionConflict.conflictingSessionIds
          .map((sessionId) => sessions.find((session) => session.id === sessionId)?.name ?? '다른 세션')
          .filter((value, index, array) => array.indexOf(value) === index),
      }
    : null

  const pendingTabIdRef = useRef<string | null>(null)
  const pendingProcessKeyByTabRef = useRef<Map<string, string>>(new Map())
  const sendStartedAtByTabRef = useRef<Map<string, number>>(new Map())
  const currentAsstMsgRef = useRef<Map<string, string>>(new Map())
  const claudeSessionToTabRef = useRef<Map<string, string>>(new Map())
  const abortedTabIdsRef = useRef<Set<string>>(new Set())
  const scheduledTaskSessionByRunRef = useRef<Map<string, string>>(new Map())
  const scheduledTaskRunMetaBySessionRef = useRef<Map<string, { taskId: string; runAt: number }>>(new Map())
  const notifiedSessionEndsRef = useRef<Set<string>>(new Set())
  const streamEndTimerByTabRef = useRef<Map<string, number>>(new Map())
  const notificationModeRef = useRef(notificationMode)
  const sessionsRef = useRef(sessions)
  const syncedQuickPanelProjectsSignatureRef = useRef<string>('')
  sessionsRef.current = sessions
  notificationModeRef.current = notificationMode

  const storeRef = useRef({
    setClaudeSessionId, startAssistantMessage, appendThinkingChunk, appendTextChunk,
    addToolCall, resolveToolCall, setStreaming, commitStreamEnd, setLastCost, setError, setPendingPermission, setPendingQuestion,
    activeSessionId
  })
  storeRef.current = {
    setClaudeSessionId, startAssistantMessage, appendThinkingChunk, appendTextChunk,
    addToolCall, resolveToolCall, setStreaming, commitStreamEnd, setLastCost, setError, setPendingPermission, setPendingQuestion,
    activeSessionId
  }

  useEffect(() => {
    applyTheme(themeId)
  }, [themeId])

  useEffect(() => {
    document.documentElement.style.setProperty('--claude-ui-font-size', `${uiFontSize}px`)
    document.documentElement.style.setProperty('--claude-ui-zoom', `${uiZoomPercent / 100}`)
  }, [uiFontSize, uiZoomPercent])

  useEffect(() => {
    if (!messageJumpTarget) return

    const timer = window.setTimeout(() => {
      setMessageJumpTarget((current) => (current?.token === messageJumpTarget.token ? null : current))
    }, 1600)

    return () => window.clearTimeout(timer)
  }, [messageJumpTarget])

  useEffect(() => {
    const cleanup = window.claude.onClaudeEvent(handleClaudeEvent)
    return cleanup
  }, [])

  useEffect(() => {
    void refreshInstallationStatus()
  }, [claudeBinaryPath])

  useEffect(() => {
    return () => {
      for (const timer of streamEndTimerByTabRef.current.values()) {
        window.clearTimeout(timer)
      }
      streamEndTimerByTabRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsafeReloadState) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsafeReloadState])

  useEffect(() => {
    if (syncedQuickPanelProjectsSignatureRef.current === quickPanelProjectsSignature) return
    syncedQuickPanelProjectsSignatureRef.current = quickPanelProjectsSignature
    void window.claude.setQuickPanelProjects(quickPanelProjects).catch(() => undefined)
  }, [quickPanelProjects, quickPanelProjectsSignature])

  useEffect(() => {
    void window.claude.syncScheduledTasks(scheduledTasksSyncPayload).catch(() => undefined)
  }, [scheduledTasksSyncPayload])

  useEffect(() => {
    void window.claude.updateQuickPanelShortcut({
      accelerator: shortcutConfig.toggleQuickPanel[shortcutPlatform],
      enabled: quickPanelEnabled,
    }).catch(() => undefined)
  }, [quickPanelEnabled, shortcutConfig, shortcutPlatform])

  useEffect(() => {
    const cleanup = window.claude.onTrayNewSession(() => {
      void handleNewSession()
    })
    return cleanup
  }, [defaultProjectPath])

  useEffect(() => {
    const cleanup = window.claude.onQuickPanelMessage(async (payload) => {
      const sessionId = await handleNewSession(payload.cwd)
      setSettingsOpen(false)
      setScheduleOpen(false)
      if (payload.text.trim()) {
        await handleSendForSession(sessionId, payload.text, [])
      }
    })
    return cleanup
  }, [defaultProjectPath])

  useEffect(() => {
    const cleanup = window.claude.onScheduledTaskAdvance((payload) => {
      const runKey = `${payload.taskId}:${payload.firedAt}`
      const sessionTabId = scheduledTaskSessionByRunRef.current.get(runKey) ?? null
      scheduledTaskSessionByRunRef.current.delete(runKey)
      applyScheduledTaskAdvance({
        ...payload,
        sessionTabId,
      })
    })
    return cleanup
  }, [applyScheduledTaskAdvance])

  useEffect(() => {
    for (const [sessionId, meta] of scheduledTaskRunMetaBySessionRef.current) {
      const session = sessions.find((item) => item.id === sessionId)
      if (!session) {
        scheduledTaskRunMetaBySessionRef.current.delete(sessionId)
        continue
      }

      const status = getScheduledTaskSnapshotStatus(session)
      updateScheduledTaskRunSnapshot(meta.taskId, meta.runAt, {
        status,
        summary: getScheduledTaskSnapshotSummary(session),
        changedPaths: getScheduledTaskChangedPaths(session),
        cost: typeof session.lastCost === 'number' ? session.lastCost : null,
      })

      if (status === 'completed' || status === 'failed') {
        scheduledTaskRunMetaBySessionRef.current.delete(sessionId)
      }
    }
  }, [sessions, updateScheduledTaskRunSnapshot])

  useEffect(() => {
    const cleanup = window.claude.onScheduledTaskFired(async (payload) => {
      setSettingsOpen(false)
      setCommandPaletteOpen(false)
      setScheduleOpen(false)

      const cwd = payload.cwd?.trim() || defaultProjectPath
      const baseSessionName = payload.name?.trim() || getProjectNameFromPath(cwd)
      const sessionName = baseSessionName.startsWith('[Schedule] ')
        ? baseSessionName
        : `[Schedule] ${baseSessionName}`
      const sessionId = addSession(cwd, sessionName)
      scheduledTaskSessionByRunRef.current.set(`${payload.taskId}:${payload.firedAt}`, sessionId)
      scheduledTaskRunMetaBySessionRef.current.set(sessionId, {
        taskId: payload.taskId,
        runAt: payload.firedAt,
      })

      await handleSendForSession(sessionId, payload.prompt, [], {
        permissionModeOverride: payload.permissionMode,
        visibleTextOverride: payload.manual
          ? `${sessionName} 지금 실행`
          : payload.catchUp
            ? `${sessionName} 따라잡기 실행`
            : sessionName,
      })
    })
    return cleanup
  }, [addSession, defaultProjectPath, claudeBinaryPath, sanitizedEnvVars])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchShortcut(event, shortcutConfig.toggleSidebar[shortcutPlatform])) {
        event.preventDefault()
        handleToggleSidebar()
        return
      }

      if (matchShortcut(event, shortcutConfig.openSettings[shortcutPlatform])) {
        event.preventDefault()
        setCommandPaletteOpen(false)
        setScheduleOpen(false)
        setSettingsOpen(true)
        return
      }

      if (matchShortcut(event, shortcutConfig.newSession[shortcutPlatform])) {
        event.preventDefault()
        void handleNewSession()
        return
      }

      if (matchShortcut(event, shortcutConfig.openCommandPalette[shortcutPlatform])) {
        event.preventDefault()
        setCommandPaletteOpen((open) => !open)
        return
      }

      if (!activeSession) return

      if (matchShortcut(event, shortcutConfig.cyclePermissionMode[shortcutPlatform])) {
        event.preventDefault()
        cycleClaudeCodeMode(
          activeSession.permissionMode,
          activeSession.planMode,
          (mode) => setPermissionMode(activeSession.id, mode),
          (value) => setPlanMode(activeSession.id, value),
        )
        return
      }

      if (matchShortcut(event, shortcutConfig.toggleBypassPermissions[shortcutPlatform])) {
        event.preventDefault()
        if (!activeSession.planMode) {
          setPermissionMode(
            activeSession.id,
            activeSession.permissionMode === 'bypassPermissions' ? 'default' : 'bypassPermissions'
          )
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [shortcutConfig, shortcutPlatform, activeSession, setPermissionMode, setPlanMode])

  const handleSidebarResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(420, Math.max(180, startWidth + (moveEvent.clientX - startX)))
      setSidebarWidth(nextWidth)
      expandedSidebarWidthRef.current = nextWidth
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function resolveTabId(claudeSessionId: string | null | undefined): string | null {
    if (!claudeSessionId) return null
    const mappedTabId = claudeSessionToTabRef.current.get(claudeSessionId)
    if (mappedTabId) return mappedTabId
    return findTabByClaudeSessionId(sessionsRef.current, claudeSessionId)?.id ?? null
  }

  function resolveOrClaimTabId(claudeSessionId: string | null | undefined): string | null {
    const resolved = resolveTabId(claudeSessionId)
    if (resolved || !claudeSessionId || !pendingTabIdRef.current) return resolved

    const tabId = pendingTabIdRef.current
    claudeSessionToTabRef.current.set(claudeSessionId, tabId)
    storeRef.current.setClaudeSessionId(tabId, claudeSessionId)
    return tabId
  }

  function findStreamingFallbackTabId(claudeSessionId?: string | null): string | null {
    if (claudeSessionId) {
      const matched = sessionsRef.current.find((session) =>
        session.isStreaming && (session.sessionId === claudeSessionId || session.sessionId === null)
      )
      if (matched) return matched.id
    }

    if (pendingTabIdRef.current) return pendingTabIdRef.current
    if (storeRef.current.activeSessionId) {
      const activeSession = sessionsRef.current.find((session) => session.id === storeRef.current.activeSessionId)
      if (activeSession?.isStreaming) return activeSession.id
    }

    return sessionsRef.current.find((session) => session.isStreaming)?.id ?? null
  }

  function resolveEventTabId(claudeSessionId?: string | null): string | null {
    return resolveOrClaimTabId(claudeSessionId) ?? findStreamingFallbackTabId(claudeSessionId)
  }

  function takePendingTabId(): string | null {
    const tabId = pendingTabIdRef.current
    if (!tabId) return null
    pendingTabIdRef.current = null
    return tabId
  }

  function ensureAssistantMessage(tabId: string): string {
    let msgId = currentAsstMsgRef.current.get(tabId)
    if (!msgId) {
      msgId = storeRef.current.startAssistantMessage(tabId)
      currentAsstMsgRef.current.set(tabId, msgId)
    }
    return msgId
  }

  function clearPendingStreamEndTimer(tabId: string) {
    const pendingTimer = streamEndTimerByTabRef.current.get(tabId)
    if (pendingTimer != null) {
      window.clearTimeout(pendingTimer)
      streamEndTimerByTabRef.current.delete(tabId)
    }
  }

  function getLatestSession(tabId: string): Session | undefined {
    return useSessionsStore.getState().sessions.find((item) => item.id === tabId)
      ?? sessionsRef.current.find((item) => item.id === tabId)
  }

  function handleClaudeEvent(event: ClaudeStreamEvent) {
    const store = storeRef.current

    if (event.type === 'stream-start') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId) return
      notifiedSessionEndsRef.current.delete(tabId)
      clearPendingStreamEndTimer(tabId)
      pendingProcessKeyByTabRef.current.delete(tabId)
      ensureAssistantMessage(tabId)
      return
    }

    if (event.type === 'text-chunk') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId) return
      if (abortedTabIdsRef.current.has(tabId)) return
      const msgId = ensureAssistantMessage(tabId)
      store.appendTextChunk(tabId, msgId, event.text)
      return
    }

    if (event.type === 'thinking-chunk') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId) return
      if (abortedTabIdsRef.current.has(tabId)) return
      const msgId = ensureAssistantMessage(tabId)
      store.appendThinkingChunk(tabId, msgId, event.text)
      return
    }

    if (event.type === 'tool-start') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId) return
      if (abortedTabIdsRef.current.has(tabId)) return
      const msgId = ensureAssistantMessage(tabId)
      store.addToolCall(tabId, msgId, {
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        toolInput: event.toolInput,
        fileSnapshotBefore: event.fileSnapshotBefore,
        status: 'running'
      })
      return
    }

    if (event.type === 'tool-result') {
      const tabId = resolveEventTabId(event.sessionId as string)
      if (!tabId) return
      if (abortedTabIdsRef.current.has(tabId)) return
      store.resolveToolCall(tabId, event.toolUseId as string, event.content, event.isError as boolean)
      return
    }

    if (event.type === 'result') {
      const tabId = resolveEventTabId(event.sessionId) ?? takePendingTabId()
      if (!tabId) return
      if (abortedTabIdsRef.current.has(tabId)) return
      store.setStreaming(tabId, false)
      if (event.totalCostUsd) store.setLastCost(tabId, event.totalCostUsd)
      const askUserQuestionRequest = event.permissionDenials
        ?.map(mapPendingQuestionRequest)
        .find((request): request is PendingQuestionRequest => Boolean(request))

      const permissionRequest = event.permissionDenials
        ?.find((denial) => denial.toolName && denial.toolName !== 'AskUserQuestion')

      store.setPendingQuestion(tabId, askUserQuestionRequest ?? null)
      store.setPendingPermission(
        tabId,
        permissionRequest
          ? {
              toolName: permissionRequest.toolName,
              toolUseId: permissionRequest.toolUseId,
              toolInput: permissionRequest.toolInput,
            }
          : null
      )
      if (event.isError && event.resultText?.trim()) {
        const msgId = ensureAssistantMessage(tabId)
        const session = sessionsRef.current.find((item) => item.id === tabId)
        const currentMessage = session?.messages.find((message) => message.id === msgId)
        if (!currentMessage?.text.trim()) {
          store.appendTextChunk(tabId, msgId, event.resultText.trim())
        }
      }
      return
    }

    if (event.type === 'stream-end') {
      const tabId = resolveEventTabId(event.sessionId ?? null) ?? takePendingTabId()
      if (event.sessionId) {
        claudeSessionToTabRef.current.delete(event.sessionId)
      }
      if (!tabId) return
      const latestSession = getLatestSession(tabId)
      const isStaleStreamEnd =
        !latestSession?.isStreaming &&
        !latestSession?.pendingPermission &&
        !latestSession?.pendingQuestion &&
        latestSession?.currentAssistantMsgId === null

      if (isStaleStreamEnd) {
        pendingProcessKeyByTabRef.current.delete(tabId)
        sendStartedAtByTabRef.current.delete(tabId)
        return
      }

      const wasAborted = abortedTabIdsRef.current.has(tabId)
      clearPendingStreamEndTimer(tabId)
      pendingProcessKeyByTabRef.current.delete(tabId)
      if (pendingTabIdRef.current === tabId) {
        pendingTabIdRef.current = null
      }
      sendStartedAtByTabRef.current.delete(tabId)

      const commitStreamEnd = () => {
        clearPendingStreamEndTimer(tabId)
        store.commitStreamEnd(tabId)

        const session = getLatestSession(tabId)
        const hasPendingInteraction = Boolean(session?.pendingPermission || session?.pendingQuestion)
        const shouldNotify =
          !notifiedSessionEndsRef.current.has(tabId) &&
          !wasAborted &&
          !hasPendingInteraction

        if (shouldNotify) {
          notifiedSessionEndsRef.current.add(tabId)
          const lastAssistantMessage = [...(session?.messages ?? [])].reverse().find((message) => message.role === 'assistant')
          const title = session?.error ? 'Claude 작업 실패' : 'Claude 작업 완료'
          const body = summarizeNotificationBody(session?.error ?? lastAssistantMessage?.text)
          if (shouldDeliverNotification(notificationModeRef.current)) {
            void window.claude.notify({
              title: session?.name ? `${title} · ${session.name}` : title,
              body,
            })
          }
        }

        abortedTabIdsRef.current.delete(tabId)
      }

      const session = getLatestSession(tabId)
      const hasPendingInteraction = Boolean(session?.pendingPermission || session?.pendingQuestion)
      if (event.exitCode === 0 || hasPendingInteraction || wasAborted) {
        commitStreamEnd()
      }
      return
    }

    if (event.type === 'error') {
      const tabId = resolveEventTabId(event.sessionId ?? null) ?? takePendingTabId() ?? store.activeSessionId
      if (event.sessionId) {
        claudeSessionToTabRef.current.delete(event.sessionId)
      }
      if (tabId) {
        if (abortedTabIdsRef.current.has(tabId)) {
          abortedTabIdsRef.current.delete(tabId)
          clearPendingStreamEndTimer(tabId)
          pendingProcessKeyByTabRef.current.delete(tabId)
          if (pendingTabIdRef.current === tabId) {
            pendingTabIdRef.current = null
          }
          sendStartedAtByTabRef.current.delete(tabId)
          store.commitStreamEnd(tabId)
          return
        }
        clearPendingStreamEndTimer(tabId)
        pendingProcessKeyByTabRef.current.delete(tabId)
        if (pendingTabIdRef.current === tabId) {
          pendingTabIdRef.current = null
        }
        sendStartedAtByTabRef.current.delete(tabId)
      }
      if (tabId) {
        if (isThinkingSignatureError(event.error)) {
          updateSession(tabId, () => ({ sessionId: null }))
        }
        store.setError(tabId, event.error)
      }
      return
    }
  }

  async function handleSendForSession(
    sessionId: string,
    text: string,
    files: SelectedFile[],
    options?: { permissionModeOverride?: PermissionMode; visibleTextOverride?: string }
  ) {
    const session = useSessionsStore.getState().sessions.find((item) => item.id === sessionId)
    if (!session || session.isStreaming) return
    abortedTabIdsRef.current.delete(sessionId)

    let fullPrompt = text
    if (files.length > 0) {
      const fileSections = files
        .map((f) => {
          if (f.fileType === 'image') {
            return `<file path="${f.path}" type="image">\n[이미지 파일: ${f.name} (${f.size} bytes) - 경로에서 직접 확인하세요]\n</file>`
          }
          return `<file path="${f.path}">\n${f.content}\n</file>`
        })
        .join('\n\n')
      fullPrompt = files.length > 0 && text
        ? `${fileSections}\n\n${text}`
        : fileSections || text
    }

    const visibleFiles = files.map(({ dataUrl: _dataUrl, ...file }) => ({
      ...file,
      id: file.path,
    }))

    addUserMessage(
      sessionId,
      options?.visibleTextOverride ?? (text || `(파일 ${files.length}개 첨부)`),
      visibleFiles.length > 0 ? visibleFiles : undefined
    )

    setError(sessionId, null)
    setPendingPermission(sessionId, null)
    setPendingQuestion(sessionId, null)
    setStreaming(sessionId, true)

    const assistantMsgId = startAssistantMessage(sessionId)
    currentAsstMsgRef.current.set(sessionId, assistantMsgId)
    sendStartedAtByTabRef.current.set(sessionId, Date.now())

    if (!session.sessionId) {
      pendingTabIdRef.current = sessionId
    } else {
      claudeSessionToTabRef.current.set(session.sessionId, sessionId)
    }

    try {
      const effectiveEnvVars = resolveEnvVarsForModel(
        session.model,
        Object.keys(sanitizedEnvVars).length > 0 ? sanitizedEnvVars : {},
      )

      const result = await window.claude.sendMessage({
        sessionId: session.sessionId ?? null,
        prompt: fullPrompt,
        cwd: session.cwd && session.cwd !== '~' ? session.cwd : '~',
        permissionMode: options?.permissionModeOverride ?? session.permissionMode,
        planMode: session.planMode,
        model: session.model ?? undefined,
        envVars: effectiveEnvVars,
        claudePath: claudeBinaryPath || undefined,
      })
      if (result?.tempKey) {
        pendingProcessKeyByTabRef.current.set(sessionId, result.tempKey)
      }
    } catch (err) {
      setError(sessionId, String(err))
      clearPendingStreamEndTimer(sessionId)
      pendingProcessKeyByTabRef.current.delete(sessionId)
      pendingTabIdRef.current = null
      currentAsstMsgRef.current.delete(sessionId)
      sendStartedAtByTabRef.current.delete(sessionId)
    }
  }

  async function handleSend(
    text: string,
    files: SelectedFile[],
    options?: { permissionModeOverride?: PermissionMode; visibleTextOverride?: string }
  ) {
    if (!activeSessionId) return
    await handleSendForSession(activeSessionId, text, files, options)
  }

  function handleModelChange(sessionId: string, nextModel: string | null) {
    const session = useSessionsStore.getState().sessions.find((item) => item.id === sessionId)
    if (!session) return

    const backendChanged = isLocalModelSelection(session.model) !== isLocalModelSelection(nextModel)
    if (!backendChanged) {
      setModel(sessionId, nextModel)
      return
    }

    if (session.sessionId) {
      claudeSessionToTabRef.current.delete(session.sessionId)
    }

    updateSession(sessionId, () => ({
      model: nextModel,
      sessionId: null,
      error: null,
    }))
  }

  async function handleAbort() {
    if (!activeSessionId) return
    const processKey = activeSession?.sessionId ?? pendingProcessKeyByTabRef.current.get(activeSessionId)
    if (!processKey) return
    abortedTabIdsRef.current.add(activeSessionId)
    await window.claude.abort({ sessionId: processKey })
    clearPendingStreamEndTimer(activeSessionId)
    pendingProcessKeyByTabRef.current.delete(activeSessionId)
    if (pendingTabIdRef.current === activeSessionId) {
      pendingTabIdRef.current = null
    }
    currentAsstMsgRef.current.delete(activeSessionId)
    sendStartedAtByTabRef.current.delete(activeSessionId)
    commitStreamEnd(activeSessionId)
  }

  function getPermissionApprovalMode(request: PendingPermissionRequest): PermissionMode {
    if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(request.toolName)) {
      return 'acceptEdits'
    }
    return 'bypassPermissions'
  }

  async function handlePermissionRequestAction(action: 'once' | 'always' | 'deny') {
    if (!activeSession || !activeSessionId || !activeSession.pendingPermission || activeSession.isStreaming) return

    const request = activeSession.pendingPermission
    setPendingPermission(activeSessionId, null)

    if (action === 'deny') return

    const nextPermissionMode = getPermissionApprovalMode(request)
    if (action === 'always' && activeSession.permissionMode !== nextPermissionMode) {
      setPermissionMode(activeSessionId, nextPermissionMode)
    }

    await handleSendForSession(
      activeSessionId,
      '방금 요청한 권한을 승인합니다. 중단된 작업을 이어서 계속 진행하세요.',
      [],
      {
        permissionModeOverride: nextPermissionMode,
        visibleTextOverride: action === 'always' ? '권한 승인 후 계속' : '이번만 권한 승인 후 계속',
      }
    )
  }

  async function handleQuestionResponse(answer: string | null) {
    if (!activeSession || !activeSessionId || !activeSession.pendingQuestion || activeSession.isStreaming) return

    setPendingQuestion(activeSessionId, null)

    if (!answer?.trim()) return

    await handleSendForSession(activeSessionId, answer.trim(), [], {
      visibleTextOverride: answer.trim(),
    })
  }

  async function handleSelectFolder(tabId?: string) {
    const id = tabId ?? activeSessionId
    if (!id) return
    const session = sessions.find((item) => item.id === id)
    const folder = normalizeSelectedFolder(await window.claude.selectFolder({
      defaultPath: session?.cwd || defaultProjectPath,
      title: '프로젝트 폴더 선택',
    }))
    if (!folder) return
    const name = getProjectNameFromPath(folder)
    updateSession(id, () => ({ cwd: folder, name }))
  }

  async function handleNewSession(cwdOverride?: string): Promise<string> {
    setSettingsOpen(false)
    setScheduleOpen(false)
    setCommandPaletteOpen(false)
    const fallbackPath = defaultProjectPath.trim() || DEFAULT_PROJECT_PATH
    const folder = normalizeSelectedFolder(cwdOverride)
      ?? normalizeSelectedFolder(await window.claude.selectFolder({
        defaultPath: fallbackPath,
        title: '프로젝트 폴더 선택',
      }))
    const cwd = folder || fallbackPath
    const name = getProjectNameFromPath(cwd)
    return addSession(cwd, name)
  }

  function handleSelectSession(sessionId: string) {
    setSettingsOpen(false)
    setScheduleOpen(false)
    setCommandPaletteOpen(false)
    setMessageJumpTarget(null)
    setActiveSession(sessionId)
  }

  function handleSelectMessageResult(sessionId: string, messageId: string) {
    messageJumpTokenRef.current += 1
    setSettingsOpen(false)
    setScheduleOpen(false)
    setCommandPaletteOpen(false)
    setMessageJumpTarget({
      sessionId,
      messageId,
      token: messageJumpTokenRef.current,
    })
    setActiveSession(sessionId)
  }

  async function refreshInstallationStatus() {
    const status = await window.claude.checkInstallation(claudeBinaryPath || undefined).catch(() => ({
      installed: false,
      path: null,
      version: null,
    }))
    setInstallationStatus(status)
    if (status.installed) setInstallationDismissed(false)
  }

  function handleToggleSidebar() {
    setSidebarCollapsed((previous) => {
      if (previous) {
        setSidebarWidth(expandedSidebarWidthRef.current)
        return false
      }

      expandedSidebarWidthRef.current = sidebarWidth
      return true
    })
  }

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
          onRemoveSession={removeSession}
          onSelectFolder={(sid) => handleSelectFolder(sid)}
          onOpenSchedule={() => {
            setSettingsOpen(false)
            setCommandPaletteOpen(false)
            setScheduleOpen(true)
          }}
          onOpenSettings={() => {
            setScheduleOpen(false)
            setSettingsOpen(true)
          }}
          scheduleOpen={scheduleOpen}
          newSessionShortcutLabel={getShortcutLabel(shortcutConfig, 'newSession', shortcutPlatform)}
          settingsShortcutLabel={getShortcutLabel(shortcutConfig, 'openSettings', shortcutPlatform)}
        />
        <div
          onMouseDown={handleSidebarResizeStart}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-claude-border/80 transition-colors"
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
        ) : (
          activeSession ? (
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
              onPlanModeChange={(val: boolean) => setPlanMode(activeSession.id, val)}
              onModelChange={(model) => handleModelChange(activeSession.id, model)}
              onPermissionRequestAction={handlePermissionRequestAction}
              onQuestionResponse={handleQuestionResponse}
              permissionShortcutLabel={getShortcutLabel(shortcutConfig, 'cyclePermissionMode', shortcutPlatform)}
              bypassShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleBypassPermissions', shortcutPlatform)}
            />
          ) : (
            <EmptyMainState sidebarMode={sidebarMode} onNewSession={handleNewSession} />
          )
        )}
      </main>

      {installationStatus && !installationStatus.installed && !installationDismissed && (
        <ClaudeInstallModal
          installationStatus={installationStatus}
          onRetry={refreshInstallationStatus}
          onClose={() => setInstallationDismissed(true)}
        />
      )}

      <CommandPalette
        open={commandPaletteOpen}
        sessions={sessions}
        onClose={() => setCommandPaletteOpen(false)}
        onNewSession={() => {
          void handleNewSession()
        }}
        onOpenSettings={() => {
          setCommandPaletteOpen(false)
          setScheduleOpen(false)
          setSettingsOpen(true)
        }}
        onSelectSession={handleSelectSession}
        onSelectMessage={handleSelectMessageResult}
      />
    </div>
  )
}

function EmptyMainState({
  sidebarMode,
  onNewSession,
}: {
  sidebarMode: 'session' | 'project'
  onNewSession: () => void
}) {
  const isProjectMode = sidebarMode === 'project'
  const title = isProjectMode ? '열린 프로젝트가 없습니다' : '열린 세션이 없습니다'
  const actionLabel = isProjectMode ? '새 프로젝트 열기' : '새 세션'
  const description = isProjectMode
    ? '새 프로젝트 열기를 누르면 프로젝트 폴더를 고를 수 있습니다. 선택하지 않으면 설정한 기본 프로젝트 폴더로 바로 시작합니다.'
    : '새 세션을 누르면 프로젝트 폴더를 고를 수 있습니다. 선택하지 않으면 설정한 기본 프로젝트 폴더로 바로 시작합니다.'

  return (
    <div className="flex h-full items-center justify-center bg-claude-bg px-8">
      <div className="max-w-sm text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-claude-text">{title}</h2>
        <p className="mt-2 text-[15px] leading-7 text-claude-muted">
          {description}
        </p>
        <button
          onClick={onNewSession}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-claude-border bg-claude-surface px-4 py-3 text-sm font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

function ClaudeInstallModal({
  installationStatus,
  onRetry,
  onClose,
}: {
  installationStatus: ClaudeInstallationStatus
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-claude-border bg-claude-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-claude-text">Claude Code를 찾을 수 없습니다</p>
            <p className="mt-1 text-sm text-claude-muted leading-relaxed">
              앱 실행 시 `claude --version` 확인에 실패했습니다. Claude Code CLI를 설치하고 `claude` 명령이 PATH에 잡혀 있어야 합니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title="닫기"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-xs text-claude-muted">확인된 경로</p>
          <p className="mt-1 break-all font-mono text-xs text-claude-text">{installationStatus.path ?? '찾지 못함'}</p>
        </div>

        <div className="mt-3 rounded-2xl border border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-xs text-claude-muted">설치 후 확인할 항목</p>
          <ul className="mt-2 space-y-1 text-sm text-claude-text">
            <li>터미널에서 `claude --version` 이 정상 출력되는지</li>
            <li>앱을 다시 열거나 아래 `다시 확인` 버튼을 눌러 재검사</li>
          </ul>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-claude-border px-3 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
          >
            닫기
          </button>
          <button
            onClick={onRetry}
            className="rounded-xl bg-claude-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:brightness-110"
          >
            다시 확인
          </button>
        </div>
      </div>
    </div>
  )
}
