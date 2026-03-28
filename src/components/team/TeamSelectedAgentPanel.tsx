import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { TeamAgent } from '../../store/teamTypes'
import { AgentPixelIcon } from './AgentPixelIcon'
import { TeamSelectedAgentMessageCard } from './TeamSelectedAgentMessageCard'
import { SystemPromptHoverCard } from './teamSelectedAgentShared'

type Props = {
  agent: TeamAgent
  isFirst: boolean
  roundNumber: number
}

export function SelectedAgentPanel({ agent, isFirst, roundNumber }: Props) {
  const { t } = useI18n()
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const latestMessage = agent.messages.at(-1)
  const preview = latestMessage?.text.trim() || latestMessage?.thinking?.trim() || ''

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
              <TeamSelectedAgentMessageCard
                key={message.id}
                agentName={agent.name}
                color={agent.color}
                containerRef={(node) => {
                  if (node) {
                    messageRefs.current[message.id] = node
                  } else {
                    delete messageRefs.current[message.id]
                  }
                }}
                highlighted={message.id === highlightedMessageId}
                message={message}
                roundIndex={index}
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
