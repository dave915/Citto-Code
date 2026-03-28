import type { StateCreator } from 'zustand'
import { CURRENT_THEME_ID } from '../lib/theme'
import { DEFAULT_APP_LANGUAGE, translate } from '../lib/i18n'
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
import { extractSubagentRuntimeInfo, isSubagentToolName } from '../lib/agent-subcalls'
import { nanoid } from './nanoid'
import type { BtwCard, Message, Session, SessionsStore, ToolCallBlock } from './sessionTypes'

type StoreSet = Parameters<StateCreator<SessionsStore>>[0]

const GENERIC_CLAUDE_ERRORS = new Set([
  translate('ko', 'session.genericClaudeError'),
  translate('en', 'session.genericClaudeError'),
])

function createBtwAnchorMessage(card: BtwCard): Message {
  return {
    id: nanoid(),
    role: 'assistant',
    text: '',
    thinking: '',
    toolCalls: [],
    btwCards: [card],
    createdAt: Date.now(),
  }
}

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

    setLinkedTeamId: (sessionId, teamId) => set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id !== sessionId ? s : { ...s, linkedTeamId: teamId },
      ),
    })),

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
        tokenUsage: data.tokenUsage ?? null,
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
                tokenUsage: null,
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

    addBtwCard: (tabId, cardId, question) => {
      const card: BtwCard = {
        id: cardId,
        question,
        answer: '',
        isStreaming: true,
        isOpen: true,
      }
      let targetMessageId = ''

      set((state) => ({
        sessions: state.sessions.map((session) => {
          if (session.id !== tabId) return session

          const lastMessage = session.messages[session.messages.length - 1]
          if (!lastMessage) {
            const anchorMessage = createBtwAnchorMessage(card)
            targetMessageId = anchorMessage.id
            return {
              ...session,
              messages: [...session.messages, anchorMessage],
            }
          }

          targetMessageId = lastMessage.id
          return {
            ...session,
            messages: session.messages.map((message) =>
              message.id === lastMessage.id
                ? { ...message, btwCards: [...(message.btwCards ?? []), card] }
                : message,
            ),
          }
        }),
      }))

      return targetMessageId
    },

    appendBtwCardChunk: (tabId, cardId, chunk) => {
      if (!chunk) return

      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id !== tabId
            ? session
            : {
                ...session,
                messages: session.messages.map((message) => ({
                  ...message,
                  btwCards: message.btwCards?.map((card) =>
                    card.id === cardId
                      ? { ...card, answer: card.answer + chunk }
                      : card,
                  ),
                })),
              },
        ),
      }))
    },

    updateBtwCard: (tabId, cardId, patch) => {
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id !== tabId
            ? session
            : {
                ...session,
                messages: session.messages.map((message) => ({
                  ...message,
                  btwCards: message.btwCards?.map((card) =>
                    card.id === cardId
                      ? { ...card, ...patch }
                      : card,
                  ),
                })),
              },
        ),
      }))
    },

    toggleBtwCard: (tabId, cardId) => {
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id !== tabId
            ? session
            : {
                ...session,
                messages: session.messages.map((message) => ({
                  ...message,
                  btwCards: message.btwCards?.map((card) =>
                    card.id === cardId
                      ? { ...card, isOpen: !card.isOpen }
                      : card,
                  ),
                })),
              },
        ),
      }))
    },

    appendSubagentText: (tabId, toolUseId, chunk) => {
      if (!chunk) return

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
                          streamingText: (toolCall.streamingText ?? '') + chunk,
                        }
                      : toolCall,
                  ),
                })),
              }
            : session,
        ),
      }))
    },

    addToolCall: (tabId, assistantMsgId, toolCall) => {
      const nextToolCall: ToolCallBlock = {
        id: nanoid(),
        ...toolCall,
        streamingText: toolCall.streamingText ?? '',
        subagentState: isSubagentToolName(toolCall.toolName)
          ? (toolCall.subagentState ?? 'pending')
          : toolCall.subagentState,
      }
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
                      ? (() => {
                          const runtimeInfo = isSubagentToolName(toolCall.toolName)
                            ? extractSubagentRuntimeInfo(result, toolCall.toolInput)
                            : null

                          return {
                            ...toolCall,
                            result,
                            isError,
                            status: isError ? 'error' : 'done',
                            subagentState: isSubagentToolName(toolCall.toolName)
                              ? (isError ? 'error' : (runtimeInfo ? 'running' : (toolCall.subagentState ?? 'done')))
                              : toolCall.subagentState,
                            subagentSessionId: runtimeInfo?.sessionId ?? toolCall.subagentSessionId,
                            subagentAgentId: runtimeInfo?.agentId ?? toolCall.subagentAgentId,
                            subagentTranscriptPath: runtimeInfo?.transcriptPath ?? toolCall.subagentTranscriptPath,
                          }
                        })()
                      : toolCall,
                  ),
                })),
              }
            : session,
        ),
      }))
    },

    updateSubagent: (tabId, toolUseId, patch) => {
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
                          ...patch,
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
            typeof error === 'string' &&
            GENERIC_CLAUDE_ERRORS.has(error) &&
            typeof session.error === 'string' &&
            !GENERIC_CLAUDE_ERRORS.has(session.error)

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

    setTokenUsage: (tabId, inputTokens) => {
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === tabId
            ? { ...session, tokenUsage: inputTokens }
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
