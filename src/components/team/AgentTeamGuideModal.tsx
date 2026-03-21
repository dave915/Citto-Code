import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import guideMarkdownKo from '../../content/agent-team-guide-app.md?raw'
import guideMarkdownEn from '../../content/agent-team-guide-app.en.md?raw'
import { useI18n } from '../../hooks/useI18n'
import { pickLocalized } from '../../lib/i18n'

type Props = {
  onClose: () => void
}

export function AgentTeamGuideModal({ onClose }: Props) {
  const { language, t } = useI18n()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  if (typeof document === 'undefined') return null

  const guideMarkdown = pickLocalized(language, { ko: guideMarkdownKo, en: guideMarkdownEn })
  const closeLabel = t('team.guideModal.close')

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label={closeLabel}
      />

      <div className="relative z-10 flex h-[min(86vh,52rem)] w-[min(56rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-[16px] border border-claude-border/90 bg-claude-panel shadow-[0_24px_56px_rgba(0,0,0,0.34)]">
        <div className="flex shrink-0 items-center justify-between border-b border-claude-border/90 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-claude-text">{t('team.guideModal.title')}</h2>
            <p className="text-sm text-claude-text">
              {t('team.guideModal.description')}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-claude-text transition-colors hover:bg-claude-bg-hover"
            aria-label={closeLabel}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-claude-text">
          <div
            className="prose prose-sm max-w-none
              prose-headings:text-claude-text
              prose-p:text-claude-text
              prose-li:text-claude-text
              prose-strong:text-claude-text
              prose-code:text-claude-text
              prose-pre:border prose-pre:border-claude-border prose-pre:bg-claude-bg prose-pre:text-claude-text
              prose-blockquote:border-l-claude-border prose-blockquote:text-claude-text
              prose-hr:border-claude-border
              prose-table:block prose-table:w-full prose-table:overflow-x-auto
              prose-thead:border-b prose-thead:border-claude-border
              prose-tr:border-b prose-tr:border-claude-border/70
              prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-claude-text
              prose-td:px-3 prose-td:py-2 prose-td:text-claude-text
              prose-a:text-blue-600"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{guideMarkdown}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
