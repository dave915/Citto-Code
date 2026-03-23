import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { useI18n } from '../../hooks/useI18n'
import { extractBtwQuestion } from '../input/inputUtils'
import type { BtwState } from '../../hooks/claudeStream/types'

export function BtwOverlay({
  state,
  onClose,
}: {
  state: BtwState
  onClose: () => void
}) {
  const { t } = useI18n()
  const prompt = extractBtwQuestion(state.prompt) ?? state.prompt
  const resultText = state.answer.trim() || state.error?.trim() || ''

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (state.status === 'running') return

      const target = event.target as HTMLElement | null
      const isTextInput = target instanceof HTMLTextAreaElement
        || target instanceof HTMLInputElement
        || target?.isContentEditable

      if (isTextInput) return

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, state.status])

  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-claude-border bg-claude-panel shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex items-center gap-3 border-b border-claude-border/70 bg-claude-surface px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-claude-border bg-claude-surface-2 text-claude-text">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h8M7 10h10M6 14h12M8 18h8" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-claude-text">{t('input.btw.title')}</div>
          <div className="truncate text-xs text-claude-muted">{prompt || t('input.btw.noPrompt')}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
          state.status === 'running'
            ? 'border-sky-400/30 bg-sky-400/10 text-sky-100'
            : state.status === 'error'
              ? 'border-red-400/30 bg-red-400/10 text-red-100'
              : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
        }`}>
          {state.status === 'running'
            ? t('input.btw.running')
            : state.status === 'error'
              ? t('input.btw.error')
              : t('input.btw.done')}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-claude-border/70 bg-claude-surface px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
        >
          {t('common.close')}
        </button>
      </div>

      <div className="px-4 py-3">
        {state.status === 'running' ? (
          <div className="flex items-center gap-2 text-sm text-claude-muted">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" strokeDasharray="40" strokeDashoffset="14" />
            </svg>
            <span>{t('input.btw.loading')}</span>
          </div>
        ) : resultText ? (
          <div className="prose max-w-none break-words text-[13px] leading-6 [overflow-wrap:anywhere]">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {resultText}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm text-claude-muted">{t('input.btw.emptyResult')}</div>
        )}
      </div>

      {state.status !== 'running' && (
        <div className="border-t border-claude-border/70 bg-claude-surface/80 px-4 py-2 text-[11px] text-claude-muted">
          {t('input.btw.dismissHint')}
        </div>
      )}
    </section>
  )
}
