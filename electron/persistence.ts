import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import initSqlJs, {
  type BindParams,
  type SqlJsDatabase,
  type SqlJsExecResult,
  type SqlValue,
} from 'sql.js/dist/sql-asm.js'
import type { ScheduledTask, Session } from './persistence-types'
import { DB_FILE_NAME, SCHEMA_SQL } from './persistence/dbSchema'
import { normalizeScheduledTasks, normalizeSessions } from './persistence/normalizers'
import { rowNumber } from './persistence/rowTypes'
import { loadScheduledTasksFromStore, saveScheduledTasksToStore } from './persistence/scheduledTaskStore'
import { loadSessionsFromStore, saveSessionsToStore } from './persistence/sessionStore'

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
