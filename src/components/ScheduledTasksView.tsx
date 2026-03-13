import { useEffect, useMemo, useState } from 'react'
import { ScheduledTaskForm } from './ScheduledTaskForm'
import { useSessionsStore, type Session, type ToolCallBlock } from '../store/sessions'
import {
  DAY_OPTIONS,
  useScheduledTasksStore,
  type ScheduledTask,
  type ScheduledTaskInput,
  type ScheduledTaskRunRecord,
} from '../store/scheduledTasks'

type Props = {
  defaultProjectPath: string
  onClose: () => void
  onSelectSession: (sessionId: string) => void
}

type InboxState = 'running' | 'approval' | 'completed' | 'failed' | 'skipped' | 'missing'

type InboxItem = {
  taskId: string
  taskName: string
  record: ScheduledTaskRunRecord
  session: Session | null
  state: InboxState
  sessionLabel: string
  summary: string
  changedPaths: string[]
  costLabel: string | null
}

const WRITE_LIKE_TOOL_NAMES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const EMPTY_SUMMARY = '응답 텍스트 없이 작업이 완료되었습니다.'

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateSummary(value: string, maxLength = 160): string {
  const normalized = normalizeSummaryText(value)
  if (!normalized) return ''
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function getPathLabel(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function extractEditedPaths(toolCall: ToolCallBlock): string[] {
  if (!WRITE_LIKE_TOOL_NAMES.has(toolCall.toolName)) return []
  if (!toolCall.toolInput || typeof toolCall.toolInput !== 'object') return []

  const input = toolCall.toolInput as {
    file_path?: unknown
    notebook_path?: unknown
    path?: unknown
  }

  const candidate = input.file_path ?? input.notebook_path ?? input.path
  return typeof candidate === 'string' && candidate.trim() ? [candidate.trim()] : []
}

function getChangedPaths(session: Session): string[] {
  const seen = new Set<string>()
  const paths: string[] = []

  for (const message of session.messages) {
    for (const toolCall of message.toolCalls) {
      for (const path of extractEditedPaths(toolCall)) {
        const normalized = path.replace(/\\/g, '/').toLowerCase()
        if (seen.has(normalized)) continue
        seen.add(normalized)
        paths.push(path)
      }
    }
  }

  return paths
}

function getLastAssistantSummary(session: Session): string {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index]
    if (message.role !== 'assistant') continue
    const text = truncateSummary(message.text)
    if (text) return text
  }
  return ''
}

function formatCostLabel(record: ScheduledTaskRunRecord, session: Session | null): string | null {
  if (typeof record.cost === 'number') return `$${record.cost.toFixed(4)}`
  if (!session || session.lastCost === undefined) return null
  return `$${session.lastCost.toFixed(4)}`
}

function getInboxState(record: ScheduledTaskRunRecord, session: Session | null): InboxState {
  if (record.outcome === 'skipped') return 'skipped'
  if (record.status) return record.status
  if (!record.sessionTabId || !session) return 'missing'
  if (session.pendingPermission || session.pendingQuestion) return 'approval'
  if (session.isStreaming) return 'running'
  if (session.error?.trim()) return 'failed'
  return 'completed'
}

function buildInboxSummary(state: InboxState, record: ScheduledTaskRunRecord, session: Session | null): string {
  if (state === 'skipped') return record.note
  if (record.summary?.trim()) return record.summary
  if (state === 'missing') return '연결된 세션을 찾을 수 없어 결과를 다시 열 수 없습니다.'
  if (!session) return '세션 정보가 없습니다.'

  if (state === 'approval') {
    if (session.pendingPermission?.toolName) {
      return `${session.pendingPermission.toolName} 권한 승인 대기 중입니다.`
    }
    if (session.pendingQuestion?.question) {
      return truncateSummary(session.pendingQuestion.question)
    }
    return '사용자 확인이 필요합니다.'
  }

  if (state === 'failed') {
    return truncateSummary(session.error ?? '') || '오류로 인해 자동 실행이 완료되지 않았습니다.'
  }

  const assistantSummary = getLastAssistantSummary(session)
  if (assistantSummary) return assistantSummary
  if (state === 'running') return 'Claude가 결과를 생성하는 중입니다.'
  return EMPTY_SUMMARY
}

function buildInboxItem(task: ScheduledTask, record: ScheduledTaskRunRecord, session: Session | null): InboxItem {
  const state = getInboxState(record, session)
  return {
    taskId: task.id,
    taskName: task.name,
    record,
    session,
    state,
    sessionLabel: session?.name ?? '연결된 세션 없음',
    summary: buildInboxSummary(state, record, session),
    changedPaths: record.changedPaths.length > 0 ? record.changedPaths : session ? getChangedPaths(session) : [],
    costLabel: formatCostLabel(record, session),
  }
}

function getInboxStateLabel(state: InboxState): string {
  if (state === 'running') return '실행 중'
  if (state === 'approval') return '확인 필요'
  if (state === 'completed') return '완료'
  if (state === 'failed') return '실패'
  if (state === 'skipped') return '건너뜀'
  return '세션 없음'
}

