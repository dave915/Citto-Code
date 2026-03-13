import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import initSqlJs, {
  type BindParams,
  type SqlJsDatabase,
  type SqlJsExecResult,
  type SqlValue,
} from 'sql.js/dist/sql-asm.js'
import type {
  AttachedFile,
  Message,
  PermissionMode,
  ScheduledTask,
  ScheduledTaskDay,
  ScheduledTaskFrequency,
  ScheduledTaskRunOutcome,
  ScheduledTaskRunRecord,
  ScheduledTaskRunSnapshotStatus,
  Session,
  ToolCallBlock,
} from './persistence-types'

type PersistenceBootstrapPayload = {
  legacySessions?: unknown
  legacyScheduledTasks?: unknown
}

export type PersistenceSnapshot = {
  sessions: Session[]
  scheduledTasks: ScheduledTask[]
  migratedSessions: boolean
  migratedScheduledTasks: boolean
}

type PersistedSessionRow = {
  id: string
  claude_session_id: string | null
  name: string
  favorite: number
  cwd: string
  error: string | null
  last_cost: number | null
  permission_mode: PermissionMode
  plan_mode: number
  model: string | null
  sort_order: number
}

type PersistedMessageRow = {
  id: string
  session_id: string
  role: Message['role']
  text: string
  thinking: string
  created_at: number
  seq: number
}

type PersistedToolCallRow = {
  id: string
  message_id: string
  tool_use_id: string
  tool_name: string
  tool_input_json: string | null
  file_snapshot_before: string | null
  result_json: string | null
  is_error: number
  status: ToolCallBlock['status']
  seq: number
}

type PersistedAttachmentRow = {
  id: string
  message_id: string
  name: string
  path: string
  content_text: string
  size: number
  file_type: AttachedFile['fileType'] | null
  seq: number
}

type PersistedScheduledTaskRow = {
  id: string
  name: string
  prompt: string
  project_path: string
  permission_mode: PermissionMode
  frequency: ScheduledTaskFrequency
  enabled: number
  hour: number
  minute: number
  weekly_day: ScheduledTaskDay
  skip_days_json: string | null
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  next_run_at: number | null
  last_run_at: number | null
  created_at: number
  updated_at: number
  sort_order: number
}

type PersistedScheduledTaskRunRow = {
  id: string
  task_id: string
  run_at: number
  outcome: ScheduledTaskRunOutcome
  note: string
  catch_up: number
  manual: number
  session_tab_id: string | null
  status: ScheduledTaskRunSnapshotStatus | null
  summary: string | null
  changed_paths_json: string | null
  cost: number | null
  sort_order: number
}

const DB_FILE_NAME = 'app.sqlite'
const SCHEMA_VERSION = 1

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA user_version = ${SCHEMA_VERSION};

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  claude_session_id TEXT,
  name TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  cwd TEXT NOT NULL,
  error TEXT,
  last_cost REAL,
  permission_mode TEXT NOT NULL,
  plan_mode INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_sort_order
  ON sessions(sort_order);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  thinking TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_seq
  ON messages(session_id, seq);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  tool_use_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input_json TEXT,
  file_snapshot_before TEXT,
  result_json TEXT,
  is_error INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  seq INTEGER NOT NULL,
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_message_seq
  ON tool_calls(message_id, seq);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  file_type TEXT,
  seq INTEGER NOT NULL,
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_seq
  ON attachments(message_id, seq);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  project_path TEXT NOT NULL,
  permission_mode TEXT NOT NULL,
  frequency TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  hour INTEGER NOT NULL DEFAULT 0,
  minute INTEGER NOT NULL DEFAULT 0,
  weekly_day TEXT NOT NULL DEFAULT 'mon',
  skip_days_json TEXT,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  next_run_at INTEGER,
  last_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_sort_order
  ON scheduled_tasks(sort_order);

