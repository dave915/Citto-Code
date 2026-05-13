import { randomUUID } from 'crypto'
import type { AppPersistence } from '../persistence'
import type { SecretaryAction, SecretaryActionResult } from './actions'
import type {
  SecretaryActiveContext,
  SecretaryConversation,
  SecretaryHistoryEntry,
  SecretaryHistoryRole,
  SecretaryIntent,
  SecretaryLearningCandidate,
  SecretaryMemoryEntry,
  SecretaryPattern,
  SecretaryPatternType,
  SecretaryProfile,
  SecretaryProcessResult,
} from './types'
import {
  inferLearningCandidateFromTurn,
  inferLearningCandidateFromCompletedAction,
  normalizeLearningCandidates,
  removeLearningCandidate,
  serializeLearningCandidates,
  upsertLearningCandidate,
} from './learning'

const ACTIVE_CONVERSATION_PROFILE_KEY = 'secretary.activeConversationId'
const LEARNING_CANDIDATES_PROFILE_KEY = 'secretary.learningCandidates'

function serializeContext(context: SecretaryActiveContext) {
  try {
    return JSON.stringify(context)
  } catch {
    return null
  }
}

function normalizeMemoryKey(key: string) {
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/^secretary\./, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80)
  if (!normalized) return 'memory.note'
  return normalized.startsWith('memory.') ? normalized : `memory.${normalized}`
}

function resolveMemoryProfileKey(key: string) {
  const trimmed = key.trim()
  return trimmed.startsWith('memory.') ? trimmed : normalizeMemoryKey(trimmed)
}

function normalizeMemoryValue(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500)
}

