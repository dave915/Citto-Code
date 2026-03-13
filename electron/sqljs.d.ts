declare module 'sql.js/dist/sql-asm.js' {
  export type SqlValue = string | number | Uint8Array | null
  export type BindParams = Record<string, SqlValue> | SqlValue[]

  export interface SqlJsStatement {
    bind(values?: BindParams): boolean
    step(): boolean
    getAsObject(params?: BindParams): Record<string, SqlValue>
    free(): boolean
  }

  export interface SqlJsExecResult {
    columns: string[]
    values: SqlValue[][]
  }

  export interface SqlJsDatabase {
    run(sql: string, params?: BindParams): SqlJsDatabase
    exec(sql: string, params?: BindParams): SqlJsExecResult[]
    prepare(sql: string, params?: BindParams): SqlJsStatement
    export(): Uint8Array
    close(): void
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => SqlJsDatabase
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>
}