CREATE TABLE IF NOT EXISTS scheduled_task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_at INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  note TEXT NOT NULL,
  catch_up INTEGER NOT NULL DEFAULT 0,
  manual INTEGER NOT NULL DEFAULT 0,
  session_tab_id TEXT,
  status TEXT,
  summary TEXT,
  changed_paths_json TEXT,
  cost REAL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY(task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task_sort
  ON scheduled_task_runs(task_id, sort_order);
`

function createId() {
  return randomUUID()
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toStringSafe(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function toTrimmedString(value: unknown, fallback = ''): string {
  const trimmed = toStringSafe(value, fallback).trim()
  return trimmed || fallback
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toBooleanNumber(value: unknown): number {
  return value ? 1 : 0
}

function parsePermissionMode(value: unknown): PermissionMode {
  return value === 'acceptEdits' || value === 'bypassPermissions' ? value : 'default'
}

function parseToolCallStatus(value: unknown): ToolCallBlock['status'] {
  return value === 'running' || value === 'error' ? value : 'done'
}

function parseMessageRole(value: unknown): Message['role'] {
  return value === 'assistant' ? 'assistant' : 'user'
}

function parseScheduledTaskFrequency(value: unknown): ScheduledTaskFrequency {
  return value === 'hourly'
    || value === 'daily'
    || value === 'weekdays'
    || value === 'weekly'
    ? value
    : 'manual'
}

function parseScheduledTaskDay(value: unknown): ScheduledTaskDay {
  return value === 'sun'
    || value === 'mon'
    || value === 'tue'
    || value === 'wed'
    || value === 'thu'
    || value === 'fri'
    || value === 'sat'
    ? value
    : 'mon'
}

function parseRunOutcome(value: unknown): ScheduledTaskRunOutcome {
  return value === 'skipped' ? 'skipped' : 'executed'
}

function parseRunStatus(value: unknown): ScheduledTaskRunSnapshotStatus | null {
  return value === 'running'
    || value === 'approval'
    || value === 'completed'
    || value === 'failed'
    ? value
    : null
}

function parseJsonValue(value: string | null): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function parseStringArray(value: string | null): string[] {
  const parsed = parseJsonValue(value)
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function stringifyJson(value: unknown): string | null {
  if (value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function rowNumber(row: Record<string, SqlValue>, key: string, fallback = 0): number {
  return typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : fallback
}

function rowNullableNumber(row: Record<string, SqlValue>, key: string): number | null {
  return typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : null
}

function rowString(row: Record<string, SqlValue>, key: string, fallback = ''): string {
  return typeof row[key] === 'string' ? row[key] : fallback
}

function rowNullableString(row: Record<string, SqlValue>, key: string): string | null {
  return typeof row[key] === 'string' && row[key].trim().length > 0 ? row[key] : null
}

function normalizeToolCall(value: unknown, index: number): ToolCallBlock {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    id: toTrimmedString(input.id, createId()),
    toolUseId: toTrimmedString(input.toolUseId, `tool-${index}`),
    toolName: toTrimmedString(input.toolName, 'Unknown'),
    toolInput: input.toolInput,
    fileSnapshotBefore: input.fileSnapshotBefore === null || typeof input.fileSnapshotBefore === 'string'
      ? input.fileSnapshotBefore
      : null,
    result: input.result,
    isError: Boolean(input.isError),
    status: parseToolCallStatus(input.status),
  }
}

function normalizeAttachment(value: unknown, index: number): AttachedFile {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const fileType = input.fileType === 'image' ? 'image' : input.fileType === 'text' ? 'text' : undefined

  return {
    id: toTrimmedString(input.id, `attachment-${index}-${createId()}`),
    name: toTrimmedString(input.name, `file-${index + 1}`),
    path: toTrimmedString(input.path, ''),
    content: toStringSafe(input.content),
    size: toFiniteNumber(input.size),
    fileType,
  }
}

function normalizeMessage(value: unknown, index: number): Message {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const toolCalls = Array.isArray(input.toolCalls)
    ? input.toolCalls.map((toolCall, toolCallIndex) => normalizeToolCall(toolCall, toolCallIndex))
    : []
  const attachedFiles = Array.isArray(input.attachedFiles)
    ? input.attachedFiles.map((file, fileIndex) => normalizeAttachment(file, fileIndex))
    : undefined

  return {
    id: toTrimmedString(input.id, `message-${index}-${createId()}`),
    role: parseMessageRole(input.role),
    text: toStringSafe(input.text),
    thinking: toStringSafe(input.thinking),
    toolCalls,
    attachedFiles,
    createdAt: toFiniteNumber(input.createdAt, Date.now()),
  }
}

function normalizeSession(value: unknown, index: number): Session {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const messages = Array.isArray(input.messages)
    ? input.messages.map((message, messageIndex) => normalizeMessage(message, messageIndex))
    : []
  const cwd = toTrimmedString(input.cwd, '~')
  const name = toTrimmedString(input.name, cwd.split('/').filter(Boolean).pop() ?? '새 세션')

  return {
    id: toTrimmedString(input.id, `session-${index}-${createId()}`),
    sessionId: toNullableString(input.sessionId),
    name,
    favorite: Boolean(input.favorite),
    cwd,
    messages,
    isStreaming: false,
    currentAssistantMsgId: null,
    error: toNullableString(input.error),
    pendingPermission: null,
    pendingQuestion: null,
    lastCost: toNullableNumber(input.lastCost) ?? undefined,
    permissionMode: parsePermissionMode(input.permissionMode),
    planMode: Boolean(input.planMode),
    model: toNullableString(input.model),
  }
}

function normalizeSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const normalized: Session[] = []

  for (const [index, entry] of value.entries()) {
    const session = normalizeSession(entry, index)
    if (seen.has(session.id)) continue
    seen.add(session.id)
    normalized.push(session)
  }

  return normalized
}

function normalizeRunRecord(value: unknown, index: number): ScheduledTaskRunRecord {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return {
    id: toTrimmedString(input.id, `run-${index}-${createId()}`),
    runAt: toFiniteNumber(input.runAt, Date.now()),
    outcome: parseRunOutcome(input.outcome),
    note: toTrimmedString(input.note, '실행'),
    catchUp: Boolean(input.catchUp),
    manual: Boolean(input.manual),
    sessionTabId: toNullableString(input.sessionTabId),
    status: parseRunStatus(input.status),
    summary: toNullableString(input.summary),
    changedPaths: Array.isArray(input.changedPaths)
      ? input.changedPaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
      : [],
    cost: toNullableNumber(input.cost),
  }
}

function normalizeScheduledTask(value: unknown, index: number): ScheduledTask {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return {
    id: toTrimmedString(input.id, `task-${index}-${createId()}`),
    name: toTrimmedString(input.name, `작업 ${index + 1}`),
    prompt: toStringSafe(input.prompt),
    projectPath: toTrimmedString(input.projectPath, '~'),
    permissionMode: parsePermissionMode(input.permissionMode),
    frequency: parseScheduledTaskFrequency(input.frequency),
    enabled: Boolean(input.enabled),
    hour: Math.max(0, Math.min(23, Math.floor(toFiniteNumber(input.hour, 0)))),
    minute: Math.max(0, Math.min(59, Math.floor(toFiniteNumber(input.minute, 0)))),
    weeklyDay: parseScheduledTaskDay(input.weeklyDay),
    skipDays: Array.isArray(input.skipDays)
      ? input.skipDays
        .map((day) => parseScheduledTaskDay(day))
        .filter((day, dayIndex, array) => array.indexOf(day) === dayIndex)
      : [],
    quietHoursStart: toNullableString(input.quietHoursStart),
    quietHoursEnd: toNullableString(input.quietHoursEnd),
    nextRunAt: toNullableNumber(input.nextRunAt),
    lastRunAt: toNullableNumber(input.lastRunAt),
    createdAt: toFiniteNumber(input.createdAt, Date.now()),
    updatedAt: toFiniteNumber(input.updatedAt, Date.now()),
    runHistory: Array.isArray(input.runHistory)
      ? input.runHistory.map((record, recordIndex) => normalizeRunRecord(record, recordIndex))
      : [],
  }
}

function normalizeScheduledTasks(value: unknown): ScheduledTask[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const normalized: ScheduledTask[] = []

  for (const [index, entry] of value.entries()) {
    const task = normalizeScheduledTask(entry, index)
    if (seen.has(task.id)) continue
    seen.add(task.id)
    normalized.push(task)
  }

  return normalized
}

function deriveSessionTimestamps(session: Session) {
  const createdAt = session.messages[0]?.createdAt ?? Date.now()
  const updatedAt = session.messages[session.messages.length - 1]?.createdAt ?? createdAt
  return { createdAt, updatedAt }
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
      migratedSessions,
      migratedScheduledTasks,
    }
  }

  loadSessions(): Session[] {
    const sessionRows = this.query<PersistedSessionRow>('SELECT * FROM sessions ORDER BY sort_order ASC')
    const messageRows = this.query<PersistedMessageRow>('SELECT * FROM messages ORDER BY session_id ASC, seq ASC')
    const toolCallRows = this.query<PersistedToolCallRow>('SELECT * FROM tool_calls ORDER BY message_id ASC, seq ASC')
    const attachmentRows = this.query<PersistedAttachmentRow>('SELECT * FROM attachments ORDER BY message_id ASC, seq ASC')

    const toolCallsByMessageId = new Map<string, ToolCallBlock[]>()
    for (const row of toolCallRows) {
      const existing = toolCallsByMessageId.get(row.message_id) ?? []
      existing.push({
        id: row.id,
        toolUseId: row.tool_use_id,
        toolName: row.tool_name,
        toolInput: parseJsonValue(row.tool_input_json),
        fileSnapshotBefore: row.file_snapshot_before,
        result: parseJsonValue(row.result_json),
        isError: Boolean(row.is_error),
        status: parseToolCallStatus(row.status),
      })
      toolCallsByMessageId.set(row.message_id, existing)
    }

    const attachmentsByMessageId = new Map<string, AttachedFile[]>()
    for (const row of attachmentRows) {
      const existing = attachmentsByMessageId.get(row.message_id) ?? []
      existing.push({
        id: row.id,
        name: row.name,
        path: row.path,
        content: row.content_text,
        size: row.size,
        fileType: row.file_type ?? undefined,
      })
      attachmentsByMessageId.set(row.message_id, existing)
    }

    const messagesBySessionId = new Map<string, Message[]>()
    for (const row of messageRows) {
      const existing = messagesBySessionId.get(row.session_id) ?? []
      const attachedFiles = attachmentsByMessageId.get(row.id)
      existing.push({
        id: row.id,
        role: parseMessageRole(row.role),
        text: row.text,
        thinking: row.thinking,
        toolCalls: toolCallsByMessageId.get(row.id) ?? [],
        attachedFiles: attachedFiles && attachedFiles.length > 0 ? attachedFiles : undefined,
        createdAt: row.created_at,
      })
      messagesBySessionId.set(row.session_id, existing)
    }

    return sessionRows.map((row) => ({
      id: row.id,
      sessionId: row.claude_session_id,
      name: row.name,
      favorite: Boolean(row.favorite),
      cwd: row.cwd,
      messages: messagesBySessionId.get(row.id) ?? [],
      isStreaming: false,
      currentAssistantMsgId: null,
      error: row.error,
      pendingPermission: null,
      pendingQuestion: null,
      lastCost: row.last_cost ?? undefined,
      permissionMode: parsePermissionMode(row.permission_mode),
      planMode: Boolean(row.plan_mode),
      model: row.model,
    }))
  }

  saveSessions(sessions: Session[]): void {
    const normalizedSessions = normalizeSessions(sessions)

    this.runInTransaction(() => {
      this.run('DELETE FROM attachments')
      this.run('DELETE FROM tool_calls')
      this.run('DELETE FROM messages')
      this.run('DELETE FROM sessions')

      for (const [sessionIndex, session] of normalizedSessions.entries()) {
        const { createdAt, updatedAt } = deriveSessionTimestamps(session)
        this.run(
          `INSERT INTO sessions (
            id,
            claude_session_id,
            name,
            favorite,
            cwd,
            error,
            last_cost,
            permission_mode,
            plan_mode,
            model,
            sort_order,
            created_at,
            updated_at
          ) VALUES (
            :id,
            :claudeSessionId,
            :name,
            :favorite,
            :cwd,
            :error,
            :lastCost,
            :permissionMode,
            :planMode,
            :model,
            :sortOrder,
            :createdAt,
            :updatedAt
          )`,
          {
            ':id': session.id,
            ':claudeSessionId': session.sessionId,
            ':name': session.name,
            ':favorite': toBooleanNumber(session.favorite),
            ':cwd': session.cwd,
            ':error': session.error,
            ':lastCost': session.lastCost ?? null,
            ':permissionMode': session.permissionMode,
            ':planMode': toBooleanNumber(session.planMode),
            ':model': session.model,
            ':sortOrder': sessionIndex,
            ':createdAt': createdAt,
            ':updatedAt': updatedAt,
          },
        )

        for (const [messageIndex, message] of session.messages.entries()) {
          this.run(
            `INSERT INTO messages (
              id,
              session_id,
              role,
              text,
              thinking,
              created_at,
              seq
            ) VALUES (
              :id,
              :sessionId,
              :role,
              :text,
              :thinking,
              :createdAt,
              :seq
            )`,
            {
              ':id': message.id,
              ':sessionId': session.id,
              ':role': message.role,
              ':text': message.text,
              ':thinking': message.thinking ?? '',
              ':createdAt': message.createdAt,
              ':seq': messageIndex,
            },
          )

          for (const [toolCallIndex, toolCall] of message.toolCalls.entries()) {
            this.run(
              `INSERT INTO tool_calls (
                id,
                message_id,
                tool_use_id,
                tool_name,
                tool_input_json,
                file_snapshot_before,
                result_json,
                is_error,
                status,
                seq
              ) VALUES (
                :id,
                :messageId,
                :toolUseId,
                :toolName,
                :toolInputJson,
                :fileSnapshotBefore,
                :resultJson,
                :isError,
                :status,
                :seq
              )`,
              {
                ':id': toolCall.id,
                ':messageId': message.id,
                ':toolUseId': toolCall.toolUseId,
                ':toolName': toolCall.toolName,
                ':toolInputJson': stringifyJson(toolCall.toolInput),
                ':fileSnapshotBefore': toolCall.fileSnapshotBefore ?? null,
                ':resultJson': stringifyJson(toolCall.result),
                ':isError': toBooleanNumber(toolCall.isError),
                ':status': toolCall.status,
                ':seq': toolCallIndex,
              },
            )
          }

          for (const [attachmentIndex, attachment] of (message.attachedFiles ?? []).entries()) {
            this.run(
              `INSERT INTO attachments (
                id,
                message_id,
                name,
                path,
                content_text,
                size,
                file_type,
                seq
              ) VALUES (
                :id,
                :messageId,
                :name,
                :path,
                :contentText,
                :size,
                :fileType,
                :seq
              )`,
              {
                ':id': attachment.id,
                ':messageId': message.id,
                ':name': attachment.name,
                ':path': attachment.path,
                ':contentText': attachment.content,
                ':size': attachment.size,
                ':fileType': attachment.fileType ?? null,
                ':seq': attachmentIndex,
              },
            )
          }
        }
      }
    })
  }

  loadScheduledTasks(): ScheduledTask[] {
    const taskRows = this.query<PersistedScheduledTaskRow>('SELECT * FROM scheduled_tasks ORDER BY sort_order ASC')
    const runRows = this.query<PersistedScheduledTaskRunRow>('SELECT * FROM scheduled_task_runs ORDER BY task_id ASC, sort_order ASC')

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

  saveScheduledTasks(tasks: ScheduledTask[]): void {
    const normalizedTasks = normalizeScheduledTasks(tasks)

    this.runInTransaction(() => {
      this.run('DELETE FROM scheduled_task_runs')
      this.run('DELETE FROM scheduled_tasks')

      for (const [taskIndex, task] of normalizedTasks.entries()) {
        this.run(
          `INSERT INTO scheduled_tasks (
            id,
            name,
            prompt,
            project_path,
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

        for (const [runIndex, run] of task.runHistory.entries()) {
          this.run(
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
              ':id': run.id,
              ':taskId': task.id,
              ':runAt': run.runAt,
              ':outcome': run.outcome,
              ':note': run.note,
              ':catchUp': toBooleanNumber(run.catchUp),
              ':manual': toBooleanNumber(run.manual),
              ':sessionTabId': run.sessionTabId,
              ':status': run.status,
              ':summary': run.summary,
              ':changedPathsJson': stringifyJson(run.changedPaths),
              ':cost': run.cost,
              ':sortOrder': runIndex,
            },
          )
        }
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
        rows.push(this.mapRow<T>(stmt.getAsObject()))
      }
    } finally {
      stmt.free()
    }

    return rows
  }

  private mapRow<T>(row: Record<string, SqlValue>): T {
    return row as unknown as T
  }

  private exec(sql: string, params?: BindParams): SqlJsExecResult[] {
    return this.requireDb().exec(sql, params)
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
