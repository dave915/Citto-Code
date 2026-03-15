import type { BrowserWindow } from 'electron'
import type { ScheduledTask as PersistedScheduledTask } from '../persistence-types'

export type ScheduledTaskFrequency = 'manual' | 'hourly' | 'daily' | 'weekdays' | 'weekly'
export type ScheduledTaskDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export type ScheduledTaskSyncItem = {
  id: string
  name: string
  prompt: string
  projectPath: string
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
  frequency: ScheduledTaskFrequency
  enabled: boolean
  hour: number
  minute: number
  weeklyDay: ScheduledTaskDay
  skipDays: ScheduledTaskDay[]
  quietHoursStart: string | null
  quietHoursEnd: string | null
  nextRunAt: number | null
}

type CreateScheduledTaskSchedulerOptions = {
  getMainWindow: () => BrowserWindow | null
  showMainWindow: () => BrowserWindow
  sendWhenRendererReady: (window: BrowserWindow, channel: string, payload?: unknown) => void
  getProjectNameFromPath: (path: string) => string
  schedulePollIntervalMs?: number
  missedRunLimitMs?: number
  catchUpThresholdMs?: number
}

const DEFAULT_SCHEDULE_POLL_INTERVAL = 60 * 1000
const DEFAULT_MISSED_RUN_LIMIT = 7 * 24 * 60 * 60 * 1000
const DEFAULT_CATCHUP_THRESHOLD = 5 * 60 * 1000

export function normalizeScheduledTasks(tasks: ScheduledTaskSyncItem[]): ScheduledTaskSyncItem[] {
  const seen = new Set<string>()
  const normalized: ScheduledTaskSyncItem[] = []

  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue
    if (typeof task.id !== 'string' || !task.id.trim() || seen.has(task.id)) continue
    seen.add(task.id)
    normalized.push({
      id: task.id,
      name: typeof task.name === 'string' ? task.name.trim() : '',
      prompt: typeof task.prompt === 'string' ? task.prompt : '',
      projectPath: typeof task.projectPath === 'string' ? task.projectPath : '',
      permissionMode: task.permissionMode === 'acceptEdits' || task.permissionMode === 'bypassPermissions'
        ? task.permissionMode
        : 'default',
      frequency: ['manual', 'hourly', 'daily', 'weekdays', 'weekly'].includes(task.frequency)
        ? task.frequency
        : 'manual',
      enabled: Boolean(task.enabled),
      hour: Number.isFinite(task.hour) ? Math.max(0, Math.min(23, Math.floor(task.hour))) : 0,
      minute: Number.isFinite(task.minute) ? Math.max(0, Math.min(59, Math.floor(task.minute))) : 0,
      weeklyDay: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(task.weeklyDay)
        ? task.weeklyDay
        : 'mon',
      skipDays: Array.isArray(task.skipDays)
        ? task.skipDays.filter((value): value is ScheduledTaskDay => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(value))
        : [],
      quietHoursStart: typeof task.quietHoursStart === 'string' ? task.quietHoursStart : null,
      quietHoursEnd: typeof task.quietHoursEnd === 'string' ? task.quietHoursEnd : null,
      nextRunAt: typeof task.nextRunAt === 'number' && Number.isFinite(task.nextRunAt) ? task.nextRunAt : null,
    })
  }

  return normalized
}

export function mapPersistedScheduledTaskToSyncItem(task: PersistedScheduledTask): ScheduledTaskSyncItem {
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    projectPath: task.projectPath,
    permissionMode: task.permissionMode,
    frequency: task.frequency,
    enabled: task.enabled,
    hour: task.hour,
    minute: task.minute,
    weeklyDay: task.weeklyDay,
    skipDays: task.skipDays,
    quietHoursStart: task.quietHoursStart,
    quietHoursEnd: task.quietHoursEnd,
    nextRunAt: task.nextRunAt,
  }
}

