import type { BrowserWindow } from 'electron'
import type {
  PermissionMode,
  Workflow,
  WorkflowConditionOperator,
  WorkflowExecutionStatus,
  WorkflowStep,
  WorkflowTrigger,
} from './persistence-types'
import { spawnClaudeProcess } from './services/claude-spawn'

type WorkflowExecutorOptions = {
  getMainWindow: () => BrowserWindow | null
  showMainWindow: () => BrowserWindow
  sendWhenRendererReady: (window: BrowserWindow, channel: string, payload?: unknown) => void
  getUserHomePath: (env?: NodeJS.ProcessEnv) => string
  resolveTargetPath: (targetPath: string) => string
}

type StepExecutionContext = {
  executionId: string
  workflowId: string
  previousOutput: string
  allResults: Map<string, string>
  abortController: AbortController
}

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

function evaluateCondition(output: string, operator: WorkflowConditionOperator, value: string): boolean {
  switch (operator) {
    case 'contains':
      return output.includes(value)
    case 'not_contains':
      return !output.includes(value)
    case 'equals':
      return output.trim() === value.trim()
    case 'not_equals':
      return output.trim() !== value.trim()
    case 'always_true':
      return true
    default:
      return false
  }
}

function resolvePrompt(template: string, context: StepExecutionContext): string {
  return template.replace(/\{\{previous_result\}\}/g, context.previousOutput)
}

function createExecutionId(workflowId: string) {
  return `wfexec-${workflowId}-${Date.now()}`
}

