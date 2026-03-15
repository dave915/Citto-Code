import { useEffect, useRef } from 'react'
import { createClaudeEventHandler } from './claudeStream/eventHandler'
import { createClaudeSessionHandlers } from './claudeStream/sessionHandlers'
import type { ClaudeStreamStoreSnapshot, ScheduledTaskRunMeta, UseClaudeStreamParams } from './claudeStream/types'

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
  const notificationModeRef = useRef(notificationMode)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  notificationModeRef.current = notificationMode

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
    notificationModeRef,
    sessionsRef,
    storeRef,
  }

  useEffect(() => {
    const cleanup = window.claude.onClaudeEvent(createClaudeEventHandler(runtime))
    return cleanup
  }, [])

  const handlers = createClaudeSessionHandlers({
    activeSession,
    activeSessionId,
    claudeBinaryPath,
    defaultProjectPath,
    runtime,
    sanitizedEnvVars,
    sessions,
  })

  return {
    ...handlers,
    scheduledTaskRunMetaBySessionRef,
    scheduledTaskSessionByRunRef,
  }
}
