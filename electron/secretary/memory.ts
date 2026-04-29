import { randomUUID } from 'crypto'
import type { AppPersistence } from '../persistence'
import type {
  SecretaryActiveContext,
  SecretaryConversation,
  SecretaryHistoryEntry,
  SecretaryHistoryRole,
  SecretaryIntent,
  SecretaryPattern,
  SecretaryPatternType,
  SecretaryProfile,
} from './types'

const ACTIVE_CONVERSATION_PROFILE_KEY = 'secretary.activeConversationId'

function serializeContext(context: SecretaryActiveContext) {
  try {
    return JSON.stringify(context)
  } catch {
    return null
  }
}

export class SecretaryMemory {
  constructor(private readonly persistence: AppPersistence) {}

  getProfile(): SecretaryProfile {
    return this.persistence.getSecretaryProfile()
  }

  updateProfile(key: string, value: string): void {
    this.persistence.updateSecretaryProfile(key, value)
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
  }): void {
    this.persistence.addSecretaryHistory(entry)
  }

  loadRecentHistory(conversationId: string, limit = 12): SecretaryHistoryEntry[] {
    return this.persistence.loadSecretaryHistory(conversationId, limit)
  }

  loadHistory(conversationId: string, limit = 80): SecretaryHistoryEntry[] {
    return this.persistence.loadSecretaryHistory(conversationId, limit)
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
