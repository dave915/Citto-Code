import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { CURRENT_THEME_ID, type ThemeId } from '../lib/theme'
import { nanoid } from './nanoid'

export type ToolCallStatus = 'running' | 'done' | 'error'

export type ToolCallBlock = {
  id: string
  toolUseId: string
  toolName: string
  toolInput: unknown
  fileSnapshotBefore?: string | null
  result?: unknown
  isError?: boolean
  status: ToolCallStatus
}

export type PendingPermissionRequest = {
  toolName: string
  toolUseId: string
  toolInput: unknown
}

export type PendingQuestionOption = {
  label: string
  description?: string
}

export type PendingQuestionRequest = {
  toolUseId: string
  question: string
  header?: string
  multiSelect?: boolean
  options: PendingQuestionOption[]
}

export type AttachedFile = {
  id: string
  name: string
  path: string
  content: string
  size: number
  fileType?: 'text' | 'image'
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  thinking?: string
  toolCalls: ToolCallBlock[]
  attachedFiles?: AttachedFile[]
  createdAt: number
}

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'
export type SidebarMode = 'session' | 'project'
export type NotificationMode = 'all' | 'background' | 'off'

export type ShortcutAction =
  | 'toggleSidebar'
  | 'toggleFiles'
  | 'toggleSessionInfo'
  | 'newSession'
  | 'openSettings'
  | 'openCommandPalette'
  | 'toggleQuickPanel'
  | 'cyclePermissionMode'
  | 'toggleBypassPermissions'

export type ShortcutPlatform = 'mac' | 'windows'

export type ShortcutBinding = {
  mac: string
  windows: string
}

export type ShortcutConfig = Record<ShortcutAction, ShortcutBinding>

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export type Session = {
  id: string
  sessionId: string | null
  name: string
  favorite: boolean
  cwd: string
  messages: Message[]
  isStreaming: boolean
  currentAssistantMsgId: string | null
  error: string | null
  pendingPermission: PendingPermissionRequest | null
  pendingQuestion: PendingQuestionRequest | null
  lastCost?: number
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
}

export type ImportedToolCall = Omit<ToolCallBlock, 'id'>

export type ImportedMessage = {
  role: 'user' | 'assistant'
  text: string
  thinking?: string
  toolCalls: ImportedToolCall[]
  attachedFiles?: AttachedFile[]
  createdAt: number
}

export type ImportedSessionData = {
  sessionId: string | null
  name: string
  cwd: string
  messages: ImportedMessage[]
  lastCost?: number
  permissionMode?: PermissionMode
  planMode?: boolean
  model?: string | null
  favorite?: boolean
}

type SessionsStore = {
  sessions: Session[]
  activeSessionId: string | null
  defaultProjectPath: string
  envVars: Record<string, string>
  sidebarMode: SidebarMode
  claudeBinaryPath: string
  preferredOpenWithAppId: string
  themeId: ThemeId
  notificationMode: NotificationMode
  uiFontSize: number
  uiZoomPercent: number
  quickPanelEnabled: boolean
  shortcutConfig: ShortcutConfig
  addSession: (cwd: string, name: string) => string
  importSession: (data: ImportedSessionData) => string
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  setDefaultProjectPath: (path: string) => void
  setSidebarMode: (mode: SidebarMode) => void
  setClaudeBinaryPath: (path: string) => void
  setPreferredOpenWithAppId: (appId: string) => void
  setThemeId: (themeId: ThemeId) => void
  setNotificationMode: (mode: NotificationMode) => void
  setUiFontSize: (value: number) => void
  setUiZoomPercent: (value: number) => void
  setQuickPanelEnabled: (value: boolean) => void
  setShortcut: (action: ShortcutAction, platform: ShortcutPlatform, value: string) => void
  updateSession: (id: string, updater: (s: Session) => Partial<Session>) => void
  addUserMessage: (tabId: string, text: string, files?: AttachedFile[]) => string
  startAssistantMessage: (sessionId: string) => string
  appendThinkingChunk: (sessionId: string, assistantMsgId: string, chunk: string) => void
  appendTextChunk: (sessionId: string, assistantMsgId: string, chunk: string) => void
  addToolCall: (sessionId: string, assistantMsgId: string, toolCall: Omit<ToolCallBlock, 'id'>) => void
  resolveToolCall: (sessionId: string, toolUseId: string, result: unknown, isError: boolean) => void
  setStreaming: (sessionId: string, value: boolean) => void
  commitStreamEnd: (sessionId: string) => void
  setClaudeSessionId: (tabId: string, claudeSessionId: string) => void
  setError: (tabId: string, error: string | null) => void
  setPendingPermission: (tabId: string, request: PendingPermissionRequest | null) => void
  setPendingQuestion: (tabId: string, request: PendingQuestionRequest | null) => void
  setLastCost: (tabId: string, cost: number) => void
  setPermissionMode: (tabId: string, mode: PermissionMode) => void
  setPlanMode: (tabId: string, value: boolean) => void
  setModel: (tabId: string, model: string | null) => void
  setEnvVar: (key: string, value: string) => void
  removeEnvVar: (key: string) => void
}

