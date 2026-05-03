import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import initSqlJs, {
  type BindParams,
  type SqlJsDatabase,
  type SqlJsExecResult,
  type SqlValue,
} from 'sql.js/dist/sql-asm.js'
import type {
  LegacyScheduledTask,
  ScheduledTask,
  Session,
  Workflow,
  WorkflowExecution,
} from './persistence-types'
import type {
  SecretaryConversation,
  SecretaryHistoryEntry,
  SecretaryHistoryRole,
  SecretaryIntent,
  SecretaryPattern,
  SecretaryPatternType,
  SecretaryProfile,
  SecretarySearchResult,
} from './secretary/types'
import { normalizeSecretaryAction } from './secretary/actions'
import { isCittoRoute } from './secretary/routes'
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
  legacyScheduledTasks: LegacyScheduledTask[]
  workflows: Workflow[]
  workflowExecutions: WorkflowExecution[]
  migratedSessions: boolean
  migratedScheduledTasks: boolean
}

const SCHEDULED_TASK_DAY_TO_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

function normalizeSecretarySearchResults(value: unknown): SecretarySearchResult[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry): SecretarySearchResult | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const record = entry as Record<string, unknown>
      const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : null
      const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : null
      const type = typeof record.type === 'string' && record.type.trim() ? record.type.trim() : null
      if (!id || !label || !type) return null

      return {
        id,
        label,
        type,
        excerpt: typeof record.excerpt === 'string' && record.excerpt.trim() ? record.excerpt.trim() : undefined,
        route: isCittoRoute(record.route) ? record.route : undefined,
        sessionId: typeof record.sessionId === 'string' && record.sessionId.trim() ? record.sessionId.trim() : undefined,
        updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : undefined,
      }
    })
    .filter((entry): entry is SecretarySearchResult => Boolean(entry))
    .slice(0, 6)
}

const REQUIRED_TABLES = [
  'sessions',
  'messages',
  'tool_calls',
  'attachments',
  'scheduled_tasks',
  'scheduled_task_runs',
  'workflows',
  'workflow_executions',
  'secretary_profile',
  'secretary_conversations',
  'secretary_history',
  'secretary_patterns',
] as const

export class AppPersistence {
  private dbPath: string | null = null

  private db: SqlJsDatabase | null = null

  private sql: Awaited<ReturnType<typeof initSqlJs>> | null = null

  private initializing: Promise<void> | null = null

