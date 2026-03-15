import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { useI18n } from '../../../hooks/useI18n'
import type { GitDraftAction } from '../../../lib/gitUtils'

export function IconTooltipButton({
  tooltip,
  tooltipAlign = 'center',
  tooltipSide = 'top',
  wrapperClassName,
  className,
  children,
  ...props
}: {
  tooltip: string
  tooltipAlign?: 'center' | 'left' | 'right'
  tooltipSide?: 'top' | 'bottom'
  wrapperClassName?: string
  className: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const tooltipPositionClass =
    tooltipAlign === 'right'
      ? 'right-0'
      : tooltipAlign === 'left'
        ? 'left-0'
        : 'left-1/2 -translate-x-1/2'
  const tooltipSideClass =
    tooltipSide === 'bottom'
      ? 'top-full mt-1.5'
      : 'bottom-full mb-1.5'

  return (
    <div className={`relative inline-flex group/tooltip ${wrapperClassName ?? ''}`}>
      <button {...props} className={className} title={tooltip} aria-label={tooltip}>
        {children}
      </button>
      <div className={`pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-claude-border bg-claude-panel px-2 py-1 text-[10px] font-medium text-claude-text opacity-0 transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${tooltipPositionClass} ${tooltipSideClass}`}>
        {tooltip}
      </div>
    </div>
  )
}

export function GitDraftActions({
  disabled,
  onCreateDraft,
  showSummary = true,
  showCommitMessage = true,
}: {
  disabled: boolean
  onCreateDraft: (action: GitDraftAction) => void
  showSummary?: boolean
  showCommitMessage?: boolean
}) {
  const { language } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => onCreateDraft('review')}
        disabled={disabled}
        className="rounded-xl border border-claude-border px-2.5 py-1 text-[11px] text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
      >
        {language === 'en' ? 'Review' : '리뷰'}
      </button>
      {showSummary && (
        <button
          type="button"
          onClick={() => onCreateDraft('summary')}
          disabled={disabled}
          className="rounded-xl border border-claude-border px-2.5 py-1 text-[11px] text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
        >
          {language === 'en' ? 'Summary' : '요약'}
        </button>
      )}
      {showCommitMessage && (
        <button
          type="button"
          onClick={() => onCreateDraft('commitMessage')}
          disabled={disabled}
          className="rounded-xl border border-claude-border px-2.5 py-1 text-[11px] text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
        >
          {language === 'en' ? 'Commit message' : '커밋 메시지'}
        </button>
      )}
    </div>
  )
}
