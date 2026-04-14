const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
const DISABLED_MODEL_IDS = new Set([
  'gpt-54',
])

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
  const normalizedModel = normalizeConfiguredModelSelection(model)
  if (!normalizedModel) return false
  const normalized = normalizedModel.toLowerCase()
  if (!normalized) return false
  if (/^claude-/i.test(normalized)) return false
  if (normalized === 'sonnet' || normalized === 'opus' || normalized === 'haiku') return false
  return true
}

export function normalizeConfiguredModelSelection(model: string | null | undefined): string | undefined {
  if (typeof model !== 'string') return undefined
  const normalized = model.trim()
  if (!normalized) return undefined
  if (DISABLED_MODEL_IDS.has(normalized.toLowerCase())) return undefined
  return normalized
}

export function resolveLaunchEnvForModel(
  model: string | null | undefined,
  envVars?: Record<string, string>,
): Record<string, string> | undefined {
  const resolved = trimEnvVars(envVars)
  const normalizedModel = normalizeConfiguredModelSelection(model)

  if (isLocalModelSelection(normalizedModel)) {
    resolved.ANTHROPIC_BASE_URL = resolved.ANTHROPIC_BASE_URL || DEFAULT_OLLAMA_BASE_URL
    resolved.ANTHROPIC_AUTH_TOKEN = resolved.ANTHROPIC_AUTH_TOKEN || 'ollama'
    delete resolved.ANTHROPIC_API_KEY
    delete resolved.CLAUDE_CODE_USE_BEDROCK
    delete resolved.ANTHROPIC_BEDROCK_BASE_URL
    delete resolved.CLAUDE_CODE_SKIP_BEDROCK_AUTH
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined
}