  async initialize(userDataPath: string): Promise<void> {
    if (this.db) return
    if (this.initializing) return this.initializing

    this.initializing = (async () => {
      this.dbPath = join(userDataPath, 'storage', DB_FILE_NAME)
      const SQL = await initSqlJs()
      this.sql = SQL
      const fileData = this.dbPath && existsSync(this.dbPath)
        ? readFileSync(this.dbPath)
        : undefined

      this.db = new SQL.Database(fileData)
      this.exec(SCHEMA_SQL)
      this.ensureRequiredTables()
      this.ensureSessionColumns()
      this.ensureMessageColumns()
      this.ensureScheduledTaskColumns()
      this.ensureSecretaryColumns()
      this.flush()
    })()

    try {
      await this.initializing
    } catch (error) {
      this.db = null
      this.sql = null
      throw error
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
      legacyScheduledTasks: this.loadLegacyScheduledTasks(),
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

  loadLegacyScheduledTasks(): LegacyScheduledTask[] {
    return this.loadScheduledTasks().map((task) => ({
      id: task.id,
      name: task.name,
      prompt: task.prompt,
      cwd: task.projectPath,
      model: task.model,
      permissionMode: task.permissionMode,
      frequency: task.frequency,
      active: task.enabled,
      hour: task.hour,
      minute: task.minute,
      dayOfWeek: SCHEDULED_TASK_DAY_TO_INDEX[task.weeklyDay] ?? 0,
    }))
  }

  saveScheduledTasks(tasks: ScheduledTask[]): void {
    saveScheduledTasksToStore(this.runInTransaction.bind(this), this.run.bind(this), tasks)
  }

  markScheduledTasksMigrated(ids: string[]): void {
    const normalizedIds = ids.filter((id) => typeof id === 'string' && id.trim().length > 0)
    if (normalizedIds.length === 0) return

    const migratedAt = Date.now()
    this.runInTransaction(() => {
      for (const id of normalizedIds) {
        this.run(
          'UPDATE scheduled_tasks SET migrated_at = :migratedAt WHERE id = :id',
          {
            ':migratedAt': migratedAt,
            ':id': id,
          },
        )
      }
    })
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

  getSecretaryProfile(): SecretaryProfile {
    const rows = this.query<{ key: string; value: string | null }>(
      'SELECT key, value FROM secretary_profile ORDER BY key ASC',
    )
    return Object.fromEntries(
      rows
        .filter((row) => typeof row.key === 'string' && row.key.trim())
        .map((row) => [row.key, row.value ?? '']),
    )
  }

  updateSecretaryProfile(key: string, value: string): void {
    const normalizedKey = key.trim()
    if (!normalizedKey) return

    this.run(
      `INSERT INTO secretary_profile (key, value, updated_at)
       VALUES (:key, :value, :updatedAt)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      {
        ':key': normalizedKey,
        ':value': value,
        ':updatedAt': Date.now(),
      },
    )
    this.flush()
  }

  listSecretaryConversations(limit = 50): SecretaryConversation[] {
    const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit)))
    const rows = this.query<{
      id: string
      title: string | null
      citto_context: string | null
      created_at: number | null
      updated_at: number | null
      archived_at: number | null
    }>(
      `SELECT *
       FROM secretary_conversations
       WHERE archived_at IS NULL
       ORDER BY updated_at DESC, created_at DESC
       LIMIT :limit`,
      { ':limit': boundedLimit },
    )

    return rows.map((row) => ({
      id: row.id,
      title: row.title?.trim() || '새 대화',
      cittoContext: row.citto_context ?? null,
      createdAt: Number(row.created_at ?? 0),
      updatedAt: Number(row.updated_at ?? row.created_at ?? 0),
      archivedAt: row.archived_at == null ? null : Number(row.archived_at),
    }))
  }

  getSecretaryConversation(id: string): SecretaryConversation | null {
    const rows = this.query<{
      id: string
      title: string | null
      citto_context: string | null
      created_at: number | null
      updated_at: number | null
      archived_at: number | null
    }>(
      'SELECT * FROM secretary_conversations WHERE id = :id LIMIT 1',
      { ':id': id },
    )
    const row = rows[0]
    if (!row || row.archived_at != null) return null

    return {
      id: row.id,
      title: row.title?.trim() || '새 대화',
      cittoContext: row.citto_context ?? null,
      createdAt: Number(row.created_at ?? 0),
      updatedAt: Number(row.updated_at ?? row.created_at ?? 0),
      archivedAt: null,
    }
  }

  createSecretaryConversation(entry: {
    id: string
    title?: string | null
    cittoContext?: string | null
  }): SecretaryConversation {
    const now = Date.now()
    const title = entry.title?.trim() || '새 대화'
    this.run(
      `INSERT INTO secretary_conversations (
        id,
        title,
        citto_context,
        created_at,
        updated_at,
        archived_at
      ) VALUES (
        :id,
        :title,
        :cittoContext,
        :createdAt,
        :updatedAt,
        NULL
      )`,
      {
        ':id': entry.id,
        ':title': title,
        ':cittoContext': entry.cittoContext ?? null,
        ':createdAt': now,
        ':updatedAt': now,
      },
    )
    this.flush()

    return {
      id: entry.id,
      title,
      cittoContext: entry.cittoContext ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    }
  }

  updateSecretaryConversationTitle(id: string, title: string): SecretaryConversation | null {
    const normalizedTitle = title.trim()
    if (!normalizedTitle) return this.getSecretaryConversation(id)
    this.run(
      `UPDATE secretary_conversations
       SET title = :title, updated_at = :updatedAt
       WHERE id = :id AND archived_at IS NULL`,
      {
        ':id': id,
        ':title': normalizedTitle,
        ':updatedAt': Date.now(),
      },
    )
    this.flush()
    return this.getSecretaryConversation(id)
  }

  touchSecretaryConversation(id: string): void {
    this.run(
      `UPDATE secretary_conversations
       SET updated_at = :updatedAt
       WHERE id = :id AND archived_at IS NULL`,
      {
        ':id': id,
        ':updatedAt': Date.now(),
      },
    )
    this.flush()
  }

  archiveSecretaryConversation(id: string): void {
    const now = Date.now()
    this.run(
      `UPDATE secretary_conversations
       SET archived_at = :archivedAt, updated_at = :archivedAt
       WHERE id = :id`,
      {
        ':id': id,
        ':archivedAt': now,
      },
    )
    this.flush()
  }

  countSecretaryHistory(conversationId: string): number {
    const rows = this.query<Record<string, SqlValue>>(
      `SELECT COUNT(*) AS count
       FROM secretary_history
       WHERE conversation_id = :conversationId`,
      { ':conversationId': conversationId },
    )
    return rows.length > 0 ? rowNumber(rows[0], 'count') : 0
  }

  addSecretaryHistory(entry: {
    conversationId: string
    role: SecretaryHistoryRole
    content: string
    intent?: SecretaryIntent | null
    action?: SecretaryHistoryEntry['action']
    searchResults?: SecretarySearchResult[]
  }): void {
    const content = entry.content.trim()
    if (!content) return
    this.run(
      `INSERT INTO secretary_history (
        conversation_id,
        role,
        content,
        intent,
        action_json,
        search_results_json,
        created_at
      ) VALUES (
        :conversationId,
        :role,
        :content,
        :intent,
        :actionJson,
        :searchResultsJson,
        :createdAt
      )`,
      {
        ':conversationId': entry.conversationId,
        ':role': entry.role,
        ':content': content,
        ':intent': entry.intent ?? null,
        ':actionJson': stringifyJson(entry.action ?? null),
        ':searchResultsJson': stringifyJson(entry.searchResults ?? []),
        ':createdAt': Date.now(),
      },
    )
    this.touchSecretaryConversation(entry.conversationId)
    this.flush()
  }

  loadSecretaryHistory(conversationId: string, limit = 12): SecretaryHistoryEntry[] {
    const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit)))
    const rows = this.query<{
      id: number
      conversation_id: string
      role: SecretaryHistoryRole
      content: string
      intent: SecretaryIntent | null
      action_json: string | null
      search_results_json: string | null
      created_at: number
    }>(
      `SELECT *
       FROM secretary_history
       WHERE conversation_id = :conversationId
       ORDER BY created_at DESC
       LIMIT :limit`,
      {
        ':conversationId': conversationId,
        ':limit': boundedLimit,
      },
    )

    return rows.map((row) => ({
      id: Number(row.id),
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      intent: row.intent ?? null,
      action: normalizeSecretaryAction(parseJsonValue(row.action_json)),
      searchResults: normalizeSecretarySearchResults(parseJsonValue(row.search_results_json)),
      createdAt: Number(row.created_at),
    }))
  }

  loadSecretaryPatterns(limit = 8): SecretaryPattern[] {
    const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)))
    const rows = this.query<{
      id: number
      pattern_type: SecretaryPatternType
      ref_id: string
      label: string
      use_count: number
      last_used_at: number | null
    }>(
      'SELECT * FROM secretary_patterns ORDER BY last_used_at DESC, use_count DESC LIMIT :limit',
      { ':limit': boundedLimit },
    )

    return rows.map((row) => ({
      id: Number(row.id),
      patternType: row.pattern_type,
      refId: row.ref_id,
      label: row.label,
      useCount: Number(row.use_count),
      lastUsedAt: row.last_used_at == null ? null : Number(row.last_used_at),
    }))
  }

  recordSecretaryPatternUse(pattern: {
    patternType: SecretaryPatternType
    refId: string
    label: string
  }): void {
    const refId = pattern.refId.trim()
    const label = pattern.label.trim()
    if (!refId || !label) return

    this.run(
      `INSERT INTO secretary_patterns (
        pattern_type,
        ref_id,
        label,
        use_count,
        last_used_at
      ) VALUES (
        :patternType,
        :refId,
        :label,
        1,
        :lastUsedAt
      )
      ON CONFLICT(pattern_type, ref_id) DO UPDATE SET
        label = excluded.label,
        use_count = secretary_patterns.use_count + 1,
        last_used_at = excluded.last_used_at`,
      {
        ':patternType': pattern.patternType,
        ':refId': refId,
        ':label': label,
        ':lastUsedAt': Date.now(),
      },
    )
    this.flush()
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
    if (!this.tableExists('sessions')) return
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
    if (!this.tableExists('messages')) return
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
    if (!this.tableExists('scheduled_tasks')) return
    const rows = this.query<Record<string, SqlValue>>('PRAGMA table_info(scheduled_tasks)')
    const columns = new Set(
      rows
        .map((row) => row.name)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )

    if (!columns.has('model')) {
      this.run('ALTER TABLE scheduled_tasks ADD COLUMN model TEXT')
    }

    if (!columns.has('migrated_at')) {
      this.run('ALTER TABLE scheduled_tasks ADD COLUMN migrated_at INTEGER')
    }
  }

  private ensureSecretaryColumns(): void {
    if (!this.tableExists('secretary_history')) return
    const rows = this.query<Record<string, SqlValue>>('PRAGMA table_info(secretary_history)')
    const columns = new Set(
      rows
        .map((row) => row.name)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )

    if (!columns.has('conversation_id')) {
      this.run('ALTER TABLE secretary_history ADD COLUMN conversation_id TEXT')
    }

    if (!columns.has('action_json')) {
      this.run('ALTER TABLE secretary_history ADD COLUMN action_json TEXT')
    }

    if (!columns.has('search_results_json')) {
      this.run('ALTER TABLE secretary_history ADD COLUMN search_results_json TEXT')
    }

    this.run(
      `CREATE INDEX IF NOT EXISTS idx_history_conversation
       ON secretary_history(conversation_id, created_at)`,
    )

    const orphanRows = this.query<Record<string, SqlValue>>(
      `SELECT COUNT(*) AS count
       FROM secretary_history
       WHERE conversation_id IS NULL OR conversation_id = ''`,
    )
    const orphanCount = orphanRows.length > 0 ? rowNumber(orphanRows[0], 'count') : 0
    if (orphanCount === 0) return

    const legacyConversationId = 'legacy-secretary-conversation'
    const now = Date.now()
    this.run(
      `INSERT OR IGNORE INTO secretary_conversations (
        id,
        title,
        citto_context,
        created_at,
        updated_at,
        archived_at
      ) VALUES (
        :id,
        :title,
        NULL,
        :createdAt,
        :updatedAt,
        NULL
      )`,
      {
        ':id': legacyConversationId,
        ':title': '이전 대화',
        ':createdAt': now,
        ':updatedAt': now,
      },
    )
    this.run(
      `UPDATE secretary_history
       SET conversation_id = :conversationId
       WHERE conversation_id IS NULL OR conversation_id = ''`,
      { ':conversationId': legacyConversationId },
    )
  }

  private ensureRequiredTables(): void {
    const existingTables = new Set(
      this.query<{ name: SqlValue }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map((row) => row.name)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )

    const missingTables = REQUIRED_TABLES.filter((tableName) => !existingTables.has(tableName))
    if (missingTables.length === 0) return

    this.exec(SCHEMA_SQL)

    const repairedTables = new Set(
      this.query<{ name: SqlValue }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map((row) => row.name)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )

    const unresolvedTables = REQUIRED_TABLES.filter((tableName) => !repairedTables.has(tableName))
    if (unresolvedTables.length > 0) {
      throw new Error(`Failed to initialize required tables: ${unresolvedTables.join(', ')}`)
    }
  }

  private tableExists(tableName: string): boolean {
    const rows = this.query<{ name: SqlValue }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = :tableName",
      { ':tableName': tableName },
    )
    return rows.length > 0
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
    const snapshot = db.export()
    writeFileSync(dbPath, Buffer.from(snapshot))
    this.reopenDatabase(snapshot)
  }

  private requireDb(): SqlJsDatabase {
    if (!this.db) {
      throw new Error('Persistence database is not initialized.')
    }
    return this.db
  }

  private requireSql(): Awaited<ReturnType<typeof initSqlJs>> {
    if (!this.sql) {
      throw new Error('Persistence SQL runtime is not initialized.')
    }
    return this.sql
  }

  private reopenDatabase(snapshot: Uint8Array): void {
    const currentDb = this.requireDb()
    const SQL = this.requireSql()
    const nextDb = new SQL.Database(snapshot)
    currentDb.close()
    this.db = nextDb
  }
}
