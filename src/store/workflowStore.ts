import { create } from 'zustand'
import { nanoid } from './nanoid'
import type {
  Workflow,
  WorkflowExecution,
  WorkflowExecutionStepResult,
  WorkflowInput,
  WorkflowStep,
  WorkflowStepUpdatePayload,
  WorkflowStore,
  WorkflowTrigger,
} from './workflowTypes'

const EXECUTION_HISTORY_LIMIT = 40

function clampHour(value: number) {
  return Math.max(0, Math.min(23, Math.floor(value)))
}

function clampMinute(value: number) {
  return Math.max(0, Math.min(59, Math.floor(value)))
}

function computeNextRunAt(trigger: WorkflowTrigger, active: boolean, fromTime = Date.now()): number | null {
  if (!active || trigger.type !== 'schedule') return null

  const from = new Date(fromTime)
  const candidate = new Date(from)
  candidate.setSeconds(0, 0)

  if (trigger.frequency === 'hourly') {
    candidate.setMinutes(clampMinute(trigger.minute), 0, 0)
    if (candidate.getTime() <= fromTime) {
      candidate.setHours(candidate.getHours() + 1)
      candidate.setMinutes(clampMinute(trigger.minute), 0, 0)
    }
    return candidate.getTime()
  }

  for (let offset = 0; offset < 14; offset += 1) {
    const next = new Date(from)
    next.setDate(next.getDate() + offset)
    next.setHours(clampHour(trigger.hour), clampMinute(trigger.minute), 0, 0)
    if (next.getTime() <= fromTime) continue

    const day = next.getDay()
    if (trigger.frequency === 'daily') return next.getTime()
    if (trigger.frequency === 'weekdays' && day >= 1 && day <= 5) return next.getTime()
    if (trigger.frequency === 'weekly' && day === trigger.dayOfWeek) return next.getTime()
  }

  return null
}

function normalizeWorkflowInput(input: WorkflowInput): WorkflowInput {
  return {
    ...input,
    name: input.name.trim(),
    active: Boolean(input.active),
    trigger: input.trigger.type === 'schedule'
      ? {
          ...input.trigger,
          hour: clampHour(input.trigger.hour),
          minute: clampMinute(input.trigger.minute),
          dayOfWeek: Math.max(0, Math.min(6, Math.floor(input.trigger.dayOfWeek))),
        }
      : { type: 'manual' },
    steps: input.steps.map((step) => {
      if (step.type === 'agent') {
        return {
          ...step,
          label: step.label.trim(),
          prompt: step.prompt,
          cwd: step.cwd.trim(),
          model: step.model?.trim() ? step.model.trim() : null,
          systemPrompt: step.systemPrompt,
        }
      }
      if (step.type === 'condition') {
        return {
          ...step,
          label: step.label.trim(),
          value: step.value,
        }
      }
      return {
        ...step,
        label: step.label.trim(),
        maxIterations: Math.max(1, Math.min(20, Math.floor(step.maxIterations))),
        bodyStepIds: step.bodyStepIds.filter((stepId) => stepId.trim().length > 0),
        breakCondition: step.breakCondition
          ? {
              operator: step.breakCondition.operator,
              value: step.breakCondition.value,
            }
          : null,
      }
    }),
  }
}

function normalizeWorkflow(workflow: Workflow): Workflow {
  const normalizedInput = normalizeWorkflowInput(workflow)
  return {
    ...workflow,
    ...normalizedInput,
    nextRunAt: computeNextRunAt(normalizedInput.trigger, normalizedInput.active, workflow.lastRunAt ?? Date.now()),
  }
}

function upsertStepResult(
  stepResults: WorkflowExecutionStepResult[],
  stepId: string,
  patch: Partial<WorkflowExecutionStepResult>,
) {
  const existingIndex = stepResults.findIndex((result) => result.stepId === stepId)
  if (existingIndex < 0) {
    return [
      ...stepResults,
      {
        stepId,
        status: patch.status ?? 'running',
        output: patch.output ?? '',
        error: patch.error ?? null,
      },
    ]
  }

  return stepResults.map((result, index) => (
    index === existingIndex
      ? {
          ...result,
          ...patch,
          output: patch.output ?? result.output,
          error: patch.error ?? result.error,
        }
      : result
  ))
}

