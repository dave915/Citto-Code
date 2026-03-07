import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { nanoid } from './nanoid'
import type { ThemeId } from '../lib/theme'
import { CURRENT_THEME_ID } from '../lib/theme'

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
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls: ToolCallBlock[]
  attachedFiles?: AttachedFile[]
  createdAt: number
}

// 편집 권한 모드
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'
export type SidebarMode = 'session' | 'project'
export type NotificationMode = 'all' | 'background' | 'off'
export type ShortcutAction =
  | 'toggleSidebar'
  | 'toggleFiles'
  | 'toggleSessionInfo'
  | 'newSession'
  | 'openSettings'
  | 'cyclePermissionMode'
  | 'toggleBypassPermissions'
export type ShortcutPlatform = 'mac' | 'windows'
export type ShortcutBinding = {
  mac: string
  windows: string
}
export type ShortcutConfig = Record<ShortcutAction, ShortcutBinding>

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
  model: string | null  // null = Claude Code 기본값 사용
}

type SessionsStore = {
  sessions: Session[]
  activeSessionId: string | null
  envVars: Record<string, string>
  sidebarMode: SidebarMode
  claudeBinaryPath: string
  preferredOpenWithAppId: string
  themeId: ThemeId
  notificationMode: NotificationMode
  shortcutConfig: ShortcutConfig
  addSession: (cwd: string, name: string) => string
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  setSidebarMode: (mode: SidebarMode) => void
  setClaudeBinaryPath: (path: string) => void
  setPreferredOpenWithAppId: (appId: string) => void
  setThemeId: (themeId: ThemeId) => void
  setNotificationMode: (mode: NotificationMode) => void
  setShortcut: (action: ShortcutAction, platform: ShortcutPlatform, value: string) => void
  updateSession: (id: string, updater: (s: Session) => Partial<Session>) => void
  addUserMessage: (tabId: string, text: string, files?: AttachedFile[]) => string
  startAssistantMessage: (sessionId: string) => string
  appendTextChunk: (sessionId: string, assistantMsgId: string, chunk: string) => void
  addToolCall: (sessionId: string, assistantMsgId: string, toolCall: Omit<ToolCallBlock, 'id'>) => void
  resolveToolCall: (sessionId: string, toolUseId: string, result: unknown, isError: boolean) => void
  setStreaming: (sessionId: string, value: boolean) => void
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

const DEFAULT_CWD = '~'
const GENERIC_CLAUDE_ERROR = 'Claude Code 요청이 실패했습니다.'

export const DEFAULT_SHORTCUT_CONFIG: ShortcutConfig = {
  toggleSidebar: { mac: 'Cmd+B', windows: 'Ctrl+B' },
  toggleFiles: { mac: 'Cmd+E', windows: 'Ctrl+E' },
  toggleSessionInfo: { mac: 'Cmd+I', windows: 'Ctrl+I' },
  newSession: { mac: 'Cmd+N', windows: 'Ctrl+N' },
  openSettings: { mac: 'Cmd+,', windows: 'Ctrl+,' },
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

export const useSessionsStore = create<SessionsStore>()(
  persist(
    (set) => {
      const firstSession = makeDefaultSession(DEFAULT_CWD, '~')

      return {
        sessions: [firstSession],
        activeSessionId: firstSession.id,
        envVars: {},
        sidebarMode: 'session',
        claudeBinaryPath: '',
        preferredOpenWithAppId: '',
        themeId: CURRENT_THEME_ID,
        notificationMode: 'all',
        shortcutConfig: DEFAULT_SHORTCUT_CONFIG,

    setEnvVar: (key, value) => set((s) => ({ envVars: { ...s.envVars, [key]: value } })),
    removeEnvVar: (key) => set((s) => {
      const { [key]: _, ...rest } = s.envVars
      return { envVars: rest }
    }),

    addSession: (cwd, name) => {
      const session = makeDefaultSession(cwd, name)
      set((s) => ({ sessions: [...s.sessions, session], activeSessionId: session.id }))
      return session.id
    },

    setSidebarMode: (mode) => set({ sidebarMode: mode }),
    setClaudeBinaryPath: (path) => set({ claudeBinaryPath: path }),
    setPreferredOpenWithAppId: (appId) => set({ preferredOpenWithAppId: appId }),
    setThemeId: (themeId) => set({ themeId }),
    setNotificationMode: (notificationMode) => set({ notificationMode }),
    setShortcut: (action, platform, value) => set((s) => ({
      shortcutConfig: {
        ...s.shortcutConfig,
        [action]: {
          ...s.shortcutConfig[action],
          [platform]: value,
        },
      },
    })),

    removeSession: (id) => {
      set((s) => {
        const remaining = s.sessions.filter((sess) => sess.id !== id)
        if (remaining.length === 0) {
          return { sessions: [], activeSessionId: null }
        }
        const newActive = s.activeSessionId === id
          ? remaining[remaining.length - 1].id
          : s.activeSessionId
        return { sessions: remaining, activeSessionId: newActive }
      })
    },

    setActiveSession: (id) => set({ activeSessionId: id }),

    updateSession: (id, updater) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === id ? { ...sess, ...updater(sess) } : sess
        )
      }))
    },

    addUserMessage: (tabId, text, files) => {
      const msgId = nanoid()
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId
            ? {
                ...sess,
                messages: [
                  ...sess.messages,
                  {
                    id: msgId,
                    role: 'user',
                    text,
                    toolCalls: [],
                    attachedFiles: files,
                    createdAt: Date.now()
                  }
                ],
                pendingPermission: null,
                pendingQuestion: null,
              }
            : sess
        )
      }))
      return msgId
    },

    startAssistantMessage: (tabId) => {
      const msgId = nanoid()
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId
            ? {
                ...sess,
                currentAssistantMsgId: msgId,
                isStreaming: true,
                pendingPermission: null,
                pendingQuestion: null,
                messages: [
                  ...sess.messages,
                  { id: msgId, role: 'assistant', text: '', toolCalls: [], createdAt: Date.now() }
                ]
              }
            : sess
        )
      }))
      return msgId
    },

    appendTextChunk: (tabId, assistantMsgId, chunk) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId
            ? {
                ...sess,
                messages: sess.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, text: m.text + chunk } : m
                )
              }
            : sess
        )
      }))
    },

    addToolCall: (tabId, assistantMsgId, toolCall) => {
      const tc: ToolCallBlock = { id: nanoid(), ...toolCall }
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId
            ? {
                ...sess,
                messages: sess.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, toolCalls: [...m.toolCalls, tc] }
                    : m
                )
              }
            : sess
        )
      }))
    },

    resolveToolCall: (tabId, toolUseId, result, isError) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId
            ? {
                ...sess,
                messages: sess.messages.map((m) => ({
                  ...m,
                  toolCalls: m.toolCalls.map((tc) =>
                    tc.toolUseId === toolUseId
                      ? { ...tc, result, isError, status: isError ? 'error' : 'done' }
                      : tc
                  )
                }))
              }
            : sess
        )
      }))
    },

    setStreaming: (tabId, value) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId
            ? { ...sess, isStreaming: value, currentAssistantMsgId: value ? sess.currentAssistantMsgId : null }
            : sess
        )
      }))
    },

    setClaudeSessionId: (tabId, claudeSessionId) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId ? { ...sess, sessionId: claudeSessionId } : sess
        )
      }))
    },

    setError: (tabId, error) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId
            ? (() => {
                const shouldKeepExistingError =
                  error === GENERIC_CLAUDE_ERROR &&
                  Boolean(sess.error) &&
                  sess.error !== GENERIC_CLAUDE_ERROR

                const nextMessages = sess.currentAssistantMsgId
                  ? sess.messages.filter((message) => {
                      if (message.id !== sess.currentAssistantMsgId) return true
                      return message.text.trim().length > 0 || message.toolCalls.length > 0
                    })
                  : sess.messages

                return {
                  ...sess,
                  messages: nextMessages,
                  error: shouldKeepExistingError ? sess.error : error,
                  pendingPermission: null,
                  pendingQuestion: null,
                  isStreaming: false,
                  currentAssistantMsgId: null,
                }
              })()
            : sess
        )
      }))
    },

    setPendingPermission: (tabId, request) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId ? { ...sess, pendingPermission: request } : sess
        )
      }))
    },

    setPendingQuestion: (tabId, request) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId ? { ...sess, pendingQuestion: request } : sess
        )
      }))
    },

    setLastCost: (tabId, cost) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId ? { ...sess, lastCost: cost } : sess
        )
      }))
    },

    setPermissionMode: (tabId, mode) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId ? { ...sess, permissionMode: mode } : sess
        )
      }))
    },

    setPlanMode: (tabId, value) => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === tabId ? { ...sess, planMode: value } : sess
        )
      }))
    },

        setModel: (tabId, model) => {
          set((s) => ({
            sessions: s.sessions.map((sess) =>
              sess.id === tabId ? { ...sess, model } : sess
            )
          }))
        },
      }
    },
    {
      name: 'claude-ui-sessions',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as Partial<SessionsStore> & {
          shortcutConfig?: Partial<ShortcutConfig>
        }

        const bypassBinding = state.shortcutConfig?.toggleBypassPermissions
        const shouldApplyBypassDefault =
          !bypassBinding ||
          ((!bypassBinding.mac || !bypassBinding.mac.trim()) &&
            (!bypassBinding.windows || !bypassBinding.windows.trim()))

        if (!shouldApplyBypassDefault) {
          return state
        }

        return {
          ...state,
          shortcutConfig: {
            ...state.shortcutConfig,
            toggleBypassPermissions: DEFAULT_SHORTCUT_CONFIG.toggleBypassPermissions,
          },
        }
      },
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        envVars: state.envVars,
        sidebarMode: state.sidebarMode,
        claudeBinaryPath: state.claudeBinaryPath,
        preferredOpenWithAppId: state.preferredOpenWithAppId,
        themeId: state.themeId,
        notificationMode: state.notificationMode,
        shortcutConfig: state.shortcutConfig,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SessionsStore> & { notificationsEnabled?: boolean }
        const restoredSessions = (persistedState.sessions ?? []).map((session) => ({
          ...session,
          isStreaming: false,
          currentAssistantMsgId: null,
          pendingPermission: null,
          pendingQuestion: null,
          error: session.error ?? null,
        }))

        const sessions = restoredSessions.length > 0 ? restoredSessions : current.sessions
        const activeSessionId = sessions.some((session) => session.id === persistedState.activeSessionId)
          ? persistedState.activeSessionId ?? sessions[0]?.id ?? null
          : sessions[0]?.id ?? null

        return {
          ...current,
          ...persistedState,
          claudeBinaryPath: persistedState.claudeBinaryPath ?? '',
          preferredOpenWithAppId: persistedState.preferredOpenWithAppId ?? '',
          themeId: persistedState.themeId ?? CURRENT_THEME_ID,
          notificationMode:
            persistedState.notificationMode
            ?? (persistedState.notificationsEnabled === false ? 'off' : 'all'),
          shortcutConfig: {
            ...DEFAULT_SHORTCUT_CONFIG,
            ...(persistedState.shortcutConfig ?? {}),
          },
          sessions,
          activeSessionId,
        }
      },
    }
  )
)

export function findTabByClaudeSessionId(
  sessions: Session[],
  claudeSessionId: string
): Session | undefined {
  return sessions.find((s) => s.sessionId === claudeSessionId)
}
