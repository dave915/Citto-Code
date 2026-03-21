import { useI18n } from '../../hooks/useI18n'
import type { ScheduledTask } from '../../store/scheduledTasks'
import { formatDateTime, formatFrequency } from './utils'

type Props = {
  selectedTaskId: string | null
  tasks: ScheduledTask[]
  onCreate: () => void
  onDelete: (taskId: string) => void
  onSelect: (taskId: string) => void
}

export function ScheduledTaskSidebar({
  selectedTaskId,
  tasks,
  onCreate,
  onDelete,
  onSelect,
}: Props) {
  const { language } = useI18n()
  return (
    <aside className="flex w-[320px] flex-shrink-0 flex-col border-r border-claude-border bg-claude-panel">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-claude-text">{language === 'en' ? 'Tasks' : '작업 목록'}</p>
          <p className="text-xs text-claude-muted">{language === 'en' ? `${tasks.length} registered` : `${tasks.length}개 등록됨`}</p>
        </div>
        <button
          onClick={onCreate}
          className="rounded-xl bg-claude-surface px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
        >
          {language === 'en' ? 'Add' : '추가'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-[12px] border border-dashed border-claude-border bg-claude-bg px-6 py-8 text-center">
            <div>
              <p className="text-sm font-semibold text-claude-text">{language === 'en' ? 'No scheduled tasks' : '예약 작업이 없습니다'}</p>
              <p className="mt-1 text-xs leading-relaxed text-claude-muted">
                {language === 'en'
                  ? 'Add a task to automatically run a Claude session at the selected time.'
                  : '새 작업을 추가하면 지정한 시각에 Claude 세션을 자동으로 실행할 수 있습니다.'}
              </p>
              <button
                type="button"
                onClick={onCreate}
                className="mt-4 rounded-xl bg-claude-surface px-3.5 py-2 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
              >
                {language === 'en' ? 'Add task' : '작업 추가'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const selected = task.id === selectedTaskId
              return (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(task.id)
                    }
                  }}
                  className={`w-full rounded-[12px] border px-3.5 py-3 text-left transition-colors ${
                    selected
                      ? 'border-claude-border bg-claude-surface'
                      : 'border-transparent bg-claude-bg hover:border-claude-border hover:bg-claude-surface/70'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-claude-text">{task.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      task.enabled
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-claude-panel text-claude-muted'
                    }`}>
                      {task.enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-claude-muted">{formatFrequency(task, language)}</p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-claude-muted">
                      {language === 'en' ? 'Next run:' : '다음 실행:'} <span className="text-claude-text">{formatDateTime(task.nextRunAt, language)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDelete(task.id)
                      }}
                      className="rounded-lg border border-red-500/40 px-2 py-1 text-[11px] text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      {language === 'en' ? 'Delete' : '삭제'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