export const DEFAULT_PROJECT_PATH = '~/Desktop'
export const DEFAULT_UI_FONT_SIZE = 16
export const MIN_UI_FONT_SIZE = 13
export const MAX_UI_FONT_SIZE = 20
export const DEFAULT_UI_ZOOM_PERCENT = 100
export const MIN_UI_ZOOM_PERCENT = 50
export const MAX_UI_ZOOM_PERCENT = 200
const GENERIC_CLAUDE_ERROR = 'Claude Code 요청이 실패했습니다.'

export function clampUiFontSize(value: number): number {
  return clampNumber(Math.round(value), MIN_UI_FONT_SIZE, MAX_UI_FONT_SIZE)
}

export function clampUiZoomPercent(value: number): number {
  const rounded = Math.round(value / 10) * 10
  return clampNumber(rounded, MIN_UI_ZOOM_PERCENT, MAX_UI_ZOOM_PERCENT)
}

export function getProjectNameFromPath(path: string): string {
  if (!path || path === '~') return '~'
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

function isLegacyHomePlaceholderSession(session: Session): boolean {
  return (
    session.cwd === '~' &&
    (session.name === '~' || session.name === '새 세션') &&
    session.sessionId === null &&
    session.messages.length === 0 &&
    !session.favorite &&
    !session.isStreaming &&
    session.currentAssistantMsgId === null &&
    session.error === null &&
    session.pendingPermission === null &&
    session.pendingQuestion === null &&
    session.permissionMode === 'default' &&
    !session.planMode &&
    session.model === null
  )
}

export const DEFAULT_SHORTCUT_CONFIG: ShortcutConfig = {
  toggleSidebar: { mac: 'Cmd+B', windows: 'Ctrl+B' },
  toggleFiles: { mac: 'Cmd+E', windows: 'Ctrl+E' },
  toggleSessionInfo: { mac: 'Cmd+I', windows: 'Ctrl+I' },
  newSession: { mac: 'Cmd+N', windows: 'Ctrl+N' },
  openSettings: { mac: 'Cmd+,', windows: 'Ctrl+,' },
  openCommandPalette: { mac: 'Cmd+K', windows: 'Ctrl+K' },
  toggleQuickPanel: { mac: 'Alt+Space', windows: 'Alt+Space' },
  cyclePermissionMode: { mac: 'Shift+Tab', windows: 'Shift+Tab' },
  toggleBypassPermissions: { mac: 'Cmd+Shift+Enter', windows: 'Ctrl+Shift+Enter' },
}

function makeDefaultSession(cwd: string, name: string): Session {
  return {
    id: nanoid(),
    sessionId: null,
    name,
    favorite: false,
    cwd,
    messages: [],
    isStreaming: false,
    currentAssistantMsgId: null,
    error: null,
    pendingPermission: null,
    pendingQuestion: null,
    permissionMode: 'default',
    planMode: false,
    model: null,
  }
}

function normalizeImportedMessage(message: ImportedMessage): Message {
  return {
    id: nanoid(),
    role: message.role,
    text: message.text,
    toolCalls: message.toolCalls.map((toolCall) => ({
      ...toolCall,
      id: nanoid(),
    })),
    thinking: message.thinking ?? '',
    attachedFiles: message.attachedFiles,
    createdAt: message.createdAt,
  }
}

function pruneEmptyCurrentAssistantMessage(session: Session): Message[] {
  if (!session.currentAssistantMsgId) return session.messages

  return session.messages.filter((message) => {
    if (message.id !== session.currentAssistantMsgId) return true
    return message.text.trim().length > 0 || (message.thinking?.trim().length ?? 0) > 0 || message.toolCalls.length > 0
  })
}

export const useSessionsStore = create<SessionsStore>()(
  persist(
    (set) => {
      const firstSession = makeDefaultSession(
        DEFAULT_PROJECT_PATH,
        getProjectNameFromPath(DEFAULT_PROJECT_PATH),
      )

      return {
        sessions: [firstSession],
        activeSessionId: firstSession.id,
        defaultProjectPath: DEFAULT_PROJECT_PATH,
        envVars: {},
        sidebarMode: 'session',
        claudeBinaryPath: '',
        preferredOpenWithAppId: '',
        themeId: CURRENT_THEME_ID,
        notificationMode: 'all',
        uiFontSize: DEFAULT_UI_FONT_SIZE,
        uiZoomPercent: DEFAULT_UI_ZOOM_PERCENT,
        quickPanelEnabled: true,
        shortcutConfig: DEFAULT_SHORTCUT_CONFIG,

        setEnvVar: (key, value) => set((state) => ({
          envVars: { ...state.envVars, [key]: value },
        })),

        removeEnvVar: (key) => set((state) => {
          const { [key]: _ignored, ...rest } = state.envVars
          return { envVars: rest }
        }),

        addSession: (cwd, name) => {
          const session = makeDefaultSession(cwd, name)
          set((state) => ({
            sessions: [...state.sessions, session],
            activeSessionId: session.id,
          }))
          return session.id
        },

        importSession: (data) => {
          const session: Session = {
            id: nanoid(),
            sessionId: data.sessionId,
            name: data.name,
            favorite: Boolean(data.favorite),
            cwd: data.cwd,
            messages: data.messages.map(normalizeImportedMessage),
            isStreaming: false,
            currentAssistantMsgId: null,
            error: null,
            pendingPermission: null,
            pendingQuestion: null,
            lastCost: data.lastCost,
            permissionMode: data.permissionMode ?? 'default',
            planMode: data.planMode ?? false,
            model: data.model ?? null,
          }

          set((state) => ({
            sessions: [...state.sessions, session],
            activeSessionId: session.id,
          }))

          return session.id
        },

        setDefaultProjectPath: (defaultProjectPath) => set({ defaultProjectPath }),
        setSidebarMode: (sidebarMode) => set({ sidebarMode }),
        setClaudeBinaryPath: (claudeBinaryPath) => set({ claudeBinaryPath }),
        setPreferredOpenWithAppId: (preferredOpenWithAppId) => set({ preferredOpenWithAppId }),
        setThemeId: (themeId) => set({ themeId }),
        setNotificationMode: (notificationMode) => set({ notificationMode }),
        setUiFontSize: (uiFontSize) => set({ uiFontSize: clampUiFontSize(uiFontSize) }),
        setUiZoomPercent: (uiZoomPercent) => set({ uiZoomPercent: clampUiZoomPercent(uiZoomPercent) }),
        setQuickPanelEnabled: (quickPanelEnabled) => set({ quickPanelEnabled }),

        setShortcut: (action, platform, value) => set((state) => ({
          shortcutConfig: {
            ...state.shortcutConfig,
            [action]: {
              ...state.shortcutConfig[action],
              [platform]: value,
            },
          },
        })),

        removeSession: (id) => {
          set((state) => {
            const remaining = state.sessions.filter((session) => session.id !== id)
            if (remaining.length === 0) {
              return { sessions: [], activeSessionId: null }
            }

            const activeSessionId = state.activeSessionId === id
              ? remaining[remaining.length - 1].id
              : state.activeSessionId

            return {
              sessions: remaining,
              activeSessionId,
            }
          })
        },

        setActiveSession: (activeSessionId) => set({ activeSessionId }),

        updateSession: (id, updater) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === id
                ? { ...session, ...updater(session) }
                : session,
            ),
          }))
        },

        addUserMessage: (tabId, text, files) => {
          const msgId = nanoid()
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? {
                    ...session,
                    messages: [
                      ...session.messages,
                      {
                        id: msgId,
                        role: 'user',
                        text,
                        thinking: '',
                        toolCalls: [],
                        attachedFiles: files,
                        createdAt: Date.now(),
                      },
                    ],
                    pendingPermission: null,
                    pendingQuestion: null,
                  }
                : session,
            ),
          }))
          return msgId
        },

        startAssistantMessage: (tabId) => {
          const msgId = nanoid()
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? {
                    ...session,
                    currentAssistantMsgId: msgId,
                    isStreaming: true,
                    pendingPermission: null,
                    pendingQuestion: null,
                    messages: [
                      ...session.messages,
                      {
                        id: msgId,
                        role: 'assistant',
                        text: '',
                        thinking: '',
                        toolCalls: [],
                        createdAt: Date.now(),
                      },
                    ],
                  }
                : session,
            ),
          }))
          return msgId
        },

        appendThinkingChunk: (tabId, assistantMsgId, chunk) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? {
                    ...session,
                    messages: session.messages.map((message) =>
                      message.id === assistantMsgId
                        ? { ...message, thinking: (message.thinking ?? '') + chunk }
                        : message,
                    ),
                  }
                : session,
            ),
          }))
        },

        appendTextChunk: (tabId, assistantMsgId, chunk) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? {
                    ...session,
                    messages: session.messages.map((message) =>
                      message.id === assistantMsgId
                        ? { ...message, text: message.text + chunk }
                        : message,
                    ),
                  }
                : session,
            ),
          }))
        },

        addToolCall: (tabId, assistantMsgId, toolCall) => {
          const nextToolCall: ToolCallBlock = { id: nanoid(), ...toolCall }
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? {
                    ...session,
                    messages: session.messages.map((message) =>
                      message.id === assistantMsgId
                        ? { ...message, toolCalls: [...message.toolCalls, nextToolCall] }
                        : message,
                    ),
                  }
                : session,
            ),
          }))
        },

        resolveToolCall: (tabId, toolUseId, result, isError) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? {
                    ...session,
                    messages: session.messages.map((message) => ({
                      ...message,
                      toolCalls: message.toolCalls.map((toolCall) =>
                        toolCall.toolUseId === toolUseId
                          ? {
                              ...toolCall,
                              result,
                              isError,
                              status: isError ? 'error' : 'done',
                            }
                          : toolCall,
                      ),
                    })),
                  }
                : session,
            ),
          }))
        },

        setStreaming: (tabId, value) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? { ...session, isStreaming: value }
                : session,
            ),
          }))
        },

        commitStreamEnd: (tabId) => {
          set((state) => ({
            sessions: state.sessions.map((session) => {
              if (session.id !== tabId) return session
              const nextSession = {
                ...session,
                isStreaming: false,
              }
              return {
                ...nextSession,
                messages: pruneEmptyCurrentAssistantMessage(nextSession),
                currentAssistantMsgId: null,
              }
            }),
          }))
        },

        setClaudeSessionId: (tabId, claudeSessionId) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? { ...session, sessionId: claudeSessionId }
                : session,
            ),
          }))
        },

        setError: (tabId, error) => {
          set((state) => ({
            sessions: state.sessions.map((session) => {
              if (session.id !== tabId) return session

              const shouldKeepExistingError =
                error === GENERIC_CLAUDE_ERROR &&
                Boolean(session.error) &&
                session.error !== GENERIC_CLAUDE_ERROR

              const nextSession = {
                ...session,
                error: shouldKeepExistingError ? session.error : error,
                pendingPermission: null,
                pendingQuestion: null,
                isStreaming: false,
              }

              return {
                ...nextSession,
                messages: pruneEmptyCurrentAssistantMessage(nextSession),
                currentAssistantMsgId: null,
              }
            }),
          }))
        },

        setPendingPermission: (tabId, request) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? { ...session, pendingPermission: request }
                : session,
            ),
          }))
        },

        setPendingQuestion: (tabId, request) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? { ...session, pendingQuestion: request }
                : session,
            ),
          }))
        },

        setLastCost: (tabId, cost) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? { ...session, lastCost: cost }
                : session,
            ),
          }))
        },

        setPermissionMode: (tabId, mode) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? { ...session, permissionMode: mode }
                : session,
            ),
          }))
        },

        setPlanMode: (tabId, value) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? { ...session, planMode: value }
                : session,
            ),
          }))
        },

        setModel: (tabId, model) => {
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === tabId
                ? { ...session, model }
                : session,
            ),
          }))
        },
      }
    },
    {
      name: 'claude-ui-sessions',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 5,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<SessionsStore> & {
          shortcutConfig?: Partial<ShortcutConfig>
        }
        const defaultProjectPath = state.defaultProjectPath?.trim() || DEFAULT_PROJECT_PATH
        const activeSessionId =
          typeof state.activeSessionId === 'string' || state.activeSessionId === null
            ? state.activeSessionId
            : null

        return {
          ...state,
          defaultProjectPath,
          sessions: undefined,
          activeSessionId,
          uiFontSize: clampUiFontSize(state.uiFontSize ?? DEFAULT_UI_FONT_SIZE),
          uiZoomPercent: clampUiZoomPercent(state.uiZoomPercent ?? DEFAULT_UI_ZOOM_PERCENT),
          quickPanelEnabled: state.quickPanelEnabled ?? true,
          shortcutConfig: {
            ...DEFAULT_SHORTCUT_CONFIG,
            ...(state.shortcutConfig ?? {}),
          },
        }
      },
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
        defaultProjectPath: state.defaultProjectPath,
        envVars: state.envVars,
        sidebarMode: state.sidebarMode,
        claudeBinaryPath: state.claudeBinaryPath,
        preferredOpenWithAppId: state.preferredOpenWithAppId,
        themeId: state.themeId,
        notificationMode: state.notificationMode,
        uiFontSize: state.uiFontSize,
        uiZoomPercent: state.uiZoomPercent,
        quickPanelEnabled: state.quickPanelEnabled,
        shortcutConfig: state.shortcutConfig,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SessionsStore> & {
          notificationsEnabled?: boolean
        }
        const activeSessionId =
          typeof persistedState.activeSessionId === 'string' || persistedState.activeSessionId === null
            ? persistedState.activeSessionId
            : current.activeSessionId

        return {
          ...current,
          ...persistedState,
          defaultProjectPath: persistedState.defaultProjectPath ?? DEFAULT_PROJECT_PATH,
          claudeBinaryPath: persistedState.claudeBinaryPath ?? '',
          preferredOpenWithAppId: persistedState.preferredOpenWithAppId ?? '',
          themeId: persistedState.themeId ?? CURRENT_THEME_ID,
          notificationMode:
            persistedState.notificationMode
            ?? (persistedState.notificationsEnabled === false ? 'off' : 'all'),
          uiFontSize: clampUiFontSize(persistedState.uiFontSize ?? DEFAULT_UI_FONT_SIZE),
          uiZoomPercent: clampUiZoomPercent(persistedState.uiZoomPercent ?? DEFAULT_UI_ZOOM_PERCENT),
          quickPanelEnabled: persistedState.quickPanelEnabled ?? true,
          shortcutConfig: {
            ...DEFAULT_SHORTCUT_CONFIG,
            ...(persistedState.shortcutConfig ?? {}),
          },
          activeSessionId,
          sessions: current.sessions,
        }
      },
    },
  ),
)

