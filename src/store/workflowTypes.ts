import type {
  Workflow,
  WorkflowConditionOperator,
  WorkflowExecution,
  WorkflowExecutionStepResult,
  WorkflowExecutionStatus,
  WorkflowExecutionTriggeredBy,
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
  WorkflowStep,
  WorkflowStepExecutionStatus,
  WorkflowTrigger,
  WorkflowTriggerFrequency,
}

export type WorkflowInput = Omit<
  Workflow,
  'id' | 'nextRunAt' | 'lastRunAt' | 'createdAt' | 'updatedAt'
>

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
  addWorkflow: (input: WorkflowInput) => string
  updateWorkflow: (workflowId: string, input: WorkflowInput) => void
  deleteWorkflow: (workflowId: string) => void
  toggleWorkflowActive: (workflowId: string) => void
  replaceAll: (workflows: Workflow[], executions: WorkflowExecution[]) => void
  recordExecutionStart: (payload: WorkflowFiredPayload) => void
  appendStepTextChunk: (executionId: string, stepId: string, chunk: string) => void
  applyStepUpdate: (payload: WorkflowStepUpdatePayload) => void
  completeExecution: (payload: WorkflowExecutionDonePayload) => void
  recomputeAll: () => void
}
