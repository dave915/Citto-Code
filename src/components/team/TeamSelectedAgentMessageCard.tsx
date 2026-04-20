import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useI18n } from '../../hooks/useI18n'
import type { AgentMessage } from '../../store/teamTypes'
import { TeamButton } from './teamDesignSystem'
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
        className={`space-y-2 border-l pl-3 pr-1 outline-none transition-colors duration-300 ${
          highlighted ? 'border-claude-orange/60 bg-claude-orange/6' : 'border-claude-border/70'
        }`}
        style={highlighted ? { boxShadow: `inset 1px 0 0 ${color}55` } : undefined}
      >
        <div className="flex items-center gap-2 text-xs text-claude-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span>{t('team.roundWithNumber', { round: roundIndex + 1 })}</span>
        </div>

        {message.thinking ? <ThinkingBubble compact text={message.thinking} /> : null}

        <div
          className="group/message relative rounded-lg border border-claude-border bg-claude-bg/70 px-4 py-3 text-sm leading-relaxed text-claude-text"
          style={{ boxShadow: `inset 2px 0 0 ${color}99` }}
        >
          {(canOpenPopup || message.text.trim()) && (
            <div className="pointer-events-auto absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-all group-hover/message:opacity-100 group-focus-within/message:opacity-100">
              {canOpenPopup ? (
                <TeamButton
                  onClick={() => setShowPopup(true)}
                  size="icon"
                  tone="secondary"
                  title={t('team.message.openPopup')}
                  aria-label={t('team.message.openPopup')}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H5a1 1 0 00-1 1v4m11-5h4a1 1 0 011 1v4M4 15v4a1 1 0 001 1h4m11-5v4a1 1 0 01-1 1h-4" />
                  </svg>
                </TeamButton>
              ) : null}
              {message.text.trim() ? (
                <TeamButton
                  onClick={copy}
                  size="icon"
                  tone="secondary"
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
                </TeamButton>
              ) : null}
            </div>
          )}

          {message.text.trim() ? (
            <div className="overflow-x-auto pr-20">
              <div className="prose prose-sm prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-white/10 [&_th]:bg-white/5 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <span className="text-xs text-claude-muted">{t('team.message.generating')}</span>
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
