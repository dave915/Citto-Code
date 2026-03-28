import { useEffect, useMemo, useState } from 'react'
import type { ImportedCliSession } from '../../../electron/preload'
import { collectSubagentCalls } from '../../lib/agent-subcalls'
import { normalizeImportedMessage } from '../../lib/sessionUtils'
import { formatToolResult } from '../../lib/toolcalls/formatting'
import type { Message, Session } from '../../store/sessions'
import type { TranslationKey } from '../../lib/i18n'

type UseSubagentDrilldownStateParams = {
  session: Session
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  title: string
  toolUseId: string
}

export function useSubagentDrilldownState({
  session,
  t,
  title,
  toolUseId,
}: UseSubagentDrilldownStateParams) {
  const [loadedSession, setLoadedSession] = useState<ImportedCliSession | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)
  const [transcriptFailed, setTranscriptFailed] = useState(false)

  const entry = useMemo(
    () => collectSubagentCalls(session.messages).find((item) => item.toolUseId === toolUseId) ?? null,
    [session.messages, toolUseId],
  )
  const promptHistory = useMemo(
    () => session.messages
      .filter((message) => message.role === 'user' && message.text.trim().length > 0)
      .map((message) => message.text),
    [session.messages],
  )
  const normalizedTranscriptMessages = useMemo(
    () => loadedSession?.messages.map(normalizeImportedMessage) ?? [],
    [loadedSession],
  )

  useEffect(() => {
    if (!entry?.transcriptPath || (entry.status !== 'done' && entry.status !== 'error')) {
      setLoadedSession(null)
      setLoadingTranscript(false)
      setTranscriptFailed(false)
      return
    }

    let cancelled = false
    setLoadedSession(null)
    setLoadingTranscript(true)
    setTranscriptFailed(false)

    void window.claude.loadCliSession({ filePath: entry.transcriptPath })
      .then((nextSession) => {
        if (cancelled) return
        if (!nextSession) {
          setTranscriptFailed(true)
          return
        }
        setLoadedSession(nextSession)
      })
      .catch(() => {
        if (!cancelled) {
          setTranscriptFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTranscript(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [entry?.status, entry?.transcriptPath, toolUseId])

  const status = entry?.status ?? 'error'
  const canReply = status === 'done' || status === 'error'
  const fallbackResult = entry?.toolCall.result ? formatToolResult(entry.toolCall.result).trim() : ''
  const liveOutput = entry?.streamingText.trim() ?? ''
  const headerTitle = entry?.description || entry?.agent || title || t('subagent.defaultName')
  const drillMessages = useMemo<Message[]>(() => {
    const promptMessage = entry?.prompt?.trim()
      ? {
          id: `${toolUseId}:prompt`,
          role: 'user' as const,
          text: entry.prompt.trim(),
          thinking: '',
          toolCalls: [],
          createdAt: 0,
        }
      : null

    if (normalizedTranscriptMessages.length > 0) {
      const hasTranscriptUserPrompt = normalizedTranscriptMessages.some((message) => (
        message.role === 'user' && message.text.trim().length > 0
      ))
      return hasTranscriptUserPrompt || !promptMessage
        ? normalizedTranscriptMessages
        : [promptMessage, ...normalizedTranscriptMessages]
    }

    const assistantText = liveOutput
      || fallbackResult
      || (transcriptFailed ? t('subagent.transcriptUnavailable') : '')
    const assistantMessage: Message | null = (
      assistantText || loadingTranscript || status === 'pending' || status === 'running'
    )
      ? {
          id: `${toolUseId}:assistant`,
          role: 'assistant',
          text: assistantText,
          thinking: '',
          toolCalls: [],
          createdAt: 1,
        }
      : null

    return [promptMessage, assistantMessage].filter((message): message is Message => Boolean(message))
  }, [
    entry?.prompt,
    fallbackResult,
    liveOutput,
    loadingTranscript,
    normalizedTranscriptMessages,
    status,
    t,
    toolUseId,
    transcriptFailed,
  ])

  return {
    canReply,
    drillMessages,
    entry,
    headerTitle,
    liveOutput,
    loadingTranscript,
    normalizedTranscriptMessages,
    promptHistory,
    status,
    transcriptFailed,
  }
}
