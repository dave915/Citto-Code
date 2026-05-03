import { BrowserWindow, ipcMain } from 'electron'
import { normalizeSecretaryAction, type SecretaryAction, type SecretaryActionResult } from './actions'
import { createSecretaryActionHandlers } from './action-handlers'
import { isCittoRoute } from './routes'
import type { SecretaryMemory } from './memory'
import type { SecretaryService } from './secretary-service'
import type { SecretaryActiveContext, SecretaryProcessResult, SecretaryRuntimeConfig } from './types'

type RegisterSecretaryIpcHandlersOptions = {
  memory: SecretaryMemory
  service: SecretaryService
  getActiveContext: () => SecretaryActiveContext
  setActiveContext: (context: SecretaryActiveContext) => void
  toggleSecretaryPanel: () => void
  setSecretaryPanelOpen: (open: boolean) => void
  getSecretaryPanelOpen: () => boolean
  setSecretaryFloatingExpanded: (expanded: boolean) => void
  moveSecretaryFloatingBy: (deltaX: number, deltaY: number) => void
  updateSecretaryShortcut: (accelerator: string, enabled: boolean) => void
  showMainWindow: () => BrowserWindow
  sendWhenRendererReady: (window: BrowserWindow, channel: string, payload?: unknown) => void
  runWorkflowNow: (workflowId: string) => Promise<{ ok: boolean; error?: string }>
}

const SECRETARY_PENDING_ACTION_TTL_MS = 10 * 60 * 1000
const SECRETARY_PROCESS_IPC_TIMEOUT_MS = 70_000
const SECRETARY_RENDERER_ACTION_TIMEOUT_MS = 20_000

function createActionKey(action: SecretaryAction): string {
  return JSON.stringify(action)
}

function withProcessTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Secretary IPC process timed out.'))
    }, timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeActionResult(value: unknown): SecretaryActionResult {
  if (!isRecord(value)) return { ok: false, error: '렌더러 작업 결과를 읽지 못했어요.' }

  const ok = Boolean(value.ok)
  const message = typeof value.message === 'string' && value.message.trim()
    ? value.message.trim()
    : undefined
  const error = typeof value.error === 'string' && value.error.trim()
    ? value.error.trim()
    : undefined

  return {
    ok,
    message,
    payload: value.payload,
    error,
  }
}

function normalizeRuntimePayload(value: unknown): SecretaryRuntimeConfig | null {
  if (!isRecord(value)) return null

  const runtime: SecretaryRuntimeConfig = {}
  const envVars = isRecord(value.envVars)
    ? Object.fromEntries(
        Object.entries(value.envVars).filter((entry): entry is [string, string] => (
          typeof entry[0] === 'string'
          && typeof entry[1] === 'string'
        )),
      )
    : undefined

  if ('claudePath' in value) {
    runtime.claudePath = typeof value.claudePath === 'string' ? value.claudePath : null
  }
  if (envVars) runtime.envVars = envVars
  if ('defaultModel' in value) {
    runtime.defaultModel = typeof value.defaultModel === 'string' ? value.defaultModel : null
  }
  if ('permissionMode' in value) {
    runtime.permissionMode = value.permissionMode === 'acceptEdits' || value.permissionMode === 'bypassPermissions'
      ? value.permissionMode
      : 'default'
  }
  if ('planMode' in value) {
    runtime.planMode = Boolean(value.planMode)
  }

  return runtime
}

