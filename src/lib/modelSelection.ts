const DISABLED_MODEL_IDS = new Set([
  'gpt-54',
])

export function normalizeConfiguredModelSelection(model: string | null | undefined): string | null {
  if (typeof model !== 'string') return null
  const normalized = model.trim()
  if (!normalized) return null
  if (DISABLED_MODEL_IDS.has(normalized.toLowerCase())) return null
  return normalized
}
