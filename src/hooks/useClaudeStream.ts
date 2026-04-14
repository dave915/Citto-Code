import { useCallback, useEffect, useRef } from 'react'
import type { SelectedFile } from '../../electron/preload'
import { createClaudeEventHandler } from './claudeStream/eventHandler'
import { createClaudeSessionHandlers } from './claudeStream/sessionHandlers'
import type { ClaudeStreamStoreSnapshot, UseClaudeStreamParams } from './claudeStream/types'

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
  addBtwCard,
  appendBtwCardChunk,
  updateBtwCard,
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
  const notifiedSessionEndsRef = useRef<Set<string>>(new Set())
  const btwRequestMapRef = useRef(new Map<string, {
    requestId: string
    messageId: string
    processKey: string | null
    prompt: string
    tabId: string
  }>())
  const notificationModeRef = useRef(notificationMode)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  notificationModeRef.current = notificationMode

  const storeRef = useRef<ClaudeStreamStoreSnapshot>({
    addUserMessage,
    startAssistantMessage,
    appendThinkingChunk,
    appendTextChunk,
    addBtwCard,
    appendBtwCardChunk,
    updateBtwCard,
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
    addBtwCard,
    appendBtwCardChunk,
    updateBtwCard,
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
    notifiedSessionEndsRef,
    btwRequestMapRef,
    notificationModeRef,
    sessionsRef,
    storeRef,
  }

  useEffect(() => {
    const cleanup = window.claude.onClaudeEvent(createClaudeEventHandler(runtime))
    return cleanup
  }, [])

  useEffect(() => {
    const sessionIds = new Set(sessions.map((session) => session.id))

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

  const handleBtwSend = useCallback(async (text: string, files: SelectedFile[]) => {
    if (!activeSessionId) return
    await handlers.handleBtwForSession(activeSessionId, text, files)
  }, [activeSessionId, handlers])

  return {
    ...handlers,
    handleBtwSend,
  }
}
