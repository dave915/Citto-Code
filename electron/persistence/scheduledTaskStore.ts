import type { ScheduledTask, ScheduledTaskRunRecord } from '../persistence-types'
import {
  normalizePersistedModelSelection,
  normalizeScheduledTasks,
  parsePermissionMode,
  parseRunOutcome,
  parseRunStatus,
  parseScheduledTaskDay,
  parseScheduledTaskFrequency,
  parseStringArray,
  stringifyJson,
  toBooleanNumber,
} from './normalizers'
import type {
  PersistedScheduledTaskRow,
  PersistedScheduledTaskRunRow,
} from './rowTypes'
import type { PersistenceQuery, PersistenceRun, PersistenceTransaction } from './operations'

export function loadScheduledTasksFromStore(query: PersistenceQuery): ScheduledTask[] {
  const taskRows = query<PersistedScheduledTaskRow>(
    'SELECT * FROM scheduled_tasks WHERE migrated_at IS NULL ORDER BY sort_order ASC',
  )
  const runRows = query<PersistedScheduledTaskRunRow>(
    'SELECT * FROM scheduled_task_runs ORDER BY task_id ASC, sort_order ASC',
  )

  const runsByTaskId = new Map<string, ScheduledTaskRunRecord[]>()
  for (const row of runRows) {
    const existing = runsByTaskId.get(row.task_id) ?? []
    existing.push({
      id: row.id,
      runAt: row.run_at,
      outcome: parseRunOutcome(row.outcome),
      note: row.note,
      catchUp: Boolean(row.catch_up),
      manual: Boolean(row.manual),
      sessionTabId: row.session_tab_id,
      status: parseRunStatus(row.status),
      summary: row.summary,
      changedPaths: parseStringArray(row.changed_paths_json),
      cost: row.cost,
    })
    runsByTaskId.set(row.task_id, existing)
  }

  return taskRows.map((row) => ({
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    projectPath: row.project_path,
    model: normalizePersistedModelSelection(row.model),
    permissionMode: parsePermissionMode(row.permission_mode),
    frequency: parseScheduledTaskFrequency(row.frequency),
    enabled: Boolean(row.enabled),
    hour: row.hour,
    minute: row.minute,
    weeklyDay: parseScheduledTaskDay(row.weekly_day),
    skipDays: parseStringArray(row.skip_days_json).map((day) => parseScheduledTaskDay(day)),
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    runHistory: runsByTaskId.get(row.id) ?? [],
  }))
}

export function saveScheduledTasksToStore(
  runInTransaction: PersistenceTransaction,
  run: PersistenceRun,
  tasks: ScheduledTask[],
): void {
  const normalizedTasks = normalizeScheduledTasks(tasks)

  runInTransaction(() => {
    run('DELETE FROM scheduled_task_runs')
    run('DELETE FROM scheduled_tasks')

    for (const [taskIndex, task] of normalizedTasks.entries()) {
      run(
        `INSERT INTO scheduled_tasks (
          id,
          name,
          prompt,
          project_path,
          model,
          permission_mode,
          frequency,
          enabled,
          hour,
          minute,
          weekly_day,
          skip_days_json,
          quiet_hours_start,
          quiet_hours_end,
          next_run_at,
          last_run_at,
          created_at,
          updated_at,
          sort_order
        ) VALUES (
          :id,
          :name,
          :prompt,
          :projectPath,
          :model,
          :permissionMode,
          :frequency,
          :enabled,
          :hour,
          :minute,
          :weeklyDay,
          :skipDaysJson,
          :quietHoursStart,
          :quietHoursEnd,
          :nextRunAt,
          :lastRunAt,
          :createdAt,
          :updatedAt,
          :sortOrder
        )`,
        {
          ':id': task.id,
          ':name': task.name,
          ':prompt': task.prompt,
          ':projectPath': task.projectPath,
          ':model': task.model,
          ':permissionMode': task.permissionMode,
          ':frequency': task.frequency,
          ':enabled': toBooleanNumber(task.enabled),
          ':hour': task.hour,
          ':minute': task.minute,
          ':weeklyDay': task.weeklyDay,
          ':skipDaysJson': stringifyJson(task.skipDays),
          ':quietHoursStart': task.quietHoursStart,
          ':quietHoursEnd': task.quietHoursEnd,
          ':nextRunAt': task.nextRunAt,
          ':lastRunAt': task.lastRunAt,
          ':createdAt': task.createdAt,
          ':updatedAt': task.updatedAt,
          ':sortOrder': taskIndex,
        },
      )

      for (const [runIndex, runRecord] of task.runHistory.entries()) {
        run(
          `INSERT INTO scheduled_task_runs (
            id,
            task_id,
            run_at,
            outcome,
            note,
            catch_up,
            manual,
            session_tab_id,
            status,
            summary,
            changed_paths_json,
            cost,
            sort_order
          ) VALUES (
            :id,
            :taskId,
            :runAt,
            :outcome,
            :note,
            :catchUp,
            :manual,
            :sessionTabId,
            :status,
            :summary,
            :changedPathsJson,
            :cost,
            :sortOrder
          )`,
          {
            ':id': runRecord.id,
            ':taskId': task.id,
            ':runAt': runRecord.runAt,
            ':outcome': runRecord.outcome,
            ':note': runRecord.note,
            ':catchUp': toBooleanNumber(runRecord.catchUp),
            ':manual': toBooleanNumber(runRecord.manual),
            ':sessionTabId': runRecord.sessionTabId,
            ':status': runRecord.status,
            ':summary': runRecord.summary,
            ':changedPathsJson': stringifyJson(runRecord.changedPaths),
            ':cost': runRecord.cost,
            ':sortOrder': runIndex,
          },
        )
      }
    }
  })
}
