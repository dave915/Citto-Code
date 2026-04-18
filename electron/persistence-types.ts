export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

export type ToolCallStatus = 'running' | 'done' | 'error'

export type ModelSwitchNotice = {
  kind: 'backend'
  fromModel: string | null
  toModel: string | null
  createdAt: number
}

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
  dataUrl?: string
}

export type BtwCard = {
  id: string
  question: string
  answer: string
  isStreaming: boolean
  isOpen: boolean
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
  btwCards?: BtwCard[]
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
  tokenUsage: number | null
  lastCost?: number
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
  modelSwitchNotice: ModelSwitchNotice | null
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
  model: string | null
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

export type LegacyScheduledTask = {
  id: string
  name: string
  prompt: string
  cwd: string
  model: string | null
  permissionMode: PermissionMode
  frequency: ScheduledTaskFrequency
  active: boolean
  hour: number
  minute: number
  dayOfWeek: number
}

export type WorkflowTriggerFrequency = 'hourly' | 'daily' | 'weekdays' | 'weekly'

export type WorkflowTrigger =
  | { type: 'manual' }
  | {
      type: 'schedule'
      frequency: WorkflowTriggerFrequency
      hour: number
      minute: number
      dayOfWeek: number
    }

export type WorkflowConditionOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'always_true'

export type WorkflowAgentStep = {
  type: 'agent'
  id: string
  label: string
  nextStepId?: string | null
  prompt: string
  cwd: string
  model: string | null
  permissionMode: PermissionMode
  systemPrompt: string
}

export type WorkflowConditionStep = {
  type: 'condition'
  id: string
  label: string
  nextStepId?: string | null
  operator: WorkflowConditionOperator
  value: string
  trueBranchStepId: string | null
  falseBranchStepId: string | null
}

export type WorkflowLoopStep = {
  type: 'loop'
  id: string
  label: string
  nextStepId?: string | null
  maxIterations: number
  bodyStepIds: string[]
  breakCondition: {
    operator: WorkflowConditionOperator
    value: string
  } | null
}

export type WorkflowStep = WorkflowAgentStep | WorkflowConditionStep | WorkflowLoopStep

export type WorkflowNodePosition = {
  x: number
  y: number
}

export type Workflow = {
  id: string
  name: string
  steps: WorkflowStep[]
  trigger: WorkflowTrigger
  active: boolean
  nextRunAt: number | null
  lastRunAt: number | null
  createdAt: number
  updatedAt: number
  nodePositions?: Record<string, WorkflowNodePosition>
}

export type WorkflowExecutionTriggeredBy = 'manual' | 'schedule'
export type WorkflowExecutionStatus = 'running' | 'done' | 'error' | 'cancelled'
export type WorkflowStepExecutionStatus = 'running' | 'done' | 'error' | 'skipped'

export type WorkflowExecutionStepResult = {
  stepId: string
  status: WorkflowStepExecutionStatus
  output: string
  error: string | null
}

export type WorkflowExecution = {
  id: string
  workflowId: string
  workflowName: string
  triggeredBy: WorkflowExecutionTriggeredBy
  firedAt: number
  finishedAt: number | null
  status: WorkflowExecutionStatus
  stepResults: WorkflowExecutionStepResult[]
}
