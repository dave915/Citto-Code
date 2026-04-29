import { CITTO_ROUTES, isCittoRoute, type CittoRoute } from './routes'

export type SecretaryAction =
  | { type: 'navigate'; route: CittoRoute }
  | { type: 'startChat'; initialPrompt?: string }
  | { type: 'openRoundTable'; presetId?: string }
  | { type: 'openSession'; sessionId: string }
  | { type: 'runWorkflow'; workflowId: string; params?: Record<string, unknown> }
  | { type: 'runClaudeCode'; prompt: string; mode?: 'print' | 'interactive' }
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
    description: '기존 세션 열기. sessionId 필수.',
    schema: '{ "type": "openSession", "sessionId": "..." }',
  },
  {
    type: 'runWorkflow',
    description: '저장된 워크플로우 실행. workflowId 필수.',
    schema: '{ "type": "runWorkflow", "workflowId": "...", "params": {} }',
  },
  {
    type: 'runClaudeCode',
    description: "Claude Code 실행. prompt 필수, mode는 'print' 또는 'interactive'.",
    schema: '{ "type": "runClaudeCode", "prompt": "...", "mode": "print" }',
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
    return sessionId ? { type: 'openSession', sessionId } : null
  }

  if (type === 'runWorkflow') {
    const workflowId = optionalText(value.workflowId)
    return workflowId
      ? { type: 'runWorkflow', workflowId, params: optionalRecord(value.params) }
      : null
  }

  if (type === 'runClaudeCode') {
    const prompt = optionalText(value.prompt)
    const mode = value.mode === 'interactive' ? 'interactive' : 'print'
    return prompt ? { type: 'runClaudeCode', prompt, mode } : null
  }

  return null
}