export const useWorkflowStore = create<WorkflowStore>()((set) => ({
  workflows: [],
  executions: [],

  addWorkflow: (input) => {
    const now = Date.now()
    const normalized = normalizeWorkflowInput(input)
    const workflow: Workflow = {
      id: nanoid(),
      ...normalized,
      nextRunAt: computeNextRunAt(normalized.trigger, normalized.active, now),
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({
      workflows: [workflow, ...state.workflows],
    }))
    return workflow.id
  },

  updateWorkflow: (workflowId, input) => {
    const now = Date.now()
    const normalized = normalizeWorkflowInput(input)
    set((state) => ({
      workflows: state.workflows.map((workflow) => (
        workflow.id === workflowId
          ? {
              ...workflow,
              ...normalized,
              updatedAt: now,
              nextRunAt: computeNextRunAt(normalized.trigger, normalized.active, Math.max(now, workflow.lastRunAt ?? now)),
            }
          : workflow
      )),
    }))
  },

  deleteWorkflow: (workflowId) => {
    set((state) => ({
      workflows: state.workflows.filter((workflow) => workflow.id !== workflowId),
      executions: state.executions.filter((execution) => execution.workflowId !== workflowId),
    }))
  },

  toggleWorkflowActive: (workflowId) => {
    const now = Date.now()
    set((state) => ({
      workflows: state.workflows.map((workflow) => {
        if (workflow.id !== workflowId) return workflow
        const active = !workflow.active
        return {
          ...workflow,
          active,
          updatedAt: now,
          nextRunAt: computeNextRunAt(workflow.trigger, active, now),
        }
      }),
    }))
  },

  replaceAll: (workflows, executions) => {
    set({
      workflows: workflows.map((workflow) => normalizeWorkflow(workflow)),
      executions: executions,
    })
  },

  recordExecutionStart: (payload) => {
    set((state) => {
      const workflows = state.workflows.map((workflow) => {
        if (workflow.id !== payload.workflowId) return workflow
        return {
          ...workflow,
          lastRunAt: payload.firedAt,
          nextRunAt: computeNextRunAt(workflow.trigger, workflow.active, payload.firedAt + 1000),
          updatedAt: Date.now(),
        }
      })

      const execution: WorkflowExecution = {
        id: payload.executionId,
        workflowId: payload.workflowId,
        workflowName: payload.workflowName,
        triggeredBy: payload.triggeredBy,
        firedAt: payload.firedAt,
        finishedAt: null,
        status: 'running',
        stepResults: [],
      }

      return {
        workflows,
        executions: [execution, ...state.executions].slice(0, EXECUTION_HISTORY_LIMIT),
      }
    })
  },

  appendStepTextChunk: (executionId, stepId, chunk) => {
    if (!chunk) return
    set((state) => ({
      executions: state.executions.map((execution) => {
        if (execution.id !== executionId) return execution
        const current = execution.stepResults.find((result) => result.stepId === stepId)
        return {
          ...execution,
          stepResults: upsertStepResult(execution.stepResults, stepId, {
            status: current?.status ?? 'running',
            output: `${current?.output ?? ''}${chunk}`,
            error: current?.error ?? null,
          }),
        }
      }),
    }))
  },

  applyStepUpdate: (payload: WorkflowStepUpdatePayload) => {
    set((state) => ({
      executions: state.executions.map((execution) => (
        execution.id === payload.executionId
          ? {
              ...execution,
              stepResults: upsertStepResult(execution.stepResults, payload.stepId, {
                status: payload.status,
                output: payload.output,
                error: payload.error ?? null,
              }),
            }
          : execution
      )),
    }))
  },

  completeExecution: (payload) => {
    set((state) => ({
      executions: state.executions.map((execution) => (
        execution.id === payload.executionId
          ? {
              ...execution,
              status: payload.status,
              finishedAt: execution.firedAt + payload.durationMs,
            }
          : execution
      )),
    }))
  },

  recomputeAll: () => {
    set((state) => ({
      workflows: state.workflows.map((workflow) => normalizeWorkflow(workflow)),
    }))
  },
}))

export type {
  Workflow,
  WorkflowExecution,
  WorkflowInput,
  WorkflowStep,
  WorkflowTrigger,
} from './workflowTypes'
