import { useI18n } from '../../hooks/useI18n'

type ThinkingBubbleProps = {
  compact?: boolean
  text: string
}

export function ThinkingBubble({ compact = false, text }: ThinkingBubbleProps) {
  const { t } = useI18n()

  if (!text.trim()) return null

  return (
    <div className="rounded-xl border border-blue-500/25 bg-blue-500/8 px-3 py-2">
      <p
        className={`mb-1 font-semibold uppercase tracking-wide ${
          compact ? 'text-[11px] text-blue-500' : 'text-[11px] text-blue-400'
        }`}
      >
        {t('team.thinking')}
      </p>
      <p
        className={
          compact
            ? 'line-clamp-4 text-xs leading-relaxed text-claude-text/90'
            : 'whitespace-pre-wrap break-words text-sm leading-relaxed text-claude-text/90'
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
