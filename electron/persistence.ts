import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import initSqlJs, {
  type BindParams,
  type SqlJsDatabase,
  type SqlJsExecResult,
  type SqlValue,
} from 'sql.js/dist/sql-asm.js'
import type { ScheduledTask, Session, Workflow, WorkflowExecution } from './persistence-types'
import { DB_FILE_NAME, SCHEMA_SQL } from './persistence/dbSchema'
import {
  normalizeScheduledTasks,
  normalizeSessions,
  normalizeWorkflowExecutions,
  normalizeWorkflows,
  parseJsonValue,
  stringifyJson,
} from './persistence/normalizers'
import { rowNumber, type PersistedWorkflowExecutionRow, type PersistedWorkflowRow } from './persistence/rowTypes'
import { loadScheduledTasksFromStore, saveScheduledTasksToStore } from './persistence/scheduledTaskStore'
import { loadSessionsFromStore, saveSessionsToStore } from './persistence/sessionStore'

type PersistenceBootstrapPayload = {
  legacySessions?: unknown
  legacyScheduledTasks?: unknown
}

export type PersistenceSnapshot = {
  sessions: Session[]
  scheduledTasks: ScheduledTask[]
  workflows: Workflow[]
  workflowExecutions: WorkflowExecution[]
  migratedSessions: boolean
  migratedScheduledTasks: boolean
}

export class AppPersistence {
  private dbPath: string | null = null

  private db: SqlJsDatabase | null = null

  private initializing: Promise<void> | null = null

  async initialize(userDataPath: string): Promise<void> {
    if (this.db) return
    if (this.initializing) return this.initializing

    this.initializing = (async () => {
      this.dbPath = join(userDataPath, 'storage', DB_FILE_NAME)
      const SQL = await initSqlJs()
      const fileData = this.dbPath && existsSync(this.dbPath)
        ? readFileSync(this.dbPath)
        : undefined

      this.db = new SQL.Database(fileData)
      this.exec(SCHEMA_SQL)
      this.ensureSessionColumns()
      this.ensureMessageColumns()
      this.ensureScheduledTaskColumns()
      this.flush()
    })()

    try {
      await this.initializing
    } finally {
      this.initializing = null
    }
  }

  async initializeAndLoad(
    userDataPath: string,
    payload?: PersistenceBootstrapPayload,
  ): Promise<PersistenceSnapshot> {
    await this.initialize(userDataPath)

    const legacySessions = normalizeSessions(payload?.legacySessions)
    const legacyScheduledTasks = normalizeScheduledTasks(payload?.legacyScheduledTasks)

    const hasStoredSessions = this.count('sessions') > 0
    const hasStoredTasks = this.count('scheduled_tasks') > 0

    let migratedSessions = false
    let migratedScheduledTasks = false

    if (!hasStoredSessions && legacySessions.length > 0) {
      this.saveSessions(legacySessions)
      migratedSessions = true
    }

    if (!hasStoredTasks && legacyScheduledTasks.length > 0) {
      this.saveScheduledTasks(legacyScheduledTasks)
      migratedScheduledTasks = true
    }

    return {
      sessions: this.loadSessions(),
      scheduledTasks: this.loadScheduledTasks(),
      workflows: this.loadWorkflows(),
      workflowExecutions: this.loadWorkflowExecutions(),
      migratedSessions,
      migratedScheduledTasks,
    }
  }

  loadSessions(): Session[] {
    return loadSessionsFromStore(this.query.bind(this))
  }

  saveSessions(sessions: Session[]): void {
    saveSessionsToStore(this.runInTransaction.bind(this), this.run.bind(this), sessions)
  }

  loadScheduledTasks(): ScheduledTask[] {
    return loadScheduledTasksFromStore(this.query.bind(this))
  }

  saveScheduledTasks(tasks: ScheduledTask[]): void {
    saveScheduledTasksToStore(this.runInTransaction.bind(this), this.run.bind(this), tasks)
  }