export function findTabByClaudeSessionId(
  sessions: Session[],
  claudeSessionId: string,
): Session | undefined {
  return sessions.find((session) => session.sessionId === claudeSessionId)
}

export type SessionMessageSearchResult = {
  sessionId: string
  sessionName: string
  cwd: string
  messageId: string
  role: Message['role']
  preview: string
  createdAt: number
}

const MESSAGE_SEARCH_RESULTS_PER_SESSION = 3
const MESSAGE_SEARCH_PREVIEW_RADIUS = 56
const MESSAGE_SEARCH_PREVIEW_MAX_LENGTH = 180

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildSearchPreview(text: string, query: string): string {
  const normalizedText = normalizeSearchText(text)
  if (!normalizedText) return ''

  const normalizedQuery = normalizeSearchText(query).toLowerCase()
  const lowerText = normalizedText.toLowerCase()
  const matchIndex = lowerText.indexOf(normalizedQuery)
  if (matchIndex < 0) {
    return normalizedText.length > MESSAGE_SEARCH_PREVIEW_MAX_LENGTH
      ? `${normalizedText.slice(0, MESSAGE_SEARCH_PREVIEW_MAX_LENGTH - 1)}…`
      : normalizedText
  }

  const start = Math.max(0, matchIndex - MESSAGE_SEARCH_PREVIEW_RADIUS)
  const end = Math.min(
    normalizedText.length,
    matchIndex + normalizedQuery.length + MESSAGE_SEARCH_PREVIEW_RADIUS
  )
  const preview = normalizedText.slice(start, end)

  return `${start > 0 ? '…' : ''}${preview}${end < normalizedText.length ? '…' : ''}`
}

