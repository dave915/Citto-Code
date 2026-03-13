import { useEffect, useMemo, useState } from 'react'
import { ScheduledTaskForm } from './ScheduledTaskForm'
import { useSessionsStore } from '../store/sessions'
import {
  DAY_OPTIONS,
  useScheduledTasksStore,
  type ScheduledTask,
  type ScheduledTaskInput,
} from '../store/scheduledTasks'

type Props = {
  defaultProjectPath: string
  onClose: () => void
  onSelectSession: (sessionId: string) => void
}

function formatDateTime(value: number | null) {
  if (!value) return '미정'
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFrequency(task: ScheduledTask) {
  if (task.frequency === 'manual') return 'Manual'
  if (task.frequency === 'hourly') return `매시간 ${String(task.minute).padStart(2, '0')}분`
  if (task.frequency === 'daily') return `매일 ${String(task.hour).padStart(2, '0')}:${String(task.minute).padStart(2, '0')}`
  if (task.frequency === 'weekdays') return `평일 ${String(task.hour).padStart(2, '0')}:${String(task.minute).padStart(2, '0')}`
  const weeklyLabel = DAY_OPTIONS.find((option) => option.value === task.weeklyDay)?.label ?? task.weeklyDay
  return `매주 ${weeklyLabel} ${String(task.hour).padStart(2, '0')}:${String(task.minute).padStart(2, '0')}`
}

function describeExceptions(task: ScheduledTask) {
  const labels: string[] = []

  if (task.skipDays.length > 0) {
    const skipDayLabels = task.skipDays
      .map((day) => DAY_OPTIONS.find((option) => option.value === day)?.shortLabel ?? day)
      .join(', ')
    labels.push(`제외 요일: ${skipDayLabels}`)
  }

  if (task.quietHoursStart && task.quietHoursEnd) {
    labels.push(`조용한 시간대: ${task.quietHoursStart} ~ ${task.quietHoursEnd}`)
  }

  return labels.length > 0 ? labels.join(' · ') : '예외 없음'
}

export function ScheduledTasksView({
  defaultProjectPath,
  onClose,
  onSelectSession,
}: Props) {
  const tasks = useScheduledTasksStore((state) => state.tasks)
  const sessions = useSessionsStore((state) => state.sessions)
  const addTask = useScheduledTasksStore((state) => state.addTask)
  const updateTask = useScheduledTasksStore((state) => state.updateTask)
  const deleteTask = useScheduledTasksStore((state) => state.deleteTask)
  const toggleTaskEnabled = useScheduledTasksStore((state) => state.toggleTaskEnabled)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [runNowLoadingId, setRunNowLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTaskId(null)
      return
    }

    if (!selectedTaskId || !tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(tasks[0].id)
    }
  }, [selectedTaskId, tasks])

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      if (a.nextRunAt == null && b.nextRunAt != null) return 1
      if (a.nextRunAt != null && b.nextRunAt == null) return -1
      return (a.nextRunAt ?? a.updatedAt) - (b.nextRunAt ?? b.updatedAt)
    }),
    [tasks],
  )

  const selectedTask = selectedTaskId
    ? sortedTasks.find((task) => task.id === selectedTaskId) ?? null
    : null

  const activeTaskCount = sortedTasks.filter((task) => task.enabled && task.frequency !== 'manual').length
  const sessionIds = useMemo(() => new Set(sessions.map((session) => session.id)), [sessions])

  const handleCreate = (input: ScheduledTaskInput) => {
    const taskId = addTask(input)
    setSelectedTaskId(taskId)
    setShowCreate(false)
  }

  const handleUpdate = (input: ScheduledTaskInput) => {
    if (!editingTask) return
    updateTask(editingTask.id, input)
    setEditingTask(null)
  }

  const handleRunNow = async (taskId: string) => {
    setRunNowLoadingId(taskId)
    try {
      await window.claude.runScheduledTaskNow({ taskId })
    } finally {
      setRunNowLoadingId(null)
    }
  }

  return (
    <div className="flex h-full flex-col bg-claude-bg">
      <div className="draggable-region flex h-14 flex-shrink-0 items-center justify-between border-b border-claude-border bg-claude-panel px-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-claude-text">Schedule</h2>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
            Beta
          </span>
          <span className="rounded-full border border-claude-border bg-claude-surface px-2 py-0.5 text-[11px] text-claude-muted">
            활성 {activeTaskCount}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
          title="닫기"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="border-b border-claude-border bg-claude-panel/80 px-5 py-3">
        <div className="rounded-[22px] border border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-xs font-semibold text-claude-text">사용 전 유의사항</p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-claude-muted">
            <li>앱이 켜져 있어야 예약 작업이 실행됩니다.</li>
            <li>Bypass 권한은 파일 수정과 외부 명령까지 자동 승인합니다.</li>
            <li>Quiet Hours 또는 제외 요일에 걸리면 가능한 다음 시각으로 자동 연기됩니다.</li>
            <li>앱 재시작 또는 절전 해제 후에는 놓친 실행을 따라잡거나 건너뜁니다.</li>
          </ul>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[320px] flex-shrink-0 flex-col border-r border-claude-border bg-claude-panel">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-claude-text">작업 목록</p>
              <p className="text-xs text-claude-muted">{sortedTasks.length}개 등록됨</p>
            </div>
            <button
              onClick={() => {
                setEditingTask(null)
                setShowCreate(true)
              }}
              className="rounded-xl bg-claude-surface px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
            >
              추가
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {sortedTasks.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-claude-border bg-claude-bg px-6 py-8 text-center">
                <div>
                  <p className="text-sm font-semibold text-claude-text">예약 작업이 없습니다</p>
                  <p className="mt-1 text-xs leading-relaxed text-claude-muted">
                    새 작업을 추가하면 지정한 시각에 Claude 세션을 자동으로 실행할 수 있습니다.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedTasks.map((task) => {
                  const selected = task.id === selectedTaskId
                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`w-full rounded-[22px] border px-3.5 py-3 text-left transition-colors ${
                        selected
                          ? 'border-claude-border bg-claude-surface'
                          : 'border-transparent bg-claude-bg hover:border-claude-border hover:bg-claude-surface/70'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-claude-text">{task.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          task.enabled
                            ? 'bg-emerald-500/15 text-emerald-200'
                            : 'bg-claude-panel text-claude-muted'
                        }`}>
                          {task.enabled ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-claude-muted">{formatFrequency(task)}</p>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-claude-muted">
                          다음 실행: <span className="text-claude-text">{formatDateTime(task.nextRunAt)}</span>
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="min-h-0 flex-1 overflow-y-auto bg-claude-bg">
          {selectedTask ? (
            <div className="mx-auto flex max-w-5xl flex-col gap-5 p-5">
              <div className="rounded-[28px] border border-claude-border bg-claude-panel px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-xl font-semibold text-claude-text">{selectedTask.name}</h3>
                      <span className="rounded-full border border-claude-border bg-claude-surface px-2 py-0.5 text-[11px] text-claude-muted">
                        {formatFrequency(selectedTask)}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-sm text-claude-muted">{selectedTask.projectPath}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void handleRunNow(selectedTask.id)}
                      disabled={runNowLoadingId === selectedTask.id}
                      className="rounded-xl bg-claude-surface px-3.5 py-2 text-sm font-medium text-claude-text transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
                    >
                      {runNowLoadingId === selectedTask.id ? '실행 중...' : '지금 실행'}
                    </button>
                    <button
                      onClick={() => setEditingTask(selectedTask)}
                      className="rounded-xl border border-claude-border px-3.5 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => toggleTaskEnabled(selectedTask.id)}
                      className="rounded-xl border border-claude-border px-3.5 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                    >
                      {selectedTask.enabled ? '비활성화' : '활성화'}
                    </button>
                    <button
                      onClick={() => {
                        deleteTask(selectedTask.id)
                        setSelectedTaskId(null)
                      }}
                      className="rounded-xl border border-red-500/25 px-3.5 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/10"
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-claude-border bg-claude-bg px-4 py-3">
                    <p className="text-xs text-claude-muted">다음 실행</p>
                    <p className="mt-1 text-sm font-medium text-claude-text">{formatDateTime(selectedTask.nextRunAt)}</p>
                  </div>
                  <div className="rounded-2xl border border-claude-border bg-claude-bg px-4 py-3">
                    <p className="text-xs text-claude-muted">마지막 실행</p>
                    <p className="mt-1 text-sm font-medium text-claude-text">{formatDateTime(selectedTask.lastRunAt)}</p>
                  </div>
                  <div className="rounded-2xl border border-claude-border bg-claude-bg px-4 py-3">
                    <p className="text-xs text-claude-muted">권한 모드</p>
                    <p className="mt-1 text-sm font-medium text-claude-text">{selectedTask.permissionMode}</p>
                  </div>
                  <div className="rounded-2xl border border-claude-border bg-claude-bg px-4 py-3">
                    <p className="text-xs text-claude-muted">예외 설정</p>
                    <p className="mt-1 text-sm font-medium text-claude-text">{describeExceptions(selectedTask)}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-[24px] border border-claude-border bg-claude-bg px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-claude-muted">Prompt</p>
                  <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-claude-text">
                    {selectedTask.prompt}
                  </pre>
                </div>
              </div>

              <div className="rounded-[28px] border border-claude-border bg-claude-panel px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-claude-text">실행 기록</p>
                    <p className="mt-1 text-xs text-claude-muted">최근 24회까지 보관합니다.</p>
                  </div>
                </div>

                {selectedTask.runHistory.length === 0 ? (
                  <div className="mt-4 rounded-[24px] border border-dashed border-claude-border bg-claude-bg px-6 py-10 text-center">
                    <p className="text-sm font-medium text-claude-text">아직 실행 기록이 없습니다</p>
                    <p className="mt-1 text-xs text-claude-muted">예약 실행 또는 지금 실행 후 여기에 기록이 쌓입니다.</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {selectedTask.runHistory.map((record) => {
                      const canOpenSession = Boolean(record.sessionTabId && sessionIds.has(record.sessionTabId))
                      const rowClassName = `flex w-full flex-wrap items-center gap-3 rounded-[22px] border border-claude-border bg-claude-bg px-4 py-3 text-left ${
                        canOpenSession ? 'transition-colors hover:bg-claude-surface/70' : ''
                      }`

                      const content = (
                        <>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            record.outcome === 'executed'
                              ? 'bg-emerald-500/15 text-emerald-200'
                              : 'bg-amber-500/15 text-amber-200'
                          }`}>
                            {record.outcome === 'executed' ? '실행' : '건너뜀'}
                          </span>
                          <span className="text-sm text-claude-text">{formatDateTime(record.runAt)}</span>
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
                              세션 열기
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
                          title="해당 세션 열기"
                        >
                          {content}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6">
              <div className="max-w-sm text-center">
                <p className="text-lg font-semibold text-claude-text">작업을 선택하세요</p>
                <p className="mt-2 text-sm leading-relaxed text-claude-muted">
                  왼쪽 목록에서 예약 작업을 고르면 상세 정보와 실행 기록을 볼 수 있습니다.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {(showCreate || editingTask) && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl">
            <ScheduledTaskForm
              initialTask={editingTask}
              defaultProjectPath={defaultProjectPath}
              onCancel={() => {
                setShowCreate(false)
                setEditingTask(null)
              }}
              onSubmit={editingTask ? handleUpdate : handleCreate}
            />
          </div>
        </div>
      )}
    </div>
  )
}
