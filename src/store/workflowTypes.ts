import type {
  Workflow,
  WorkflowConditionOperator,
  WorkflowExecution,
  WorkflowExecutionStepResult,
  WorkflowExecutionStatus,
  WorkflowExecutionTriggeredBy,
  WorkflowNodePosition,
  WorkflowStep,
  WorkflowStepExecutionStatus,
  WorkflowTrigger,
  WorkflowTriggerFrequency,
} from '../../electron/persistence-types'

export type {
  Workflow,
  WorkflowConditionOperator,
  WorkflowExecution,
  WorkflowExecutionStepResult,
  WorkflowExecutionStatus,
  WorkflowExecutionTriggeredBy,
  WorkflowNodePosition,
  WorkflowStep,
  WorkflowStepExecutionStatus,
  WorkflowTrigger,
  WorkflowTriggerFrequency,
}

export type WorkflowInput = Omit<
  Workflow,
  'id' | 'nextRunAt' | 'lastRunAt' | 'createdAt' | 'updatedAt'
>

export type WorkflowClipboardItem = {
  step: WorkflowStep
  position: WorkflowNodePosition
}

export type WorkflowHistorySnapshot = {
  workflows: Workflow[]
  selectedWorkflowId: string | null
  selectedStepIds: string[]
}

export type WorkflowFiredPayload = {
  workflowId: string
  workflowName: string
  executionId: string
  triggeredBy: WorkflowExecutionTriggeredBy
  firedAt: number
}

export type WorkflowStepUpdatePayload = {
  executionId: string
  stepId: string
  status: WorkflowStepExecutionStatus
  output?: string
  error?: string
}

export type WorkflowExecutionDonePayload = {
  executionId: string
  workflowId: string
  status: Exclude<WorkflowExecutionStatus, 'running'>
  durationMs: number
}

export type WorkflowStore = {
  workflows: Workflow[]
  executions: WorkflowExecution[]
  selectedWorkflowId: string | null
  selectedStepIds: string[]
  clipboard: WorkflowClipboardItem[]
  selectorOpen: boolean
  history: WorkflowHistorySnapshot[]
  historyIndex: number
  canUndo: boolean
  canRedo: boolean
  setSelectedWorkflowId: (workflowId: string | null) => void
  setSelectedStepIds: (stepIds: string[]) => void
  toggleSelectedStepId: (stepId: string, additive?: boolean) => void
  clearSelectedStepIds: () => void
  setSelectorOpen: (open: boolean) => void
  addWorkflow: (input: WorkflowInput) => string
  addWorkflows: (workflows: Workflow[]) => void
  updateWorkflow: (workflowId: string, input: WorkflowInput) => void
  updateWorkflowName: (workflowId: string, name: string) => void
  deleteWorkflow: (workflowId: string) => void
  duplicateWorkflow: (workflowId: string) => string | null
  toggleWorkflowActive: (workflowId: string) => void
  appendStep: (workflowId: string, step: WorkflowStep, position?: WorkflowNodePosition | null) => void
  setWorkflowNodePositions: (workflowId: string, positions: Record<string, WorkflowNodePosition>) => void
  deleteSelectedSteps: (workflowId: string) => void
  copySelectedSteps: (workflowId: string) => void
  pasteSteps: (workflowId: string, offset?: { x: number; y: number }) => void
  replaceAll: (workflows: Workflow[], executions: WorkflowExecution[]) => void
  undo: () => void
  redo: () => void
  recordExecutionStart: (payload: WorkflowFiredPayload) => void
  appendStepTextChunk: (executionId: string, stepId: string, chunk: string) => void
  applyStepUpdate: (payload: WorkflowStepUpdatePayload) => void
  completeExecution: (payload: WorkflowExecutionDonePayload) => void
  recomputeAll: () => void
}