function normalizeActiveContext(value: unknown, fallback: SecretaryActiveContext): SecretaryActiveContext {
  const record = isRecord(value) ? value as Partial<SecretaryActiveContext> : {}

  return {
    activeRoute: isCittoRoute(record.activeRoute) ? record.activeRoute : fallback.activeRoute,
    currentSessionId: typeof record.currentSessionId === 'string' && record.currentSessionId.trim()
      ? record.currentSessionId.trim()
      : null,
    currentProjectId: typeof record.currentProjectId === 'string' && record.currentProjectId.trim()
      ? record.currentProjectId.trim()
      : null,
    currentSessionName: typeof record.currentSessionName === 'string' && record.currentSessionName.trim()
      ? record.currentSessionName.trim()
      : null,
    currentProjectPath: typeof record.currentProjectPath === 'string' && record.currentProjectPath.trim()
      ? record.currentProjectPath.trim()
      : null,
    currentModel: typeof record.currentModel === 'string' && record.currentModel.trim()
      ? record.currentModel.trim()
      : null,
    permissionMode: record.permissionMode === 'acceptEdits' || record.permissionMode === 'bypassPermissions'
      ? record.permissionMode
      : 'default',
    planMode: Boolean(record.planMode),
    themeId: typeof record.themeId === 'string' && record.themeId.trim() ? record.themeId.trim() : null,
    uiFontSize: typeof record.uiFontSize === 'number' && Number.isFinite(record.uiFontSize)
      ? record.uiFontSize
      : null,
    sidebarCollapsed: Boolean(record.sidebarCollapsed),
    settingsTab: typeof record.settingsTab === 'string' && record.settingsTab.trim() ? record.settingsTab.trim() : null,
    selectedFileNames: Array.isArray(record.selectedFileNames)
      ? record.selectedFileNames.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 12)
      : [],
    isTaskRunning: Boolean(record.isTaskRunning),
    recentSessions: Array.isArray(record.recentSessions) ? record.recentSessions.slice(0, 8) : [],
    recentArtifacts: Array.isArray(record.recentArtifacts) ? record.recentArtifacts.slice(0, 8) : [],
    recentWorkflows: Array.isArray(record.recentWorkflows) ? record.recentWorkflows.slice(0, 8) : [],
  }
}

