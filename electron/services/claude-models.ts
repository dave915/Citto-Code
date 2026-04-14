import {
  getGatewayProxyBaseUrl,
  isGatewayModelId,
} from '../gateway-constants'

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
const GATEWAY_CLI_MODEL = 'claude-sonnet-4-6'

function trimEnvVars(envVars: Record<string, string> | undefined): Record<string, string> {
  if (!envVars) return {}

  const next = Object.fromEntries(
    Object.entries(envVars).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : '']),
  )

  return Object.fromEntries(
    Object.entries(next).filter(([, value]) => value.length > 0),
  )
}

export function isLocalModelSelection(model: string | null | undefined): boolean {
  if (!model) return false
  const normalized = model.trim().toLowerCase()
  if (!normalized) return false
  if (isGatewayModelId(normalized)) return false
  if (/^claude-/i.test(normalized)) return false
  if (normalized === 'sonnet' || normalized === 'opus' || normalized === 'haiku') return false
  return true
}

export function resolveCliModelName(model: string | null | undefined): string | undefined {
  if (!model?.trim()) return undefined
  return isGatewayModelId(model) ? GATEWAY_CLI_MODEL : model.trim()
}

export function resolveLaunchEnvForModel(
  model: string | null | undefined,
  envVars?: Record<string, string>,
): Record<string, string> | undefined {
  const resolved = trimEnvVars(envVars)

  if (isGatewayModelId(model)) {
    resolved.ANTHROPIC_BASE_URL = getGatewayProxyBaseUrl()
    resolved.ANTHROPIC_API_KEY = resolved.ANTHROPIC_API_KEY || 'gateway-proxy'
    delete resolved.ANTHROPIC_AUTH_TOKEN
    delete resolved.CLAUDE_CODE_USE_BEDROCK
    delete resolved.ANTHROPIC_BEDROCK_BASE_URL
    delete resolved.CLAUDE_CODE_SKIP_BEDROCK_AUTH
    return Object.keys(resolved).length > 0 ? resolved : undefined
  }

  if (isLocalModelSelection(model)) {
    resolved.ANTHROPIC_BASE_URL = resolved.ANTHROPIC_BASE_URL || DEFAULT_OLLAMA_BASE_URL
    resolved.ANTHROPIC_AUTH_TOKEN = resolved.ANTHROPIC_AUTH_TOKEN || 'ollama'
    delete resolved.ANTHROPIC_API_KEY
    delete resolved.CLAUDE_CODE_USE_BEDROCK
    delete resolved.ANTHROPIC_BEDROCK_BASE_URL
    delete resolved.CLAUDE_CODE_SKIP_BEDROCK_AUTH
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined
}
