import { CITTO_ROUTES, isCittoRoute, type CittoRoute } from './routes'
import type { PermissionMode } from '../persistence-types'

export type SecretaryWorkflowDraftStep = {
  label?: string
  prompt: string
  cwd?: string
  systemPrompt?: string
}

export type SecretaryAction =
  | { type: 'navigate'; route: CittoRoute }
  | { type: 'startChat'; initialPrompt?: string }
  | { type: 'openRoundTable'; presetId?: string }
  | { type: 'openSession'; sessionId: string }
  | { type: 'runWorkflow'; workflowId: string; params?: Record<string, unknown> }
  | {
      type: 'draftWorkflow'
      name: string
      summary?: string
      steps?: SecretaryWorkflowDraftStep[]
      initialPrompt?: string
    }
  | {
      type: 'createWorkflow'
      name: string
      description?: string
      cwd?: string
      prompt?: string
      steps?: SecretaryWorkflowDraftStep[]
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
    type: 'draftWorkflow',
    description: '1차: 워크플로우 초안을 새 프로젝트 세션으로 넘겨 구체화. name 필수, initialPrompt 또는 steps 권장.',
    schema: '{ "type": "draftWorkflow", "name": "daily-review", "summary": "...", "steps": [{ "label": "검토", "prompt": "..." }] }',
  },
  {
    type: 'createWorkflow',
    description: '2차: 워크플로우를 앱에 저장. name 필수, prompt 또는 steps 필수. cwd는 선택.',
    schema: '{ "type": "createWorkflow", "name": "daily-review", "description": "...", "steps": [{ "label": "검토", "prompt": "..." }] }',
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
    type: 'runClaudeCode',
    description: "Claude Code 실행. prompt 필수, mode는 'print' 또는 'interactive'.",
    schema: '{ "type": "runClaudeCode", "prompt": "...", "mode": "print" }',
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

function normalizeWorkflowDraftSteps(value: unknown): SecretaryWorkflowDraftStep[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry): SecretaryWorkflowDraftStep | null => {
      if (!isRecord(entry)) return null
      const prompt = optionalText(entry.prompt)
      if (!prompt) return null

      return {
        prompt,
        label: optionalText(entry.label),
        cwd: optionalText(entry.cwd),
        systemPrompt: optionalText(entry.systemPrompt),
      }
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
    return sessionId ? { type: 'openSession', sessionId } : null
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

  if (type === 'runClaudeCode') {
    const prompt = optionalText(value.prompt)
    const mode = value.mode === 'interactive' ? 'interactive' : 'print'
    return prompt ? { type: 'runClaudeCode', prompt, mode } : null
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
