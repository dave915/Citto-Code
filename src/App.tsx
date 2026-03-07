import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useSessionsStore, findTabByClaudeSessionId } from './store/sessions'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsPanel } from './components/SettingsPanel'
import type { ClaudeInstallationStatus, ClaudeStreamEvent, SelectedFile } from '../electron/preload'
import type {
  NotificationMode,
  PermissionMode,
  PendingPermissionRequest,
  PendingQuestionRequest,
} from './store/sessions'
import { getCurrentPlatform, getShortcutLabel, matchShortcut } from './lib/shortcuts'
import { applyTheme } from './lib/theme'

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

export default function App() {
  const expandedSidebarWidthRef = useRef(290)
  const {
    sessions,
    activeSessionId,
    sidebarMode,
    addSession,
    removeSession,
    setActiveSession,
    setSidebarMode,
    addUserMessage,
    startAssistantMessage,
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
    envVars,
    themeId,
    notificationMode,
    shortcutConfig,
  } = useSessionsStore()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(290)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [installationStatus, setInstallationStatus] = useState<ClaudeInstallationStatus | null>(null)
  const [installationDismissed, setInstallationDismissed] = useState(false)
  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) ?? null : null
  const shortcutPlatform = getCurrentPlatform()
  const sanitizedEnvVars = sanitizeEnvVars(envVars)

  const pendingTabIdRef = useRef<string | null>(null)
  const pendingProcessKeyByTabRef = useRef<Map<string, string>>(new Map())
  const sendStartedAtByTabRef = useRef<Map<string, number>>(new Map())
  const currentAsstMsgRef = useRef<Map<string, string>>(new Map())
  const claudeSessionToTabRef = useRef<Map<string, string>>(new Map())
  const abortedTabIdsRef = useRef<Set<string>>(new Set())
  const notifiedSessionEndsRef = useRef<Set<string>>(new Set())
  const notificationModeRef = useRef(notificationMode)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  notificationModeRef.current = notificationMode

  const storeRef = useRef({
    setClaudeSessionId, startAssistantMessage, appendTextChunk,
    addToolCall, resolveToolCall, setStreaming, setLastCost, setError, setPendingPermission, setPendingQuestion,
    activeSessionId
  })
  storeRef.current = {
    setClaudeSessionId, startAssistantMessage, appendTextChunk,
    addToolCall, resolveToolCall, setStreaming, setLastCost, setError, setPendingPermission, setPendingQuestion,
    activeSessionId
  }

  useEffect(() => {
    applyTheme(themeId)
  }, [themeId])

  useEffect(() => {
    const cleanup = window.claude.onClaudeEvent(handleClaudeEvent)
    return cleanup
  }, [])

  useEffect(() => {
    void refreshInstallationStatus()
  }, [])

  useEffect(() => {
    if (!activeSessionId || !activeSession?.isStreaming) return

    let cancelled = false

    const verifyStreamingState = async () => {
      const processKey = activeSession.sessionId ?? pendingProcessKeyByTabRef.current.get(activeSessionId)
      if (!processKey) {
        const startedAt = sendStartedAtByTabRef.current.get(activeSessionId) ?? 0
        if (Date.now() - startedAt < 4000) {
          return
        }
        setStreaming(activeSessionId, false)
        currentAsstMsgRef.current.delete(activeSessionId)
        if (pendingTabIdRef.current === activeSessionId) {
          pendingTabIdRef.current = null
        }
        sendStartedAtByTabRef.current.delete(activeSessionId)
        return
      }

      const hasActiveProcess = await window.claude.hasActiveProcess({ sessionId: processKey }).catch(() => false)
      if (cancelled || hasActiveProcess) return

      pendingProcessKeyByTabRef.current.delete(activeSessionId)
      currentAsstMsgRef.current.delete(activeSessionId)
      if (pendingTabIdRef.current === activeSessionId) {
        pendingTabIdRef.current = null
      }
      sendStartedAtByTabRef.current.delete(activeSessionId)
      setStreaming(activeSessionId, false)
    }

    void verifyStreamingState()
    const interval = window.setInterval(() => {
      void verifyStreamingState()
    }, 1500)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeSessionId, activeSession?.isStreaming, activeSession?.sessionId, setStreaming])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchShortcut(event, shortcutConfig.toggleSidebar[shortcutPlatform])) {
        event.preventDefault()
        handleToggleSidebar()
        return
      }

      if (matchShortcut(event, shortcutConfig.openSettings[shortcutPlatform])) {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }

      if (matchShortcut(event, shortcutConfig.newSession[shortcutPlatform])) {
        event.preventDefault()
        void handleNewSession()
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

  function handleClaudeEvent(event: ClaudeStreamEvent) {
    const store = storeRef.current

    if (event.type === 'stream-start') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId) return
      notifiedSessionEndsRef.current.delete(tabId)
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

    if (event.type === 'tool-start') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId) return
      if (abortedTabIdsRef.current.has(tabId)) return
      const msgId = ensureAssistantMessage(tabId)
      store.addToolCall(tabId, msgId, {
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        toolInput: event.toolInput,
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
      if (tabId) {
        abortedTabIdsRef.current.delete(tabId)
        pendingProcessKeyByTabRef.current.delete(tabId)
        if (pendingTabIdRef.current === tabId) {
          pendingTabIdRef.current = null
        }
        sendStartedAtByTabRef.current.delete(tabId)
      }
      if (!tabId) return
      const session = sessionsRef.current.find((item) => item.id === tabId)
      const shouldNotify =
        !notifiedSessionEndsRef.current.has(tabId) &&
        !abortedTabIdsRef.current.has(tabId) &&
        !session?.pendingPermission &&
        !session?.pendingQuestion
      store.setStreaming(tabId, false)
      currentAsstMsgRef.current.delete(tabId)
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
          pendingProcessKeyByTabRef.current.delete(tabId)
          if (pendingTabIdRef.current === tabId) {
            pendingTabIdRef.current = null
          }
          sendStartedAtByTabRef.current.delete(tabId)
          store.setStreaming(tabId, false)
          return
        }
        pendingProcessKeyByTabRef.current.delete(tabId)
        if (pendingTabIdRef.current === tabId) {
          pendingTabIdRef.current = null
        }
        sendStartedAtByTabRef.current.delete(tabId)
      }
      store.setError(tabId, event.error)
      return
    }
  }

  async function handleSend(
    text: string,
    files: SelectedFile[],
    options?: { permissionModeOverride?: PermissionMode; visibleTextOverride?: string }
  ) {
    if (!activeSession || !activeSessionId || activeSession.isStreaming) return
    abortedTabIdsRef.current.delete(activeSessionId)

    setError(activeSessionId, null)
    setPendingPermission(activeSessionId, null)
    setPendingQuestion(activeSessionId, null)
    setStreaming(activeSessionId, true)

    // 첨부파일이 있으면 프롬프트 앞에 파일 내용 삽입
    let fullPrompt = text
    if (files.length > 0) {
      const fileSections = files
        .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
        .join('\n\n')
      fullPrompt = files.length > 0 && text
        ? `${fileSections}\n\n${text}`
        : fileSections || text
    }

    // UI에 표시할 메시지 (원본 텍스트 + 첨부파일 메타만)
    addUserMessage(
      activeSessionId,
      options?.visibleTextOverride ?? (text || `(파일 ${files.length}개 첨부)`),
      files.length > 0 ? files : undefined
    )

    const assistantMsgId = startAssistantMessage(activeSessionId)
    currentAsstMsgRef.current.set(activeSessionId, assistantMsgId)
    sendStartedAtByTabRef.current.set(activeSessionId, Date.now())

    if (!activeSession.sessionId) {
      pendingTabIdRef.current = activeSessionId
    } else {
      claudeSessionToTabRef.current.set(activeSession.sessionId, activeSessionId)
    }

    try {
      const result = await window.claude.sendMessage({
        sessionId: activeSession.sessionId ?? null,
        prompt: fullPrompt,
        cwd: activeSession.cwd && activeSession.cwd !== '~' ? activeSession.cwd : '~',
        permissionMode: options?.permissionModeOverride ?? activeSession.permissionMode,
        planMode: activeSession.planMode,
        model: activeSession.model ?? undefined,
        envVars: Object.keys(sanitizedEnvVars).length > 0 ? sanitizedEnvVars : undefined,
      })
      if (result?.tempKey) {
        pendingProcessKeyByTabRef.current.set(activeSessionId, result.tempKey)
      }
    } catch (err) {
      setError(activeSessionId, String(err))
      pendingProcessKeyByTabRef.current.delete(activeSessionId)
      pendingTabIdRef.current = null
      currentAsstMsgRef.current.delete(activeSessionId)
      sendStartedAtByTabRef.current.delete(activeSessionId)
    }
  }

  async function handleAbort() {
    if (!activeSessionId) return
    const processKey = activeSession?.sessionId ?? pendingProcessKeyByTabRef.current.get(activeSessionId)
    if (!processKey) return
    abortedTabIdsRef.current.add(activeSessionId)
    await window.claude.abort({ sessionId: processKey })
    pendingProcessKeyByTabRef.current.delete(activeSessionId)
    if (pendingTabIdRef.current === activeSessionId) {
      pendingTabIdRef.current = null
    }
    currentAsstMsgRef.current.delete(activeSessionId)
    sendStartedAtByTabRef.current.delete(activeSessionId)
    setStreaming(activeSessionId, false)
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

    await handleSend(
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

    await handleSend(answer.trim(), [], {
      visibleTextOverride: answer.trim(),
    })
  }

  async function handleSelectFolder(tabId?: string) {
    const id = tabId ?? activeSessionId
    if (!id) return
    const folder = normalizeSelectedFolder(await window.claude.selectFolder())
    if (!folder) return
    const name = folder.split('/').pop() || folder
    updateSession(id, () => ({ cwd: folder, name }))
  }

  async function handleNewSession(cwdOverride?: string) {
    let folder = normalizeSelectedFolder(cwdOverride)
    if (!folder) {
      folder = normalizeSelectedFolder(await window.claude.selectFolder())
    }
    const cwd = folder ?? '~'
    const name = folder ? (folder.split('/').pop() || folder) : '~'
    addSession(cwd, name)
  }

  function handleSelectSession(sessionId: string) {
    setSettingsOpen(false)
    setActiveSession(sessionId)
  }

  async function refreshInstallationStatus() {
    const status = await window.claude.checkInstallation().catch(() => ({
      installed: false,
      path: null,
      version: null,
    }))
    setInstallationStatus(status)
    if (status.installed) setInstallationDismissed(false)
  }

  function handleToggleSidebar() {
    if (sidebarCollapsed) {
      setSidebarWidth(expandedSidebarWidthRef.current)
      setSidebarCollapsed(false)
      return
    }

    expandedSidebarWidthRef.current = sidebarWidth
    setSidebarCollapsed(true)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-claude-sidebar font-sans">
      {!sidebarCollapsed && (
      <div className="relative flex-shrink-0" style={{ width: `${sidebarWidth}px` }}>
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          sidebarMode={sidebarMode}
          onSelectSession={handleSelectSession}
          onRenameSession={(id, name) => updateSession(id, () => ({ name }))}
          onToggleFavorite={(id) => updateSession(id, (session) => ({ favorite: !session.favorite }))}
          onNewSession={handleNewSession}
          onRemoveSession={removeSession}
          onSelectFolder={(sid) => handleSelectFolder(sid)}
          onOpenSettings={() => setSettingsOpen(true)}
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
        {settingsOpen ? (
          <SettingsPanel onClose={() => setSettingsOpen(false)} onSidebarModeChange={setSidebarMode} />
        ) : (
          activeSession ? (
            <ChatView
              key={activeSession.id}
              session={activeSession}
              onSend={handleSend}
              onAbort={handleAbort}
              sidebarMode={sidebarMode}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={handleToggleSidebar}
              sidebarShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleSidebar', shortcutPlatform)}
              filesShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleFiles', shortcutPlatform)}
              sessionInfoShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleSessionInfo', shortcutPlatform)}
              onSelectFolder={() => handleSelectFolder()}
              onPermissionModeChange={(mode: PermissionMode) => setPermissionMode(activeSession.id, mode)}
              onPlanModeChange={(val: boolean) => setPlanMode(activeSession.id, val)}
              onModelChange={(model) => setModel(activeSession.id, model)}
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
    </div>
  )
}

function EmptyMainState({ sidebarMode, onNewSession }: { sidebarMode: 'session' | 'project'; onNewSession: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-claude-bg px-8">
      <div className="max-w-sm text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-claude-text">열린 세션이 없습니다</h2>
        <p className="mt-2 text-[15px] leading-7 text-claude-muted">
          새 세션을 만들고 프로젝트 폴더를 선택하면 바로 작업을 시작할 수 있습니다.
        </p>
        <button
          onClick={onNewSession}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-claude-border bg-claude-surface px-4 py-3 text-sm font-medium text-claude-text shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-colors hover:bg-claude-surface-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {sidebarMode === 'project' ? '프로젝트 폴더 열기' : '새 세션'}
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
      <div className="w-full max-w-md rounded-[28px] border border-claude-border bg-claude-panel p-5 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
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