function getMemoryLabel(key: string) {
  return key
    .replace(/^memory\./, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    || key
}

export class SecretaryMemory {
  constructor(private readonly persistence: AppPersistence) {}

  getProfile(): SecretaryProfile {
    return this.persistence.getSecretaryProfile()
  }

  updateProfile(key: string, value: string): void {
    this.persistence.updateSecretaryProfile(key, value)
  }

  listMemories(): SecretaryMemoryEntry[] {
    return Object.entries(this.getProfile())
      .filter(([key]) => key.startsWith('memory.'))
      .map(([key, value]) => ({
        key,
        value,
        label: getMemoryLabel(key),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ko'))
  }

  updateMemory(key: string, value: string): { ok: boolean; error?: string } {
    const normalizedKey = resolveMemoryProfileKey(key)
    const normalizedValue = normalizeMemoryValue(value)
    if (!normalizedValue) return { ok: false, error: '저장할 기억 내용이 비어 있어요.' }
    this.persistence.updateSecretaryProfile(normalizedKey, normalizedValue)
    return { ok: true }
  }

  deleteMemory(key: string): { ok: boolean; error?: string } {
    const normalizedKey = resolveMemoryProfileKey(key)
    if (!this.getProfile()[normalizedKey]) return { ok: false, error: '삭제할 기억을 찾지 못했어요.' }
    this.persistence.deleteSecretaryProfile(normalizedKey)
    return { ok: true }
  }

  loadLearningCandidates(limit = 8): SecretaryLearningCandidate[] {
    const raw = this.getProfile()[LEARNING_CANDIDATES_PROFILE_KEY]
    if (!raw) return []
    try {
      return normalizeLearningCandidates(JSON.parse(raw)).slice(0, Math.max(1, limit))
    } catch {
      return []
    }
  }

  recordLearningCandidate(candidate: SecretaryLearningCandidate | null): void {
    if (!candidate) return
    const candidates = upsertLearningCandidate(this.loadLearningCandidates(12), candidate)
    this.updateProfile(LEARNING_CANDIDATES_PROFILE_KEY, serializeLearningCandidates(candidates))
  }

  getLearningCandidate(id: string): SecretaryLearningCandidate | null {
    return this.loadLearningCandidates(12).find((candidate) => candidate.id === id) ?? null
  }

  dismissLearningCandidate(id: string): boolean {
    const current = this.loadLearningCandidates(12)
    const next = removeLearningCandidate(current, id)
    if (next.length === current.length) return false
    this.updateProfile(LEARNING_CANDIDATES_PROFILE_KEY, serializeLearningCandidates(next))
    return true
  }

  recordLearningCandidateFromTurn(input: string, result: SecretaryProcessResult): void {
    this.recordLearningCandidate(inferLearningCandidateFromTurn(input, result))
  }

  recordLearningCandidateFromAction(action: SecretaryAction, result: SecretaryActionResult): void {
    this.recordLearningCandidate(inferLearningCandidateFromCompletedAction(action, result))
  }

  listConversations(limit = 50): SecretaryConversation[] {
    return this.persistence.listSecretaryConversations(limit)
  }

  getConversation(id: string): SecretaryConversation | null {
    return this.persistence.getSecretaryConversation(id)
  }

  getActiveConversation(context: SecretaryActiveContext): SecretaryConversation {
    const activeConversationId = this.getProfile()[ACTIVE_CONVERSATION_PROFILE_KEY]
    const activeConversation = activeConversationId
      ? this.persistence.getSecretaryConversation(activeConversationId)
      : null
    if (activeConversation) return activeConversation

    const [latestConversation] = this.listConversations(1)
    if (latestConversation) {
      this.updateProfile(ACTIVE_CONVERSATION_PROFILE_KEY, latestConversation.id)
      return latestConversation
    }

    return this.createConversation(context)
  }

  createConversation(context: SecretaryActiveContext): SecretaryConversation {
    const conversation = this.persistence.createSecretaryConversation({
      id: randomUUID(),
      title: '새 채팅',
      cittoContext: serializeContext(context),
    })
    this.updateProfile(ACTIVE_CONVERSATION_PROFILE_KEY, conversation.id)
    return conversation
  }

  switchConversation(id: string): SecretaryConversation | null {
    const conversation = this.persistence.getSecretaryConversation(id)
    if (!conversation) return null
    this.updateProfile(ACTIVE_CONVERSATION_PROFILE_KEY, conversation.id)
    return conversation
  }

  renameConversation(id: string, title: string): SecretaryConversation | null {
    return this.persistence.updateSecretaryConversationTitle(id, title)
  }

  archiveConversation(id: string, context: SecretaryActiveContext): SecretaryConversation {
    const activeConversationId = this.getProfile()[ACTIVE_CONVERSATION_PROFILE_KEY]
    this.persistence.archiveSecretaryConversation(id)

    if (activeConversationId && activeConversationId !== id) {
      const activeConversation = this.persistence.getSecretaryConversation(activeConversationId)
      if (activeConversation) return activeConversation
    }

    const [latestConversation] = this.listConversations(1)
    const nextConversation = latestConversation ?? this.createConversation(context)
    this.updateProfile(ACTIVE_CONVERSATION_PROFILE_KEY, nextConversation.id)
    return nextConversation
  }

  maybeSetFallbackTitle(conversationId: string, input: string): void {
    const conversation = this.persistence.getSecretaryConversation(conversationId)
    if (!conversation || (conversation.title !== '새 대화' && conversation.title !== '새 채팅')) return
    const normalized = input.trim().replace(/\s+/g, ' ')
    const title = normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized
    if (title) {
      this.persistence.updateSecretaryConversationTitle(conversationId, title)
    }
  }

  setGeneratedTitle(conversationId: string, title: string): void {
    this.persistence.updateSecretaryConversationTitle(conversationId, title)
  }

  countHistory(conversationId: string): number {
    return this.persistence.countSecretaryHistory(conversationId)
  }

  addHistory(entry: {
    conversationId: string
    role: SecretaryHistoryRole
    content: string
    intent?: SecretaryIntent | null
    action?: SecretaryHistoryEntry['action']
    searchResults?: SecretaryHistoryEntry['searchResults']
  }): void {
    this.persistence.addSecretaryHistory(entry)
  }

  loadRecentHistory(conversationId: string, limit = 12): SecretaryHistoryEntry[] {
    return this.persistence.loadSecretaryHistory(conversationId, limit)
  }

  loadHistory(conversationId: string, limit = 80): SecretaryHistoryEntry[] {
    return this.persistence.loadSecretaryHistory(conversationId, limit)
  }

  searchConversationHistory(input: string, limit = 10) {
    return this.persistence.searchConversationHistory(input, limit)
  }

  loadPatterns(limit = 8): SecretaryPattern[] {
    return this.persistence.loadSecretaryPatterns(limit)
  }

  recordPatternUse(pattern: {
    patternType: SecretaryPatternType
    refId: string
    label: string
  }): void {
    this.persistence.recordSecretaryPatternUse(pattern)
  }
}
