export const DB_FILE_NAME = 'app.sqlite'
const SCHEMA_VERSION = 3

export const SCHEMA_SQL = `
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
  input_tokens INTEGER,
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
  btw_cards_json TEXT,
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
