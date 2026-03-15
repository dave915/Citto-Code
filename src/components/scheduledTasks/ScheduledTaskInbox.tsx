import { useI18n } from '../../hooks/useI18n'
import {
  formatDateTime,
  getInboxStateClassName,
  getInboxStateLabel,
  getPathLabel,
  type InboxItem,
} from './utils'

type Props = {
  inboxCounts: {
    completed: number
    failed: number
    running: number
  }
  inboxItems: InboxItem[]
  open: boolean
  sessionIds: Set<string>
  onClose: () => void
  onOpenSession: (sessionId: string) => void
  onOpenTask: (taskId: string) => void
}

export function ScheduledTaskInbox({
  inboxCounts,
  inboxItems,
  open,
  sessionIds,
  onClose,
  onOpenSession,
  onOpenTask,
}: Props) {
  const { language } = useI18n()
  if (!open) return null

  return (
    <div className="absolute inset-0 z-30 flex bg-black/40 backdrop-blur-[1px]">
      <button
        type="button"
        aria-label={language === 'en' ? 'Close results inbox' : 'Results Inbox 닫기'}
        onClick={onClose}
        className="min-w-0 flex-1 cursor-default"
      />
      <aside className="flex h-full w-full max-w-[560px] flex-shrink-0 flex-col border-l border-claude-border bg-claude-panel shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-claude-border px-5 py-4">
          <div>
            <p className="text-base font-semibold text-claude-text">Results Inbox</p>
            <p className="mt-1 text-xs text-claude-muted">{language === 'en' ? 'View recent execution results here.' : '최근 실행 결과를 여기서 확인합니다.'}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-claude-border bg-claude-bg px-2.5 py-1 text-claude-muted">
                {language === 'en' ? `Running / attention ${inboxCounts.running}` : `진행/확인 ${inboxCounts.running}`}
              </span>
              <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-red-200">
                {language === 'en' ? `Failed ${inboxCounts.failed}` : `실패 ${inboxCounts.failed}`}
              </span>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
                {language === 'en' ? `Completed ${inboxCounts.completed}` : `완료 ${inboxCounts.completed}`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title={language === 'en' ? 'Close' : '닫기'}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {inboxItems.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-claude-border bg-claude-bg px-6 py-8 text-center">
              <p className="text-sm font-medium text-claude-text">{language === 'en' ? 'No results yet' : '아직 도착한 결과가 없습니다'}</p>
              <p className="mt-1 text-xs text-claude-muted">{language === 'en' ? 'Result cards appear here after a scheduled run or a manual run.' : '예약 실행이나 지금 실행이 끝나면 여기에 결과 카드가 쌓입니다.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {inboxItems.map((item) => {
                const canOpenSession = Boolean(item.record.sessionTabId && sessionIds.has(item.record.sessionTabId))
                const changedPathLabels = item.changedPaths.slice(0, 3).map(getPathLabel)

                return (
                  <div
                    key={`${item.taskId}:${item.record.id}`}
                    className="rounded-[24px] border border-claude-border bg-claude-surface px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getInboxStateClassName(item.state)}`}>
                            {getInboxStateLabel(item.state, language)}
                          </span>
                          <p className="truncate text-sm font-semibold text-claude-text">{item.taskName}</p>
                        </div>
                        <p className="mt-1 text-xs text-claude-muted">
                          {formatDateTime(item.record.runAt, language)} · {item.record.note}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {item.record.catchUp && (
                          <span className="rounded-full border border-claude-border bg-claude-bg px-2 py-0.5 text-[10px] text-claude-muted">
                            catch-up
                          </span>
                        )}
                        {item.record.manual && (
                          <span className="rounded-full border border-claude-border bg-claude-bg px-2 py-0.5 text-[10px] text-claude-muted">
                            manual
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-claude-border bg-claude-bg px-3.5 py-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-claude-muted">{language === 'en' ? 'Created session' : '생성 세션'}</p>
                        <p className="mt-2 truncate text-sm font-medium text-claude-text">{item.sessionLabel}</p>
                      </div>
                      <div className="rounded-2xl border border-claude-border bg-claude-bg px-3.5 py-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-claude-muted">{language === 'en' ? 'Changed files' : '변경 파일'}</p>
                        <p className="mt-2 text-sm font-medium text-claude-text">
                          {item.changedPaths.length > 0
                            ? (language === 'en' ? `${item.changedPaths.length}` : `${item.changedPaths.length}개`)
                            : item.state === 'failed' || item.state === 'skipped'
                              ? '-'
                              : (language === 'en' ? 'None' : '없음')}
                        </p>
                        {changedPathLabels.length > 0 && (
                          <p className="mt-1 truncate text-xs text-claude-muted">{changedPathLabels.join(', ')}{item.changedPaths.length > 3 ? (language === 'en' ? ` +${item.changedPaths.length - 3} more` : ` 외 ${item.changedPaths.length - 3}개`) : ''}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-claude-border bg-claude-bg px-3.5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-claude-muted">
                          {item.state === 'failed'
                            ? (language === 'en' ? 'Failure reason' : '실패 이유')
                            : item.state === 'skipped'
                              ? (language === 'en' ? 'Run note' : '실행 메모')
                              : (language === 'en' ? 'Summary' : '요약 보고서')}
                        </p>
                        {item.costLabel && (
                          <span className="text-[11px] text-claude-muted">{language === 'en' ? 'Cost' : '비용'} {item.costLabel}</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-claude-text">{item.summary}</p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenTask(item.taskId)}
                        className="rounded-xl border border-claude-border bg-claude-bg px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                      >
                        {language === 'en' ? 'View task' : '작업 보기'}
                      </button>
                      {canOpenSession && item.record.sessionTabId && (
                        <button
                          type="button"
                          onClick={() => onOpenSession(item.record.sessionTabId!)}
                          className="rounded-xl border border-claude-border bg-claude-bg px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-claude-panel"
                        >
                          {language === 'en' ? 'Open session' : '세션 열기'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