export function createScheduledTaskScheduler({
  getMainWindow,
  showMainWindow,
  sendWhenRendererReady,
  getProjectNameFromPath,
  schedulePollIntervalMs = DEFAULT_SCHEDULE_POLL_INTERVAL,
  missedRunLimitMs = DEFAULT_MISSED_RUN_LIMIT,
  catchUpThresholdMs = DEFAULT_CATCHUP_THRESHOLD,
}: CreateScheduledTaskSchedulerOptions) {
  let scheduledTasks: ScheduledTaskSyncItem[] = []
  let scheduledTaskInterval: NodeJS.Timeout | null = null
  let nextScheduledTaskTimeout: NodeJS.Timeout | null = null

  const getScheduledTaskWindow = () => {
    const currentWindow = getMainWindow()
    if (currentWindow && !currentWindow.isDestroyed()) return currentWindow
    return showMainWindow()
  }

  const clearScheduledTaskTimeout = () => {
    if (!nextScheduledTaskTimeout) return
    clearTimeout(nextScheduledTaskTimeout)
    nextScheduledTaskTimeout = null
  }

  const scheduleNextTaskCheck = () => {
    clearScheduledTaskTimeout()

    const now = Date.now()
    const nextTask = scheduledTasks
      .filter((task) => task.enabled && task.frequency !== 'manual' && typeof task.nextRunAt === 'number' && task.nextRunAt > now)
      .sort((a, b) => (a.nextRunAt ?? Number.POSITIVE_INFINITY) - (b.nextRunAt ?? Number.POSITIVE_INFINITY))[0]

    if (!nextTask?.nextRunAt) return

    const delay = Math.max(0, nextTask.nextRunAt - now)
    nextScheduledTaskTimeout = setTimeout(() => {
      nextScheduledTaskTimeout = null
      void checkMissedRuns()
    }, delay)
  }

  const emitScheduledTaskAdvance = (payload: {
    taskId: string
    firedAt: number
    skipped?: boolean
    reason?: string
    catchUp?: boolean
    manual?: boolean
  }) => {
    const window = getScheduledTaskWindow()
    sendWhenRendererReady(window, 'scheduled-tasks:advance', payload)
  }

  const holdScheduledTaskUntilSync = (taskId: string) => {
    scheduledTasks = scheduledTasks.map((task) => (
      task.id === taskId ? { ...task, nextRunAt: null } : task
    ))
  }

  const fireScheduledTask = (task: ScheduledTaskSyncItem, options?: { catchUp?: boolean; manual?: boolean }) => {
    const firedAt = Date.now()
    const lateness = typeof task.nextRunAt === 'number' ? firedAt - task.nextRunAt : 0
    const catchUp = Boolean(options?.catchUp) || (!options?.manual && lateness > catchUpThresholdMs)
    const manual = Boolean(options?.manual)
    const window = getScheduledTaskWindow()

    sendWhenRendererReady(window, 'scheduled-tasks:fired', {
      taskId: task.id,
      name: task.name || getProjectNameFromPath(task.projectPath),
      prompt: task.prompt,
      cwd: task.projectPath,
      permissionMode: task.permissionMode,
      firedAt,
      catchUp,
      manual,
    })

    emitScheduledTaskAdvance({
      taskId: task.id,
      firedAt,
      catchUp,
      manual,
    })
    holdScheduledTaskUntilSync(task.id)
  }

  const checkMissedRuns = async () => {
    const now = Date.now()

    for (const task of scheduledTasks) {
      if (!task.enabled || task.frequency === 'manual' || task.nextRunAt == null || task.nextRunAt > now) continue

      const lateness = now - task.nextRunAt
      if (lateness > missedRunLimitMs) {
        emitScheduledTaskAdvance({
          taskId: task.id,
          firedAt: now,
          skipped: true,
          reason: '7일을 초과해 놓친 실행은 건너뛰고 다음 예약으로 이동합니다.',
          catchUp: true,
        })
        holdScheduledTaskUntilSync(task.id)
        continue
      }

      fireScheduledTask(task, { catchUp: lateness > catchUpThresholdMs })
    }

    scheduleNextTaskCheck()
  }

  return {
    setTasks(tasks: ScheduledTaskSyncItem[]) {
      scheduledTasks = normalizeScheduledTasks(tasks)
      scheduleNextTaskCheck()
    },

    start() {
      if (!scheduledTaskInterval) {
        scheduledTaskInterval = setInterval(() => {
          void checkMissedRuns()
        }, schedulePollIntervalMs)
      }
      scheduleNextTaskCheck()
    },

    stop() {
      if (scheduledTaskInterval) {
        clearInterval(scheduledTaskInterval)
        scheduledTaskInterval = null
      }
      clearScheduledTaskTimeout()
    },

    async checkMissedRuns() {
      await checkMissedRuns()
    },

    syncTasks(tasks: ScheduledTaskSyncItem[]) {
      scheduledTasks = normalizeScheduledTasks(tasks)
      scheduleNextTaskCheck()
      void checkMissedRuns()
    },

    runNow(taskId: string) {
      const task = scheduledTasks.find((item) => item.id === taskId)
      if (!task) {
        return { ok: false, error: '작업을 찾을 수 없습니다.' }
      }

      fireScheduledTask(task, { manual: true })
      scheduleNextTaskCheck()
      return { ok: true }
    },
  }
}
