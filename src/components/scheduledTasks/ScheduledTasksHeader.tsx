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
  const { language } = useI18n()
  return (
    <>
      <div className="draggable-region flex h-14 flex-shrink-0 items-center justify-between border-b border-claude-border bg-claude-panel px-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-claude-text">Schedule</h2>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
            Beta
          </span>
          <span className="rounded-full border border-claude-border bg-claude-surface px-2 py-0.5 text-[11px] text-claude-muted">
            {language === 'en' ? `Active ${activeTaskCount}` : `활성 ${activeTaskCount}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenInbox}
            className="rounded-xl border border-claude-border bg-claude-bg px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface"
          >
            Results Inbox
            <span className="ml-2 rounded-full border border-claude-border bg-claude-panel px-1.5 py-0.5 text-[10px] text-claude-muted">
              {inboxBadgeCount}
            </span>
          </button>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title={language === 'en' ? 'Close' : '닫기'}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="border-b border-claude-border bg-claude-panel/80 px-5 py-3">
        <div className="rounded-[22px] border border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-xs font-semibold text-claude-text">{language === 'en' ? 'Before you use it' : '사용 전 유의사항'}</p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-claude-muted">
            <li>{language === 'en' ? 'The app must stay open for scheduled tasks to run.' : '앱이 켜져 있어야 예약 작업이 실행됩니다.'}</li>
            <li>{language === 'en' ? 'Bypass permission automatically approves file edits and external commands.' : 'Bypass 권한은 파일 수정과 외부 명령까지 자동 승인합니다.'}</li>
            <li>{language === 'en' ? 'If a task lands in quiet hours or skip days, it is postponed to the next possible time.' : 'Quiet Hours 또는 제외 요일에 걸리면 가능한 다음 시각으로 자동 연기됩니다.'}</li>
            <li>{language === 'en' ? 'After app restart or waking from sleep, missed runs are either caught up or skipped.' : '앱 재시작 또는 절전 해제 후에는 놓친 실행을 따라잡거나 건너뜁니다.'}</li>
          </ul>
        </div>
      </div>
    </>
  )
}
