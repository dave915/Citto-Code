import { useI18n } from '../../hooks/useI18n'
import { TeamButton, TeamEyebrow, TeamPanel } from './teamDesignSystem'

type ThinkingBubbleProps = {
  compact?: boolean
  text: string
}

export function ThinkingBubble({ compact = false, text }: ThinkingBubbleProps) {
  const { t } = useI18n()

  if (!text.trim()) return null

  return (
    <div className="rounded-md border border-claude-border/80 bg-claude-bg/55 px-2.5 py-1.5">
      <p
        className={`mb-1 font-semibold uppercase tracking-wide ${
          compact ? 'text-[11px] text-claude-orange' : 'text-[11px] text-claude-orange'
        }`}
      >
        {t('team.thinking')}
      </p>
      <p
        className={
          compact
            ? 'line-clamp-4 text-xs leading-5 text-claude-text/90'
            : 'whitespace-pre-wrap break-words text-[13px] leading-6 text-claude-text/90'
        }
      >
        {text}
      </p>
    </div>
  )
}

export function StreamingCursor() {
  return <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle bg-current" />
}

export function SystemPromptHoverCard({ prompt }: { prompt: string }) {
  const { t } = useI18n()

  if (!prompt.trim()) return null

  return (
    <>
      <TeamButton
        className="peer/prompt"
        size="icon"
        tone="ghost"
        aria-label={t('team.systemPrompt.show')}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v5m0-8h.01" />
        </svg>
      </TeamButton>
      <TeamPanel
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-[24rem] p-3 opacity-0 shadow-none transition-opacity peer-hover/prompt:opacity-100 peer-focus-visible/prompt:opacity-100"
        style={{
          maxWidth: 'min(calc(100vw - 5rem), calc(var(--team-detail-width) - 3rem), 100%)',
        }}
      >
        <TeamEyebrow className="mb-2">
          {t('team.systemPrompt.title')}
        </TeamEyebrow>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-claude-text">
          {prompt}
        </div>
      </TeamPanel>
    </>
  )
}
