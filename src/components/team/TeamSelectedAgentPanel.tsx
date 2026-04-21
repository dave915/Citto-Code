import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { TeamAgent } from '../../store/teamTypes'
import { AgentPixelIcon } from './AgentPixelIcon'
import { TeamChip, TeamEyebrow, TeamPanel } from './teamDesignSystem'
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
    <TeamPanel className="flex h-full min-h-0 flex-col overflow-hidden bg-claude-panel/95 backdrop-blur-sm">
      <div
        className="shrink-0 border-b border-claude-border px-3 py-3"
        style={{ backgroundImage: `linear-gradient(180deg, ${agent.color}14 0%, transparent 72%)` }}
      >
        <div className="flex items-start gap-4">
          <div className="relative shrink-0 rounded-md border border-claude-border bg-claude-bg p-1.5">
            <AgentPixelIcon type={agent.iconType} size={48} color={agent.color} />
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
              <h3 className="text-[14px] font-semibold text-claude-text">{agent.name}</h3>
              {agent.systemPrompt && <SystemPromptHoverCard prompt={agent.systemPrompt} />}
              {isFirst && (
                <TeamChip tone="accent">
                  {t('team.panel.firstAgent')}
                </TeamChip>
              )}
              {agent.isStreaming && (
                <TeamChip>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: agent.color }} />
                  {t('team.panel.speaking')}
                </TeamChip>
              )}
            </div>
            <p className="mt-1 text-[12px] text-claude-muted">{agent.role}</p>
            {agent.description && (
              <p className="mt-2 text-[12px] leading-5 text-claude-muted">
                {agent.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TeamChip>
            {t('team.panel.messageCount', { count: agent.messages.length })}
          </TeamChip>
          <TeamChip>
            {t('team.panel.currentRound', { round: roundNumber })}
          </TeamChip>
        </div>

        {preview && latestMessage && (
          <button
            type="button"
            onClick={() => focusMessage(latestMessage.id)}
            className="mt-3 block w-full rounded-md border border-claude-border bg-claude-bg/70 px-3 py-2.5 text-left transition-colors hover:bg-claude-bg focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/30"
          >
            <TeamEyebrow className="mb-1 text-claude-muted">
              {t('team.panel.latestCue')}
            </TeamEyebrow>
            <p className="line-clamp-3 text-[13px] leading-5 text-claude-text">{preview}</p>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-3 pt-2">
        {agent.messages.length === 0 && !agent.isStreaming && !agent.error ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-claude-border bg-claude-bg/60 text-center">
            <AgentPixelIcon type={agent.iconType} size={60} color={agent.color} />
            <div>
              <p className="text-sm font-medium text-claude-text">{t('team.panel.emptyTitle')}</p>
              <p className="mt-1 text-xs text-claude-muted">
                {t('team.panel.emptyDescription')}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
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
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
                {t('team.panel.error', { error: agent.error })}
              </div>
            )}
          </div>
        )}
      </div>
    </TeamPanel>
  )
}
