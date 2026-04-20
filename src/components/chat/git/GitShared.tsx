import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { useI18n } from '../../../hooks/useI18n'
import type { GitDraftAction } from '../../../lib/gitUtils'
import { AppButton } from '../../ui/appDesignSystem'

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
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <AppButton
        onClick={() => onCreateDraft('review')}
        disabled={disabled}
        tone="ghost"
        className="h-7 px-2.5 text-[11px]"
      >
        {t('git.shared.review')}
      </AppButton>
      {showSummary && (
        <AppButton
          onClick={() => onCreateDraft('summary')}
          disabled={disabled}
          tone="ghost"
          className="h-7 px-2.5 text-[11px]"
        >
          {t('git.shared.summary')}
        </AppButton>
      )}
      {showCommitMessage && (
        <AppButton
          onClick={() => onCreateDraft('commitMessage')}
          disabled={disabled}
          tone="ghost"
          className="h-7 px-2.5 text-[11px]"
        >
          {t('git.shared.commitMessage')}
        </AppButton>
      )}
    </div>
  )
}
