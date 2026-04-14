import { ipcMain } from 'electron'
import type { AppPersistence } from '../persistence'
import type {
  LegacyScheduledTask,
  Session as PersistedSession,
  Workflow as PersistedWorkflow,
  WorkflowExecution as PersistedWorkflowExecution,
} from '../persistence-types'

type WorkflowExecutorLike = {
  syncClaudeRuntime: (config: {
    claudePath?: string | null
    envVars?: Record<string, string>
    defaultModel?: string | null
  }) => void
  syncWorkflows: (workflows: PersistedWorkflow[]) => void
  runNow: (workflowId: string) => Promise<{ ok: boolean; error?: string }>
  cancel: (workflowId: string) => { ok: boolean; error?: string }
}

type RegisterStorageIpcHandlersOptions = {
  appPersistence: AppPersistence
  userDataPath: string
  workflowExecutor: WorkflowExecutorLike
}

export function registerStorageIpcHandlers({
  appPersistence,
  userDataPath,
  workflowExecutor,
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
        legacyScheduledTasks?: LegacyScheduledTask[]
      } = {},
    ) => {
      const snapshot = await appPersistence.initializeAndLoad(userDataPath, {
        legacySessions,
        legacyScheduledTasks,
      })

      workflowExecutor.syncWorkflows(snapshot.workflows)

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
    'app-storage:save-workflows',
    async (
      _event,
      {
        workflows,
        executions,
      }: {
        workflows: PersistedWorkflow[]
        executions: PersistedWorkflowExecution[]
      },
    ) => {
      try {
        appPersistence.saveWorkflows(Array.isArray(workflows) ? workflows : [])
        appPersistence.saveWorkflowExecutions(Array.isArray(executions) ? executions : [])
        return { ok: true }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    },
  )

  ipcMain.handle('app:sync-workflows', (_event, { workflows }: { workflows: PersistedWorkflow[] }) => {
    workflowExecutor.syncWorkflows(Array.isArray(workflows) ? workflows : [])
    return { ok: true }
  })

  ipcMain.handle(
    'app:sync-claude-runtime',
    (
      _event,
      config: {
        claudePath?: string | null
        envVars?: Record<string, string>
        defaultModel?: string | null
      } = {},
    ) => {
      workflowExecutor.syncClaudeRuntime(config)
      return { ok: true }
    },
  )

  ipcMain.handle('app:mark-scheduled-tasks-migrated', (_event, { ids }: { ids: string[] }) => {
    try {
      appPersistence.markScheduledTasksMigrated(Array.isArray(ids) ? ids : [])
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('workflow:run-now', async (_event, { workflowId }: { workflowId: string }) => {
    return workflowExecutor.runNow(workflowId)
  })

  ipcMain.handle('workflow:cancel', (_event, { workflowId }: { workflowId: string }) => {
    return workflowExecutor.cancel(workflowId)
  })
}
