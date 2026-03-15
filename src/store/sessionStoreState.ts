import type { StateCreator } from 'zustand'
import { CURRENT_THEME_ID } from '../lib/theme'
import { DEFAULT_APP_LANGUAGE } from '../lib/i18n'
import {
  DEFAULT_PROJECT_PATH,
  DEFAULT_SHORTCUT_CONFIG,
  DEFAULT_UI_FONT_SIZE,
  DEFAULT_UI_ZOOM_PERCENT,
  clampUiFontSize,
  clampUiZoomPercent,
  getProjectNameFromPath,
  makeDefaultSession,
  normalizeImportedMessage,
  pruneEmptyCurrentAssistantMessage,
} from '../lib/sessionUtils'
import { nanoid } from './nanoid'
import type { Session, SessionsStore, ToolCallBlock } from './sessionTypes'

type StoreSet = Parameters<StateCreator<SessionsStore>>[0]

const GENERIC_CLAUDE_ERROR = 'Claude Code 요청이 실패했습니다.'

export function createSessionStoreState(set: StoreSet): SessionsStore {
  const firstSession = makeDefaultSession(
    DEFAULT_PROJECT_PATH,
    getProjectNameFromPath(DEFAULT_PROJECT_PATH),
  )

  return {
    sessions: [firstSession],
    activeSessionId: firstSession.id,
    appLanguage: DEFAULT_APP_LANGUAGE,
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
    setAppLanguage: (appLanguage) => set({ appLanguage }),
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
}
