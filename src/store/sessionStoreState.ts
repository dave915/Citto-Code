import type { StateCreator } from 'zustand'
import { CURRENT_THEME_ID } from '../lib/theme'
import { DEFAULT_APP_LANGUAGE, translate } from '../lib/i18n'
import { buildCheckpointSummary } from '../lib/checkpointSummary'
import {
  DEFAULT_PROJECT_PATH,
  DEFAULT_SHORTCUT_CONFIG,
  DEFAULT_UI_FONT_SIZE,
  DEFAULT_UI_ZOOM_PERCENT,
  clampUiFontSize,
  clampUiZoomPercent,
  makeDefaultSession,
  normalizeImportedMessage,
} from '../lib/sessionUtils'
import { extractSubagentRuntimeInfo, isSubagentToolName } from '../lib/agent-subcalls'
import { nanoid } from './nanoid'
import {
  appendBtwCardToLastMessage,
  appendToolCallToMessage,
  appendUserMessage,
  finalizeStreamingSession,
  patchSession,
  startAssistantStreamingSession,
  updateBtwCards,
  updateMessageById,
  updateSessionById,
  updateToolCalls,
} from './sessionStoreMutators'
import type {
  BtwCard,
  Message,
  Session,
  SessionCheckpoint,
  SessionCheckpointRestoreState,
  SessionCheckpointSnapshot,
  SessionsStore,
  ToolCallBlock,
} from './sessionTypes'

type StoreSet = Parameters<StateCreator<SessionsStore>>[0]

const GENERIC_CLAUDE_ERRORS = new Set([
  translate('ko', 'session.genericClaudeError'),
  translate('en', 'session.genericClaudeError'),
])

function cloneSerializable<T>(value: T): T {
  if (value === undefined || value === null) return value

  try {
    return structuredClone(value)
  } catch {
    return value
  }
}

function cloneMessage(message: Message): Message {
  return {
    ...message,
    toolCalls: message.toolCalls.map((toolCall) => ({
      ...toolCall,
      toolInput: cloneSerializable(toolCall.toolInput),
      result: cloneSerializable(toolCall.result),
    })),
    attachedFiles: message.attachedFiles?.map((file) => ({ ...file })),
    btwCards: message.btwCards?.map((card) => ({ ...card, isStreaming: false })),
  }
}

function createCheckpointSnapshot(session: Session): SessionCheckpointSnapshot {
  return {
    cwd: session.cwd,
    messages: session.messages.map(cloneMessage),
    tokenUsage: session.tokenUsage,
    lastCost: session.lastCost,
    permissionMode: session.permissionMode,
    planMode: session.planMode,
    model: session.model,
  }
}

function createCheckpointRestoreState(checkpoint: SessionCheckpoint): SessionCheckpointRestoreState {
  const summary = checkpoint.summary?.trim() ? checkpoint.summary.trim() : null

  return {
    checkpointId: checkpoint.id,
    checkpointName: checkpoint.name,
    summary,
    restoredAt: Date.now(),
    pendingSummaryInjection: Boolean(summary),
  }
}

function restoreSessionFromCheckpoint(session: Session, checkpoint: SessionCheckpoint): Session {
  const { snapshot } = checkpoint

  return {
    ...session,
    cwd: snapshot.cwd,
    sessionId: null,
    messages: snapshot.messages.map(cloneMessage),
    isStreaming: false,
    currentAssistantMsgId: null,
    error: null,
    pendingPermission: null,
    pendingQuestion: null,
    tokenUsage: snapshot.tokenUsage,
    lastCost: snapshot.lastCost,
    permissionMode: snapshot.permissionMode,
    planMode: snapshot.planMode,
    model: snapshot.model,
    modelSwitchNotice: null,
    checkpointRestoreState: createCheckpointRestoreState(checkpoint),
  }
}

function createSessionFromCheckpoint(checkpoint: SessionCheckpoint): Session {
  const session = makeDefaultSession(checkpoint.snapshot.cwd, checkpoint.name)

  return {
    ...session,
    name: checkpoint.name,
    cwd: checkpoint.snapshot.cwd,
    messages: checkpoint.snapshot.messages.map(cloneMessage),
    tokenUsage: checkpoint.snapshot.tokenUsage,
    lastCost: checkpoint.snapshot.lastCost,
    permissionMode: checkpoint.snapshot.permissionMode,
    planMode: checkpoint.snapshot.planMode,
    model: checkpoint.snapshot.model,
    checkpointRestoreState: createCheckpointRestoreState(checkpoint),
  }
}

