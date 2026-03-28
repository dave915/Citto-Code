import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useI18n } from '../../hooks/useI18n'
import type { AgentMessage } from '../../store/teamTypes'
import { useCopyFeedback } from './teamOverlayShared'
import { TeamSelectedAgentMessagePopup } from './TeamSelectedAgentMessagePopup'
import { StreamingCursor, ThinkingBubble } from './teamSelectedAgentShared'

type TeamSelectedAgentMessageCardProps = {
  agentName: string
  color: string
  containerRef?: (node: HTMLDivElement | null) => void
  highlighted?: boolean
  message: AgentMessage
  roundIndex: number
}

export function TeamSelectedAgentMessageCard({
  agentName,
  color,
  containerRef,
  highlighted = false,
  message,
  roundIndex,
}: TeamSelectedAgentMessageCardProps) {
  const { t } = useI18n()
  const [showPopup, setShowPopup] = useState(false)
  const { copied, copy } = useCopyFeedback(message.text)
  const copyLabel = copied ? t('common.copied') : t('common.copy')
  const canOpenPopup = Boolean(message.text.trim() || message.thinking?.trim())

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

        {message.thinking ? <ThinkingBubble compact text={message.thinking} /> : null}

        <div
          className="group/message relative rounded-2xl border px-4 py-3 text-sm leading-relaxed text-claude-text"
          style={{ borderColor: `${color}44`, backgroundColor: `${color}10` }}
        >
          {(canOpenPopup || message.text.trim()) && (
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
              {message.text.trim() ? (
                <button
                  type="button"
                  onClick={copy}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-panel/90 text-claude-muted transition-all hover:bg-claude-surface-2 hover:text-claude-text focus:outline-none focus-visible:text-claude-text"
                  title={copyLabel}
                  aria-label={copyLabel}
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

          {message.text.trim() ? (
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
        <TeamSelectedAgentMessagePopup
          agentName={agentName}
          color={color}
          message={message}
          onClose={() => setShowPopup(false)}
          roundIndex={roundIndex}
        />
      )}
    </>
  )
}
