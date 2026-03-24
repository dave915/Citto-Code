import { useEffect, useMemo, useRef, useState } from 'react'
import type { ImportedCliSession, SelectedFile } from '../../electron/preload'
import { useI18n } from '../hooks/useI18n'
import { collectSubagentCalls } from '../lib/agent-subcalls'
import { normalizeImportedMessage } from '../lib/sessionUtils'
import { formatToolResult } from '../lib/toolcalls/formatting'
import type { Message, PermissionMode, Session } from '../store/sessions'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'

type Props = {
  session: Session
  toolUseId: string
  title: string
  onBack: () => void
  onSendToMain: (text: string, files: SelectedFile[]) => void
  onSendBtwToMain: (text: string, files: SelectedFile[]) => void
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
  onOpenTeam?: () => void
  hasLinkedTeam?: boolean
}

export function SubagentDrilldownView({
  session,
  toolUseId,
  title,
  onBack,
  onSendToMain,
  onSendBtwToMain,
  permissionMode,
  planMode,
  model,
  onPermissionModeChange,
  onPlanModeChange,
  onModelChange,
  permissionShortcutLabel,
  bypassShortcutLabel,
  onOpenTeam,
  hasLinkedTeam,
}: Props) {
  const { t } = useI18n()
  const [loadedSession, setLoadedSession] = useState<ImportedCliSession | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)
  const [transcriptFailed, setTranscriptFailed] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: normalizedTranscriptMessages.length > 0 ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [drillMessages.length, liveOutput, normalizedTranscriptMessages.length, status])

  if (!entry) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-claude-chat-bg">
        <div className="flex-shrink-0 border-b border-claude-border/70 bg-claude-chat-bg/95 backdrop-blur supports-[backdrop-filter]:bg-claude-chat-bg/80">
        <div className="w-full px-6 py-4">
          <button
            type="button"
            onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border border-claude-border/70 bg-claude-surface px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
              {t('subagent.backToChat')}
            </button>
          </div>
        </div>
        <div
          className="relative z-0 min-h-0 flex-1 overflow-y-auto px-6 py-7"
          style={{ background: 'linear-gradient(180deg, rgb(var(--claude-chat-bg) / 0.985) 0%, rgb(var(--claude-chat-bg)) 100%)' }}
        >
          <div className="mx-auto w-full max-w-[860px]">
            <div className="text-sm text-claude-muted">{t('subagent.transcriptUnavailable')}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-claude-chat-bg">
      <div className="flex-shrink-0 border-b border-claude-border/70 bg-claude-chat-bg/95 backdrop-blur supports-[backdrop-filter]:bg-claude-chat-bg/80">
        <div className="w-full px-6 py-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-surface text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
              aria-label={t('subagent.backToChat')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-medium text-claude-text">
                  {headerTitle}
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  status === 'pending'
                    ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
                    : status === 'running'
                      ? 'border-sky-400/30 bg-sky-400/10 text-sky-100'
                      : status === 'error'
                        ? 'border-red-400/30 bg-red-400/10 text-red-100'
                        : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                }`}>
                  {status === 'pending'
                    ? t('subagent.status.pending')
                    : status === 'running'
                      ? t('subagent.status.running')
                      : status === 'error'
                        ? t('subagent.status.error')
                        : t('subagent.status.done')}
                </span>
              </div>
              <div className="mt-1 text-xs text-claude-muted">
                {entry.agent ? `${entry.agent} · ` : ''}{toolUseId}
              </div>
              {entry.transcriptPath ? (
                <div className="mt-1 truncate font-mono text-[11px] text-claude-muted/85">
                  {entry.transcriptPath}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative z-0 min-h-0 flex-1 overflow-y-auto px-6 py-7"
        style={{ background: 'linear-gradient(180deg, rgb(var(--claude-chat-bg) / 0.985) 0%, rgb(var(--claude-chat-bg)) 100%)' }}
      >
        <div className="mx-auto w-full max-w-[860px]">
          {drillMessages.length > 0 ? (
            <div>
              {drillMessages.map((message, index) => {
                const isTranscriptMessage = normalizedTranscriptMessages.length > 0
                const isStreamingMessage = !isTranscriptMessage
                  && message.role === 'assistant'
                  && index === drillMessages.length - 1
                  && (status === 'pending' || status === 'running' || loadingTranscript)

                return (
                  <div key={message.id} className="-mx-2 px-2 py-1">
                    <MessageBubble
                      message={message}
                      isStreaming={isStreamingMessage}
                    />
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="text-sm text-claude-muted">{t('subagent.noOutput')}</div>
          )}
        </div>
      </div>

      <InputArea
        cwd={session.cwd}
        promptHistory={promptHistory}
        onSend={(text, files) => {
          onSendToMain(text, files)
          onBack()
        }}
        onSendBtw={(text, files) => {
          onSendBtwToMain(text, files)
          onBack()
        }}
        onAbort={() => undefined}
        isStreaming={false}
        disabled={!canReply}
        pendingPermission={null}
        onPermissionRequestAction={() => undefined}
        pendingQuestion={null}
        onQuestionResponse={() => undefined}
        permissionMode={permissionMode}
        planMode={planMode}
        model={model}
        onPermissionModeChange={onPermissionModeChange}
        onPlanModeChange={onPlanModeChange}
        onModelChange={onModelChange}
        permissionShortcutLabel={permissionShortcutLabel}
        bypassShortcutLabel={bypassShortcutLabel}
        topSlot={(
          <div className="mb-2 px-1 text-xs text-claude-muted">
            {canReply ? t('subagent.replyToMain') : t('subagent.replyWhenDone')}
          </div>
        )}
        onOpenTeam={onOpenTeam}
        hasLinkedTeam={hasLinkedTeam}
      />
    </div>
  )
}