function getInboxStateClassName(state: InboxState): string {
  if (state === 'running') return 'bg-sky-500/15 text-sky-200'
  if (state === 'approval') return 'bg-violet-500/15 text-violet-200'
  if (state === 'completed') return 'bg-emerald-500/15 text-emerald-200'
  if (state === 'failed') return 'bg-red-500/15 text-red-200'
  if (state === 'skipped') return 'bg-amber-500/15 text-amber-200'
  return 'bg-claude-panel text-claude-muted'
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
  const [inboxOpen, setInboxOpen] = useState(false)
  const [runNowLoadingId, setRunNowLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showCreate || editingTask) return
      if (inboxOpen) {
        setInboxOpen(false)
        return
      }
      onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [editingTask, inboxOpen, onClose, showCreate])

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
  const sessionById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )
  const inboxItems = useMemo(
    () => tasks
      .flatMap((task) => task.runHistory.map((record) => buildInboxItem(task, record, record.sessionTabId ? sessionById.get(record.sessionTabId) ?? null : null)))
      .sort((a, b) => b.record.runAt - a.record.runAt)
      .slice(0, 8),
    [sessionById, tasks],
  )
  const inboxCounts = useMemo(() => ({
    running: inboxItems.filter((item) => item.state === 'running' || item.state === 'approval').length,
    failed: inboxItems.filter((item) => item.state === 'failed').length,
    completed: inboxItems.filter((item) => item.state === 'completed').length,
  }), [inboxItems])
  const inboxBadgeCount = inboxCounts.running + inboxCounts.failed + inboxCounts.completed

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

  const openCreateModal = () => {
    setEditingTask(null)
    setShowCreate(true)
  }

  const handleDeleteTask = (taskId: string) => {
    deleteTask(taskId)
    setSelectedTaskId((current) => (current === taskId ? null : current))
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-claude-bg">
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInboxOpen(true)}
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
            title="닫기"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
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
              onClick={openCreateModal}
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
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="mt-4 rounded-xl bg-claude-surface px-3.5 py-2 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
                  >
                    작업 추가
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedTasks.map((task) => {
                  const selected = task.id === selectedTaskId
                  return (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTaskId(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedTaskId(task.id)
                        }
                      }}
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
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleDeleteTask(task.id)
                          }}
                          className="rounded-lg border border-red-500/25 px-2 py-1 text-[11px] text-red-300 transition-colors hover:bg-red-500/10"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
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
                        handleDeleteTask(selectedTask.id)
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

      {inboxOpen && (
        <div className="absolute inset-0 z-30 flex bg-black/40 backdrop-blur-[1px]">
          <button
            type="button"
            aria-label="Results Inbox 닫기"
            onClick={() => setInboxOpen(false)}
            className="min-w-0 flex-1 cursor-default"
          />
          <aside className="flex h-full w-full max-w-[560px] flex-shrink-0 flex-col border-l border-claude-border bg-claude-panel shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-claude-border px-5 py-4">
              <div>
                <p className="text-base font-semibold text-claude-text">Results Inbox</p>
                <p className="mt-1 text-xs text-claude-muted">최근 실행 결과를 여기서 확인합니다.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-claude-border bg-claude-bg px-2.5 py-1 text-claude-muted">
                    진행/확인 {inboxCounts.running}
                  </span>
                  <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-red-200">
                    실패 {inboxCounts.failed}
                  </span>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
                    완료 {inboxCounts.completed}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInboxOpen(false)}
                className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                title="닫기"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {inboxItems.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-claude-border bg-claude-bg px-6 py-8 text-center">
                  <p className="text-sm font-medium text-claude-text">아직 도착한 결과가 없습니다</p>
                  <p className="mt-1 text-xs text-claude-muted">예약 실행이나 지금 실행이 끝나면 여기에 결과 카드가 쌓입니다.</p>
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
                                {getInboxStateLabel(item.state)}
                              </span>
                              <p className="truncate text-sm font-semibold text-claude-text">{item.taskName}</p>
                            </div>
                            <p className="mt-1 text-xs text-claude-muted">{formatDateTime(item.record.runAt)} · {item.record.note}</p>
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
                            <p className="text-[11px] uppercase tracking-[0.14em] text-claude-muted">생성 세션</p>
                            <p className="mt-2 truncate text-sm font-medium text-claude-text">{item.sessionLabel}</p>
                          </div>
                          <div className="rounded-2xl border border-claude-border bg-claude-bg px-3.5 py-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-claude-muted">변경 파일</p>
                            <p className="mt-2 text-sm font-medium text-claude-text">
                              {item.changedPaths.length > 0 ? `${item.changedPaths.length}개` : item.state === 'failed' || item.state === 'skipped' ? '-' : '없음'}
                            </p>
                            {changedPathLabels.length > 0 && (
                              <p className="mt-1 truncate text-xs text-claude-muted">{changedPathLabels.join(', ')}{item.changedPaths.length > 3 ? ` 외 ${item.changedPaths.length - 3}개` : ''}</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 rounded-2xl border border-claude-border bg-claude-bg px-3.5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-claude-muted">
                              {item.state === 'failed' ? '실패 이유' : item.state === 'skipped' ? '실행 메모' : '요약 보고서'}
                            </p>
                            {item.costLabel && (
                              <span className="text-[11px] text-claude-muted">비용 {item.costLabel}</span>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-claude-text">{item.summary}</p>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTaskId(item.taskId)
                              setInboxOpen(false)
                            }}
                            className="rounded-xl border border-claude-border bg-claude-bg px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                          >
                            작업 보기
                          </button>
                          {canOpenSession && item.record.sessionTabId && (
                            <button
                              type="button"
                              onClick={() => onSelectSession(item.record.sessionTabId!)}
                              className="rounded-xl border border-claude-border bg-claude-bg px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-claude-panel"
                            >
                              세션 열기
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
      )}

      {(showCreate || editingTask) && (
        <div className="absolute inset-0 z-40 bg-black/55 backdrop-blur-sm">
          <div className="flex h-full w-full items-start justify-center overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <div className="w-full max-w-3xl flex-shrink-0">
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
        </div>
      )}
    </div>
  )
}
