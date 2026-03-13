export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

export type ToolCallStatus = 'running' | 'done' | 'error'

export type PendingPermissionRequest = {
  toolName: string
  toolUseId: string
  toolInput: unknown
}

export type PendingQuestionOption = {
  label: string
  description?: string
}

export type PendingQuestionRequest = {
  toolUseId: string
  question: string
  header?: string
  multiSelect?: boolean
  options: PendingQuestionOption[]
}

export type AttachedFile = {
  id: string
  name: string
  path: string
  content: string
  size: number
  fileType?: 'text' | 'image'
}

export type ToolCallBlock = {
  id: string
  toolUseId: string
  toolName: string
  toolInput: unknown
  fileSnapshotBefore?: string | null
  result?: unknown
  isError?: boolean
  status: ToolCallStatus
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  thinking?: string
  toolCalls: ToolCallBlock[]
  attachedFiles?: AttachedFile[]
  createdAt: number
}

export type Session = {
  id: string
  sessionId: string | null
  name: string
  favorite: boolean
  cwd: string
  messages: Message[]
  isStreaming: boolean
  currentAssistantMsgId: string | null
  error: string | null
  pendingPermission: PendingPermissionRequest | null
  pendingQuestion: PendingQuestionRequest | null
  lastCost?: number
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
}

export type ScheduledTaskFrequency = 'manual' | 'hourly' | 'daily' | 'weekdays' | 'weekly'
export type ScheduledTaskDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
export type ScheduledTaskRunOutcome = 'executed' | 'skipped'
export type ScheduledTaskRunSnapshotStatus = 'running' | 'approval' | 'completed' | 'failed'

export type ScheduledTaskRunRecord = {
  id: string
  runAt: number
  outcome: ScheduledTaskRunOutcome
  note: string
  catchUp: boolean
  manual: boolean
  sessionTabId: string | null
  status: ScheduledTaskRunSnapshotStatus | null
  summary: string | null
  changedPaths: string[]
  cost: number | null
}

export type ScheduledTask = {
  id: string
  name: string
  prompt: string
  projectPath: string
  permissionMode: PermissionMode
  frequency: ScheduledTaskFrequency
  enabled: boolean
  hour: number
  minute: number
  weeklyDay: ScheduledTaskDay
  skipDays: ScheduledTaskDay[]
  quietHoursStart: string | null
  quietHoursEnd: string | null
  nextRunAt: number | null
  lastRunAt: number | null
  createdAt: number
  updatedAt: number
  runHistory: ScheduledTaskRunRecord[]
}
