import { CITTO_ROUTES, isCittoRoute, type CittoRoute } from './routes'
import type {
  PermissionMode,
  WorkflowConditionOperator,
  WorkflowTriggerFrequency,
} from '../persistence-types'
import type { SecretaryAutomationIntent } from './automation-profile-types'

export type SecretaryWorkflowDraftTrigger =
  | { type: 'manual' }
  | {
      type: 'schedule'
      frequency: WorkflowTriggerFrequency
      hour?: number
      minute?: number
      dayOfWeek?: number
    }

export type SecretaryWorkflowBreakConditionDraft = {
  operator?: WorkflowConditionOperator
  value?: string
}

export type SecretaryWorkflowAgentDraftStep = {
  type?: 'agent'
  label?: string
  prompt: string
  cwd?: string
  systemPrompt?: string
}

export type SecretaryWorkflowConditionDraftStep = {
  type: 'condition'
  label?: string
  operator?: WorkflowConditionOperator
  value?: string
  trueBranchStepIndex?: number
  falseBranchStepIndex?: number
}

export type SecretaryWorkflowLoopDraftStep = {
  type: 'loop'
  label?: string
  maxIterations?: number
  bodySteps?: SecretaryWorkflowAgentDraftStep[]
  breakCondition?: SecretaryWorkflowBreakConditionDraft | null
}

export type SecretaryWorkflowDraftStep =
  | SecretaryWorkflowAgentDraftStep
  | SecretaryWorkflowConditionDraftStep
  | SecretaryWorkflowLoopDraftStep

export type SecretaryAppAutomationSlots = {
  recipient?: string
  message?: string
  attachmentPaths?: string[]
}

export type SecretaryAction =
  | { type: 'navigate'; route: CittoRoute }
  | { type: 'startChat'; initialPrompt?: string }
  | { type: 'openRoundTable'; presetId?: string }
  | { type: 'openSession'; sessionId: string; messageId?: string }
  | { type: 'runWorkflow'; workflowId: string; params?: Record<string, unknown> }
  | {
      type: 'draftWorkflow'
      name: string
      summary?: string
      steps?: SecretaryWorkflowDraftStep[]
      trigger?: SecretaryWorkflowDraftTrigger
      initialPrompt?: string
    }
  | {
      type: 'createWorkflow'
      name: string
      description?: string
      cwd?: string
      prompt?: string
      steps?: SecretaryWorkflowDraftStep[]
      trigger?: SecretaryWorkflowDraftTrigger
      permissionMode?: PermissionMode
    }
  | {
      type: 'draftSkill'
      name: string
      description?: string
      instructions?: string
      initialPrompt?: string
    }
  | {
      type: 'createSkill'
      name: string
      description: string
      instructions: string
    }
  | { type: 'saveMemory'; key: string; value: string; label?: string }
  | { type: 'runClaudeCode'; prompt: string; mode?: 'print' | 'interactive' }
  | {
      type: 'runAppAutomation'
      intent: SecretaryAutomationIntent
      appHint?: string
      profileId?: string
      slots: SecretaryAppAutomationSlots
      confirmationSummary: string
      allowCoordinateFallback?: boolean
    }
  | { type: 'installComputerUse' }
  | { type: 'openSettings'; section?: string }
  | { type: 'cancelActiveTask' }

export type SecretaryActionResult = {
  ok: boolean
  message?: string
  payload?: unknown
  error?: string
}

type ActionCapability = {
  type: SecretaryAction['type']
  description: string
  schema: string
}

