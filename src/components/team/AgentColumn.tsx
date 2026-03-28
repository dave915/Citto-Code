import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AgentPixelIcon } from './AgentPixelIcon'
import { useI18n } from '../../hooks/useI18n'
import type { TeamAgent, AgentMessage } from '../../store/teamTypes'

type Props = {
  agent: TeamAgent
  roundNumber: number
  isActive: boolean
  isFirst: boolean
}

function ThinkingBubble({ text }: { text: string }) {
  const { t } = useI18n()

  if (!text?.trim()) return null
  return (
    <div className="mb-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-purple-400">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M6 4v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-xs font-medium text-purple-400">{t('team.thinking')}</span>
      </div>
      <p className="line-clamp-3 text-xs text-purple-300/70">{text}</p>
    </div>
  )
}

function StreamingCursor() {
  return (
    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle bg-current" />
  )
}

function MessageBubble({
  message,
  agentColor,
  roundIndex,
}: {
  message: AgentMessage
  agentColor: string
  roundIndex: number
}) {
  const { t } = useI18n()

  return (
    <div className="group relative">
      <div className="mb-1 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: agentColor }} />
        <span className="text-xs text-claude-text-muted">
          {t('team.roundWithNumber', { round: roundIndex + 1 })}
        </span>
      </div>

      {message.thinking && <ThinkingBubble text={message.thinking} />}

      <div
        className="rounded-xl rounded-tl-sm border px-3 py-2.5 text-sm leading-relaxed text-claude-text"
        style={{ borderColor: `${agentColor}44`, backgroundColor: `${agentColor}08` }}
      >
        {message.text ? (
          <div className="overflow-x-auto">
            <div className="prose prose-sm prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-white/10 [&_th]:bg-white/5 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <span className="text-xs text-claude-text-muted">{t('team.message.generating')}</span>
        )}
        {message.isStreaming && <StreamingCursor />}
      </div>
    </div>
  )
}

export function AgentColumn({ agent, roundNumber: _roundNumber, isActive, isFirst }: Props) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showMeta, setShowMeta] = useState(false)

  useEffect(() => {
    if (agent.isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [agent.messages, agent.isStreaming])

  return (
    <div
      className={`
        flex min-w-0 flex-1 flex-col rounded-xl border transition-all duration-300
        ${isActive ? 'border-opacity-100 shadow-lg' : 'border-claude-border'}
      `}
      style={{
        borderColor: isActive ? `${agent.color}aa` : undefined,
        boxShadow: isActive ? `0 0 0 1px ${agent.color}44, 0 4px 20px ${agent.color}22` : undefined,
      }}
    >
      <div
        className="rounded-t-xl border-b border-claude-border px-4 py-3"
        style={{
          background: `linear-gradient(135deg, ${agent.color}15 0%, transparent 100%)`,
        }}
      >
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <AgentPixelIcon type={agent.iconType} size={40} color={agent.color} />
            {agent.isStreaming && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: agent.color }} />
              </span>
            )}
            {!agent.isStreaming && agent.messages.length > 0 && !agent.error && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-green-500">
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                  <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate whitespace-nowrap text-sm font-semibold text-claude-text">
                {agent.name}
              </h3>
              {isFirst && (
                <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-400">
                  {t('team.panel.firstAgent')}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate whitespace-nowrap text-xs text-claude-text-muted">
              {agent.role}
            </p>
            {agent.model && (
              <span className="mt-1 inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-300">
                {agent.model}
              </span>
            )}
            {agent.description && (
              <p className="mt-1 truncate whitespace-nowrap text-[11px] leading-relaxed text-claude-text-muted">
                {agent.description}
              </p>
            )}
          </div>

          {agent.messages.length > 0 && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${agent.color}22`, color: agent.color }}
            >
              {t('team.column.messageCount', { count: agent.messages.length })}
            </span>
          )}
        </div>

        {(agent.description || agent.systemPrompt) && (
          <div className="mt-3 flex justify-start">
            <button
              type="button"
              onClick={() => setShowMeta((current) => !current)}
              className="rounded-full border border-claude-border px-2.5 py-1 text-[11px] font-medium leading-none text-claude-text-muted transition-colors hover:border-claude-border-hover hover:text-claude-text"
            >
              {showMeta ? t('team.column.hideMeta') : t('team.column.showMeta')}
            </button>
          </div>
        )}
      </div>

      {showMeta && (
        <div className="space-y-3 border-b border-claude-border bg-claude-bg-base/60 px-4 py-3">
          {agent.description && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-claude-text-muted">
                {t('team.column.description')}
              </p>
              <p className="text-xs leading-relaxed text-claude-text">
                {agent.description}
              </p>
            </div>
          )}

          {agent.systemPrompt && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-claude-text-muted">
                {t('team.systemPrompt.title')}
              </p>
              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-xs leading-relaxed text-claude-text">
                {agent.systemPrompt}
              </div>
            </div>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4" style={{ minHeight: 0 }}>
        {agent.messages.length === 0 && !agent.isStreaming && (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-8 opacity-40">
            <AgentPixelIcon type={agent.iconType} size={48} color={agent.color} />
            <p className="text-center text-sm text-claude-text-muted">
              {t('team.column.empty')}
            </p>
          </div>
        )}

        {agent.messages.map((msg, index) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            agentColor={agent.color}
            roundIndex={index}
          />
        ))}

        {agent.error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <p className="text-xs text-red-400">{t('team.panel.error', { error: agent.error })}</p>
          </div>
        )}
      </div>
    </div>
  )
}