export function searchSessions(sessions: Session[], query: string): Session[] {
  const trimmed = normalizeSearchText(query).toLowerCase()
  if (!trimmed) return sessions

  return sessions.filter((session) => {
    const haystack = [
      session.name,
      session.cwd,
      session.sessionId ?? '',
      ...session.messages.flatMap((message) => [message.text, message.thinking ?? '']),
    ]
      .join('\n')
      .replace(/\s+/g, ' ')
      .toLowerCase()

    return haystack.includes(trimmed)
  })
}

export function searchSessionMessages(
  sessions: Session[],
  query: string,
  limit = 12,
): SessionMessageSearchResult[] {
  const trimmed = normalizeSearchText(query).toLowerCase()
  if (!trimmed) return []

  const matches: SessionMessageSearchResult[] = []

  for (const session of sessions) {
    let collectedForSession = 0

    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
      const message = session.messages[index]
      const normalizedText = normalizeSearchText(message.text)
      if (!normalizedText) continue
      if (!normalizedText.toLowerCase().includes(trimmed)) continue

      matches.push({
        sessionId: session.id,
        sessionName: session.name,
        cwd: session.cwd,
        messageId: message.id,
        role: message.role,
        preview: buildSearchPreview(message.text, query),
        createdAt: message.createdAt,
      })
      collectedForSession += 1

      if (collectedForSession >= MESSAGE_SEARCH_RESULTS_PER_SESSION) {
        break
      }
    }
  }

  return matches
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}