export function createWorkflowExecutor({
  getMainWindow,
  showMainWindow,
  sendWhenRendererReady,
  getUserHomePath,
  resolveTargetPath,
}: WorkflowExecutorOptions) {
  let workflows: Workflow[] = []
  let workflowInterval: NodeJS.Timeout | null = null
  let nextWorkflowTimeout: NodeJS.Timeout | null = null
  const runningExecutions = new Map<string, AbortController>()

  const getWorkflowWindow = () => {
    const currentWindow = getMainWindow()
    if (currentWindow && !currentWindow.isDestroyed()) return currentWindow
    return showMainWindow()
  }

  const emit = (channel: string, payload: unknown) => {
    const window = getWorkflowWindow()
    sendWhenRendererReady(window, channel, payload)
  }

  const clearNextTimeout = () => {
    if (!nextWorkflowTimeout) return
    clearTimeout(nextWorkflowTimeout)
    nextWorkflowTimeout = null
  }

  const scheduleNextCheck = () => {
    clearNextTimeout()

    const now = Date.now()
    const nextWorkflow = workflows
      .filter((workflow) => workflow.active && typeof workflow.nextRunAt === 'number' && workflow.nextRunAt > now)
      .sort((left, right) => (left.nextRunAt ?? Number.POSITIVE_INFINITY) - (right.nextRunAt ?? Number.POSITIVE_INFINITY))[0]

    if (!nextWorkflow?.nextRunAt) return

    nextWorkflowTimeout = setTimeout(() => {
      nextWorkflowTimeout = null
      void checkDueWorkflows()
    }, Math.max(0, nextWorkflow.nextRunAt - now))
  }

  const markWorkflowFired = (workflowId: string, firedAt: number) => {
    workflows = workflows.map((workflow) => (
      workflow.id === workflowId
        ? {
            ...workflow,
            lastRunAt: firedAt,
            nextRunAt: computeNextRunAt(workflow.trigger, workflow.active, firedAt + 1000),
          }
        : workflow
    ))
    scheduleNextCheck()
  }

  const getOrderedStepIds = (workflow: Workflow) => workflow.steps.map((step) => step.id)

  const getTopLevelStepIds = (workflow: Workflow) => {
    const loopBodyStepIds = new Set(
      workflow.steps.flatMap((step) => (step.type === 'loop' ? step.bodyStepIds : [])),
    )
    return workflow.steps
      .map((step) => step.id)
      .filter((stepId) => !loopBodyStepIds.has(stepId))
  }

  const findStepById = (workflow: Workflow, stepId: string | null) => (
    stepId ? workflow.steps.find((step) => step.id === stepId) ?? null : null
  )

  const getSequentialStepId = (workflow: Workflow, stepId: string) => {
    const ordered = getOrderedStepIds(workflow)
    const index = ordered.indexOf(stepId)
    return index >= 0 ? ordered[index + 1] ?? null : null
  }

  const getSequentialTopLevelStepId = (workflow: Workflow, stepId: string) => {
    const ordered = getTopLevelStepIds(workflow)
    const index = ordered.indexOf(stepId)
    return index >= 0 ? ordered[index + 1] ?? null : null
  }

  const executeAgentStep = async (
    workflow: Workflow,
    executionId: string,
    step: Extract<WorkflowStep, { type: 'agent' }>,
    context: StepExecutionContext,
  ) => {
    const prompt = resolvePrompt(step.prompt, context)
    const result = await spawnClaudeProcess({
      prompt,
      cwd: step.cwd,
      model: step.model,
      permissionMode: step.permissionMode as PermissionMode,
      systemPrompt: step.systemPrompt,
      abortSignal: context.abortController.signal,
      getUserHomePath,
      resolveTargetPath,
      onTextChunk: (chunk) => {
        emit('workflow:step-text-chunk', {
          executionId,
          stepId: step.id,
          chunk,
        })
      },
    })

    if (result.isError) {
      throw new Error(result.error?.trim() || result.output || 'Workflow agent step failed.')
    }

    context.previousOutput = result.output
    context.allResults.set(step.id, result.output)
    emit('workflow:step-update', {
      executionId,
      stepId: step.id,
      status: 'done',
      output: result.output,
    })
    return getSequentialTopLevelStepId(workflow, step.id)
  }

  const executeConditionStep = async (
    workflow: Workflow,
    executionId: string,
    step: Extract<WorkflowStep, { type: 'condition' }>,
    context: StepExecutionContext,
  ) => {
    const matched = evaluateCondition(context.previousOutput, step.operator, step.value)
    const output = matched ? 'true' : 'false'
    context.previousOutput = output
    context.allResults.set(step.id, output)
    emit('workflow:step-update', {
      executionId,
      stepId: step.id,
      status: 'done',
      output,
    })
    return matched
      ? (step.trueBranchStepId ?? getSequentialTopLevelStepId(workflow, step.id))
      : (step.falseBranchStepId ?? getSequentialTopLevelStepId(workflow, step.id))
  }

  const executeLoopStep = async (
    workflow: Workflow,
    executionId: string,
    step: Extract<WorkflowStep, { type: 'loop' }>,
    context: StepExecutionContext,
  ) => {
    let combinedOutput = ''

    for (let iteration = 0; iteration < step.maxIterations; iteration += 1) {
      for (const bodyStepId of step.bodyStepIds) {
        const bodyStep = findStepById(workflow, bodyStepId)
        if (!bodyStep || bodyStep.type !== 'agent') continue

        emit('workflow:step-update', {
          executionId,
          stepId: bodyStep.id,
          status: 'running',
        })

        const result = await spawnClaudeProcess({
          prompt: resolvePrompt(bodyStep.prompt, context),
          cwd: bodyStep.cwd,
          model: bodyStep.model,
          permissionMode: bodyStep.permissionMode,
          systemPrompt: bodyStep.systemPrompt,
          abortSignal: context.abortController.signal,
          getUserHomePath,
          resolveTargetPath,
          onTextChunk: (chunk) => {
            emit('workflow:step-text-chunk', {
              executionId,
              stepId: bodyStep.id,
              chunk,
            })
          },
        })

        if (result.isError) {
          throw new Error(result.error?.trim() || result.output || 'Workflow loop step failed.')
        }

        combinedOutput = combinedOutput
          ? `${combinedOutput}\n\n${result.output}`
          : result.output
        context.previousOutput = result.output
        context.allResults.set(bodyStep.id, result.output)
        emit('workflow:step-update', {
          executionId,
          stepId: bodyStep.id,
          status: 'done',
          output: result.output,
        })
      }

      if (
        step.breakCondition
        && evaluateCondition(context.previousOutput, step.breakCondition.operator, step.breakCondition.value)
      ) {
        break
      }
    }

    context.allResults.set(step.id, combinedOutput)
    emit('workflow:step-update', {
      executionId,
      stepId: step.id,
      status: 'done',
      output: combinedOutput,
    })
    return getSequentialTopLevelStepId(workflow, step.id)
  }

  const execute = async (workflow: Workflow, triggeredBy: 'manual' | 'schedule') => {
    if (runningExecutions.has(workflow.id)) {
      return { ok: false, error: '이미 실행 중인 워크플로우입니다.' }
    }

    const executionId = createExecutionId(workflow.id)
    const firedAt = Date.now()
    const abortController = new AbortController()
    const startedAt = Date.now()
    runningExecutions.set(workflow.id, abortController)
    markWorkflowFired(workflow.id, firedAt)

    emit('workflow:fired', {
      workflowId: workflow.id,
      workflowName: workflow.name,
      executionId,
      triggeredBy,
      firedAt,
    })

    const context: StepExecutionContext = {
      executionId,
      workflowId: workflow.id,
      previousOutput: '',
      allResults: new Map<string, string>(),
      abortController,
    }

    let nextStepId: string | null = getTopLevelStepIds(workflow)[0] ?? null
    let status: WorkflowExecutionStatus = 'done'

    try {
      let safetyCounter = 0
      while (nextStepId && safetyCounter < 200) {
        safetyCounter += 1
        const step = findStepById(workflow, nextStepId)
        if (!step) break

        emit('workflow:step-update', {
          executionId,
          stepId: step.id,
          status: 'running',
        })

        if (step.type === 'agent') {
          nextStepId = await executeAgentStep(workflow, executionId, step, context)
          continue
        }

        if (step.type === 'condition') {
          nextStepId = await executeConditionStep(workflow, executionId, step, context)
          continue
        }

        nextStepId = await executeLoopStep(workflow, executionId, step, context)
      }

      if (abortController.signal.aborted) {
        status = 'cancelled'
      }
    } catch (error) {
      status = abortController.signal.aborted ? 'cancelled' : 'error'
      const currentStepId = nextStepId
      if (currentStepId) {
        emit('workflow:step-update', {
          executionId,
          stepId: currentStepId,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      runningExecutions.delete(workflow.id)
      emit('workflow:execution-done', {
        executionId,
        workflowId: workflow.id,
        status,
        durationMs: Date.now() - startedAt,
      })
    }

    return { ok: true }
  }

  const checkDueWorkflows = async () => {
    const now = Date.now()
    const dueWorkflows = workflows.filter((workflow) => (
      workflow.active
      && typeof workflow.nextRunAt === 'number'
      && workflow.nextRunAt <= now
    ))

    for (const workflow of dueWorkflows) {
      if (runningExecutions.has(workflow.id)) continue
      await execute(workflow, 'schedule')
    }

    scheduleNextCheck()
  }

  return {
    syncWorkflows(nextWorkflows: Workflow[]) {
      workflows = nextWorkflows.map((workflow) => ({
        ...workflow,
        nextRunAt: workflow.nextRunAt ?? computeNextRunAt(workflow.trigger, workflow.active, workflow.lastRunAt ?? Date.now()),
      }))
      scheduleNextCheck()
    },

    start() {
      if (!workflowInterval) {
        workflowInterval = setInterval(() => {
          void checkDueWorkflows()
        }, 60 * 1000)
      }
      scheduleNextCheck()
    },

    stop() {
      if (workflowInterval) {
        clearInterval(workflowInterval)
        workflowInterval = null
      }
      clearNextTimeout()
    },

    async checkDueWorkflows() {
      await checkDueWorkflows()
    },

    async runNow(workflowId: string) {
      const workflow = workflows.find((item) => item.id === workflowId)
      if (!workflow) {
        return { ok: false, error: '워크플로우를 찾을 수 없습니다.' }
      }

      return await execute(workflow, 'manual')
    },

    cancel(workflowId: string) {
      const controller = runningExecutions.get(workflowId)
      if (!controller) {
        return { ok: false, error: '실행 중인 워크플로우가 없습니다.' }
      }

      controller.abort()
      return { ok: true }
    },
  }
}
