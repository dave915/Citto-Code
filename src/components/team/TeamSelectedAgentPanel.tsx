import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { useI18n } from '../../hooks/useI18n'
import type { AgentMessage, TeamAgent } from '../../store/teamTypes'
import { AgentPixelIcon } from './AgentPixelIcon'

function ThinkingBubble({ text }: { text: string }) {
  const { t } = useI18n()

  if (!text?.trim()) return null
  return (
    <div className="rounded-xl border border-blue-500/25 bg-blue-500/8 px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-500">
        {t('team.thinking')}
      </p>
      <p className="line-clamp-4 text-xs leading-relaxed text-claude-text/90">{text}</p>
    </div>
  )
}

function StreamingCursor() {
  return <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle bg-current" />
}

function SystemPromptHoverCard({ prompt }: { prompt: string }) {
  const { t } = useI18n()

  if (!prompt.trim()) return null

  return (
    <>
      <button
        type="button"
        className="peer/prompt flex h-7 w-7 items-center justify-center rounded-full text-claude-text-muted transition-colors hover:bg-white/5 hover:text-claude-text"
        aria-label={t('team.systemPrompt.show')}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v5m0-8h.01" />
        </svg>
      </button>
      <div
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-[24rem] rounded-2xl border border-claude-border bg-claude-panel/95 p-3 opacity-0 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm transition-opacity peer-hover/prompt:opacity-100 peer-focus-visible/prompt:opacity-100"
        style={{
          maxWidth: 'min(calc(100vw - 5rem), calc(var(--team-detail-width) - 3rem), 100%)',
        }}
      >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-claude-text-muted">
          {t('team.systemPrompt.title')}
        </p>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-claude-text">
          {prompt}
        </div>
      </div>
    </>
  )
}

type AgentMessageCardProps = {
  message: AgentMessage
  color: string
  roundIndex: number
  agentName: string
  highlighted?: boolean
  containerRef?: (node: HTMLDivElement | null) => void
}

function AgentMessageCard({
  message,
  color,
  roundIndex,
  agentName,
  highlighted = false,
  containerRef,
}: AgentMessageCardProps) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [showPopup, setShowPopup] = useState(false)

  useEffect(() => {
    if (!copied) return

    const timeoutId = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  const handleCopy = useCallback(() => {
    if (!message.text?.trim()) return

    void navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true)
    })
  }, [message.text])

  const canOpenPopup = Boolean(message.text?.trim() || message.thinking?.trim())

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`space-y-2 rounded-2xl bg-claude-bg-base/50 p-4 outline-none transition-all duration-300 ${
          highlighted ? 'bg-claude-surface/80' : ''
        }`}
        style={highlighted ? { boxShadow: `0 0 0 1px ${color}66, inset 0 0 0 1px ${color}22` } : undefined}
      >
        <div className="flex items-center gap-2 text-xs text-claude-text-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span>{t('team.roundWithNumber', { round: roundIndex + 1 })}</span>
        </div>

        {message.thinking && <ThinkingBubble text={message.thinking} />}

        <div
          className="group/message relative rounded-2xl border px-4 py-3 text-sm leading-relaxed text-claude-text"
          style={{ borderColor: `${color}44`, backgroundColor: `${color}10` }}
        >
          {(canOpenPopup || message.text?.trim()) && (
            <div className="pointer-events-auto absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-all group-hover/message:opacity-100 group-focus-within/message:opacity-100">
              {canOpenPopup ? (
                <button
                  type="button"
                  onClick={() => setShowPopup(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-panel/90 text-claude-muted transition-all hover:bg-claude-surface-2 hover:text-claude-text focus:outline-none focus-visible:text-claude-text"
                  title={t('team.message.openPopup')}
                  aria-label={t('team.message.openPopup')}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H5a1 1 0 00-1 1v4m11-5h4a1 1 0 011 1v4M4 15v4a1 1 0 001 1h4m11-5v4a1 1 0 01-1 1h-4" />
                  </svg>
                </button>
              ) : null}
              {message.text?.trim() ? (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-panel/90 text-claude-muted transition-all hover:bg-claude-surface-2 hover:text-claude-text focus:outline-none focus-visible:text-claude-text"
                  title={copied ? t('common.copied') : t('common.copy')}
                  aria-label={copied ? t('common.copied') : t('common.copy')}
                >
                  {copied ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <rect x="9" y="9" width="10" height="10" rx="2" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2h2" />
                    </svg>
                  )}
                </button>
              ) : null}
            </div>
          )}

          {message.text ? (
            <div className="prose prose-sm prose-invert max-w-none break-words pr-20 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown>{message.text}</ReactMarkdown>
            </div>
          ) : (
            <span className="text-xs text-claude-text-muted">{t('team.message.generating')}</span>
          )}
          {message.isStreaming && <StreamingCursor />}
        </div>
      </div>

      {showPopup && (
        <AgentMessagePopup
          agentName={agentName}
          message={message}
          color={color}
          roundIndex={roundIndex}
          onClose={() => setShowPopup(false)}
        />
      )}
    </>
  )
}