export function createSessionStoreState(set: StoreSet): SessionsStore {
  const updateStoredSession = (
    sessionId: string,
    updater: (session: Session) => Session,
  ) => set((state) => ({
    sessions: updateSessionById(state.sessions, sessionId, updater),
  }))
  const patchStoredSession = (sessionId: string, patch: Partial<Session>) => (
    updateStoredSession(sessionId, (session) => patchSession(session, patch))
  )

  return {
    sessions: [],
    activeSessionId: null,
    appLanguage: DEFAULT_APP_LANGUAGE,
    defaultProjectPath: DEFAULT_PROJECT_PATH,
    envVars: {},
    autoHtmlPreview: true,
    sidebarMode: 'session',
    claudeBinaryPath: '',
    preferredOpenWithAppId: '',
    themeId: CURRENT_THEME_ID,
    notificationMode: 'all',
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    uiZoomPercent: DEFAULT_UI_ZOOM_PERCENT,
    quickPanelEnabled: true,
    shortcutConfig: DEFAULT_SHORTCUT_CONFIG,

    setLinkedTeamId: (sessionId, teamId) => patchStoredSession(sessionId, { linkedTeamId: teamId }),

    setEnvVar: (key, value) => set((state) => ({
      envVars: { ...state.envVars, [key]: value },
    })),

    setAutoHtmlPreview: (autoHtmlPreview) => set({ autoHtmlPreview }),

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
        modelSwitchNotice: null,
        checkpointRestoreState: null,
        checkpoints: [],
      }

      set((state) => ({
        sessions: [...state.sessions, session],
        activeSessionId: session.id,
      }))

      return session.id
    },

    reorderSessions: (sessionIds) => {
      const desiredOrder = new Map(sessionIds.map((sessionId, index) => [sessionId, index]))
      set((state) => {
        if (desiredOrder.size === 0) return state

        const ordered = [...state.sessions].sort((a, b) => {
          const left = desiredOrder.get(a.id)
          const right = desiredOrder.get(b.id)
          if (left == null && right == null) return 0
          if (left == null) return 1
          if (right == null) return -1
          return left - right
        })

        const unchanged = ordered.every((session, index) => session.id === state.sessions[index]?.id)
        return unchanged ? state : { sessions: ordered }
      })
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

    updateSession: (id, updater) => updateStoredSession(id, (session) => ({ ...session, ...updater(session) })),

    createCheckpoint: (sessionId, name, note = '') => {
      let checkpointId: string | null = null

      set((state) => ({
        sessions: updateSessionById(state.sessions, sessionId, (session) => {
          const existingCheckpoints = session.checkpoints ?? []
          const checkpoint: SessionCheckpoint = {
            id: nanoid(),
            name: name.trim() || `Checkpoint ${existingCheckpoints.length + 1}`,
            note: note.trim(),
            summary: buildCheckpointSummary(session, note),
            createdAt: Date.now(),
            snapshot: createCheckpointSnapshot(session),
          }

          checkpointId = checkpoint.id

          return {
            ...session,
            checkpoints: [checkpoint, ...existingCheckpoints],
          }
        }),
      }))

      return checkpointId
    },

    renameCheckpoint: (sessionId, checkpointId, name) => updateStoredSession(sessionId, (session) => {
      const nextName = name.trim()
      if (!nextName) return session

      return {
        ...session,
        checkpoints: (session.checkpoints ?? []).map((checkpoint) => (
          checkpoint.id === checkpointId
            ? { ...checkpoint, name: nextName }
            : checkpoint
        )),
      }
    }),

    deleteCheckpoint: (sessionId, checkpointId) => updateStoredSession(sessionId, (session) => ({
      ...session,
      checkpoints: (session.checkpoints ?? []).filter((checkpoint) => checkpoint.id !== checkpointId),
    })),

    restoreCheckpoint: (sessionId, checkpointId, mode) => {
      let restoredSessionId: string | null = null

      set((state) => {
        const sourceSession = state.sessions.find((session) => session.id === sessionId)
        const checkpoint = sourceSession?.checkpoints.find((entry) => entry.id === checkpointId)

        if (!sourceSession || !checkpoint) return state

        if (mode === 'replace') {
          restoredSessionId = sourceSession.id

          return {
            sessions: updateSessionById(
              state.sessions,
              sourceSession.id,
              (session) => restoreSessionFromCheckpoint(session, checkpoint),
            ),
            activeSessionId: sourceSession.id,
          }
        }

        const nextSession = createSessionFromCheckpoint(checkpoint)
        restoredSessionId = nextSession.id

        return {
          sessions: [...state.sessions, nextSession],
          activeSessionId: nextSession.id,
        }
      })

      return restoredSessionId
    },

    addUserMessage: (tabId, text, files) => {
      const msgId = nanoid()
      set((state) => ({
        sessions: updateSessionById(state.sessions, tabId, (session) => (
          appendUserMessage(session, text, files, msgId)
        )),
      }))
      return msgId
    },

    startAssistantMessage: (tabId) => {
      const msgId = nanoid()
      set((state) => ({
        sessions: updateSessionById(state.sessions, tabId, (session) => (
          startAssistantStreamingSession(session, msgId)
        )),
      }))
      return msgId
    },

    appendThinkingChunk: (tabId, assistantMsgId, chunk) => updateStoredSession(
      tabId,
      (session) => updateMessageById(
        session,
        assistantMsgId,
        (message) => ({ ...message, thinking: (message.thinking ?? '') + chunk }),
      ),
    ),

    appendTextChunk: (tabId, assistantMsgId, chunk) => updateStoredSession(
      tabId,
      (session) => updateMessageById(
        session,
        assistantMsgId,
        (message) => ({ ...message, text: message.text + chunk }),
      ),
    ),

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
        sessions: updateSessionById(state.sessions, tabId, (session) => {
          const nextSession = appendBtwCardToLastMessage(session, card)
          targetMessageId = nextSession.targetMessageId
          return nextSession.session
        }),
      }))

      return targetMessageId
    },

    appendBtwCardChunk: (tabId, cardId, chunk) => {
      if (!chunk) return

      updateStoredSession(
        tabId,
        (session) => updateBtwCards(
          session,
          (card) => (card.id === cardId ? { ...card, answer: card.answer + chunk } : card),
        ),
      )
    },

    updateBtwCard: (tabId, cardId, patch) => updateStoredSession(
      tabId,
      (session) => updateBtwCards(
        session,
        (card) => (card.id === cardId ? { ...card, ...patch } : card),
      ),
    ),

    toggleBtwCard: (tabId, cardId) => updateStoredSession(
      tabId,
      (session) => updateBtwCards(
        session,
        (card) => (card.id === cardId ? { ...card, isOpen: !card.isOpen } : card),
      ),
    ),

    appendSubagentText: (tabId, toolUseId, chunk) => {
      if (!chunk) return

      updateStoredSession(
        tabId,
        (session) => updateToolCalls(
          session,
          (toolCall) => (
            toolCall.toolUseId === toolUseId
              ? { ...toolCall, streamingText: (toolCall.streamingText ?? '') + chunk }
              : toolCall
          ),
        ),
      )
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
      updateStoredSession(
        tabId,
        (session) => appendToolCallToMessage(session, assistantMsgId, nextToolCall),
      )
    },

    resolveToolCall: (tabId, toolUseId, result, isError) => updateStoredSession(
      tabId,
      (session) => updateToolCalls(
        session,
        (toolCall) => {
          if (toolCall.toolUseId !== toolUseId) return toolCall

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
        },
      ),
    ),

    updateSubagent: (tabId, toolUseId, patch) => updateStoredSession(
      tabId,
      (session) => updateToolCalls(
        session,
        (toolCall) => (toolCall.toolUseId === toolUseId ? { ...toolCall, ...patch } : toolCall),
      ),
    ),

    setStreaming: (tabId, value) => patchStoredSession(tabId, { isStreaming: value }),

    commitStreamEnd: (tabId) => {
      set((state) => ({
        sessions: updateSessionById(state.sessions, tabId, (session) => finalizeStreamingSession(session)),
      }))
    },

    setClaudeSessionId: (tabId, claudeSessionId) => patchStoredSession(tabId, { sessionId: claudeSessionId }),

    setError: (tabId, error) => {
      set((state) => ({
        sessions: state.sessions.map((session) => {
          if (session.id !== tabId) return session

          const shouldKeepExistingError =
            typeof error === 'string' &&
            GENERIC_CLAUDE_ERRORS.has(error) &&
            typeof session.error === 'string' &&
            !GENERIC_CLAUDE_ERRORS.has(session.error)

          return finalizeStreamingSession(session, {
            error: shouldKeepExistingError ? session.error : error,
            pendingPermission: null,
            pendingQuestion: null,
          })
        }),
      }))
    },

    setPendingPermission: (tabId, request) => patchStoredSession(tabId, { pendingPermission: request }),

    setPendingQuestion: (tabId, request) => patchStoredSession(tabId, { pendingQuestion: request }),

    setTokenUsage: (tabId, inputTokens) => patchStoredSession(tabId, { tokenUsage: inputTokens }),

    setLastCost: (tabId, cost) => patchStoredSession(tabId, { lastCost: cost }),

    setPermissionMode: (tabId, mode) => patchStoredSession(tabId, { permissionMode: mode }),

    setPlanMode: (tabId, value) => patchStoredSession(tabId, { planMode: value }),

    setModel: (tabId, model) => patchStoredSession(tabId, { model }),
  }
}
