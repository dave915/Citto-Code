import type {
  ScheduledTask,
  ScheduledTaskAdvancePayload,
  ScheduledTaskDay,
  ScheduledTaskInput,
  ScheduledTaskRunRecord,
} from './scheduledTaskTypes'
import { translate, type AppLanguage } from '../lib/i18n'

export const DAY_OPTIONS: ScheduledTaskDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const DAY_INDEX: Record<ScheduledTaskDay, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

const WEEKDAY_SET = new Set<ScheduledTaskDay>(['mon', 'tue', 'wed', 'thu', 'fri'])
export const HISTORY_LIMIT = 24
const EXCEPTION_ADVANCE_LIMIT = 14

export function getDayOptions(language: AppLanguage = 'ko') {
  return DAY_OPTIONS.map((value) => ({
    value,
    label: translate(language, `scheduled.day.${value}.label`),
    shortLabel: translate(language, `scheduled.day.${value}.short`),
  }))
}

export function getDayKey(date: Date): ScheduledTaskDay {
  return DAY_OPTIONS[date.getDay()] ?? 'sun'
}

export function clampHour(value: number) {
  return Math.min(23, Math.max(0, Math.floor(value)))
}

export function clampMinute(value: number) {
  return Math.min(59, Math.max(0, Math.floor(value)))
}

export function parseClockValue(value: string | null): { hour: number; minute: number } | null {
  if (!value) return null
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  return {
    hour: clampHour(Number(match[1])),
    minute: clampMinute(Number(match[2])),
  }
}

export function normalizeSkipDays(days: ScheduledTaskDay[]): ScheduledTaskDay[] {
  const seen = new Set<ScheduledTaskDay>()
  const normalized: ScheduledTaskDay[] = []
  for (const day of days) {
    if (!(day in DAY_INDEX) || seen.has(day)) continue
    seen.add(day)
    normalized.push(day)
  }
  return normalized
}