  loadWorkflows(): Workflow[] {
    const rows = this.query<PersistedWorkflowRow>('SELECT * FROM workflows ORDER BY sort_order ASC')
    return normalizeWorkflows(rows.map((row) => ({
      id: row.id,
      name: row.name,
      steps: parseJsonValue(row.steps_json),
      trigger: parseJsonValue(row.trigger_json),
      active: Boolean(row.active),
      nextRunAt: row.next_run_at,
      lastRunAt: row.last_run_at,
      nodePositions: parseJsonValue(row.node_positions_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })))
  }

  saveWorkflows(workflows: Workflow[]): void {
    const normalizedWorkflows = normalizeWorkflows(workflows)
    this.runInTransaction(() => {
      this.run('DELETE FROM workflows')
      for (const [index, workflow] of normalizedWorkflows.entries()) {
        this.run(
          `INSERT INTO workflows (
            id,
            name,
            steps_json,
            trigger_json,
            active,
            next_run_at,
            last_run_at,
            node_positions_json,
            created_at,
            updated_at,
            sort_order
          ) VALUES (
            :id,
            :name,
            :stepsJson,
            :triggerJson,
            :active,
            :nextRunAt,
            :lastRunAt,
            :nodePositionsJson,
            :createdAt,
            :updatedAt,
            :sortOrder
          )`,
          {
            ':id': workflow.id,
            ':name': workflow.name,
            ':stepsJson': stringifyJson(workflow.steps) ?? '[]',
            ':triggerJson': stringifyJson(workflow.trigger) ?? '{"type":"manual"}',
            ':active': workflow.active ? 1 : 0,
            ':nextRunAt': workflow.nextRunAt,
            ':lastRunAt': workflow.lastRunAt,
            ':nodePositionsJson': stringifyJson(workflow.nodePositions),
            ':createdAt': workflow.createdAt,
            ':updatedAt': workflow.updatedAt,
            ':sortOrder': index,
          },
        )
      }
    })
  }

  loadWorkflowExecutions(): WorkflowExecution[] {
    const rows = this.query<PersistedWorkflowExecutionRow>(
      'SELECT * FROM workflow_executions ORDER BY sort_order ASC',
    )
    return normalizeWorkflowExecutions(rows.map((row) => ({
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      triggeredBy: row.triggered_by,
      firedAt: row.fired_at,
      finishedAt: row.finished_at,
      status: row.status,
      stepResults: parseJsonValue(row.step_results_json),
    })))
  }

  saveWorkflowExecutions(executions: WorkflowExecution[]): void {
    const normalizedExecutions = normalizeWorkflowExecutions(executions)
    this.runInTransaction(() => {
      this.run('DELETE FROM workflow_executions')
      for (const [index, execution] of normalizedExecutions.entries()) {
        this.run(
          `INSERT INTO workflow_executions (
            id,
            workflow_id,
            workflow_name,
            triggered_by,
            fired_at,
            finished_at,
            status,
            step_results_json,
            sort_order
          ) VALUES (
            :id,
            :workflowId,
            :workflowName,
            :triggeredBy,
            :firedAt,
            :finishedAt,
            :status,
            :stepResultsJson,
            :sortOrder
          )`,
          {
            ':id': execution.id,
            ':workflowId': execution.workflowId,
            ':workflowName': execution.workflowName,
            ':triggeredBy': execution.triggeredBy,
            ':firedAt': execution.firedAt,
            ':finishedAt': execution.finishedAt,
            ':status': execution.status,
            ':stepResultsJson': stringifyJson(execution.stepResults) ?? '[]',
            ':sortOrder': index,
          },
        )
      }
    })
  }

  getDatabasePath(): string | null {
    return this.dbPath
  }

  private count(tableName: string): number {
    const rows = this.query<Record<string, SqlValue>>(`SELECT COUNT(*) AS count FROM ${tableName}`)
    return rows.length > 0 ? rowNumber(rows[0], 'count') : 0
  }

  private query<T>(sql: string, params?: BindParams): T[] {
    const db = this.requireDb()
    const stmt = db.prepare(sql, params)
    const rows: T[] = []

    try {
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as unknown as T)
      }
    } finally {
      stmt.free()
    }

    return rows
  }

  private exec(sql: string, params?: BindParams): SqlJsExecResult[] {
    return this.requireDb().exec(sql, params)
  }

  private ensureSessionColumns(): void {
    const rows = this.query<Record<string, SqlValue>>('PRAGMA table_info(sessions)')
    const columns = new Set(
      rows
        .map((row) => row.name)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )

    if (!columns.has('input_tokens')) {
      this.run('ALTER TABLE sessions ADD COLUMN input_tokens INTEGER')
    }
  }

  private ensureMessageColumns(): void {
    const rows = this.query<Record<string, SqlValue>>('PRAGMA table_info(messages)')
    const columns = new Set(
      rows
        .map((row) => row.name)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )

    if (!columns.has('btw_cards_json')) {
      this.run('ALTER TABLE messages ADD COLUMN btw_cards_json TEXT')
    }
  }

  private ensureScheduledTaskColumns(): void {
    const rows = this.query<Record<string, SqlValue>>('PRAGMA table_info(scheduled_tasks)')
    const columns = new Set(
      rows
        .map((row) => row.name)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )

    if (!columns.has('model')) {
      this.run('ALTER TABLE scheduled_tasks ADD COLUMN model TEXT')
    }
  }

  private run(sql: string, params?: BindParams): void {
    this.requireDb().run(sql, params)
  }

  private runInTransaction(action: () => void): void {
    const db = this.requireDb()
    db.run('BEGIN')
    try {
      action()
      db.run('COMMIT')
      this.flush()
    } catch (error) {
      db.run('ROLLBACK')
      throw error
    }
  }

  private flush(): void {
    const db = this.requireDb()
    const dbPath = this.dbPath
    if (!dbPath) {
      throw new Error('Database path is not initialized.')
    }

    const dir = dirname(dbPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(dbPath, Buffer.from(db.export()))
  }

  private requireDb(): SqlJsDatabase {
    if (!this.db) {
      throw new Error('Persistence database is not initialized.')
    }
    return this.db
  }
}