export function registerSecretaryIpcHandlers({
  memory,
  service,
  getActiveContext,
  setActiveContext,
  toggleSecretaryPanel,
  setSecretaryPanelOpen,
  getSecretaryPanelOpen,
  setSecretaryFloatingExpanded,
  moveSecretaryFloatingBy,
  updateSecretaryShortcut,
  showMainWindow,
  sendWhenRendererReady,
  runWorkflowNow,
}: RegisterSecretaryIpcHandlersOptions) {
  let activeConversationId: string | null = null
  const pendingActions = new Map<string, number>()
  const pendingRendererActions = new Map<string, {
    resolve: (result: SecretaryActionResult) => void
    timer: NodeJS.Timeout
  }>()
  let rendererActionSeq = 0

  const prunePendingActions = () => {
    const now = Date.now()
    for (const [key, issuedAt] of pendingActions) {
      if (now - issuedAt > SECRETARY_PENDING_ACTION_TTL_MS) {
        pendingActions.delete(key)
      }
    }
  }

  const rememberPendingAction = (action: SecretaryAction) => {
    prunePendingActions()
    pendingActions.set(createActionKey(action), Date.now())
  }

  const consumePendingAction = (action: SecretaryAction) => {
    prunePendingActions()
    const key = createActionKey(action)
    if (!pendingActions.has(key)) return false
    pendingActions.delete(key)
    return true
  }

  const hasStoredPendingAction = (action: SecretaryAction) => {
    const conversationId = activeConversationId
    if (!conversationId) return false
    const key = createActionKey(action)
    const now = Date.now()
    return memory.loadHistory(conversationId, 80).some((entry) => (
      entry.action
      && createActionKey(entry.action) === key
      && now - entry.createdAt <= SECRETARY_PENDING_ACTION_TTL_MS
    ))
  }

  const createRendererActionRequestId = () => {
    rendererActionSeq += 1
    return `secretary-renderer-action-${Date.now()}-${rendererActionSeq}`
  }

  const runRendererAction = (action: SecretaryAction) => new Promise<SecretaryActionResult>((resolve) => {
    const window = showMainWindow()
    const requestId = createRendererActionRequestId()
    const timer = setTimeout(() => {
      pendingRendererActions.delete(requestId)
      resolve({ ok: false, error: '앱에서 작업 결과를 확인하지 못했어요. 다시 시도해 주세요.' })
    }, SECRETARY_RENDERER_ACTION_TIMEOUT_MS)

    pendingRendererActions.set(requestId, { resolve, timer })
    sendWhenRendererReady(window, 'secretary:renderer-action', { requestId, action })
  })

  const executeSecretaryAction = createSecretaryActionHandlers({
    service,
    getActiveConversationId: () => activeConversationId,
    showMainWindow,
    sendWhenRendererReady,
    runWorkflowNow,
    runRendererAction,
  })

  ipcMain.handle('secretary:toggle-panel', () => {
    toggleSecretaryPanel()
    return { ok: true }
  })

  ipcMain.handle('secretary:get-panel-open', () => getSecretaryPanelOpen())

  ipcMain.handle('secretary:set-panel-open', (_event, { open }: { open: boolean }) => {
    setSecretaryPanelOpen(Boolean(open))
    return { ok: true }
  })

  ipcMain.handle('secretary:set-floating-expanded', (_event, { expanded }: { expanded: boolean }) => {
    setSecretaryFloatingExpanded(Boolean(expanded))
    return { ok: true }
  })

  ipcMain.on('secretary:move-floating-by', (_event, payload: unknown) => {
    if (!isRecord(payload)) return
    const deltaX = typeof payload.deltaX === 'number' ? payload.deltaX : Number(payload.deltaX)
    const deltaY = typeof payload.deltaY === 'number' ? payload.deltaY : Number(payload.deltaY)
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return
    moveSecretaryFloatingBy(deltaX, deltaY)
  })

  ipcMain.handle('secretary:open-main-window', () => {
    showMainWindow()
    return { ok: true }
  })

  ipcMain.handle('secretary:active-context', () => getActiveContext())

  ipcMain.handle('secretary:update-active-context', (_event, context: SecretaryActiveContext) => {
    setActiveContext(normalizeActiveContext(context, getActiveContext()))
    return { ok: true }
  })

  ipcMain.handle('secretary:update-shortcut', (_event, { accelerator, enabled }: { accelerator: string; enabled: boolean }) => {
    updateSecretaryShortcut(String(accelerator ?? ''), Boolean(enabled))
    return { ok: true }
  })

  ipcMain.handle('secretary:process', async (event, payload: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? showMainWindow()
    sendWhenRendererReady(window, 'secretary:bot-state', 'working')

    try {
      const input = isRecord(payload) ? payload.input : payload
      const runtime = isRecord(payload) ? normalizeRuntimePayload(payload.runtime) : null

      const conversation = memory.getActiveConversation(getActiveContext())
      activeConversationId = conversation.id
      const result = await withProcessTimeout(
        service.process(String(input ?? ''), conversation.id, getActiveContext(), runtime),
        SECRETARY_PROCESS_IPC_TIMEOUT_MS,
      )
      if (result.action) rememberPendingAction(result.action)
      sendWhenRendererReady(window, 'secretary:bot-state', result.action ? 'done' : 'idle')
      return result
    } catch (error) {
      sendWhenRendererReady(window, 'secretary:bot-state', 'error')
      return {
        reply: error instanceof Error && error.message === 'Secretary IPC process timed out.'
          ? '비서 응답이 오래 걸려서 이번 요청은 중단했어요. 다시 짧게 요청해 주세요.'
          : error instanceof Error && error.message.trim()
          ? `비서 응답을 처리하지 못했어요. ${error.message}`
          : '비서 응답을 처리하지 못했어요.',
        intent: 'chat',
        action: null,
      } satisfies SecretaryProcessResult
    }
  })

  ipcMain.handle('secretary:execute-action', async (event, action: unknown): Promise<SecretaryActionResult> => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? showMainWindow()
    const normalizedAction = normalizeSecretaryAction(action)
    if (!normalizedAction) {
      sendWhenRendererReady(window, 'secretary:bot-state', 'error')
      return { ok: false, error: '지원하지 않는 액션입니다.' }
    }

    if (!consumePendingAction(normalizedAction) && !hasStoredPendingAction(normalizedAction)) {
      sendWhenRendererReady(window, 'secretary:bot-state', 'error')
      return { ok: false, error: '확인 가능한 액션이 아닙니다. 씨토에게 다시 제안받아 주세요.' }
    }

    sendWhenRendererReady(window, 'secretary:bot-state', 'working')
    try {
      const result = await executeSecretaryAction(normalizedAction)
      sendWhenRendererReady(window, 'secretary:bot-state', result.ok ? 'done' : 'error')
      sendWhenRendererReady(window, 'secretary:action-result', result)
      return result
    } catch (error) {
      sendWhenRendererReady(window, 'secretary:bot-state', 'error')
      const result = {
        ok: false,
        error: error instanceof Error && error.message.trim()
          ? `실행 결과를 처리하지 못했어요. ${error.message}`
          : '실행 결과를 처리하지 못했어요.',
      }
      sendWhenRendererReady(window, 'secretary:action-result', result)
      return result
    }
  })

  ipcMain.handle('secretary:renderer-action-result', (_event, payload: unknown) => {
    if (!isRecord(payload)) return { ok: false, error: '렌더러 작업 결과가 올바르지 않아요.' }
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
    const pending = pendingRendererActions.get(requestId)
    if (!pending) return { ok: false, error: '대기 중인 렌더러 작업을 찾지 못했어요.' }

    pendingRendererActions.delete(requestId)
    clearTimeout(pending.timer)
    pending.resolve(normalizeActionResult(payload.result))
    return { ok: true }
  })

  ipcMain.handle('secretary:list-conversations', () => memory.listConversations())

  ipcMain.handle('secretary:get-active-conversation', () => {
    const conversation = memory.getActiveConversation(getActiveContext())
    activeConversationId = conversation.id
    return conversation
  })

  ipcMain.handle('secretary:create-conversation', () => {
    const conversation = memory.createConversation(getActiveContext())
    activeConversationId = conversation.id
    return conversation
  })

  ipcMain.handle('secretary:switch-conversation', (_event, id: string) => {
    const conversation = memory.switchConversation(String(id ?? ''))
    if (conversation) {
      activeConversationId = conversation.id
      return { ok: true, conversation }
    }
    return { ok: false, error: '대화를 찾지 못했어요.' }
  })

  ipcMain.handle('secretary:rename-conversation', (_event, { id, title }: { id: string; title: string }) => {
    const conversation = memory.renameConversation(String(id ?? ''), String(title ?? ''))
    return conversation
      ? { ok: true, conversation }
      : { ok: false, error: '대화 이름을 바꾸지 못했어요.' }
  })

  ipcMain.handle('secretary:archive-conversation', (_event, id: string) => {
    const conversation = memory.archiveConversation(String(id ?? ''), getActiveContext())
    activeConversationId = conversation.id
    return { ok: true, conversation }
  })

  ipcMain.handle('secretary:get-history', (_event, { conversationId, limit }: { conversationId?: string; limit?: number } = {}) => {
    const conversation = conversationId
      ? memory.getConversation(String(conversationId))
      : memory.getActiveConversation(getActiveContext())
    if (!conversation) return []
    return memory.loadHistory(conversation.id, limit)
  })

  ipcMain.handle('secretary:get-profile', () => memory.getProfile())

  ipcMain.handle('secretary:update-profile', (_event, { key, value }: { key: string; value: string }) => {
    memory.updateProfile(String(key ?? ''), String(value ?? ''))
    return { ok: true }
  })
}
