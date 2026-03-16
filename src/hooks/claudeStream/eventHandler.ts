import type { ClaudeStreamEvent } from '../../../electron/preload'
import {
  isThinkingSignatureError,
  mapPendingQuestionRequest,
  shouldDeliverNotification,
  summarizeNotificationBody,
} from '../../lib/claudeRuntime'
import {
  findTabByClaudeSessionId,
  useSessionsStore,
  type Session,
} from '../../store/sessions'
import type { ClaudeStreamRuntimeRefs } from './types'

export function createClaudeEventHandler(runtime: ClaudeStreamRuntimeRefs) {
  const isEnglish = typeof document !== 'undefined' && document.documentElement.lang.startsWith('en')

  function resolveTabId(claudeSessionId: string | null | undefined): string | null {
    if (!claudeSessionId) return null
    const mappedTabId = runtime.claudeSessionToTabRef.current.get(claudeSessionId)
    if (mappedTabId) return mappedTabId
    return findTabByClaudeSessionId(runtime.sessionsRef.current, claudeSessionId)?.id ?? null
  }

  function resolveOrClaimTabId(claudeSessionId: string | null | undefined): string | null {
    const resolved = resolveTabId(claudeSessionId)
    if (resolved || !claudeSessionId || !runtime.pendingTabIdRef.current) return resolved

    const tabId = runtime.pendingTabIdRef.current
    runtime.claudeSessionToTabRef.current.set(claudeSessionId, tabId)
    runtime.storeRef.current.setClaudeSessionId(tabId, claudeSessionId)
    return tabId
  }

  function findStreamingFallbackTabId(claudeSessionId?: string | null): string | null {
    if (claudeSessionId) {
      const matched = runtime.sessionsRef.current.find((session) =>
        session.isStreaming && (session.sessionId === claudeSessionId || session.sessionId === null),
      )
      if (matched) return matched.id
    }

    if (runtime.pendingTabIdRef.current) return runtime.pendingTabIdRef.current
    if (runtime.storeRef.current.activeSessionId) {
      const selectedSession = runtime.sessionsRef.current.find(
        (session) => session.id === runtime.storeRef.current.activeSessionId,
      )
      if (selectedSession?.isStreaming) return selectedSession.id
    }

    return runtime.sessionsRef.current.find((session) => session.isStreaming)?.id ?? null
  }

  function resolveEventTabId(claudeSessionId?: string | null): string | null {
    return resolveOrClaimTabId(claudeSessionId) ?? findStreamingFallbackTabId(claudeSessionId)
  }

  function takePendingTabId(): string | null {
    const tabId = runtime.pendingTabIdRef.current
    if (!tabId) return null
    runtime.pendingTabIdRef.current = null
    return tabId
  }

  function ensureAssistantMessage(tabId: string): string {
    let messageId = runtime.currentAsstMsgRef.current.get(tabId)
    if (!messageId) {
      messageId = runtime.storeRef.current.startAssistantMessage(tabId)
      runtime.currentAsstMsgRef.current.set(tabId, messageId)
    }
    return messageId
  }

  function getLatestSession(tabId: string): Session | undefined {
    return useSessionsStore.getState().sessions.find((session) => session.id === tabId)
      ?? runtime.sessionsRef.current.find((session) => session.id === tabId)
  }

  return function handleClaudeEvent(event: ClaudeStreamEvent) {
    const store = runtime.storeRef.current

    if (event.type === 'stream-start') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId) return
      runtime.notifiedSessionEndsRef.current.delete(tabId)
      runtime.pendingProcessKeyByTabRef.current.delete(tabId)
      ensureAssistantMessage(tabId)
      return
    }

    if (event.type === 'token-usage') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId || runtime.abortedTabIdsRef.current.has(tabId)) return
      store.setTokenUsage(tabId, event.inputTokens)
      return
    }

    if (event.type === 'text-chunk') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId || runtime.abortedTabIdsRef.current.has(tabId)) return
      const messageId = ensureAssistantMessage(tabId)
      store.appendTextChunk(tabId, messageId, event.text)
      return
    }

    if (event.type === 'thinking-chunk') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId || runtime.abortedTabIdsRef.current.has(tabId)) return
      const messageId = ensureAssistantMessage(tabId)
      store.appendThinkingChunk(tabId, messageId, event.text)
      return
    }

    if (event.type === 'tool-start') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId || runtime.abortedTabIdsRef.current.has(tabId)) return
      const messageId = ensureAssistantMessage(tabId)
      store.addToolCall(tabId, messageId, {
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        toolInput: event.toolInput,
        fileSnapshotBefore: event.fileSnapshotBefore,
        status: 'running',
      })
      return
    }

    if (event.type === 'tool-result') {
      const tabId = resolveEventTabId(event.sessionId)
      if (!tabId || runtime.abortedTabIdsRef.current.has(tabId)) return
      store.resolveToolCall(tabId, event.toolUseId, event.content, event.isError)
      return
    }

    if (event.type === 'result') {
      const tabId = resolveEventTabId(event.sessionId) ?? takePendingTabId()
      if (!tabId || runtime.abortedTabIdsRef.current.has(tabId)) return

      store.setStreaming(tabId, false)
      if (event.totalCostUsd !== undefined) store.setLastCost(tabId, event.totalCostUsd)

      const pendingQuestionRequest = event.permissionDenials
        ?.map(mapPendingQuestionRequest)
        .find((request): request is NonNullable<typeof request> => Boolean(request))

      const permissionRequest = event.permissionDenials
        ?.find((denial) => denial.toolName && denial.toolName !== 'AskUserQuestion')

      store.setPendingQuestion(tabId, pendingQuestionRequest ?? null)
      store.setPendingPermission(
        tabId,
        permissionRequest
          ? {
              toolName: permissionRequest.toolName,
              toolUseId: permissionRequest.toolUseId,
              toolInput: permissionRequest.toolInput,
            }
          : null,
      )

      if (event.isError && event.resultText?.trim()) {
        const messageId = ensureAssistantMessage(tabId)
        const session = runtime.sessionsRef.current.find((item) => item.id === tabId)
        const currentMessage = session?.messages.find((message) => message.id === messageId)
        if (!currentMessage?.text.trim()) {
          store.appendTextChunk(tabId, messageId, event.resultText.trim())
        }
      }
      return
    }

    if (event.type === 'stream-end') {
      const tabId = resolveEventTabId(event.sessionId ?? null) ?? takePendingTabId()
      if (event.sessionId) {
        runtime.claudeSessionToTabRef.current.delete(event.sessionId)
      }
      if (!tabId) return

      const latestSession = getLatestSession(tabId)
      const isStaleStreamEnd =
        !latestSession?.isStreaming &&
        !latestSession?.pendingPermission &&
        !latestSession?.pendingQuestion &&
        latestSession?.currentAssistantMsgId === null

      if (isStaleStreamEnd) {
        runtime.pendingProcessKeyByTabRef.current.delete(tabId)
        return
      }

      const wasAborted = runtime.abortedTabIdsRef.current.has(tabId)
      runtime.pendingProcessKeyByTabRef.current.delete(tabId)
      if (runtime.pendingTabIdRef.current === tabId) {
        runtime.pendingTabIdRef.current = null
      }

      const finalizeStreamEnd = () => {
        store.commitStreamEnd(tabId)

        const session = getLatestSession(tabId)
        const hasPendingInteraction = Boolean(session?.pendingPermission || session?.pendingQuestion)
        const shouldNotify =
          !runtime.notifiedSessionEndsRef.current.has(tabId) &&
          !wasAborted &&
          !hasPendingInteraction

        if (shouldNotify) {
          runtime.notifiedSessionEndsRef.current.add(tabId)
          const lastAssistantMessage = [...(session?.messages ?? [])]
            .reverse()
            .find((message) => message.role === 'assistant')
          const title = session?.error
            ? (isEnglish ? 'Claude task failed' : 'Claude 작업 실패')
            : (isEnglish ? 'Claude task completed' : 'Claude 작업 완료')
          const body = summarizeNotificationBody(session?.error ?? lastAssistantMessage?.text)
          if (shouldDeliverNotification(runtime.notificationModeRef.current)) {
            void window.claude.notify({
              title: session?.name ? `${title} · ${session.name}` : title,
              body,
            })
          }
        }

        runtime.abortedTabIdsRef.current.delete(tabId)
      }

      const session = getLatestSession(tabId)
      const hasPendingInteraction = Boolean(session?.pendingPermission || session?.pendingQuestion)
      if (event.exitCode === 0 || hasPendingInteraction || wasAborted) {
        finalizeStreamEnd()
      }
      return
    }

    if (event.type === 'error') {
      const tabId = resolveEventTabId(event.sessionId ?? null) ?? takePendingTabId() ?? store.activeSessionId
      if (event.sessionId) {
        runtime.claudeSessionToTabRef.current.delete(event.sessionId)
      }

      if (tabId) {
        if (runtime.abortedTabIdsRef.current.has(tabId)) {
          runtime.abortedTabIdsRef.current.delete(tabId)
          runtime.pendingProcessKeyByTabRef.current.delete(tabId)
          if (runtime.pendingTabIdRef.current === tabId) {
            runtime.pendingTabIdRef.current = null
          }
          store.commitStreamEnd(tabId)
          return
        }

        runtime.pendingProcessKeyByTabRef.current.delete(tabId)
        if (runtime.pendingTabIdRef.current === tabId) {
          runtime.pendingTabIdRef.current = null
        }
      }

      if (tabId) {
        if (isThinkingSignatureError(event.error)) {
          store.updateSession(tabId, () => ({ sessionId: null }))
        }
        store.setError(tabId, event.error)
      }
    }
  }
}