type AgentMessagePopupProps = {
  agentName: string
  message: AgentMessage
  color: string
  roundIndex: number
  onClose: () => void
}

function AgentMessagePopup({
  agentName,
  message,
  color,
  roundIndex,
  onClose,
}: AgentMessagePopupProps) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => window.removeEventListener('keydown', handleKeyDownCapture, true)
  }, [onClose])

  useEffect(() => {
    if (!copied) return
    const timeoutId = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  const handleCopy = useCallback(() => {
    if (!message.text?.trim()) return

    void navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true)
    })
  }, [message.text])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[145] flex items-center justify-center p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label={t('common.close')}
      />

      <div className="relative z-10 flex max-h-[min(84vh,56rem)] w-[min(56rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-[18px] border border-claude-border bg-claude-panel shadow-[0_26px_70px_rgba(0,0,0,0.34)]">
        <div className="flex items-start justify-between gap-4 border-b border-claude-border/70 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <h3 className="truncate text-base font-semibold text-claude-text">{agentName}</h3>
              <span className="rounded-full border border-claude-border/70 px-2 py-0.5 text-[11px] text-claude-text-muted">
                {t('team.roundWithNumber', { round: roundIndex + 1 })}
              </span>
            </div>
            <p className="mt-1 text-xs text-claude-text-muted">{t('team.message.popupDescription')}</p>
          </div>

          <div className="flex items-center gap-2">
            {message.text?.trim() ? (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-claude-border/70 bg-claude-surface px-3 text-xs font-medium text-claude-text-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
              >
                {copied ? t('common.copied') : t('common.copy')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg border border-claude-border/70 bg-claude-surface px-3 text-xs font-medium text-claude-text-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
            >
              {t('common.close')}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {message.thinking ? (
            <div className="mb-4 rounded-2xl border border-blue-500/25 bg-blue-500/8 px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-blue-400">
                {t('team.thinking')}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-claude-text/90">
                {message.thinking}
              </p>
            </div>
          ) : null}

          <div
            className="rounded-[20px] border px-5 py-4 text-[15px] leading-8 text-claude-text"
            style={{ borderColor: `${color}44`, backgroundColor: `${color}12` }}
          >
            {message.text?.trim() ? (
              <div className="prose prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown>{message.text}</ReactMarkdown>
              </div>
            ) : (
              <span className="text-sm text-claude-text-muted">{t('team.message.generating')}</span>
            )}
            {message.isStreaming && <StreamingCursor />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

type Props = {
  agent: TeamAgent
  isFirst: boolean
  roundNumber: number
}

export function SelectedAgentPanel({ agent, isFirst, roundNumber }: Props) {
  const { t } = useI18n()
  const latestMessage = agent.messages.at(-1)
  const preview = latestMessage?.text?.trim() || latestMessage?.thinking?.trim() || ''
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    setHighlightedMessageId(null)
    messageRefs.current = {}
  }, [agent.id])

  useEffect(() => {
    if (!highlightedMessageId) return

    const timeoutId = window.setTimeout(() => {
      setHighlightedMessageId(null)
    }, 1800)

    return () => window.clearTimeout(timeoutId)
  }, [highlightedMessageId])

  const focusMessage = useCallback((messageId: string) => {
    const node = messageRefs.current[messageId]
    if (!node) return

    setHighlightedMessageId(messageId)
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    requestAnimationFrame(() => {
      node.focus({ preventScroll: true })
    })
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[16px] border border-claude-border bg-claude-bg-base/70 backdrop-blur-sm">
      <div
        className="shrink-0 rounded-t-[16px] border-b border-claude-border px-4 py-5"
        style={{ background: `linear-gradient(160deg, ${agent.color}20 0%, transparent 70%)` }}
      >
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <AgentPixelIcon type={agent.iconType} size={56} color={agent.color} />
            {agent.isStreaming && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                  style={{ backgroundColor: agent.color }}
                />
                <span
                  className="relative inline-flex h-4 w-4 rounded-full border border-black/30"
                  style={{ backgroundColor: agent.color }}
                />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-claude-text">{agent.name}</h3>
              {agent.systemPrompt && <SystemPromptHoverCard prompt={agent.systemPrompt} />}
              {isFirst && (
                <span
                  className="rounded-full border px-2 py-1 text-[11px] font-medium"
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.14)',
                    borderColor: 'rgba(59, 130, 246, 0.28)',
                    color: '#2f6fe4',
                  }}
                >
                  {t('team.panel.firstAgent')}
                </span>
              )}
              {agent.isStreaming && (
                <span className="rounded-full px-2 py-1 text-[11px] font-medium" style={{ backgroundColor: `${agent.color}22`, color: agent.color }}>
                  {t('team.panel.speaking')}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-claude-text-muted">{agent.role}</p>
            {agent.description && (
              <p className="mt-2 text-sm leading-relaxed text-claude-text-muted">
                {agent.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-claude-border px-2.5 py-1 text-xs text-claude-text-muted">
            {t('team.panel.messageCount', { count: agent.messages.length })}
          </span>
          <span className="rounded-full border border-claude-border px-2.5 py-1 text-xs text-claude-text-muted">
            {t('team.panel.currentRound', { round: roundNumber })}
          </span>
        </div>

        {preview && latestMessage && (
          <button
            type="button"
            onClick={() => focusMessage(latestMessage.id)}
            className="mt-4 block w-full rounded-2xl border border-claude-border bg-claude-surface/80 px-4 py-3 text-left transition-colors hover:bg-claude-surface focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-border"
          >
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-claude-text/65">
              {t('team.panel.latestCue')}
            </p>
            <p className="line-clamp-3 text-sm leading-relaxed text-claude-text">{preview}</p>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-3 pt-2">
        {agent.messages.length === 0 && !agent.isStreaming && !agent.error ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-claude-border bg-claude-bg/60 text-center">
            <AgentPixelIcon type={agent.iconType} size={60} color={agent.color} />
            <div>
              <p className="text-sm font-medium text-claude-text">{t('team.panel.emptyTitle')}</p>
              <p className="mt-1 text-xs text-claude-text-muted">
                {t('team.panel.emptyDescription')}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {agent.messages.map((message, index) => (
              <AgentMessageCard
                key={message.id}
                message={message}
                color={agent.color}
                roundIndex={index}
                agentName={agent.name}
                highlighted={message.id === highlightedMessageId}
                containerRef={(node) => {
                  if (node) {
                    messageRefs.current[message.id] = node
                  } else {
                    delete messageRefs.current[message.id]
                  }
                }}
              />
            ))}

            {agent.error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {t('team.panel.error', { error: agent.error })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
