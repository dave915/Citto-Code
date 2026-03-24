import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { useI18n } from '../../hooks/useI18n'
import type { BtwCard } from '../../store/sessions'

type Props = {
  cards: BtwCard[]
  onToggle: (cardId: string) => void
  className?: string
}

export function BtwCardStack({ cards, onToggle, className = '' }: Props) {
  const { t } = useI18n()

  if (cards.length === 0) return null

  return (
    <div className={`${className} space-y-1.5`}>
      {cards.map((card) => {
        const resultText = card.answer.trim()

        return (
          <section key={card.id} className="px-0.5 py-1">
            <button
              type="button"
              onClick={() => onToggle(card.id)}
              className="flex w-full items-center gap-1.5 text-left text-[12px] leading-5 text-claude-muted outline-none transition-colors hover:text-claude-text focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
            >
              <svg
                className={`h-3 w-3 flex-shrink-0 transition-transform ${card.isOpen ? 'rotate-90' : 'rotate-0'}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
              </svg>
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-muted/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M6.5 12h11M8 17h8" />
              </svg>
              <span className="flex-shrink-0">{t('input.btw.title')}</span>
              <span className="truncate text-[12px] text-claude-muted/85">{card.question}</span>
            </button>

            {card.isOpen ? (
              <div className="ml-[10px] mt-1 border-l border-claude-border/70 pl-3">
                <div className="mb-1 text-[12px] leading-6 text-claude-muted/90">{card.question}</div>
                {resultText ? (
                  <div className="prose max-w-none break-words text-[13px] leading-6 [overflow-wrap:anywhere]">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                      {resultText}
                    </ReactMarkdown>
                  </div>
                ) : card.isStreaming ? (
                  <div className="flex items-center gap-2 py-1 text-sm text-claude-muted">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" strokeDasharray="40" strokeDashoffset="14" />
                    </svg>
                    <span>{t('input.btw.loading')}</span>
                  </div>
                ) : (
                  <div className="text-sm text-claude-muted">{t('input.btw.emptyResult')}</div>
                )}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
