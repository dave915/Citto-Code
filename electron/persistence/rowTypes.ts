import type { SqlValue } from 'sql.js/dist/sql-asm.js'
import type {
  AttachedFile,
  Message,
  PermissionMode,
  ScheduledTask,
  ScheduledTaskDay,
  ScheduledTaskFrequency,
  ScheduledTaskRunOutcome,
  ScheduledTaskRunSnapshotStatus,
  Session,
  ToolCallBlock,
} from '../persistence-types'

export type PersistedSessionRow = {
  id: string
  claude_session_id: string | null
  name: string
  favorite: number
  cwd: string
  error: string | null
  input_tokens: number | null
  last_cost: number | null
  permission_mode: PermissionMode
  plan_mode: number
  model: string | null
  sort_order: number
}

export type PersistedMessageRow = {
  id: string
  session_id: string
  role: Message['role']
  text: string
  thinking: string
  created_at: number
  seq: number
}

export type PersistedToolCallRow = {
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

export type PersistedAttachmentRow = {
  id: string
  message_id: string
  name: string
  path: string
  content_text: string
  size: number
  file_type: AttachedFile['fileType'] | null
  seq: number
}

export type PersistedScheduledTaskRow = {
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

export type PersistedScheduledTaskRunRow = {
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

export function rowNumber(row: Record<string, SqlValue>, key: string, fallback = 0): number {
  return typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : fallback
}
