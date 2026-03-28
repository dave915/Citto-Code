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
  model: string | null
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

export type ScheduledTasksStore = {
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
