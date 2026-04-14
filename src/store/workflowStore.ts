import { create } from 'zustand'
import { normalizeConfiguredModelSelection } from '../lib/modelSelection'
import { nanoid } from './nanoid'
import type {
  Workflow,
  WorkflowClipboardItem,
  WorkflowExecution,
  WorkflowExecutionStepResult,
  WorkflowHistorySnapshot,
  WorkflowInput,
  WorkflowNodePosition,
  WorkflowScheduleAdvancedPayload,
  WorkflowStep,
  WorkflowStepUpdatePayload,
  WorkflowStore,
  WorkflowTrigger,
} from './workflowTypes'

const EXECUTION_HISTORY_LIMIT = 40
const HISTORY_LIMIT = 50
const DEFAULT_NODE_X = 80
const DEFAULT_NODE_Y = 120
const NODE_X_GAP = 280
const NODE_Y_GAP = 180

function clampHour(value: number) {
  return Math.max(0, Math.min(23, Math.floor(value)))
}

function clampMinute(value: number) {
  return Math.max(0, Math.min(59, Math.floor(value)))
}

function clonePosition(position: WorkflowNodePosition): WorkflowNodePosition {
  return { x: position.x, y: position.y }
}

function cloneStep(step: WorkflowStep): WorkflowStep {
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

function cloneWorkflow(workflow: Workflow): Workflow {
  return {
    ...workflow,
    steps: workflow.steps.map(cloneStep),
    nodePositions: workflow.nodePositions
      ? Object.fromEntries(
          Object.entries(workflow.nodePositions).map(([stepId, position]) => [stepId, clonePosition(position)]),
        )
      : undefined,
  }
}

function cloneWorkflows(workflows: Workflow[]) {
  return workflows.map(cloneWorkflow)
}

function cloneHistorySnapshot(snapshot: WorkflowHistorySnapshot): WorkflowHistorySnapshot {
  return {
    workflows: cloneWorkflows(snapshot.workflows),
    selectedWorkflowId: snapshot.selectedWorkflowId,
    selectedStepIds: [...snapshot.selectedStepIds],
  }
}

function computeNextRunAt(trigger: WorkflowTrigger, active: boolean, fromTime = Date.now()): number | null {
  if (!active || trigger.type !== 'schedule') return null

  const from = new Date(fromTime)
  const candidate = new Date(from)
  candidate.setSeconds(0, 0)

  if (trigger.frequency === 'hourly') {
    candidate.setMinutes(clampMinute(trigger.minute), 0, 0)
    while (candidate.getTime() <= fromTime) {
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

function getDefaultNodePosition(index: number): WorkflowNodePosition {
  const column = index % 3
  const row = Math.floor(index / 3)
  return {
    x: DEFAULT_NODE_X + (column * NODE_X_GAP),
    y: DEFAULT_NODE_Y + (row * NODE_Y_GAP),
  }
}

function remapStep(step: WorkflowStep, idMap: Map<string, string>): WorkflowStep {
  if (step.type === 'agent') {
    return {
      ...step,
      id: idMap.get(step.id) ?? step.id,
      nextStepId: typeof step.nextStepId === 'string' ? (idMap.get(step.nextStepId) ?? null) : step.nextStepId,
    }
  }

  if (step.type === 'condition') {
    return {
      ...step,
      id: idMap.get(step.id) ?? step.id,
      nextStepId: typeof step.nextStepId === 'string' ? (idMap.get(step.nextStepId) ?? null) : step.nextStepId,
      trueBranchStepId: step.trueBranchStepId ? (idMap.get(step.trueBranchStepId) ?? null) : null,
      falseBranchStepId: step.falseBranchStepId ? (idMap.get(step.falseBranchStepId) ?? null) : null,
    }
  }

  return {
    ...step,
    id: idMap.get(step.id) ?? step.id,
    nextStepId: typeof step.nextStepId === 'string' ? (idMap.get(step.nextStepId) ?? null) : step.nextStepId,
    bodyStepIds: step.bodyStepIds.map((stepId) => idMap.get(stepId)).filter((value): value is string => Boolean(value)),
    breakCondition: step.breakCondition ? { ...step.breakCondition } : null,
  }
}

function disconnectImplicitNextStep(step: WorkflowStep): WorkflowStep {
  if (step.nextStepId !== undefined) return step
  return {
    ...step,
    nextStepId: null,
  }
}

function sanitizeNextStepId(
  stepId: string,
  nextStepId: string | null | undefined,
  stepIds: Set<string>,
): string | null | undefined {
  if (nextStepId === null) return null
  if (typeof nextStepId !== 'string') return undefined
  if (nextStepId === stepId || !stepIds.has(nextStepId)) return undefined
  return nextStepId
}

function sanitizeStepReferences(steps: WorkflowStep[]) {
  const stepIds = new Set(steps.map((step) => step.id))

  return steps.map((step) => {
    if (step.type === 'condition') {
      return {
        ...step,
        nextStepId: sanitizeNextStepId(step.id, step.nextStepId, stepIds),
        trueBranchStepId: step.trueBranchStepId && stepIds.has(step.trueBranchStepId) ? step.trueBranchStepId : null,
        falseBranchStepId: step.falseBranchStepId && stepIds.has(step.falseBranchStepId) ? step.falseBranchStepId : null,
      }
    }

    if (step.type === 'loop') {
      return {
        ...step,
        nextStepId: sanitizeNextStepId(step.id, step.nextStepId, stepIds),
        bodyStepIds: step.bodyStepIds.filter((stepId) => stepIds.has(stepId)),
        breakCondition: step.breakCondition ? { ...step.breakCondition } : null,
      }
    }

    return {
      ...step,
      nextStepId: sanitizeNextStepId(step.id, step.nextStepId, stepIds),
    }
  })
}

function ensureNodePositions(
  steps: WorkflowStep[],
  nodePositions?: Record<string, WorkflowNodePosition>,
) {
  const positions: Record<string, WorkflowNodePosition> = {}

  steps.forEach((step, index) => {
    const existing = nodePositions?.[step.id]
    positions[step.id] = existing
      ? clonePosition(existing)
      : getDefaultNodePosition(index)
  })

  return positions
}

function normalizeWorkflowInput(input: WorkflowInput): WorkflowInput {
  const steps = sanitizeStepReferences(input.steps.map((step) => {
    if (step.type === 'agent') {
      return {
        ...step,
        label: step.label.trim(),
        cwd: step.cwd.trim(),
        model: normalizeConfiguredModelSelection(step.model),
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
      bodyStepIds: [...step.bodyStepIds],
      breakCondition: step.breakCondition
        ? {
            operator: step.breakCondition.operator,
            value: step.breakCondition.value,
          }
        : null,
    }
  }))

  const trigger = input.trigger.type === 'schedule'
    ? {
        ...input.trigger,
        hour: clampHour(input.trigger.hour),
        minute: clampMinute(input.trigger.minute),
        dayOfWeek: Math.max(0, Math.min(6, Math.floor(input.trigger.dayOfWeek))),
      }
    : { type: 'manual' as const }

  return {
    ...input,
    name: input.name.trim(),
    active: input.trigger.type === 'schedule' ? Boolean(input.active) : false,
    trigger,
    steps,
    nodePositions: ensureNodePositions(steps, input.nodePositions),
  }
}

function normalizeWorkflow(
  workflow: Workflow,
  options?: {
    preserveNextRunAt?: boolean
  },
): Workflow {
  const normalizedInput = normalizeWorkflowInput(workflow)
  const referenceTime = Date.now()
  const computedNextRunAt = computeNextRunAt(normalizedInput.trigger, normalizedInput.active, referenceTime)
  const nextRunAt = (
    options?.preserveNextRunAt
    && normalizedInput.active
    && normalizedInput.trigger.type === 'schedule'
    && typeof workflow.nextRunAt === 'number'
    && Number.isFinite(workflow.nextRunAt)
  )
    ? workflow.nextRunAt
    : computedNextRunAt

  return {
    ...workflow,
    ...normalizedInput,
    nextRunAt,
  }
}

function createHistorySnapshot(
  workflows: Workflow[],
  selectedWorkflowId: string | null,
  selectedStepIds: string[],
): WorkflowHistorySnapshot {
  return {
    workflows: cloneWorkflows(workflows),
    selectedWorkflowId,
    selectedStepIds: [...selectedStepIds],
  }
}

function syncSelection(
  workflows: Workflow[],
  selectedWorkflowId: string | null,
  selectedStepIds: string[],
) {
  const selectedWorkflow = selectedWorkflowId
    ? workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null
    : null
  const resolvedWorkflowId = selectedWorkflow?.id ?? workflows[0]?.id ?? null
  const allowedStepIds = new Set(
    (resolvedWorkflowId
      ? workflows.find((workflow) => workflow.id === resolvedWorkflowId)?.steps
      : []
    )?.map((step) => step.id) ?? [],
  )

  return {
    selectedWorkflowId: resolvedWorkflowId,
    selectedStepIds: selectedStepIds.filter((stepId) => allowedStepIds.has(stepId)),
  }
}

function withHistoryState(
  state: WorkflowStore,
  workflows: Workflow[],
  options?: {
    selectedWorkflowId?: string | null
    selectedStepIds?: string[]
    executions?: WorkflowExecution[]
  },
) {
  const normalizedWorkflows = workflows.map((workflow) => normalizeWorkflow(workflow))
  const selection = syncSelection(
    normalizedWorkflows,
    options?.selectedWorkflowId ?? state.selectedWorkflowId,
    options?.selectedStepIds ?? state.selectedStepIds,
  )

  const nextHistory = state.history
    .slice(0, state.historyIndex + 1)
    .concat(createHistorySnapshot(normalizedWorkflows, selection.selectedWorkflowId, selection.selectedStepIds))
    .slice(-HISTORY_LIMIT)

  const historyIndex = nextHistory.length - 1

  return {
    workflows: normalizedWorkflows,
    executions: options?.executions ?? state.executions,
    selectedWorkflowId: selection.selectedWorkflowId,
    selectedStepIds: selection.selectedStepIds,
    history: nextHistory,
    historyIndex,
    canUndo: historyIndex > 0,
    canRedo: false,
  }
}

function withRuntimeWorkflows(
  state: WorkflowStore,
  workflows: Workflow[],
  executions?: WorkflowExecution[],
) {
  const normalizedWorkflows = workflows.map((workflow) => normalizeWorkflow(workflow, { preserveNextRunAt: true }))
  const selection = syncSelection(normalizedWorkflows, state.selectedWorkflowId, state.selectedStepIds)
  const history = state.history.length === 0
    ? []
    : state.history.map((snapshot, index) => (
        index === state.historyIndex
          ? createHistorySnapshot(normalizedWorkflows, selection.selectedWorkflowId, selection.selectedStepIds)
          : snapshot
      ))

  return {
    workflows: normalizedWorkflows,
    executions: executions ?? state.executions,
    selectedWorkflowId: selection.selectedWorkflowId,
    selectedStepIds: selection.selectedStepIds,
    history,
    historyIndex: history.length === 0 ? -1 : Math.min(state.historyIndex, history.length - 1),
    canUndo: history.length > 1 && state.historyIndex > 0,
    canRedo: history.length > 0 && state.historyIndex < history.length - 1,
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

function buildDuplicateWorkflowName(name: string, existingNames: Set<string>) {
  const base = `${name} (copy)`
  if (!existingNames.has(base)) return base

  let suffix = 2
  while (existingNames.has(`${base} ${suffix}`)) {
    suffix += 1
  }
  return `${base} ${suffix}`
}

function duplicateWorkflowRecord(workflow: Workflow, existingNames: Set<string>): Workflow {
  const idMap = new Map<string, string>()
  workflow.steps.forEach((step) => {
    idMap.set(step.id, nanoid())
  })

  const duplicatedSteps = workflow.steps.map((step) => remapStep(cloneStep(step), idMap))
  const duplicatedPositions = Object.fromEntries(
    Object.entries(ensureNodePositions(workflow.steps, workflow.nodePositions)).map(([stepId, position]) => [
      idMap.get(stepId) ?? stepId,
      clonePosition(position),
    ]),
  )

  const now = Date.now()
  return normalizeWorkflow({
    ...cloneWorkflow(workflow),
    id: nanoid(),
    name: buildDuplicateWorkflowName(workflow.name, existingNames),
    steps: duplicatedSteps,
    active: false,
    nextRunAt: null,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
    nodePositions: duplicatedPositions,
  })
}

export const useWorkflowStore = create<WorkflowStore>()((set) => ({
  workflows: [],
  executions: [],
  selectedWorkflowId: null,
  selectedStepIds: [],
  clipboard: [],
  selectorOpen: false,
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,

  setSelectedWorkflowId: (workflowId) => {
    set((state) => ({
      ...syncSelection(state.workflows, workflowId, []),
    }))
  },

  setSelectedStepIds: (stepIds) => {
    set((state) => ({
      ...syncSelection(state.workflows, state.selectedWorkflowId, stepIds),
    }))
  },

  toggleSelectedStepId: (stepId, additive = false) => {
    set((state) => {
      if (!additive) {
        return {
          selectedStepIds: [stepId],
        }
      }

      return {
        selectedStepIds: state.selectedStepIds.includes(stepId)
          ? state.selectedStepIds.filter((value) => value !== stepId)
          : [...state.selectedStepIds, stepId],
      }
    })
  },

  clearSelectedStepIds: () => {
    set({ selectedStepIds: [] })
  },

  setSelectorOpen: (open) => {
    set({ selectorOpen: open })
  },

  addWorkflow: (input) => {
    const now = Date.now()
    const normalized = normalizeWorkflowInput(input)
    const workflow: Workflow = normalizeWorkflow({
      id: nanoid(),
      ...normalized,
      nextRunAt: null,
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    })

    set((state) => withHistoryState(state, [workflow, ...state.workflows], {
      selectedWorkflowId: workflow.id,
      selectedStepIds: [],
    }))

    return workflow.id
  },

  addWorkflows: (workflows) => {
    set((state) => {
      const seen = new Set(state.workflows.map((workflow) => workflow.id))
      const incoming = workflows
        .filter((workflow) => !seen.has(workflow.id))
        .map((workflow) => normalizeWorkflow(workflow))

      if (incoming.length === 0) return {}

      const selectedWorkflowId = state.selectedWorkflowId ?? incoming[0]?.id ?? null
      return withHistoryState(state, [...state.workflows, ...incoming], {
        selectedWorkflowId,
      })
    })
  },

  updateWorkflow: (workflowId, input) => {
    const now = Date.now()
    const normalized = normalizeWorkflowInput(input)
    set((state) => withHistoryState(
      state,
      state.workflows.map((workflow) => (
        workflow.id === workflowId
          ? normalizeWorkflow({
              ...workflow,
              ...normalized,
              updatedAt: now,
            })
          : workflow
      )),
    ))
  },

  updateWorkflowName: (workflowId, name) => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    set((state) => withHistoryState(
      state,
      state.workflows.map((workflow) => (
        workflow.id === workflowId
          ? {
              ...workflow,
              name: trimmedName,
              updatedAt: Date.now(),
            }
          : workflow
      )),
    ))
  },

  deleteWorkflow: (workflowId) => {
    set((state) => {
      const nextWorkflows = state.workflows.filter((workflow) => workflow.id !== workflowId)
      const nextExecutions = state.executions.filter((execution) => execution.workflowId !== workflowId)
      const nextSelectedWorkflowId = state.selectedWorkflowId === workflowId
        ? nextWorkflows[0]?.id ?? null
        : state.selectedWorkflowId

      return withHistoryState(state, nextWorkflows, {
        selectedWorkflowId: nextSelectedWorkflowId,
        selectedStepIds: [],
        executions: nextExecutions,
      })
    })
  },

  duplicateWorkflow: (workflowId) => {
    let duplicatedId: string | null = null

    set((state) => {
      const workflow = state.workflows.find((item) => item.id === workflowId)
      if (!workflow) return {}

      const duplicated = duplicateWorkflowRecord(
        workflow,
        new Set(state.workflows.map((item) => item.name)),
      )
      duplicatedId = duplicated.id

      return withHistoryState(state, [duplicated, ...state.workflows], {
        selectedWorkflowId: duplicated.id,
        selectedStepIds: [],
      })
    })

    return duplicatedId
  },

  toggleWorkflowActive: (workflowId) => {
    const now = Date.now()
    set((state) => withHistoryState(
      state,
      state.workflows.map((workflow) => {
        if (workflow.id !== workflowId) return workflow
        const active = workflow.trigger.type === 'schedule' ? !workflow.active : false
        return {
          ...workflow,
          active,
          updatedAt: now,
          nextRunAt: computeNextRunAt(workflow.trigger, active, now),
        }
      }),
    ))
  },

  appendStep: (workflowId, step, position) => {
    set((state) => withHistoryState(
      state,
      state.workflows.map((workflow) => {
        if (workflow.id !== workflowId) return workflow
        const steps = [...workflow.steps, cloneStep(step)]
        const nodePositions = {
          ...ensureNodePositions(workflow.steps, workflow.nodePositions),
          [step.id]: position ? clonePosition(position) : getDefaultNodePosition(steps.length - 1),
        }
        return {
          ...workflow,
          steps,
          nodePositions,
          updatedAt: Date.now(),
        }
      }),
      {
        selectedWorkflowId: workflowId,
        selectedStepIds: [step.id],
      },
    ))
  },

  setWorkflowNodePositions: (workflowId, positions) => {
    set((state) => withHistoryState(
      state,
      state.workflows.map((workflow) => (
        workflow.id === workflowId
          ? {
              ...workflow,
              nodePositions: {
                ...ensureNodePositions(workflow.steps, workflow.nodePositions),
                ...Object.fromEntries(
                  Object.entries(positions).map(([stepId, position]) => [stepId, clonePosition(position)]),
                ),
              },
              updatedAt: Date.now(),
            }
          : workflow
      )),
    ))
  },

  deleteSelectedSteps: (workflowId) => {
    set((state) => {
      const workflow = state.workflows.find((item) => item.id === workflowId)
      if (!workflow || state.selectedStepIds.length === 0) return {}

      const blocked = new Set(state.selectedStepIds)
      return withHistoryState(
        state,
        state.workflows.map((item) => {
          if (item.id !== workflowId) return item
          const steps = sanitizeStepReferences(item.steps.filter((step) => !blocked.has(step.id)))
          const nodePositions = Object.fromEntries(
            Object.entries(ensureNodePositions(item.steps, item.nodePositions))
              .filter(([stepId]) => !blocked.has(stepId))
              .map(([stepId, position]) => [stepId, clonePosition(position)]),
          )
          return {
            ...item,
            steps,
            nodePositions: ensureNodePositions(steps, nodePositions),
            updatedAt: Date.now(),
          }
        }),
        {
          selectedWorkflowId: workflowId,
          selectedStepIds: [],
        },
      )
    })
  },

  copySelectedSteps: (workflowId) => {
    set((state) => {
      const workflow = state.workflows.find((item) => item.id === workflowId)
      if (!workflow || state.selectedStepIds.length === 0) return {}

      const selectedSet = new Set(state.selectedStepIds)
      const clipboard: WorkflowClipboardItem[] = workflow.steps
        .filter((step) => selectedSet.has(step.id))
        .map((step) => ({
          step: cloneStep(step),
          position: clonePosition(
            ensureNodePositions(workflow.steps, workflow.nodePositions)[step.id] ?? getDefaultNodePosition(0),
          ),
        }))

      return { clipboard }
    })
  },

  pasteSteps: (workflowId, offset = { x: 40, y: 40 }) => {
    set((state) => {
      const workflow = state.workflows.find((item) => item.id === workflowId)
      if (!workflow || state.clipboard.length === 0) return {}

      const idMap = new Map<string, string>()
      state.clipboard.forEach((item) => {
        idMap.set(item.step.id, nanoid())
      })

      const pastedSteps = state.clipboard.map((item) => remapStep(cloneStep(item.step), idMap))
      const pastedPositions = Object.fromEntries(
        state.clipboard.map((item, index) => {
          const nextId = idMap.get(item.step.id) ?? item.step.id
          return [
            nextId,
            {
              x: item.position.x + offset.x + (index * 12),
              y: item.position.y + offset.y + (index * 12),
            },
          ]
        }),
      )
      const previousTailStepId = workflow.steps.at(-1)?.id ?? null

      return withHistoryState(
        state,
        state.workflows.map((item) => (
          item.id === workflowId
            ? {
                ...item,
                steps: sanitizeStepReferences([
                  ...item.steps.map((step) => (
                    previousTailStepId && step.id === previousTailStepId
                      ? disconnectImplicitNextStep(step)
                      : step
                  )),
                  ...pastedSteps,
                ]),
                nodePositions: {
                  ...ensureNodePositions(item.steps, item.nodePositions),
                  ...pastedPositions,
                },
                updatedAt: Date.now(),
              }
            : item
        )),
        {
          selectedWorkflowId: workflowId,
          selectedStepIds: pastedSteps.map((step) => step.id),
        },
      )
    })
  },

  replaceAll: (workflows, executions) => {
    const normalizedWorkflows = workflows.map((workflow) => normalizeWorkflow(workflow, { preserveNextRunAt: true }))
    const selectedWorkflowId = normalizedWorkflows[0]?.id ?? null
    const history = normalizedWorkflows.length > 0
      ? [createHistorySnapshot(normalizedWorkflows, selectedWorkflowId, [])]
      : []

    set({
      workflows: normalizedWorkflows,
      executions,
      selectedWorkflowId,
      selectedStepIds: [],
      clipboard: [],
      selectorOpen: false,
      history,
      historyIndex: history.length === 0 ? -1 : 0,
      canUndo: false,
      canRedo: false,
    })
  },

  undo: () => {
    set((state) => {
      if (state.historyIndex <= 0) return {}
      const snapshot = cloneHistorySnapshot(state.history[state.historyIndex - 1])
      const selection = syncSelection(snapshot.workflows, snapshot.selectedWorkflowId, snapshot.selectedStepIds)
      const historyIndex = state.historyIndex - 1
      return {
        workflows: snapshot.workflows.map((workflow) => normalizeWorkflow(workflow)),
        selectedWorkflowId: selection.selectedWorkflowId,
        selectedStepIds: selection.selectedStepIds,
        historyIndex,
        canUndo: historyIndex > 0,
        canRedo: true,
      }
    })
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex < 0 || state.historyIndex >= state.history.length - 1) return {}
      const snapshot = cloneHistorySnapshot(state.history[state.historyIndex + 1])
      const selection = syncSelection(snapshot.workflows, snapshot.selectedWorkflowId, snapshot.selectedStepIds)
      const historyIndex = state.historyIndex + 1
      return {
        workflows: snapshot.workflows.map((workflow) => normalizeWorkflow(workflow)),
        selectedWorkflowId: selection.selectedWorkflowId,
        selectedStepIds: selection.selectedStepIds,
        historyIndex,
        canUndo: historyIndex > 0,
        canRedo: historyIndex < state.history.length - 1,
      }
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

      return withRuntimeWorkflows(
        state,
        workflows,
        [execution, ...state.executions.filter((item) => item.id !== payload.executionId)].slice(0, EXECUTION_HISTORY_LIMIT),
      )
    })
  },

  advanceSchedule: (payload: WorkflowScheduleAdvancedPayload) => {
    set((state) => withRuntimeWorkflows(
      state,
      state.workflows.map((workflow) => (
        workflow.id === payload.workflowId
          ? {
              ...workflow,
              lastRunAt: payload.skipped ? workflow.lastRunAt : payload.firedAt,
              nextRunAt: computeNextRunAt(workflow.trigger, workflow.active, payload.firedAt + 1000),
              updatedAt: Date.now(),
            }
          : workflow
      )),
    ))
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
    set((state) => withRuntimeWorkflows(state, state.workflows))
  },
}))

export type {
  Workflow,
  WorkflowExecution,
  WorkflowInput,
  WorkflowNodePosition,
  WorkflowStep,
  WorkflowTrigger,
} from './workflowTypes'
