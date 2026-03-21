import type { Session, ToolCallBlock } from '../../store/sessions'
import { getDayOptions, type ScheduledTask, type ScheduledTaskRunRecord } from '../../store/scheduledTasks'
import { getIntlLocale, translate, type AppLanguage } from '../../lib/i18n'

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
  return translate(language, 'scheduled.summary.emptyResponse')
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
  if (state === 'missing') return translate(language, 'scheduled.summary.missingSession')
  if (!session) return translate(language, 'scheduled.summary.noSessionInfo')

  if (state === 'approval') {
    if (session.pendingPermission?.toolName) {
      return translate(language, 'scheduled.summary.waitingPermission', {
        toolName: session.pendingPermission.toolName,
      })
    }
    if (session.pendingQuestion?.question) {
      return truncateSummary(session.pendingQuestion.question)
    }
    return translate(language, 'scheduled.summary.userConfirmation')
  }

  if (state === 'failed') {
    return truncateSummary(session.error ?? '') || translate(language, 'scheduled.summary.errorFallback')
  }

  const assistantSummary = getLastAssistantSummary(session)
  if (assistantSummary) return assistantSummary
  if (state === 'running') return translate(language, 'scheduled.summary.generating')
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
    sessionLabel: session?.name ?? translate(language, 'scheduled.sessionLabel.none'),
    summary: buildInboxSummary(state, record, session, language),
    changedPaths: record.changedPaths.length > 0 ? record.changedPaths : session ? getChangedPaths(session) : [],
    costLabel: formatCostLabel(record, session),
  }
}

export function getInboxStateLabel(state: InboxState, language: AppLanguage = 'ko'): string {
  if (state === 'running') return translate(language, 'scheduled.status.running')
  if (state === 'approval') return translate(language, 'scheduled.status.approval')
  if (state === 'completed') return translate(language, 'scheduled.status.completed')
  if (state === 'failed') return translate(language, 'scheduled.status.failed')
  if (state === 'skipped') return translate(language, 'scheduled.status.skipped')
  return translate(language, 'scheduled.status.missing')
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
  if (!value) return translate(language, 'scheduled.date.notScheduled')
  return new Date(value).toLocaleString(getIntlLocale(language), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatFrequency(task: ScheduledTask, language: AppLanguage = 'ko') {
  if (task.frequency === 'manual') return translate(language, 'scheduled.frequency.summary.manual')
  if (task.frequency === 'hourly') {
    return translate(language, 'scheduled.frequency.summary.hourly', { minute: task.minute })
  }
  if (task.frequency === 'daily') {
    return translate(language, 'scheduled.frequency.summary.daily', {
      hour: task.hour,
      minute: task.minute,
    })
  }
  if (task.frequency === 'weekdays') {
    return translate(language, 'scheduled.frequency.summary.weekdays', {
      hour: task.hour,
      minute: task.minute,
    })
  }
  const weeklyLabel = getDayOptions(language).find((option) => option.value === task.weeklyDay)?.label ?? task.weeklyDay
  return translate(language, 'scheduled.frequency.summary.weekly', {
    day: weeklyLabel,
    hour: task.hour,
    minute: task.minute,
  })
}

export function describeExceptions(task: ScheduledTask, language: AppLanguage = 'ko') {
  const labels: string[] = []

  if (task.skipDays.length > 0) {
    const skipDayLabels = task.skipDays
      .map((day) => getDayOptions(language).find((option) => option.value === day)?.shortLabel ?? day)
      .join(', ')
    labels.push(translate(language, 'scheduled.exceptions.skipDays', { days: skipDayLabels }))
  }

  if (task.quietHoursStart && task.quietHoursEnd) {
    labels.push(translate(language, 'scheduled.exceptions.quietHours', {
      start: task.quietHoursStart,
      end: task.quietHoursEnd,
    }))
  }

  return labels.length > 0 ? labels.join(' · ') : translate(language, 'scheduled.exceptions.none')
}
