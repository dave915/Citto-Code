import { create } from 'zustand'
import { nanoid } from './nanoid'
import type { PermissionMode } from './sessions'

export type ScheduledTaskFrequency = 'manual' | 'hourly' | 'daily' | 'weekdays' | 'weekly'
export type ScheduledTaskDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
export type ScheduledTaskRunOutcome = 'executed' | 'skipped'
export type ScheduledTaskRunSnapshotStatus = 'running' | 'approval' | 'completed' | 'failed'

export type ScheduledTaskRunRecord = {
  id: string
  runAt: number
  outcome: ScheduledTaskRunOutcome
  note: string
  catchUp: boolean
  manual: boolean
  sessionTabId: string | null
  status: ScheduledTaskRunSnapshotStatus | null
  summary: string | null
  changedPaths: string[]
  cost: number | null
}

export type ScheduledTask = {
  id: string
  name: string
  prompt: string
  projectPath: string
  permissionMode: PermissionMode
  frequency: ScheduledTaskFrequency
  enabled: boolean
  hour: number
  minute: number
  weeklyDay: ScheduledTaskDay
  skipDays: ScheduledTaskDay[]
  quietHoursStart: string | null
  quietHoursEnd: string | null
  nextRunAt: number | null
  lastRunAt: number | null
  createdAt: number
  updatedAt: number
  runHistory: ScheduledTaskRunRecord[]
}

export type ScheduledTaskInput = Omit<
  ScheduledTask,
  'id' | 'nextRunAt' | 'lastRunAt' | 'createdAt' | 'updatedAt' | 'runHistory'
>

export type ScheduledTaskAdvancePayload = {
  taskId: string
  firedAt: number
  skipped?: boolean
  reason?: string
  catchUp?: boolean
  manual?: boolean
  sessionTabId?: string | null
}

type ScheduledTasksStore = {
  tasks: ScheduledTask[]
  addTask: (input: ScheduledTaskInput) => string
  updateTask: (taskId: string, input: ScheduledTaskInput) => void
  deleteTask: (taskId: string) => void
  toggleTaskEnabled: (taskId: string) => void
  applyAdvance: (payload: ScheduledTaskAdvancePayload) => void
  updateRunRecordSnapshot: (
    taskId: string,
    runAt: number,
    snapshot: {
      status: ScheduledTaskRunSnapshotStatus
      summary: string | null
      changedPaths: string[]
      cost: number | null
    },
  ) => void
  recomputeAll: () => void
}

export const DAY_OPTIONS: Array<{ value: ScheduledTaskDay; label: string; shortLabel: string }> = [
  { value: 'sun', label: '일요일', shortLabel: '일' },
  { value: 'mon', label: '월요일', shortLabel: '월' },
  { value: 'tue', label: '화요일', shortLabel: '화' },
  { value: 'wed', label: '수요일', shortLabel: '수' },
  { value: 'thu', label: '목요일', shortLabel: '목' },
  { value: 'fri', label: '금요일', shortLabel: '금' },
  { value: 'sat', label: '토요일', shortLabel: '토' },
]

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
const HISTORY_LIMIT = 24
const EXCEPTION_ADVANCE_LIMIT = 14

export function getDayKey(date: Date): ScheduledTaskDay {
  return DAY_OPTIONS[date.getDay()]?.value ?? 'sun'
}

function clampHour(value: number) {
  return Math.min(23, Math.max(0, Math.floor(value)))
}

function clampMinute(value: number) {
  return Math.min(59, Math.max(0, Math.floor(value)))
}

function parseClockValue(value: string | null): { hour: number; minute: number } | null {
  if (!value) return null
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  return {
    hour: clampHour(Number(match[1])),
    minute: clampMinute(Number(match[2])),
  }
}

