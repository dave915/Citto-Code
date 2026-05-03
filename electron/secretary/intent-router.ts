import { normalizeSecretaryAction } from './actions'
import { isCittoRoute } from './routes'
import type { SecretaryIntent, SecretaryProcessResult, SecretarySearchResult } from './types'

const INTENTS: SecretaryIntent[] = ['chat', 'navigate', 'execute', 'recall']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeIntent(value: unknown): SecretaryIntent {
  return typeof value === 'string' && INTENTS.includes(value as SecretaryIntent)
    ? value as SecretaryIntent
    : 'chat'
}

function normalizeSearchResults(value: unknown): SecretarySearchResult[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry): SecretarySearchResult | null => {
      if (!isRecord(entry)) return null
      const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : null
      const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : null
      const type = typeof entry.type === 'string' && entry.type.trim() ? entry.type.trim() : null
      if (!id || !label || !type) return null

      return {
        id,
        label,
        type,
        excerpt: typeof entry.excerpt === 'string' && entry.excerpt.trim() ? entry.excerpt.trim() : undefined,
        route: isCittoRoute(entry.route) ? entry.route : undefined,
        sessionId: typeof entry.sessionId === 'string' && entry.sessionId.trim() ? entry.sessionId.trim() : undefined,
        updatedAt: typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : undefined,
      }
    })
    .filter((entry): entry is SecretarySearchResult => Boolean(entry))
    .slice(0, 6)
}

export function normalizeSecretaryResult(value: unknown): SecretaryProcessResult {
  if (!isRecord(value)) {
    return {
      reply: '응답을 읽지 못했어요. 다시 말해 주세요.',
      intent: 'chat',
      action: null,
    }
  }

  const reply = typeof value.reply === 'string' && value.reply.trim()
    ? value.reply.trim()
    : '다음에 할 일을 조금 더 구체적으로 말해 주세요.'
  const action = normalizeSecretaryAction(value.action)
  const intent = action?.type === 'navigate' ? 'navigate' : normalizeIntent(value.intent)
  const searchResults = normalizeSearchResults(value.searchResults)

  return searchResults.length > 0
    ? { reply, intent, action, searchResults }
    : { reply, intent, action }
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    // Continue with fenced/object extraction.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      // Continue with object boundary extraction.
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
    } catch {
      return null
    }
  }

  return null
}
