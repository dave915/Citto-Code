import { randomUUID } from 'crypto'
import type {
  AttachedFile,
  BtwCard,
  Message,
  PermissionMode,
  ScheduledTask,
  ScheduledTaskDay,
  ScheduledTaskFrequency,
  ScheduledTaskRunOutcome,
  ScheduledTaskRunRecord,
  ScheduledTaskRunSnapshotStatus,
  Session,
  ToolCallBlock,
  Workflow,
  WorkflowConditionOperator,
  WorkflowExecution,
  WorkflowExecutionStepResult,
  WorkflowExecutionStatus,
  WorkflowStep,
  WorkflowStepExecutionStatus,
  WorkflowTrigger,
  WorkflowTriggerFrequency,
} from '../persistence-types'

function createId() {
  return randomUUID()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toStringSafe(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function toTrimmedString(value: unknown, fallback = ''): string {
  const trimmed = toStringSafe(value, fallback).trim()
  return trimmed || fallback
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toOptionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function normalizeModelSelection(value: unknown): string | null {
  const normalized = toNullableString(value)
  if (!normalized) return null
  if (normalized.toLowerCase() === 'gpt-54') return null
  return normalized
}

export function toBooleanNumber(value: unknown): number {
  return value ? 1 : 0
}

export function parsePermissionMode(value: unknown): PermissionMode {
  return value === 'acceptEdits' || value === 'bypassPermissions' ? value : 'default'
}

export function parseToolCallStatus(value: unknown): ToolCallBlock['status'] {
  return value === 'running' || value === 'error' ? value : 'done'
}

export function parseMessageRole(value: unknown): Message['role'] {
  return value === 'assistant' ? 'assistant' : 'user'
}

export function parseScheduledTaskFrequency(value: unknown): ScheduledTaskFrequency {
  return value === 'hourly'
    || value === 'daily'
    || value === 'weekdays'
    || value === 'weekly'
    ? value
    : 'manual'
}

export function parseScheduledTaskDay(value: unknown): ScheduledTaskDay {
  return value === 'sun'
    || value === 'mon'
    || value === 'tue'
    || value === 'wed'
    || value === 'thu'
    || value === 'fri'
    || value === 'sat'
    ? value
    : 'mon'
}

export function parseRunOutcome(value: unknown): ScheduledTaskRunOutcome {
  return value === 'skipped' ? 'skipped' : 'executed'
}

export function parseRunStatus(value: unknown): ScheduledTaskRunSnapshotStatus | null {
  return value === 'running'
    || value === 'approval'
    || value === 'completed'
    || value === 'failed'
    ? value
    : null
}

export function parseWorkflowTriggerFrequency(value: unknown): WorkflowTriggerFrequency {
  return value === 'hourly'
    || value === 'daily'
    || value === 'weekdays'
    || value === 'weekly'
    ? value
    : 'daily'
}

export function parseWorkflowConditionOperator(value: unknown): WorkflowConditionOperator {
  return value === 'contains'
    || value === 'not_contains'
    || value === 'equals'
    || value === 'not_equals'
    || value === 'always_true'
    ? value
    : 'contains'
}

export function parseWorkflowExecutionStatus(value: unknown): WorkflowExecutionStatus {
  return value === 'done' || value === 'error' || value === 'cancelled' ? value : 'running'
}

export function parseWorkflowStepExecutionStatus(value: unknown): WorkflowStepExecutionStatus {
  return value === 'done' || value === 'error' || value === 'skipped' ? value : 'running'
}

export function parseJsonValue(value: string | null): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export function parseStringArray(value: string | null): string[] {
  const parsed = parseJsonValue(value)
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

export function stringifyJson(value: unknown): string | null {
  if (value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function normalizeToolCall(value: unknown, index: number): ToolCallBlock {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    id: toTrimmedString(input.id, createId()),
    toolUseId: toTrimmedString(input.toolUseId, `tool-${index}`),
    toolName: toTrimmedString(input.toolName, 'Unknown'),
    toolInput: input.toolInput,
    fileSnapshotBefore: input.fileSnapshotBefore === null || typeof input.fileSnapshotBefore === 'string'
      ? input.fileSnapshotBefore
      : null,
    result: input.result,
    isError: Boolean(input.isError),
    status: parseToolCallStatus(input.status),
  }
}

function normalizeAttachment(value: unknown, index: number): AttachedFile {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const fileType = input.fileType === 'image' ? 'image' : input.fileType === 'text' ? 'text' : undefined

  return {
    id: toTrimmedString(input.id, `attachment-${index}-${createId()}`),
    name: toTrimmedString(input.name, `file-${index + 1}`),
    path: toTrimmedString(input.path, ''),
    content: toStringSafe(input.content),
    size: toFiniteNumber(input.size),
    fileType,
  }
}

function normalizeBtwCard(value: unknown, index: number): BtwCard {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    id: toTrimmedString(input.id, `btw-${index}-${createId()}`),
    question: toTrimmedString(input.question, ''),
    answer: toStringSafe(input.answer),
    isStreaming: false,
    isOpen: typeof input.isOpen === 'boolean' ? input.isOpen : true,
  }
}

function normalizeMessage(value: unknown, index: number): Message {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const toolCalls = Array.isArray(input.toolCalls)
    ? input.toolCalls.map((toolCall, toolCallIndex) => normalizeToolCall(toolCall, toolCallIndex))
    : []
  const attachedFiles = Array.isArray(input.attachedFiles)
    ? input.attachedFiles.map((file, fileIndex) => normalizeAttachment(file, fileIndex))
    : undefined
  const btwCards = Array.isArray(input.btwCards)
    ? input.btwCards.map((card, cardIndex) => normalizeBtwCard(card, cardIndex))
    : undefined

  return {
    id: toTrimmedString(input.id, `message-${index}-${createId()}`),
    role: parseMessageRole(input.role),
    text: toStringSafe(input.text),
    thinking: toStringSafe(input.thinking),
    toolCalls,
    attachedFiles,
    btwCards,
    createdAt: toFiniteNumber(input.createdAt, Date.now()),
  }
}

function normalizeSession(value: unknown, index: number): Session {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const messages = Array.isArray(input.messages)
    ? input.messages.map((message, messageIndex) => normalizeMessage(message, messageIndex))
    : []
  const cwd = toTrimmedString(input.cwd, '~')
  const name = toTrimmedString(input.name, cwd.split('/').filter(Boolean).pop() ?? '새 세션')

  return {
    id: toTrimmedString(input.id, `session-${index}-${createId()}`),
    sessionId: toNullableString(input.sessionId),
    name,
    favorite: Boolean(input.favorite),
    cwd,
    messages,
    isStreaming: false,
    currentAssistantMsgId: null,
    error: toNullableString(input.error),
    pendingPermission: null,
    pendingQuestion: null,
    tokenUsage: toNullableNumber(input.tokenUsage ?? input.inputTokens),
    lastCost: toNullableNumber(input.lastCost) ?? undefined,
    permissionMode: parsePermissionMode(input.permissionMode),
    planMode: Boolean(input.planMode),
    model: normalizeModelSelection(input.model),
    modelSwitchNotice: null,
  }
}

export function normalizeSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const normalized: Session[] = []

  for (const [index, entry] of value.entries()) {
    const session = normalizeSession(entry, index)
    if (seen.has(session.id)) continue
    seen.add(session.id)
    normalized.push(session)
  }

  return normalized
}

function normalizeRunRecord(value: unknown, index: number): ScheduledTaskRunRecord {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return {
    id: toTrimmedString(input.id, `run-${index}-${createId()}`),
    runAt: toFiniteNumber(input.runAt, Date.now()),
    outcome: parseRunOutcome(input.outcome),
    note: toTrimmedString(input.note, '실행'),
    catchUp: Boolean(input.catchUp),
    manual: Boolean(input.manual),
    sessionTabId: toNullableString(input.sessionTabId),
    status: parseRunStatus(input.status),
    summary: toNullableString(input.summary),
    changedPaths: Array.isArray(input.changedPaths)
      ? input.changedPaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
      : [],
    cost: toNullableNumber(input.cost),
  }
}

function normalizeScheduledTask(value: unknown, index: number): ScheduledTask {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return {
    id: toTrimmedString(input.id, `task-${index}-${createId()}`),
    name: toTrimmedString(input.name, `작업 ${index + 1}`),
    prompt: toStringSafe(input.prompt),
    projectPath: toTrimmedString(input.projectPath, '~'),
    model: normalizeModelSelection(input.model),
    permissionMode: parsePermissionMode(input.permissionMode),
    frequency: parseScheduledTaskFrequency(input.frequency),
    enabled: Boolean(input.enabled),
    hour: Math.max(0, Math.min(23, Math.floor(toFiniteNumber(input.hour, 0)))),
    minute: Math.max(0, Math.min(59, Math.floor(toFiniteNumber(input.minute, 0)))),
    weeklyDay: parseScheduledTaskDay(input.weeklyDay),
    skipDays: Array.isArray(input.skipDays)
      ? input.skipDays
        .map((day) => parseScheduledTaskDay(day))
        .filter((day, dayIndex, array) => array.indexOf(day) === dayIndex)
      : [],
    quietHoursStart: toNullableString(input.quietHoursStart),
    quietHoursEnd: toNullableString(input.quietHoursEnd),
    nextRunAt: toNullableNumber(input.nextRunAt),
    lastRunAt: toNullableNumber(input.lastRunAt),
    createdAt: toFiniteNumber(input.createdAt, Date.now()),
    updatedAt: toFiniteNumber(input.updatedAt, Date.now()),
    runHistory: Array.isArray(input.runHistory)
      ? input.runHistory.map((record, recordIndex) => normalizeRunRecord(record, recordIndex))
      : [],
  }
}

export function normalizeScheduledTasks(value: unknown): ScheduledTask[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const normalized: ScheduledTask[] = []

  for (const [index, entry] of value.entries()) {
    const task = normalizeScheduledTask(entry, index)
    if (seen.has(task.id)) continue
    seen.add(task.id)
    normalized.push(task)
  }

  return normalized
}

function normalizeWorkflowTrigger(value: unknown): WorkflowTrigger {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  if (input.type !== 'schedule') {
    return { type: 'manual' }
  }

  return {
    type: 'schedule',
    frequency: parseWorkflowTriggerFrequency(input.frequency),
    hour: Math.max(0, Math.min(23, Math.floor(toFiniteNumber(input.hour, 9)))),
    minute: Math.max(0, Math.min(59, Math.floor(toFiniteNumber(input.minute, 0)))),
    dayOfWeek: Math.max(0, Math.min(6, Math.floor(toFiniteNumber(input.dayOfWeek, 1)))),
  }
}

function normalizeWorkflowStep(value: unknown, index: number): WorkflowStep {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const id = toTrimmedString(input.id, `workflow-step-${index}-${createId()}`)
  const label = toTrimmedString(input.label, `Step ${index + 1}`)

  if (input.type === 'condition') {
    return {
      type: 'condition',
      id,
      label,
      nextStepId: toOptionalNullableString(input.nextStepId),
      operator: parseWorkflowConditionOperator(input.operator),
      value: toStringSafe(input.value),
      trueBranchStepId: toNullableString(input.trueBranchStepId),
      falseBranchStepId: toNullableString(input.falseBranchStepId),
    }
  }

  if (input.type === 'loop') {
    const breakConditionInput = isRecord(input.breakCondition) ? input.breakCondition : null
    return {
      type: 'loop',
      id,
      label,
      nextStepId: toOptionalNullableString(input.nextStepId),
      maxIterations: Math.max(1, Math.min(20, Math.floor(toFiniteNumber(input.maxIterations, 2)))),
      bodyStepIds: Array.isArray(input.bodyStepIds)
        ? input.bodyStepIds.filter((stepId): stepId is string => typeof stepId === 'string' && stepId.trim().length > 0)
        : [],
      breakCondition: breakConditionInput
        ? {
            operator: parseWorkflowConditionOperator(breakConditionInput.operator),
            value: toStringSafe(breakConditionInput.value),
          }
        : null,
    }
  }

  return {
    type: 'agent',
    id,
    label,
    nextStepId: toOptionalNullableString(input.nextStepId),
    prompt: toStringSafe(input.prompt),
    cwd: toTrimmedString(input.cwd, '~'),
    model: normalizeModelSelection(input.model),
    permissionMode: parsePermissionMode(input.permissionMode),
    systemPrompt: toStringSafe(input.systemPrompt),
  }
}

export function normalizePersistedModelSelection(value: unknown): string | null {
  return normalizeModelSelection(value)
}

function normalizeWorkflow(value: unknown, index: number): Workflow {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const nodePositions = isRecord(input.nodePositions)
    ? Object.fromEntries(
        Object.entries(input.nodePositions)
          .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
          .map(([stepId, position]) => [
            stepId,
            {
              x: toFiniteNumber(position.x),
              y: toFiniteNumber(position.y),
            },
          ]),
      )
    : undefined

  return {
    id: toTrimmedString(input.id, `workflow-${index}-${createId()}`),
    name: toTrimmedString(input.name, `Workflow ${index + 1}`),
    steps: Array.isArray(input.steps)
      ? input.steps.map((step, stepIndex) => normalizeWorkflowStep(step, stepIndex))
      : [],
    trigger: normalizeWorkflowTrigger(input.trigger),
    active: Boolean(input.active),
    nextRunAt: toNullableNumber(input.nextRunAt),
    lastRunAt: toNullableNumber(input.lastRunAt),
    createdAt: toFiniteNumber(input.createdAt, Date.now()),
    updatedAt: toFiniteNumber(input.updatedAt, Date.now()),
    nodePositions,
  }
}

export function normalizeWorkflows(value: unknown): Workflow[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const normalized: Workflow[] = []
  for (const [index, entry] of value.entries()) {
    const workflow = normalizeWorkflow(entry, index)
    if (seen.has(workflow.id)) continue
    seen.add(workflow.id)
    normalized.push(workflow)
  }
  return normalized
}

function normalizeWorkflowExecutionStepResult(value: unknown, index: number): WorkflowExecutionStepResult {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    stepId: toTrimmedString(input.stepId, `workflow-step-result-${index}`),
    status: parseWorkflowStepExecutionStatus(input.status),
    output: toStringSafe(input.output),
    error: toNullableString(input.error),
  }
}

function normalizeWorkflowExecution(value: unknown, index: number): WorkflowExecution {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    id: toTrimmedString(input.id, `workflow-exec-${index}-${createId()}`),
    workflowId: toTrimmedString(input.workflowId, ''),
    workflowName: toTrimmedString(input.workflowName, `Workflow ${index + 1}`),
    triggeredBy: input.triggeredBy === 'schedule' ? 'schedule' : 'manual',
    firedAt: toFiniteNumber(input.firedAt, Date.now()),
    finishedAt: toNullableNumber(input.finishedAt),
    status: parseWorkflowExecutionStatus(input.status),
    stepResults: Array.isArray(input.stepResults)
      ? input.stepResults.map((stepResult, stepIndex) => normalizeWorkflowExecutionStepResult(stepResult, stepIndex))
      : [],
  }
}

export function normalizeWorkflowExecutions(value: unknown): WorkflowExecution[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const normalized: WorkflowExecution[] = []
  for (const [index, entry] of value.entries()) {
    const execution = normalizeWorkflowExecution(entry, index)
    if (seen.has(execution.id)) continue
    seen.add(execution.id)
    normalized.push(execution)
  }
  return normalized
}

export function deriveSessionTimestamps(session: Session) {
  const createdAt = session.messages[0]?.createdAt ?? Date.now()
  const updatedAt = session.messages[session.messages.length - 1]?.createdAt ?? createdAt
  return { createdAt, updatedAt }
}
