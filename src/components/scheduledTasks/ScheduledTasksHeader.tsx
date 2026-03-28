import { useI18n } from '../../hooks/useI18n'

type Props = {
  activeTaskCount: number
  inboxBadgeCount: number
  onOpenInbox: () => void
  onClose: () => void
}

export function ScheduledTasksHeader({
  activeTaskCount,
  inboxBadgeCount,
  onOpenInbox,
  onClose,
}: Props) {
  const { t } = useI18n()
  return (
    <>
      <div className="draggable-region flex h-14 flex-shrink-0 items-center justify-between border-b border-claude-border bg-claude-panel px-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-claude-text">{t('scheduled.header.title')}</h2>
          <span className="rounded-full border border-claude-border bg-claude-surface px-2 py-0.5 text-[11px] text-claude-muted">
            {t('scheduled.header.activeCount', { count: activeTaskCount })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenInbox}
            className="rounded-xl border border-claude-border bg-claude-bg px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface"
          >
            {t('scheduled.header.inbox')}
            <span className="ml-2 rounded-full border border-claude-border bg-claude-panel px-1.5 py-0.5 text-[10px] text-claude-muted">
              {inboxBadgeCount}
            </span>
          </button>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title={t('common.close')}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="border-b border-claude-border bg-claude-panel/80 px-5 py-3">
        <div className="rounded-[12px] border border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-xs font-semibold text-claude-text">{t('scheduled.header.beforeUse')}</p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-claude-muted">
            <li>{t('scheduled.header.tip.appOpen')}</li>
            <li>{t('scheduled.header.tip.bypass')}</li>
            <li>{t('scheduled.header.tip.exceptions')}</li>
            <li>{t('scheduled.header.tip.missedRuns')}</li>
          </ul>
        </div>
      </div>
    </>
  )
}
