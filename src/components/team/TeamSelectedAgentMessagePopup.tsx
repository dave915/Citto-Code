import ReactMarkdown from 'react-markdown'
import { useI18n } from '../../hooks/useI18n'
import type { AgentMessage } from '../../store/teamTypes'
import { TeamOverlayPortal, useCopyFeedback, useEscapeToClose } from './teamOverlayShared'
import { StreamingCursor, ThinkingBubble } from './teamSelectedAgentShared'

type TeamSelectedAgentMessagePopupProps = {
  agentName: string
  color: string
  message: AgentMessage
  onClose: () => void
  roundIndex: number
}

export function TeamSelectedAgentMessagePopup({
  agentName,
  color,
  message,
  onClose,
  roundIndex,
}: TeamSelectedAgentMessagePopupProps) {
  const { t } = useI18n()
  const { copied, copy } = useCopyFeedback(message.text)
  const copyLabel = copied ? t('common.copied') : t('common.copy')

  useEscapeToClose(onClose)

  return (
    <TeamOverlayPortal
      backdropClassName="bg-black/40 backdrop-blur-[2px]"
      closeLabel={t('common.close')}
      onClose={onClose}
      overlayClassName="z-[145]"
    >
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
            {message.text.trim() ? (
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-claude-border/70 bg-claude-surface px-3 text-xs font-medium text-claude-text-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
                aria-label={copyLabel}
              >
                {copyLabel}
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
          {message.thinking ? <ThinkingBubble text={message.thinking} /> : null}

          <div
            className="rounded-[20px] border px-5 py-4 text-[15px] leading-8 text-claude-text"
            style={{ borderColor: `${color}44`, backgroundColor: `${color}12` }}
          >
            {message.text.trim() ? (
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
    </TeamOverlayPortal>
  )
}
