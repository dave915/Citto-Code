import { ipcMain } from 'electron'
import type { AppPersistence } from '../persistence'
import type { Session as PersistedSession, ScheduledTask as PersistedScheduledTask } from '../persistence-types'
import type { ScheduledTaskSyncItem } from '../services/scheduledTaskScheduler'

type ScheduledTaskSchedulerLike = {
  syncTasks: (tasks: ScheduledTaskSyncItem[]) => void
  runNow: (taskId: string) => { ok: boolean; error?: string }
}

type RegisterStorageIpcHandlersOptions = {
  appPersistence: AppPersistence
  userDataPath: string
  scheduledTaskScheduler: ScheduledTaskSchedulerLike
  mapPersistedScheduledTaskToSyncItem: (task: PersistedScheduledTask) => ScheduledTaskSyncItem
}

export function registerStorageIpcHandlers({
  appPersistence,
  userDataPath,
  scheduledTaskScheduler,
  mapPersistedScheduledTaskToSyncItem,
}: RegisterStorageIpcHandlersOptions) {
  ipcMain.handle(
    'app-storage:init',
    async (
      _event,
      {
        legacySessions,
        legacyScheduledTasks,
      }: {
        legacySessions?: PersistedSession[]
        legacyScheduledTasks?: PersistedScheduledTask[]
      } = {},
    ) => {
      const snapshot = await appPersistence.initializeAndLoad(userDataPath, {
        legacySessions,
        legacyScheduledTasks,
      })

      scheduledTaskScheduler.syncTasks(
        snapshot.scheduledTasks.map(mapPersistedScheduledTaskToSyncItem),
      )

      return snapshot
    },
  )

  ipcMain.handle(
    'app-storage:save-sessions',
    async (
      _event,
      { sessions }: { sessions: PersistedSession[] },
    ) => {
      try {
        appPersistence.saveSessions(Array.isArray(sessions) ? sessions : [])
        return { ok: true }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    },
  )

  ipcMain.handle(
    'app-storage:save-scheduled-tasks',
    async (
      _event,
      { tasks }: { tasks: PersistedScheduledTask[] },
    ) => {
      try {
        appPersistence.saveScheduledTasks(Array.isArray(tasks) ? tasks : [])
        return { ok: true }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    },
  )

  ipcMain.handle('scheduled-tasks:sync', (_event, { tasks }: { tasks: ScheduledTaskSyncItem[] }) => {
    scheduledTaskScheduler.syncTasks(Array.isArray(tasks) ? tasks : [])
    return { ok: true }
  })

  ipcMain.handle('scheduled-tasks:run-now', (_event, { taskId }: { taskId: string }) => {
    return scheduledTaskScheduler.runNow(taskId)
  })
}
