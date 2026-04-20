import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useI18n } from '../../hooks/useI18n'
import type { AgentMessage } from '../../store/teamTypes'
import { TeamButton, TeamChip, TeamPanel } from './teamDesignSystem'
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
      overlayClassName="z-[190]"
    >
      <TeamPanel className="relative z-10 flex max-h-[min(88vh,60rem)] w-[min(72rem,calc(100vw-2rem))] flex-col overflow-hidden shadow-[0_26px_70px_rgba(0,0,0,0.34)]">
        <div className="flex items-start justify-between gap-4 border-b border-claude-border/70 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <h3 className="truncate text-base font-semibold text-claude-text">{agentName}</h3>
              <TeamChip>
                {t('team.roundWithNumber', { round: roundIndex + 1 })}
              </TeamChip>
            </div>
            <p className="mt-1 text-xs text-claude-muted">{t('team.message.popupDescription')}</p>
          </div>

          <div className="flex items-center gap-2">
            {message.text.trim() ? (
              <TeamButton onClick={copy} tone="secondary" aria-label={copyLabel}>
                {copyLabel}
              </TeamButton>
            ) : null}
            <TeamButton onClick={onClose} tone="ghost">
              {t('common.close')}
            </TeamButton>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {message.thinking ? <ThinkingBubble text={message.thinking} /> : null}

          <div
            className="rounded-lg border border-claude-border bg-claude-bg/70 px-5 py-4 text-[15px] leading-8 text-claude-text"
            style={{ boxShadow: `inset 2px 0 0 ${color}99` }}
          >
            {message.text.trim() ? (
              <div className="overflow-x-auto">
                <div className="prose prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-white/10 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-white/10 [&_th]:bg-white/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <span className="text-sm text-claude-muted">{t('team.message.generating')}</span>
            )}
            {message.isStreaming && <StreamingCursor />}
          </div>
        </div>
      </TeamPanel>
    </TeamOverlayPortal>
  )
}