function makeScheduledDate(base: Date, hour: number, minute: number): Date {
  const next = new Date(base)
  next.setHours(hour, minute, 0, 0)
  return next
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function moveToNextBaseTime(task: ScheduledTask, from: Date): Date | null {
  if (!task.enabled || task.frequency === 'manual') return null

  const hour = clampHour(task.hour)
  const minute = clampMinute(task.minute)
  const cursor = new Date(from)
  cursor.setSeconds(0, 0)

  if (task.frequency === 'hourly') {
    const candidate = new Date(cursor)
    candidate.setMinutes(minute, 0, 0)
    if (candidate.getTime() <= from.getTime()) {
      candidate.setHours(candidate.getHours() + 1)
      candidate.setMinutes(minute, 0, 0)
    }
    return candidate
  }

  for (let offset = 0; offset < 14; offset += 1) {
    const day = addDays(cursor, offset)
    const candidate = makeScheduledDate(day, hour, minute)
    if (candidate.getTime() <= from.getTime()) continue

    const dayKey = getDayKey(candidate)
    if (task.frequency === 'daily') return candidate
    if (task.frequency === 'weekdays' && WEEKDAY_SET.has(dayKey)) return candidate
    if (task.frequency === 'weekly' && dayKey === task.weeklyDay) return candidate
  }

  return null
}

function isWithinQuietHours(date: Date, start: string | null, end: string | null): boolean {
  const quietStart = parseClockValue(start)
  const quietEnd = parseClockValue(end)
  if (!quietStart || !quietEnd) return false

  const currentMinutes = date.getHours() * 60 + date.getMinutes()
  const startMinutes = quietStart.hour * 60 + quietStart.minute
  const endMinutes = quietEnd.hour * 60 + quietEnd.minute

  if (startMinutes === endMinutes) return false
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes
}

function movePastQuietHours(date: Date, start: string | null, end: string | null): Date {
  const quietStart = parseClockValue(start)
  const quietEnd = parseClockValue(end)
  if (!quietStart || !quietEnd) return date

  const next = new Date(date)
  next.setSeconds(0, 0)

  if (!isWithinQuietHours(next, start, end)) return next

  const startMinutes = quietStart.hour * 60 + quietStart.minute
  const endMinutes = quietEnd.hour * 60 + quietEnd.minute
  const currentMinutes = next.getHours() * 60 + next.getMinutes()

  if (startMinutes < endMinutes) {
    next.setHours(quietEnd.hour, quietEnd.minute, 0, 0)
    return next
  }

  if (currentMinutes >= startMinutes) {
    next.setDate(next.getDate() + 1)
  }
  next.setHours(quietEnd.hour, quietEnd.minute, 0, 0)
  return next
}

export function advancePastExceptions(task: ScheduledTask, candidateAt: number | null): number | null {
  if (candidateAt == null) return null

  const skipDays = new Set(normalizeSkipDays(task.skipDays))
  let candidate = new Date(candidateAt)

  for (let attempt = 0; attempt < EXCEPTION_ADVANCE_LIMIT; attempt += 1) {
    if (skipDays.has(getDayKey(candidate))) {
      const nextBase = moveToNextBaseTime(task, new Date(candidate.getTime()))
      if (!nextBase) return null
      candidate = nextBase
      continue
    }

    if (isWithinQuietHours(candidate, task.quietHoursStart, task.quietHoursEnd)) {
      candidate = movePastQuietHours(candidate, task.quietHoursStart, task.quietHoursEnd)
      continue
    }

    return candidate.getTime()
  }

  return candidate.getTime()
}

function asScheduledTask(task: ScheduledTask | ScheduledTaskInput): ScheduledTask {
  return {
    ...task,
    id: 'preview',
    nextRunAt: null,
    lastRunAt: null,
    createdAt: 0,
    updatedAt: 0,
    runHistory: [],
  }
}

export function computeNextRunAt(task: ScheduledTask | ScheduledTaskInput, fromTime = Date.now()): number | null {
  if (!task.enabled || task.frequency === 'manual') return null
  const scheduledTask = asScheduledTask(task)
  const base = moveToNextBaseTime(scheduledTask, new Date(fromTime))
  return advancePastExceptions(scheduledTask, base?.getTime() ?? null)
}

export function buildRunNote(payload: ScheduledTaskAdvancePayload, language: AppLanguage = 'ko') {
  if (payload.reason?.trim()) return payload.reason.trim()
  if (payload.skipped) return translate(language, 'scheduled.runNote.skipAdvance')
  if (payload.manual) return translate(language, 'scheduled.runNote.manual')
  if (payload.catchUp) return translate(language, 'scheduled.runNote.catchUp')
  return translate(language, 'scheduled.runNote.scheduled')
}

export function normalizeInput(input: ScheduledTaskInput): ScheduledTaskInput {
  return {
    ...input,
    name: input.name.trim(),
    prompt: input.prompt.trim(),
    projectPath: input.projectPath.trim(),
    hour: clampHour(input.hour),
    minute: clampMinute(input.minute),
    weeklyDay: input.weeklyDay,
    skipDays: normalizeSkipDays(input.skipDays),
    quietHoursStart: parseClockValue(input.quietHoursStart) ? input.quietHoursStart : null,
    quietHoursEnd: parseClockValue(input.quietHoursEnd) ? input.quietHoursEnd : null,
  }
}

export function normalizeRunRecord(record: ScheduledTaskRunRecord): ScheduledTaskRunRecord {
  return {
    ...record,
    sessionTabId: typeof record.sessionTabId === 'string' ? record.sessionTabId : null,
    status:
      record.status === 'running'
      || record.status === 'approval'
      || record.status === 'completed'
      || record.status === 'failed'
        ? record.status
        : null,
    summary: typeof record.summary === 'string' && record.summary.trim() ? record.summary.trim() : null,
    changedPaths: Array.isArray(record.changedPaths)
      ? record.changedPaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
      : [],
    cost: typeof record.cost === 'number' && Number.isFinite(record.cost) ? record.cost : null,
  }
}

export function normalizeTask(task: ScheduledTask): ScheduledTask {
  const input = normalizeInput(task)
  const nextRunAt = computeNextRunAt(input, task.lastRunAt ?? Date.now())
  return {
    ...task,
    ...input,
    nextRunAt: input.enabled && input.frequency !== 'manual' ? nextRunAt : null,
    runHistory: Array.isArray(task.runHistory)
      ? task.runHistory.map((record) => normalizeRunRecord(record))
      : [],
  }
}
