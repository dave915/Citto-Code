import { useCallback, useEffect, useRef, useState } from 'react'
import type { SelectedFile } from '../../electron/preload'
import { createClaudeEventHandler } from './claudeStream/eventHandler'
import { createClaudeSessionHandlers } from './claudeStream/sessionHandlers'
import type {
  BtwState,
  ClaudeStreamStoreSnapshot,
  ScheduledTaskRunMeta,
  UseClaudeStreamParams,
} from './claudeStream/types'

export function useClaudeStream({
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
}: UseClaudeStreamParams) {
  const activeSession = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null

  const pendingTabIdRef = useRef<string | null>(null)
  const pendingProcessKeyByTabRef = useRef<Map<string, string>>(new Map())
  const currentAsstMsgRef = useRef<Map<string, string>>(new Map())
  const claudeSessionToTabRef = useRef<Map<string, string>>(new Map())
  const abortedTabIdsRef = useRef<Set<string>>(new Set())
  const scheduledTaskSessionByRunRef = useRef<Map<string, string>>(new Map())
  const scheduledTaskRunMetaBySessionRef = useRef<Map<string, ScheduledTaskRunMeta>>(new Map())
  const notifiedSessionEndsRef = useRef<Set<string>>(new Set())
  const btwRequestMapRef = useRef(new Map<string, { requestId: string; tabId: string; prompt: string }>())
  const [btwBySession, setBtwBySession] = useState<Record<string, BtwState>>({})
  const btwBySessionRef = useRef<Record<string, BtwState>>({})
  const notificationModeRef = useRef(notificationMode)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  notificationModeRef.current = notificationMode
  btwBySessionRef.current = btwBySession

  const setBtwState = useCallback((tabId: string, nextState: BtwState | null) => {
    setBtwBySession((current) => {
      if (!nextState) {
        if (!current[tabId]) return current
        const { [tabId]: _removed, ...rest } = current
        return rest
      }

      return {
        ...current,
        [tabId]: nextState,
      }
    })
  }, [])

  const patchBtwState = useCallback((tabId: string, updater: (current: BtwState) => BtwState) => {
    setBtwBySession((current) => {
      const existing = current[tabId]
      if (!existing) return current
      return {
        ...current,
        [tabId]: updater(existing),
      }
    })
  }, [])

  const clearBtwState = useCallback((tabId: string) => {
    setBtwBySession((current) => {
      if (!current[tabId]) return current
      const { [tabId]: _removed, ...rest } = current
      return rest
    })
  }, [])

  const storeRef = useRef<ClaudeStreamStoreSnapshot>({
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
    setTokenUsage,
    setLastCost,
    updateSession,
    setPermissionMode,
    setModel,
    commitStreamEnd,
    removeSession,
    activeSessionId,
  })
  storeRef.current = {
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
    setTokenUsage,
    setLastCost,
    updateSession,
    setPermissionMode,
    setModel,
    commitStreamEnd,
    removeSession,
    activeSessionId,
  }

  const runtime = {
    pendingTabIdRef,
    pendingProcessKeyByTabRef,
    currentAsstMsgRef,
    claudeSessionToTabRef,
    abortedTabIdsRef,
    scheduledTaskSessionByRunRef,
    scheduledTaskRunMetaBySessionRef,
    notifiedSessionEndsRef,
    btwRequestMapRef,
    notificationModeRef,
    sessionsRef,
    storeRef,
    setBtwState,
    patchBtwState,
    clearBtwState,
  }

  useEffect(() => {
    const cleanup = window.claude.onClaudeEvent(createClaudeEventHandler(runtime))
    return cleanup
  }, [])

  useEffect(() => {
    const sessionIds = new Set(sessions.map((session) => session.id))

    setBtwBySession((current) => {
      let changed = false
      const next: Record<string, BtwState> = {}
      for (const [tabId, state] of Object.entries(current)) {
        if (!sessionIds.has(tabId)) {
          changed = true
          continue
        }
        next[tabId] = state
      }
      return changed ? next : current
    })

    for (const [requestId, context] of btwRequestMapRef.current.entries()) {
      if (!sessionIds.has(context.tabId)) {
        btwRequestMapRef.current.delete(requestId)
      }
    }
  }, [sessions])

  const handlers = createClaudeSessionHandlers({
    activeSession,
    activeSessionId,
    claudeBinaryPath,
    defaultProjectPath,
    runtime,
    sanitizedEnvVars,
    sessions,
  })

  const handleBtwDismiss = useCallback(async (sessionId: string) => {
    const current = btwBySessionRef.current[sessionId]
    if (!current) return

    if (current.requestId) {
      btwRequestMapRef.current.delete(current.requestId)
    }

    if (current.status === 'running' && current.processKey) {
      try {
        await window.claude.abort({ sessionId: current.processKey })
      } catch {
        // Ignore abort races when the side question has already finished.
      }
    }

    clearBtwState(sessionId)
  }, [clearBtwState])

  const handleBtwSend = useCallback(async (text: string, files: SelectedFile[]) => {
    if (!activeSessionId) return
    await handlers.handleBtwForSession(activeSessionId, text, files)
  }, [activeSessionId, handlers])

  return {
    ...handlers,
    btwBySession,
    handleBtwDismiss,
    handleBtwSend,
    scheduledTaskRunMetaBySessionRef,
    scheduledTaskSessionByRunRef,
  }
}
