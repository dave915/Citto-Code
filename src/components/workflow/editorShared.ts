import { nanoid } from '../../store/nanoid'
import type {
  Workflow,
  WorkflowConditionOperator,
  WorkflowInput,
  WorkflowNodePosition,
  WorkflowStep,
} from '../../store/workflowTypes'

export const CONDITION_OPERATORS: WorkflowConditionOperator[] = [
  'contains',
  'not_contains',
  'equals',
  'not_equals',
  'always_true',
]

export function cloneWorkflowStep(step: WorkflowStep): WorkflowStep {
  if (step.type === 'agent') {
    return { ...step }
  }

  if (step.type === 'condition') {
    return { ...step }
  }

  return {
    ...step,
    bodyStepIds: [...step.bodyStepIds],
    breakCondition: step.breakCondition ? { ...step.breakCondition } : null,
  }
}

export function createAgentStep(
  defaultProjectPath: string,
  id = nanoid(),
  label = '',
): Extract<WorkflowStep, { type: 'agent' }> {
  return {
    type: 'agent',
    id,
    label,
    prompt: '',
    cwd: defaultProjectPath,
    model: null,
    permissionMode: 'default',
    systemPrompt: '',
  }
}

export function createConditionStep(
  id = nanoid(),
  label = '',
): Extract<WorkflowStep, { type: 'condition' }> {
  return {
    type: 'condition',
    id,
    label,
    operator: 'contains',
    value: '',
    trueBranchStepId: null,
    falseBranchStepId: null,
  }
}

export function createLoopStep(
  id = nanoid(),
  label = '',
): Extract<WorkflowStep, { type: 'loop' }> {
  return {
    type: 'loop',
    id,
    label,
    maxIterations: 3,
    bodyStepIds: [],
    breakCondition: null,
  }
}

export function createStepByType(
  type: WorkflowStep['type'],
  defaultProjectPath: string,
  id = nanoid(),
  label = '',
): WorkflowStep {
  if (type === 'condition') return createConditionStep(id, label)
  if (type === 'loop') return createLoopStep(id, label)
  return createAgentStep(defaultProjectPath, id, label)
}

function cloneTrigger(trigger: Workflow['trigger']): WorkflowInput['trigger'] {
  return trigger.type === 'schedule' ? { ...trigger } : { type: 'manual' }
}

function cloneNodePositions(nodePositions?: Record<string, WorkflowNodePosition>) {
  if (!nodePositions) return undefined
  return Object.fromEntries(
    Object.entries(nodePositions).map(([stepId, position]) => [stepId, { ...position }]),
  )
}

export function workflowToInput(workflow: Workflow): WorkflowInput {
  return {
    name: workflow.name,
    steps: workflow.steps.map(cloneWorkflowStep),
    trigger: cloneTrigger(workflow.trigger),
    active: workflow.active,
    nodePositions: cloneNodePositions(workflow.nodePositions),
  }
}
