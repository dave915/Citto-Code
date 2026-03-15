import type { BindParams } from 'sql.js/dist/sql-asm.js'

export type PersistenceQuery = <T>(sql: string, params?: BindParams) => T[]
export type PersistenceRun = (sql: string, params?: BindParams) => void
export type PersistenceTransaction = (action: () => void) => void