function normalizeSkipDays(days: ScheduledTaskDay[]): ScheduledTaskDay[] {
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

export function computeNextRunAt(task: ScheduledTask | ScheduledTaskInput, fromTime = Date.now()): number | null {
  if (!task.enabled || task.frequency === 'manual') return null
  const base = moveToNextBaseTime(
    {
      ...task,
      id: 'preview',
      nextRunAt: null,
      lastRunAt: null,
      createdAt: 0,
      updatedAt: 0,
      runHistory: [],
    },
    new Date(fromTime),
  )
  return advancePastExceptions(
    {
      ...task,
      id: 'preview',
      nextRunAt: null,
      lastRunAt: null,
      createdAt: 0,
      updatedAt: 0,
      runHistory: [],
    },
    base?.getTime() ?? null,
  )
}

function buildRunNote(payload: ScheduledTaskAdvancePayload) {
  if (payload.reason?.trim()) return payload.reason.trim()
  if (payload.skipped) return '실행 없이 다음 예약으로 이동'
  if (payload.manual) return '지금 실행'
  if (payload.catchUp) return '놓친 실행 따라잡기'
  return '예약 실행'
}

function normalizeInput(input: ScheduledTaskInput): ScheduledTaskInput {
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

function normalizeRunRecord(record: ScheduledTaskRunRecord): ScheduledTaskRunRecord {
  return {
    ...record,
    sessionTabId: typeof record.sessionTabId === 'string' ? record.sessionTabId : null,
    status: record.status === 'running' || record.status === 'approval' || record.status === 'completed' || record.status === 'failed'
      ? record.status
      : null,
    summary: typeof record.summary === 'string' && record.summary.trim() ? record.summary.trim() : null,
    changedPaths: Array.isArray(record.changedPaths)
      ? record.changedPaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
      : [],
    cost: typeof record.cost === 'number' && Number.isFinite(record.cost) ? record.cost : null,
  }
}

function normalizeTask(task: ScheduledTask): ScheduledTask {
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

export const useScheduledTasksStore = create<ScheduledTasksStore>()(
  (set) => ({
    tasks: [],

    addTask: (input) => {
      const now = Date.now()
      const normalized = normalizeInput(input)
      const task: ScheduledTask = {
        id: nanoid(),
        ...normalized,
        nextRunAt: computeNextRunAt(normalized, now),
        lastRunAt: null,
        createdAt: now,
        updatedAt: now,
        runHistory: [],
      }

      set((state) => ({ tasks: [task, ...state.tasks] }))
      return task.id
    },

    updateTask: (taskId, input) => {
      const now = Date.now()
      const normalized = normalizeInput(input)
      set((state) => ({
        tasks: state.tasks.map((task) => (
          task.id === taskId
            ? {
                ...task,
                ...normalized,
                updatedAt: now,
                nextRunAt: computeNextRunAt(normalized, Math.max(now, task.lastRunAt ?? now)),
              }
            : task
        )),
      }))
    },

    deleteTask: (taskId) => {
      set((state) => ({ tasks: state.tasks.filter((task) => task.id !== taskId) }))
    },

    toggleTaskEnabled: (taskId) => {
      const now = Date.now()
      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId) return task
          const enabled = !task.enabled
          return {
            ...task,
            enabled,
            updatedAt: now,
            nextRunAt: enabled ? computeNextRunAt({ ...task, enabled }, now) : null,
          }
        }),
      }))
    },

    applyAdvance: (payload) => {
      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== payload.taskId) return task

          const nextRunAt = computeNextRunAt(task, payload.firedAt + 1000)
          const runRecord: ScheduledTaskRunRecord = {
            id: nanoid(),
            runAt: payload.firedAt,
            outcome: payload.skipped ? 'skipped' : 'executed',
            note: buildRunNote(payload),
            catchUp: Boolean(payload.catchUp),
            manual: Boolean(payload.manual),
            sessionTabId: payload.sessionTabId ?? null,
            status: payload.skipped ? null : 'running',
            summary: null,
            changedPaths: [],
            cost: null,
          }

          return {
            ...task,
            updatedAt: Date.now(),
            lastRunAt: payload.skipped ? task.lastRunAt : payload.firedAt,
            nextRunAt: task.enabled && task.frequency !== 'manual' ? nextRunAt : null,
            runHistory: [runRecord, ...task.runHistory].slice(0, HISTORY_LIMIT),
          }
        }),
      }))
    },

    updateRunRecordSnapshot: (taskId, runAt, snapshot) => {
      const normalizedChangedPaths = snapshot.changedPaths
        .filter((path) => path.trim().length > 0)
      const normalizedSummary = snapshot.summary?.trim() ? snapshot.summary.trim() : null
      const normalizedCost = typeof snapshot.cost === 'number' && Number.isFinite(snapshot.cost) ? snapshot.cost : null

      set((state) => {
        let changed = false

        const tasks = state.tasks.map((task) => {
          if (task.id !== taskId) return task

          const runHistory = task.runHistory.map((record) => {
            if (record.runAt !== runAt) return record

            const samePaths = record.changedPaths.length === normalizedChangedPaths.length
              && record.changedPaths.every((path, index) => path === normalizedChangedPaths[index])

            if (
              record.status === snapshot.status
              && record.summary === normalizedSummary
              && samePaths
              && record.cost === normalizedCost
            ) {
              return record
            }

            changed = true
            return {
              ...record,
              status: snapshot.status,
              summary: normalizedSummary,
              changedPaths: normalizedChangedPaths,
              cost: normalizedCost,
            }
          })

          return changed ? { ...task, runHistory } : task
        })

        return changed ? { tasks } : state
      })
    },

    recomputeAll: () => {
      set((state) => ({
        tasks: state.tasks.map((task) => ({
          ...normalizeTask(task),
          updatedAt: task.updatedAt,
          createdAt: task.createdAt,
        })),
      }))
    },
  }),
)