const ACTION_CAPABILITIES: ActionCapability[] = [
  {
    type: 'navigate',
    description: `화면 이동. route는 ${Object.keys(CITTO_ROUTES).join(', ')} 중 하나.`,
    schema: '{ "type": "navigate", "route": "home" }',
  },
  {
    type: 'startChat',
    description: '새 채팅 세션 시작. initialPrompt는 선택.',
    schema: '{ "type": "startChat", "initialPrompt": "..." }',
  },
  {
    type: 'openSession',
    description: '기존 세션 열기. sessionId 필수, 검색 결과 메시지로 이동할 때는 messageId 선택.',
    schema: '{ "type": "openSession", "sessionId": "...", "messageId": "..." }',
  },
  {
    type: 'runWorkflow',
    description: '저장된 워크플로우 실행. workflowId 필수.',
    schema: '{ "type": "runWorkflow", "workflowId": "...", "params": {} }',
  },
  {
    type: 'draftWorkflow',
    description: '1차: 워크플로우 초안을 새 프로젝트 세션으로 넘겨 구체화. 반복/조건/예약이 보이면 loop/condition/schedule도 담음.',
    schema: '{ "type": "draftWorkflow", "name": "daily-review", "summary": "...", "trigger": { "type": "schedule", "frequency": "daily", "hour": 9, "minute": 0 }, "steps": [{ "type": "agent", "label": "검토", "prompt": "..." }] }',
  },
  {
    type: 'createWorkflow',
    description: '2차: 워크플로우를 앱에 저장. 매일/매주/매시간은 trigger, 반복은 loop, 조건부 분기는 condition step으로 표현.',
    schema: '{ "type": "createWorkflow", "name": "daily-review", "description": "...", "trigger": { "type": "schedule", "frequency": "daily", "hour": 9, "minute": 0 }, "steps": [{ "type": "agent", "label": "검토", "prompt": "..." }, { "type": "condition", "label": "실패 확인", "operator": "contains", "value": "fail" }] }',
  },
  {
    type: 'draftSkill',
    description: '1차: 스킬 초안을 새 프로젝트 세션으로 넘겨 구체화. name 필수, description/instructions 권장.',
    schema: '{ "type": "draftSkill", "name": "review-helper", "description": "...", "instructions": "..." }',
  },
  {
    type: 'createSkill',
    description: '2차: ~/.claude/skills/<name>/SKILL.md 파일로 스킬 생성. name, description, instructions 필수.',
    schema: '{ "type": "createSkill", "name": "review-helper", "description": "...", "instructions": "..." }',
  },
  {
    type: 'saveMemory',
    description: '사용자가 명시적으로 기억하라고 한 선호/규칙/사실을 비서 profile에 저장. key는 memory.<slug> 형태 권장, value 필수.',
    schema: '{ "type": "saveMemory", "key": "memory.prefers-short-korean-updates", "value": "사용자는 짧은 한국어 진행 업데이트를 선호한다.", "label": "응답 스타일 선호" }',
  },
  {
    type: 'runClaudeCode',
    description: "Claude Code 실행. prompt 필수, mode는 'print' 또는 'interactive'.",
    schema: '{ "type": "runClaudeCode", "prompt": "...", "mode": "print" }',
  },
  {
    type: 'runAppAutomation',
    description: '앱별 adapter 없이 automation profile로 앱 자동화 실행. send_message는 항상 high risk 승인 카드 이후에만 실행하며 recipient/message slot 필수.',
    schema: '{ "type": "runAppAutomation", "intent": "send_message", "appHint": "KakaoTalk", "profileId": "generic-messenger", "slots": { "recipient": "홍길동", "message": "안녕하세요" }, "confirmationSummary": "KakaoTalk에서 홍길동에게 지정한 메시지를 보냅니다. 접근성 경로를 먼저 쓰고 좌표 fallback은 쓰지 않습니다." }',
  },
  {
    type: 'installComputerUse',
    description: 'Cua Driver computer-use 실행기 설치. OS UI 자동화가 필요하지만 실행기가 없을 때만 제안.',
    schema: '{ "type": "installComputerUse" }',
  },
  {
    type: 'openRoundTable',
    description: '라운드테이블 화면 열기. presetId는 선택.',
    schema: '{ "type": "openRoundTable" }',
  },
  {
    type: 'openSettings',
    description: '설정 화면 열기. section은 선택.',
    schema: '{ "type": "openSettings", "section": "general" }',
  },
  {
    type: 'cancelActiveTask',
    description: '진행 중 작업 취소 제안. 실제 취소 연결이 없으면 실패할 수 있음.',
    schema: '{ "type": "cancelActiveTask" }',
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function normalizePermissionMode(value: unknown): PermissionMode | undefined {
  return value === 'acceptEdits' || value === 'bypassPermissions' || value === 'default'
    ? value
    : undefined
}

function normalizeConditionOperator(value: unknown): WorkflowConditionOperator | undefined {
  return (
    value === 'contains'
    || value === 'not_contains'
    || value === 'equals'
    || value === 'not_equals'
    || value === 'always_true'
  )
    ? value
    : undefined
}

function normalizeWorkflowTriggerFrequency(value: unknown): WorkflowTriggerFrequency | undefined {
  return value === 'hourly' || value === 'daily' || value === 'weekdays' || value === 'weekly'
    ? value
    : undefined
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeAttachmentPaths(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const paths = value
    .map((item) => optionalText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 8)
  return paths.length > 0 ? paths : undefined
}

function normalizeAppAutomationSlots(value: unknown): SecretaryAppAutomationSlots | null {
  if (!isRecord(value)) return null
  const recipient = optionalText(value.recipient)
  const message = optionalText(value.message)
  if (!recipient || !message) return null
  return {
    recipient,
    message,
    attachmentPaths: normalizeAttachmentPaths(value.attachmentPaths),
  }
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  const numberValue = optionalFiniteNumber(value)
  return numberValue === undefined ? undefined : Math.max(0, Math.floor(numberValue))
}

function normalizeWorkflowDraftTrigger(value: unknown): SecretaryWorkflowDraftTrigger | undefined {
  if (!isRecord(value)) return undefined
  if (value.type === 'manual') return { type: 'manual' }
  if (value.type !== 'schedule') return undefined

  const frequency = normalizeWorkflowTriggerFrequency(value.frequency)
  if (!frequency) return undefined

  return {
    type: 'schedule',
    frequency,
    hour: optionalNonNegativeInteger(value.hour),
    minute: optionalNonNegativeInteger(value.minute),
    dayOfWeek: optionalNonNegativeInteger(value.dayOfWeek),
  }
}

function normalizeWorkflowAgentDraftStep(entry: Record<string, unknown>): SecretaryWorkflowAgentDraftStep | null {
  const prompt = optionalText(entry.prompt)
  if (!prompt) return null

  return {
    type: 'agent',
    prompt,
    label: optionalText(entry.label),
    cwd: optionalText(entry.cwd),
    systemPrompt: optionalText(entry.systemPrompt),
  }
}

function normalizeWorkflowConditionDraftStep(entry: Record<string, unknown>): SecretaryWorkflowConditionDraftStep | null {
  if (entry.type !== 'condition') return null

  return {
    type: 'condition',
    label: optionalText(entry.label),
    operator: normalizeConditionOperator(entry.operator),
    value: optionalText(entry.value),
    trueBranchStepIndex: optionalNonNegativeInteger(entry.trueBranchStepIndex),
    falseBranchStepIndex: optionalNonNegativeInteger(entry.falseBranchStepIndex),
  }
}

function normalizeWorkflowLoopDraftStep(entry: Record<string, unknown>): SecretaryWorkflowLoopDraftStep | null {
  if (entry.type !== 'loop') return null
  const bodySteps = normalizeWorkflowDraftSteps(entry.bodySteps)
    .filter((step): step is SecretaryWorkflowAgentDraftStep => step.type === 'agent' || step.type === undefined)
    .slice(0, 8)
  const breakConditionOperator = isRecord(entry.breakCondition)
    ? normalizeConditionOperator(entry.breakCondition.operator)
    : undefined
  const breakConditionValue = isRecord(entry.breakCondition)
    ? optionalText(entry.breakCondition.value)
    : undefined
  const breakCondition = breakConditionOperator || breakConditionValue
    ? { operator: breakConditionOperator, value: breakConditionValue }
    : null

  return {
    type: 'loop',
    label: optionalText(entry.label),
    maxIterations: optionalNonNegativeInteger(entry.maxIterations),
    bodySteps: bodySteps.length > 0 ? bodySteps : undefined,
    breakCondition,
  }
}

function normalizeWorkflowDraftSteps(value: unknown): SecretaryWorkflowDraftStep[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry): SecretaryWorkflowDraftStep | null => {
      if (!isRecord(entry)) return null
      if (entry.type === 'condition') return normalizeWorkflowConditionDraftStep(entry)
      if (entry.type === 'loop') return normalizeWorkflowLoopDraftStep(entry)
      return normalizeWorkflowAgentDraftStep(entry)
    })
    .filter((entry): entry is SecretaryWorkflowDraftStep => Boolean(entry))
    .slice(0, 12)
}

export function buildCapabilityManifest() {
  return ACTION_CAPABILITIES
    .map((capability) => [
      `- ${capability.type}: ${capability.description}`,
      `  예: ${capability.schema}`,
    ].join('\n'))
    .join('\n')
}

export function normalizeSecretaryAction(value: unknown): SecretaryAction | null {
  if (!isRecord(value)) return null
  const type = typeof value.type === 'string' ? value.type : ''

  if (type === 'navigate' && isCittoRoute(value.route)) {
    return { type: 'navigate', route: value.route }
  }

  if (type === 'startChat') {
    return { type: 'startChat', initialPrompt: optionalText(value.initialPrompt) }
  }

  if (type === 'openSession') {
    const sessionId = optionalText(value.sessionId)
    return sessionId
      ? { type: 'openSession', sessionId, messageId: optionalText(value.messageId) }
      : null
  }

  if (type === 'runWorkflow') {
    const workflowId = optionalText(value.workflowId)
    return workflowId
      ? { type: 'runWorkflow', workflowId, params: optionalRecord(value.params) }
      : null
  }

  if (type === 'draftWorkflow') {
    const name = optionalText(value.name)
    if (!name) return null
    const steps = normalizeWorkflowDraftSteps(value.steps)
    return {
      type: 'draftWorkflow',
      name,
      summary: optionalText(value.summary),
      steps: steps.length > 0 ? steps : undefined,
      trigger: normalizeWorkflowDraftTrigger(value.trigger),
      initialPrompt: optionalText(value.initialPrompt),
    }
  }

  if (type === 'createWorkflow') {
    const name = optionalText(value.name)
    if (!name) return null
    const steps = normalizeWorkflowDraftSteps(value.steps)
    const prompt = optionalText(value.prompt)
    if (steps.length === 0 && !prompt) return null
    return {
      type: 'createWorkflow',
      name,
      description: optionalText(value.description),
      cwd: optionalText(value.cwd),
      prompt,
      steps: steps.length > 0 ? steps : undefined,
      trigger: normalizeWorkflowDraftTrigger(value.trigger),
      permissionMode: normalizePermissionMode(value.permissionMode),
    }
  }

  if (type === 'draftSkill') {
    const name = optionalText(value.name)
    if (!name) return null
    return {
      type: 'draftSkill',
      name,
      description: optionalText(value.description),
      instructions: optionalText(value.instructions),
      initialPrompt: optionalText(value.initialPrompt),
    }
  }

  if (type === 'createSkill') {
    const name = optionalText(value.name)
    const description = optionalText(value.description)
    const instructions = optionalText(value.instructions)
    return name && description && instructions
      ? { type: 'createSkill', name, description, instructions }
      : null
  }

  if (type === 'saveMemory') {
    const key = optionalText(value.key)
    const memoryValue = optionalText(value.value)
    if (!key || !memoryValue) return null
    return {
      type: 'saveMemory',
      key,
      value: memoryValue,
      label: optionalText(value.label),
    }
  }

  if (type === 'runClaudeCode') {
    const prompt = optionalText(value.prompt)
    const mode = value.mode === 'interactive' ? 'interactive' : 'print'
    return prompt ? { type: 'runClaudeCode', prompt, mode } : null
  }

  if (type === 'runAppAutomation') {
    const intent = value.intent === 'send_message' ? value.intent : null
    const slots = normalizeAppAutomationSlots(value.slots)
    if (!intent || !slots) return null
    const appHint = optionalText(value.appHint)
    const confirmationSummary = optionalText(value.confirmationSummary)
      ?? `${appHint ? `${appHint}에서 ` : ''}${slots.recipient}에게 지정한 메시지를 보냅니다. 접근성/profile 경로를 먼저 사용합니다.`
    return {
      type: 'runAppAutomation',
      intent,
      appHint,
      profileId: optionalText(value.profileId),
      slots,
      confirmationSummary,
      allowCoordinateFallback: value.allowCoordinateFallback === true || undefined,
    }
  }

  if (type === 'installComputerUse') {
    return { type: 'installComputerUse' }
  }

  if (type === 'openRoundTable') {
    return { type: 'openRoundTable', presetId: optionalText(value.presetId) }
  }

  if (type === 'openSettings') {
    return { type: 'openSettings', section: optionalText(value.section) }
  }

  if (type === 'cancelActiveTask') {
    return { type: 'cancelActiveTask' }
  }

  return null
}
