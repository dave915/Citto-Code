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
  workflowPollIntervalMs?: number
  missedRunLimitMs?: number
  catchUpThresholdMs?: number
}

type WorkflowClaudeRuntimeConfig = {
  claudePath?: string
  envVars?: Record<string, string>
  defaultModel?: string | null
}

const DEFAULT_WORKFLOW_POLL_INTERVAL = 60 * 1000
const DEFAULT_MISSED_RUN_LIMIT = 7 * 24 * 60 * 60 * 1000
const DEFAULT_CATCHUP_THRESHOLD = 5 * 60 * 1000

type StepExecutionContext = {
  executionId: string
  workflowId: string
  workflowName: string
  catchUp: boolean
  manual: boolean
  previousOutput: string
  allResults: Map<string, string>
  abortController: AbortController
  agentRunCounter: number
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

function throwIfAborted(abortController: AbortController) {
  if (abortController.signal.aborted) {
    throw new Error('Workflow execution aborted')
  }
}

function normalizeSyncedWorkflow(workflow: Workflow) {
  if (!workflow.active || workflow.trigger.type !== 'schedule') {
    return {
      ...workflow,
      nextRunAt: null,
    }
  }

  if (typeof workflow.nextRunAt === 'number' && Number.isFinite(workflow.nextRunAt)) {
    return workflow
  }

  return {
    ...workflow,
    nextRunAt: computeNextRunAt(workflow.trigger, true, Date.now()),
  }
}

export function createWorkflowExecutor({
  getMainWindow,
  showMainWindow,
  sendWhenRendererReady,
  getUserHomePath,
  resolveTargetPath,
  workflowPollIntervalMs = DEFAULT_WORKFLOW_POLL_INTERVAL,
  missedRunLimitMs = DEFAULT_MISSED_RUN_LIMIT,
  catchUpThresholdMs = DEFAULT_CATCHUP_THRESHOLD,
}: WorkflowExecutorOptions) {
  let workflows: Workflow[] = []
  let workflowInterval: NodeJS.Timeout | null = null
  let nextWorkflowTimeout: NodeJS.Timeout | null = null
  const runningExecutions = new Map<string, AbortController>()
  let claudeRuntimeConfig: WorkflowClaudeRuntimeConfig = {}
  let claudeRuntimeReady = false

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

  const advanceWorkflowSchedule = (
    workflowId: string,
    firedAt: number,
    options?: { skipped?: boolean },
  ) => {
    workflows = workflows.map((workflow) => (
      workflow.id === workflowId
        ? {
            ...workflow,
            lastRunAt: options?.skipped ? workflow.lastRunAt : firedAt,
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

  const resolveConfiguredNextStepId = (
    step: WorkflowStep,
    fallbackNextStepId: string | null,
  ) => (
    step.nextStepId === undefined ? fallbackNextStepId : step.nextStepId
  )

  const getResolvedTopLevelNextStepId = (workflow: Workflow, step: WorkflowStep) => (
    resolveConfiguredNextStepId(step, getSequentialTopLevelStepId(workflow, step.id))
  )

  const createAgentRunId = (context: StepExecutionContext, stepId: string) => {
    context.agentRunCounter += 1
    return `${context.executionId}:${stepId}:${context.agentRunCounter}`
  }

  const executeAgentProcess = async (
    executionId: string,
    step: Extract<WorkflowStep, { type: 'agent' }>,
    context: StepExecutionContext,
  ) => {
    const prompt = resolvePrompt(step.prompt, context)
    const agentRunId = createAgentRunId(context, step.id)
    const resolvedModel = step.model ?? claudeRuntimeConfig.defaultModel ?? null
    emit('workflow:agent-session-started', {
      agentRunId,
      executionId: context.executionId,
      workflowId: context.workflowId,
      workflowName: context.workflowName,
      stepId: step.id,
      stepLabel: step.label.trim() || step.id,
      cwd: step.cwd,
      model: resolvedModel,
      permissionMode: step.permissionMode,
      catchUp: context.catchUp,
      manual: context.manual,
    })

    let finished = false
    let linkedClaudeSessionId: string | null = null
    const finishAgentSession = (
      status: 'done' | 'error' | 'cancelled',
      error?: string | null,
    ) => {
      if (finished) return
      finished = true
      emit('workflow:agent-session-done', {
        agentRunId,
        status,
        error: error ?? null,
      })
    }

    try {
      const result = await spawnClaudeProcess({
        prompt,
        cwd: step.cwd,
        model: resolvedModel,
        permissionMode: step.permissionMode as PermissionMode,
        systemPrompt: step.systemPrompt,
        claudePath: claudeRuntimeConfig.claudePath,
        envVars: claudeRuntimeConfig.envVars,
        abortSignal: context.abortController.signal,
        getUserHomePath,
        resolveTargetPath,
        onSessionId: (claudeSessionId) => {
          linkedClaudeSessionId = claudeSessionId
          emit('workflow:agent-session-linked', {
            agentRunId,
            claudeSessionId,
          })
        },
        onTextChunk: (chunk) => {
          emit('workflow:step-text-chunk', {
            executionId,
            stepId: step.id,
            chunk,
          })
          emit('workflow:agent-session-text-chunk', {
            agentRunId,
            chunk,
          })
        },
      })

      if (result.sessionId && result.sessionId !== linkedClaudeSessionId) {
        emit('workflow:agent-session-linked', {
          agentRunId,
          claudeSessionId: result.sessionId,
        })
      }

      if (result.isError) {
        const errorMessage = result.error?.trim() || result.output || 'Workflow agent step failed.'
        finishAgentSession(context.abortController.signal.aborted ? 'cancelled' : 'error', errorMessage)
        throw new Error(errorMessage)
      }

      finishAgentSession('done')
      return result.output
    } catch (error) {
      finishAgentSession(
        context.abortController.signal.aborted ? 'cancelled' : 'error',
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
  }

  const executeAgentStep = async (
    workflow: Workflow,
    executionId: string,
    step: Extract<WorkflowStep, { type: 'agent' }>,
    context: StepExecutionContext,
  ) => {
    throwIfAborted(context.abortController)
    const output = await executeAgentProcess(executionId, step, context)
    context.previousOutput = output
    context.allResults.set(step.id, output)
    emit('workflow:step-update', {
      executionId,
      stepId: step.id,
      status: 'done',
      output,
    })
    return getResolvedTopLevelNextStepId(workflow, step)
  }

  const executeConditionStep = async (
    workflow: Workflow,
    executionId: string,
    step: Extract<WorkflowStep, { type: 'condition' }>,
    context: StepExecutionContext,
  ) => {
    throwIfAborted(context.abortController)
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
      ? (step.trueBranchStepId ?? getResolvedTopLevelNextStepId(workflow, step))
      : (step.falseBranchStepId ?? getResolvedTopLevelNextStepId(workflow, step))
  }

  const executeLoopStep = async (
    workflow: Workflow,
    executionId: string,
    step: Extract<WorkflowStep, { type: 'loop' }>,
    context: StepExecutionContext,
  ) => {
    let combinedOutput = ''

    for (let iteration = 0; iteration < step.maxIterations; iteration += 1) {
      throwIfAborted(context.abortController)
      for (const bodyStepId of step.bodyStepIds) {
        throwIfAborted(context.abortController)
        const bodyStep = findStepById(workflow, bodyStepId)
        if (!bodyStep || bodyStep.type !== 'agent') continue

        emit('workflow:step-update', {
          executionId,
          stepId: bodyStep.id,
          status: 'running',
        })

        const output = await executeAgentProcess(executionId, bodyStep, context)

        combinedOutput = combinedOutput
          ? `${combinedOutput}\n\n${output}`
          : output
        context.previousOutput = output
        context.allResults.set(bodyStep.id, output)
        emit('workflow:step-update', {
          executionId,
          stepId: bodyStep.id,
          status: 'done',
          output,
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
    return getResolvedTopLevelNextStepId(workflow, step)
  }

  const execute = async (
    workflow: Workflow,
    triggeredBy: 'manual' | 'schedule',
    options?: { catchUp?: boolean },
  ) => {
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
      catchUp: Boolean(options?.catchUp),
    })

    const context: StepExecutionContext = {
      executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      catchUp: Boolean(options?.catchUp),
      manual: triggeredBy === 'manual',
      previousOutput: '',
      allResults: new Map<string, string>(),
      abortController,
      agentRunCounter: 0,
    }

    let nextStepId: string | null = getTopLevelStepIds(workflow)[0] ?? null
    let status: WorkflowExecutionStatus = 'done'
    let currentStepId: string | null = null

    try {
      let safetyCounter = 0
      while (nextStepId && safetyCounter < 200) {
        if (abortController.signal.aborted) {
          status = 'cancelled'
          break
        }
        safetyCounter += 1
        const step = findStepById(workflow, nextStepId)
        if (!step) break
        currentStepId = step.id

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
      if (currentStepId) {
        emit('workflow:step-update', {
          executionId,
          stepId: currentStepId,
          status: abortController.signal.aborted ? 'skipped' : 'error',
          error: abortController.signal.aborted ? 'Workflow execution cancelled.' : (error instanceof Error ? error.message : String(error)),
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
      emit('workflow:notify', {
        title: status === 'done'
          ? '워크플로우 완료'
          : status === 'cancelled'
            ? '워크플로우 취소됨'
            : '워크플로우 오류',
        body: status === 'done'
          ? `${workflow.name} 실행이 완료되었습니다.`
          : status === 'cancelled'
            ? `${workflow.name} 실행이 취소되었습니다.`
            : `${workflow.name} 실행 중 오류가 발생했습니다.`,
      })
    }

    return { ok: true }
  }

  const checkDueWorkflows = async () => {
    if (!claudeRuntimeReady) {
      scheduleNextCheck()
      return
    }

    const now = Date.now()
    const dueWorkflows = workflows
      .filter((workflow) => (
        workflow.active
        && typeof workflow.nextRunAt === 'number'
        && workflow.nextRunAt <= now
      ))
      .sort((left, right) => (left.nextRunAt ?? 0) - (right.nextRunAt ?? 0))

    for (const workflow of dueWorkflows) {
      if (runningExecutions.has(workflow.id)) continue
      const lateness = now - (workflow.nextRunAt ?? now)
      if (lateness > missedRunLimitMs) {
        advanceWorkflowSchedule(workflow.id, now, { skipped: true })
        emit('workflow:schedule-advanced', {
          workflowId: workflow.id,
          firedAt: now,
          skipped: true,
          reason: '7일을 초과해 놓친 실행은 건너뛰고 다음 예약으로 이동합니다.',
          catchUp: true,
          manual: false,
        })
        continue
      }

      await execute(workflow, 'schedule', {
        catchUp: lateness > catchUpThresholdMs,
      })
    }

    scheduleNextCheck()
  }

  return {
    syncClaudeRuntime(config: {
      claudePath?: string | null
      envVars?: Record<string, string>
      defaultModel?: string | null
    }) {
      claudeRuntimeConfig = {
        claudePath: typeof config.claudePath === 'string' && config.claudePath.trim()
          ? config.claudePath.trim()
          : undefined,
        envVars: config.envVars && typeof config.envVars === 'object'
          ? { ...config.envVars }
          : undefined,
        defaultModel: typeof config.defaultModel === 'string' && config.defaultModel.trim()
          ? config.defaultModel.trim()
          : null,
      }
      claudeRuntimeReady = true
      void checkDueWorkflows()
    },

    syncWorkflows(nextWorkflows: Workflow[]) {
      workflows = nextWorkflows.map(normalizeSyncedWorkflow)
      scheduleNextCheck()
      if (claudeRuntimeReady) {
        void checkDueWorkflows()
      }
    },

    start() {
      if (!workflowInterval) {
        workflowInterval = setInterval(() => {
          void checkDueWorkflows()
        }, workflowPollIntervalMs)
      }
      scheduleNextCheck()
      if (claudeRuntimeReady) {
        void checkDueWorkflows()
      }
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
      if (!claudeRuntimeReady) {
        return { ok: false, error: 'Claude 실행 설정을 불러오는 중입니다. 잠시 후 다시 시도해주세요.' }
      }

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
