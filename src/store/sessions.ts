import { create } from 'zustand'
import { nanoid } from './nanoid'

export type ToolCallStatus = 'running' | 'done' | 'error'

export type ToolCallBlock = {
  id: string
  toolUseId: string
  toolName: string
  toolInput: unknown
  result?: unknown
  isError?: boolean
  status: ToolCallStatus
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

export type Session = {
  id: string
  sessionId: string | null
  name: string
  cwd: string
  messages: Message[]
  isStreaming: boolean
  currentAssistantMsgId: string | null
  error: string | null
  lastCost?: number
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null  // null = Claude Code 기본값 사용
}

type SessionsStore = {
  sessions: Session[]
  activeSessionId: string
  envVars: Record<string, string>
  addSession: (cwd: string, name: string) => string
  removeSession: (id: string) => void
  setActiveSession: (id: string) => void
  updateSession: (id: string, updater: (s: Session) => Partial<Session>) => void
  addUserMessage: (tabId: string, text: string, files?: AttachedFile[]) => string
  startAssistantMessage: (sessionId: string) => string
  appendTextChunk: (sessionId: string, assistantMsgId: string, chunk: string) => void
  addToolCall: (sessionId: string, assistantMsgId: string, toolCall: Omit<ToolCallBlock, 'id'>) => void
  resolveToolCall: (sessionId: string, toolUseId: string, result: unknown, isError: boolean) => void
  setStreaming: (sessionId: string, value: boolean) => void
  setClaudeSessionId: (tabId: string, claudeSessionId: string) => void
  setError: (tabId: string, error: string | null) => void
  setLastCost: (tabId: string, cost: number) => void
  setPermissionMode: (tabId: string, mode: PermissionMode) => void
  setPlanMode: (tabId: string, value: boolean) => void
  setModel: (tabId: string, model: string | null) => void
  setEnvVar: (key: string, value: string) => void
  removeEnvVar: (key: string) => void
}

const DEFAULT_CWD = '~'

function makeDefaultSession(cwd: string, name: string): Session {
  return {
    id: nanoid(),
    sessionId: null,
    name,
    cwd,
    messages: [],
    isStreaming: false,
    currentAssistantMsgId: null,
    error: null,
    permissionMode: 'default',
    planMode: false,
    model: null,
  }
}

export const useSessionsStore = create<SessionsStore>((set) => {
  const firstSession = makeDefaultSession(DEFAULT_CWD, '~')

  return {
    sessions: [firstSession],
    activeSessionId: firstSession.id,
    envVars: {},

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

    removeSession: (id) => {
      set((s) => {
        const remaining = s.sessions.filter((sess) => sess.id !== id)
        if (remaining.length === 0) {
          const fresh = makeDefaultSession(DEFAULT_CWD, '~')
          return { sessions: [fresh], activeSessionId: fresh.id }
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
                ]
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
                error: null,
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
          sess.id === tabId ? { ...sess, error, isStreaming: false } : sess
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
})

export function findTabByClaudeSessionId(
  sessions: Session[],
  claudeSessionId: string
): Session | undefined {
  return sessions.find((s) => s.sessionId === claudeSessionId)
}
