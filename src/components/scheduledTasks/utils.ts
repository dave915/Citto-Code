import type { Session, ToolCallBlock } from '../../store/sessions'
import { getDayOptions, type ScheduledTask, type ScheduledTaskRunRecord } from '../../store/scheduledTasks'
import type { AppLanguage } from '../../lib/i18n'

export type InboxState = 'running' | 'approval' | 'completed' | 'failed' | 'skipped' | 'missing'

export type InboxItem = {
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
function getEmptySummary(language: AppLanguage) {
  return language === 'en'
    ? 'The task finished without response text.'
    : '응답 텍스트 없이 작업이 완료되었습니다.'
}

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateSummary(value: string, maxLength = 160): string {
  const normalized = normalizeSummaryText(value)
  if (!normalized) return ''
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

export function getPathLabel(path: string): string {
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

function buildInboxSummary(
  state: InboxState,
  record: ScheduledTaskRunRecord,
  session: Session | null,
  language: AppLanguage,
): string {
  if (state === 'skipped') return record.note
  if (record.summary?.trim()) return record.summary
  if (state === 'missing') return language === 'en' ? 'The linked session could not be found.' : '연결된 세션을 찾을 수 없어 결과를 다시 열 수 없습니다.'
  if (!session) return language === 'en' ? 'No session information is available.' : '세션 정보가 없습니다.'

  if (state === 'approval') {
    if (session.pendingPermission?.toolName) {
      return language === 'en'
        ? `Waiting for ${session.pendingPermission.toolName} permission approval.`
        : `${session.pendingPermission.toolName} 권한 승인 대기 중입니다.`
    }
    if (session.pendingQuestion?.question) {
      return truncateSummary(session.pendingQuestion.question)
    }
    return language === 'en' ? 'User confirmation is required.' : '사용자 확인이 필요합니다.'
  }

  if (state === 'failed') {
    return truncateSummary(session.error ?? '') || (language === 'en'
      ? 'The automated run did not complete because of an error.'
      : '오류로 인해 자동 실행이 완료되지 않았습니다.')
  }

  const assistantSummary = getLastAssistantSummary(session)
  if (assistantSummary) return assistantSummary
  if (state === 'running') return language === 'en' ? 'Claude is generating the result.' : 'Claude가 결과를 생성하는 중입니다.'
  return getEmptySummary(language)
}

export function buildInboxItem(
  task: ScheduledTask,
  record: ScheduledTaskRunRecord,
  session: Session | null,
  language: AppLanguage = 'ko',
): InboxItem {
  const state = getInboxState(record, session)
  return {
    taskId: task.id,
    taskName: task.name,
    record,
    session,
    state,
    sessionLabel: session?.name ?? (language === 'en' ? 'No linked session' : '연결된 세션 없음'),
    summary: buildInboxSummary(state, record, session, language),
    changedPaths: record.changedPaths.length > 0 ? record.changedPaths : session ? getChangedPaths(session) : [],
    costLabel: formatCostLabel(record, session),
  }
}

export function getInboxStateLabel(state: InboxState, language: AppLanguage = 'ko'): string {
  if (state === 'running') return language === 'en' ? 'Running' : '실행 중'
  if (state === 'approval') return language === 'en' ? 'Needs attention' : '확인 필요'
  if (state === 'completed') return language === 'en' ? 'Completed' : '완료'
  if (state === 'failed') return language === 'en' ? 'Failed' : '실패'
  if (state === 'skipped') return language === 'en' ? 'Skipped' : '건너뜀'
  return language === 'en' ? 'No session' : '세션 없음'
}

export function getInboxStateClassName(state: InboxState): string {
  if (state === 'running') return 'bg-sky-500/15 text-sky-200'
  if (state === 'approval') return 'bg-violet-500/15 text-violet-200'
  if (state === 'completed') return 'bg-emerald-500/15 text-emerald-200'
  if (state === 'failed') return 'bg-red-500/15 text-red-200'
  if (state === 'skipped') return 'bg-amber-500/15 text-amber-200'
  return 'bg-claude-panel text-claude-muted'
}

export function formatDateTime(value: number | null, language: AppLanguage = 'ko') {
  if (!value) return language === 'en' ? 'Not scheduled' : '미정'
  return new Date(value).toLocaleString(language === 'en' ? 'en-US' : 'ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatFrequency(task: ScheduledTask, language: AppLanguage = 'ko') {
  if (task.frequency === 'manual') return 'Manual'
  if (task.frequency === 'hourly') {
    return language === 'en'
      ? `Every hour at minute ${String(task.minute).padStart(2, '0')}`
      : `매시간 ${String(task.minute).padStart(2, '0')}분`
  }
  if (task.frequency === 'daily') {
    return language === 'en'
      ? `Every day ${String(task.hour).padStart(2, '0')}:${String(task.minute).padStart(2, '0')}`
      : `매일 ${String(task.hour).padStart(2, '0')}:${String(task.minute).padStart(2, '0')}`
  }
  if (task.frequency === 'weekdays') {
    return language === 'en'
      ? `Weekdays ${String(task.hour).padStart(2, '0')}:${String(task.minute).padStart(2, '0')}`
      : `평일 ${String(task.hour).padStart(2, '0')}:${String(task.minute).padStart(2, '0')}`
  }
  const weeklyLabel = getDayOptions(language).find((option) => option.value === task.weeklyDay)?.label ?? task.weeklyDay
  return language === 'en'
    ? `Every ${weeklyLabel} ${String(task.hour).padStart(2, '0')}:${String(task.minute).padStart(2, '0')}`
    : `매주 ${weeklyLabel} ${String(task.hour).padStart(2, '0')}:${String(task.minute).padStart(2, '0')}`
}

export function describeExceptions(task: ScheduledTask, language: AppLanguage = 'ko') {
  const labels: string[] = []

  if (task.skipDays.length > 0) {
    const skipDayLabels = task.skipDays
      .map((day) => getDayOptions(language).find((option) => option.value === day)?.shortLabel ?? day)
      .join(', ')
    labels.push(language === 'en' ? `Skip days: ${skipDayLabels}` : `제외 요일: ${skipDayLabels}`)
  }

  if (task.quietHoursStart && task.quietHoursEnd) {
    labels.push(language === 'en'
      ? `Quiet hours: ${task.quietHoursStart} - ${task.quietHoursEnd}`
      : `조용한 시간대: ${task.quietHoursStart} ~ ${task.quietHoursEnd}`)
  }

  return labels.length > 0 ? labels.join(' · ') : (language === 'en' ? 'No exceptions' : '예외 없음')
}
