import { useI18n } from '../../hooks/useI18n'
import type { ScheduledTask } from '../../store/scheduledTasks'
import { describeExceptions, formatDateTime, formatFrequency } from './utils'

type Props = {
  runNowLoadingId: string | null
  selectedTask: ScheduledTask | null
  sessionIds: Set<string>
  onDelete: (taskId: string) => void
  onEdit: (task: ScheduledTask) => void
  onRunNow: (taskId: string) => Promise<void>
  onSelectSession: (sessionId: string) => void
  onToggleEnabled: (taskId: string) => void
}

export function ScheduledTaskDetails({
  runNowLoadingId,
  selectedTask,
  sessionIds,
  onDelete,
  onEdit,
  onRunNow,
  onSelectSession,
  onToggleEnabled,
}: Props) {
  const { language, t } = useI18n()
  if (!selectedTask) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto bg-claude-bg">
        <div className="flex h-full items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-lg font-semibold text-claude-text">{t('scheduled.details.selectTitle')}</p>
            <p className="mt-2 text-sm leading-relaxed text-claude-muted">{t('scheduled.details.selectDescription')}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-claude-bg">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-5">
        <div className="rounded-[16px] border border-claude-border bg-claude-panel px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-xl font-semibold text-claude-text">{selectedTask.name}</h3>
                <span className="rounded-full border border-claude-border bg-claude-surface px-2 py-0.5 text-[11px] text-claude-muted">
                  {formatFrequency(selectedTask, language)}
                </span>
              </div>
              <p className="mt-1 break-all text-sm text-claude-muted">{selectedTask.projectPath}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void onRunNow(selectedTask.id)}
                disabled={runNowLoadingId === selectedTask.id}
                className="rounded-xl bg-claude-surface px-3.5 py-2 text-sm font-medium text-claude-text transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
              >
                {runNowLoadingId === selectedTask.id ? t('scheduled.details.running') : t('scheduled.runNote.manual')}
              </button>
              <button
                onClick={() => onEdit(selectedTask)}
                className="rounded-xl border border-claude-border px-3.5 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
              >
                {t('common.edit')}
              </button>
              <button
                onClick={() => onToggleEnabled(selectedTask.id)}
                className="rounded-xl border border-claude-border px-3.5 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
              >
                {selectedTask.enabled ? t('common.disable') : t('common.enable')}
              </button>
              <button
                onClick={() => onDelete(selectedTask.id)}
                className="rounded-xl border border-red-500/25 px-3.5 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/10"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-claude-border bg-claude-bg px-4 py-3">
              <p className="text-xs text-claude-muted">{t('scheduled.details.nextRun')}</p>
              <p className="mt-1 text-sm font-medium text-claude-text">{formatDateTime(selectedTask.nextRunAt, language)}</p>
            </div>
            <div className="rounded-2xl border border-claude-border bg-claude-bg px-4 py-3">
              <p className="text-xs text-claude-muted">{t('scheduled.details.lastRun')}</p>
              <p className="mt-1 text-sm font-medium text-claude-text">{formatDateTime(selectedTask.lastRunAt, language)}</p>
            </div>
            <div className="rounded-2xl border border-claude-border bg-claude-bg px-4 py-3">
              <p className="text-xs text-claude-muted">{t('scheduled.details.model')}</p>
              <p className="mt-1 text-sm font-medium text-claude-text">
                {selectedTask.model ?? t('input.modelPicker.defaultModel')}
              </p>
            </div>
            <div className="rounded-2xl border border-claude-border bg-claude-bg px-4 py-3">
              <p className="text-xs text-claude-muted">{t('scheduled.details.permissionMode')}</p>
              <p className="mt-1 text-sm font-medium text-claude-text">{selectedTask.permissionMode}</p>
            </div>
            <div className="rounded-2xl border border-claude-border bg-claude-bg px-4 py-3">
              <p className="text-xs text-claude-muted">{t('scheduled.details.exceptions')}</p>
              <p className="mt-1 text-sm font-medium text-claude-text">{describeExceptions(selectedTask, language)}</p>
            </div>
          </div>

          <div className="mt-5 rounded-[12px] border border-claude-border bg-claude-bg px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-claude-muted">{t('common.prompt')}</p>
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-claude-text">
              {selectedTask.prompt}
            </pre>
          </div>
        </div>

        <div className="rounded-[16px] border border-claude-border bg-claude-panel px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-claude-text">{t('scheduled.details.runHistory')}</p>
              <p className="mt-1 text-xs text-claude-muted">{t('scheduled.details.runHistoryDescription')}</p>
            </div>
          </div>

          {selectedTask.runHistory.length === 0 ? (
            <div className="mt-4 rounded-[12px] border border-dashed border-claude-border bg-claude-bg px-6 py-10 text-center">
              <p className="text-sm font-medium text-claude-text">{t('scheduled.details.noHistoryTitle')}</p>
              <p className="mt-1 text-xs text-claude-muted">{t('scheduled.details.noHistoryDescription')}</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {selectedTask.runHistory.map((record) => {
                const canOpenSession = Boolean(record.sessionTabId && sessionIds.has(record.sessionTabId))
                const rowClassName = `flex w-full flex-wrap items-center gap-3 rounded-[12px] border border-claude-border bg-claude-bg px-4 py-3 text-left ${
                  canOpenSession ? 'transition-colors hover:bg-claude-surface/70' : ''
                }`

                const content = (
                  <>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      record.outcome === 'executed'
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'bg-amber-500/15 text-amber-200'
                    }`}>
                      {record.outcome === 'executed'
                        ? t('scheduled.details.executed')
                        : t('scheduled.details.skipped')}
                    </span>
                    <span className="text-sm text-claude-text">{formatDateTime(record.runAt, language)}</span>
                    <span className="text-sm text-claude-muted">{record.note}</span>
                    {record.catchUp && (
                      <span className="rounded-full border border-claude-border bg-claude-panel px-2 py-0.5 text-[10px] text-claude-muted">
                        catch-up
                      </span>
                    )}
                    {record.manual && (
                      <span className="rounded-full border border-claude-border bg-claude-panel px-2 py-0.5 text-[10px] text-claude-muted">
                        manual
                      </span>
                    )}
                    {canOpenSession && (
                      <span className="ml-auto text-xs font-medium text-claude-text">
                        {t('common.openSession')}
                      </span>
                    )}
                  </>
                )

                if (!canOpenSession || !record.sessionTabId) {
                  return (
                    <div key={record.id} className={rowClassName}>
                      {content}
                    </div>
                  )
                }

                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => onSelectSession(record.sessionTabId!)}
                    className={rowClassName}
                    title={t('scheduled.details.openThisSession')}
                  >
                    {content}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
