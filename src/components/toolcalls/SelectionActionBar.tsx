import { useI18n } from '../../hooks/useI18n'

export function SelectionActionBar({
  label,
  onAskAgain,
  onOpenComment,
  commentOpen,
  commentValue,
  onCommentChange,
  onSubmitComment,
  onCancelComment,
}: {
  label: string
  onAskAgain: () => void
  onOpenComment: () => void
  commentOpen: boolean
  commentValue: string
  onCommentChange: (value: string) => void
  onSubmitComment: () => void
  onCancelComment: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="mt-2 rounded-lg border border-claude-border/70 bg-claude-panel px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-claude-muted">{label}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenComment}
            className="inline-flex items-center gap-1 rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
          >
            {t('selection.addComment')}
          </button>
          <button
            type="button"
            onClick={onAskAgain}
            className="inline-flex items-center gap-1 rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
          >
            {t('selection.askAgain')}
          </button>
        </div>
      </div>

      {commentOpen && (
        <div className="mt-2 flex items-end gap-2">
          <textarea
            value={commentValue}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder={t('selection.placeholder')}
            rows={2}
            autoFocus
            className="min-h-[56px] flex-1 resize-none rounded-md border border-claude-border bg-claude-surface px-3 py-2 text-[12px] leading-5 text-claude-text outline-none placeholder:text-claude-muted focus-visible:ring-1 focus-visible:ring-white/10"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onCancelComment}
              className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onSubmitComment}
              disabled={!commentValue.trim()}
              className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 disabled:opacity-40"
            >
              {t('selection.addToInput')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
