import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { AgentPixelIcon } from './AgentPixelIcon'
import type { TeamAgent, AgentMessage } from '../../store/teamTypes'
import type { AgentIconType } from './AgentPixelIcon'

type AgentWithMeta = TeamAgent & { iconType?: AgentIconType }

type Props = {
  agent: AgentWithMeta
  roundNumber: number
  isActive: boolean
  isFirst: boolean
}

function ThinkingBubble({ text }: { text: string }) {
  if (!text?.trim()) return null
  return (
    <div className="mb-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-purple-400">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M6 4v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-xs font-medium text-purple-400">생각 중...</span>
      </div>
      <p className="text-xs text-purple-300/70 line-clamp-3">{text}</p>
    </div>
  )
}

function StreamingCursor() {
  return (
    <span className="inline-block h-4 w-0.5 animate-pulse bg-current ml-0.5 align-middle" />
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
  return (
    <div className="group relative">
      <div className="mb-1 flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: agentColor }}
        />
        <span className="text-xs text-claude-text-muted">Round {roundIndex + 1}</span>
      </div>

      {message.thinking && <ThinkingBubble text={message.thinking} />}

      <div
        className="rounded-xl rounded-tl-sm border px-3 py-2.5 text-sm text-claude-text leading-relaxed"
        style={{ borderColor: agentColor + '44', backgroundColor: agentColor + '08' }}
      >
        {message.text ? (
          <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown>{message.text}</ReactMarkdown>
          </div>
        ) : (
          <span className="text-claude-text-muted text-xs">응답 생성 중...</span>
        )}
        {message.isStreaming && <StreamingCursor />}
      </div>
    </div>
  )
}

export function AgentColumn({ agent, roundNumber, isActive, isFirst }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const iconType = (agent as AgentWithMeta).iconType ?? 'custom'

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (agent.isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [agent.messages, agent.isStreaming])

  return (
    <div
      className={`
        flex min-w-0 flex-1 flex-col rounded-xl border transition-all duration-300
        ${isActive
          ? 'border-opacity-100 shadow-lg'
          : 'border-claude-border'
        }
      `}
      style={{
        borderColor: isActive ? agent.color + 'aa' : undefined,
        boxShadow: isActive ? `0 0 0 1px ${agent.color}44, 0 4px 20px ${agent.color}22` : undefined,
      }}
    >
      {/* Agent header */}
      <div
        className="flex items-center gap-3 rounded-t-xl border-b border-claude-border px-4 py-3"
        style={{
          background: `linear-gradient(135deg, ${agent.color}15 0%, transparent 100%)`,
        }}
      >
        <div className="relative shrink-0">
          <AgentPixelIcon type={iconType} size={40} color={agent.color} />
          {/* Status indicator */}
          {agent.isStreaming && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ backgroundColor: agent.color }}
              />
              <span
                className="relative inline-flex h-3 w-3 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
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
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-claude-text text-sm">{agent.name}</h3>
            {isFirst && (
              <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-400">
                선발
              </span>
            )}
          </div>
          <p className="truncate text-xs text-claude-text-muted">{agent.role}</p>
        </div>

        {/* Round badge */}
        {agent.messages.length > 0 && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: agent.color + '22', color: agent.color }}
          >
            {agent.messages.length}회
          </span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ minHeight: 0 }}
      >
        {agent.messages.length === 0 && !agent.isStreaming && (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-8 opacity-40">
            <AgentPixelIcon type={iconType} size={48} color={agent.color} />
            <p className="text-sm text-claude-text-muted text-center">
              토론이 시작되면 이곳에<br />응답이 표시됩니다
            </p>
          </div>
        )}

        {agent.messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            agentColor={agent.color}
            roundIndex={i}
          />
        ))}

        {/* Error state */}
        {agent.error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <p className="text-xs text-red-400">오류: {agent.error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
