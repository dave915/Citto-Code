import type { AppPersistence } from '../persistence'
import type {
  SecretaryAutomationIntentProfile,
  SecretaryAutomationPlatform,
  SecretaryAutomationProfile,
  SecretaryAutomationSlot,
  SecretaryAutomationTargetHint,
  SecretaryAutomationTargetPreference,
  SecretaryAutomationVerificationRule,
  SecretaryAutomationWorkflowStep,
} from './automation-profile-types'

const AUTOMATION_PROFILES_PROFILE_KEY = 'secretary.automationProfiles'
const DEFAULT_GENERIC_MESSENGER_PROFILE_ID = 'generic-messenger'
const MAX_PROFILES = 50
const MAX_ITEMS = 40

export const DEFAULT_GENERIC_MESSENGER_PROFILE: SecretaryAutomationProfile = {
  id: DEFAULT_GENERIC_MESSENGER_PROFILE_ID,
  label: 'Generic Messenger',
  app: {
    names: ['KakaoTalk', '카카오톡', 'LINE', 'Messages'],
    bundleIds: ['com.kakao.KakaoTalkMac', 'com.apple.MobileSMS'],
    platform: 'macos',
  },
  intents: {
    send_message: {
      slots: ['recipient', 'message'],
      workflow: [
        { type: 'find', target: 'recipientSearch' },
        { type: 'setText', target: 'recipientSearch', value: '{{recipient}}' },
        { type: 'press', key: 'return' },
        { type: 'find', target: 'messageInput' },
        { type: 'setText', target: 'messageInput', value: '{{message}}' },
        { type: 'find', target: 'sendButton', optional: true },
        { type: 'activate', target: 'sendButton' },
        { type: 'verify', rule: 'messageVisibleAtConversationBottom' },
      ],
      targets: {
        recipientSearch: {
          roles: ['searchbox', 'textbox', 'text field'],
          labels: ['Search', '검색', 'Find', '찾기'],
        },
        messageInput: {
          roles: ['textbox', 'textarea', 'text area'],
          labels: ['Message', '메시지', 'Write a message', '내용 입력'],
          prefer: [{ bottomArea: true }],
        },
        sendButton: {
          roles: ['button'],
          labels: ['Send', '전송', '보내기'],
          prefer: [{ nearTarget: 'messageInput' }],
        },
      },
      verification: [
        { type: 'messageVisible', text: '{{message}}', near: 'conversationBottom' },
      ],
      fallback: {
        allowOcr: true,
        allowCoordinateInput: false,
      },
    },
  },
  createdAt: 0,
  updatedAt: 0,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeText(value: unknown, maxLength = 160): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

function normalizeTextList(value: unknown, maxItems = MAX_ITEMS): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const text = normalizeText(item)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (result.length >= maxItems) break
  }
  return result
}

function normalizeId(value: unknown, fallbackSource?: string): string | null {
  const source = normalizeText(value, 80) ?? normalizeText(fallbackSource, 80)
  if (!source) return null
  const id = source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 64)
  return id || null
}

function normalizePlatform(value: unknown): SecretaryAutomationPlatform | null {
  return value === 'macos' || value === 'windows' || value === 'linux' ? value : null
}

function normalizeSlot(value: unknown): SecretaryAutomationSlot | null {
  return value === 'recipient' || value === 'message' || value === 'attachmentPaths' ? value : null
}

function normalizeSlots(value: unknown): SecretaryAutomationSlot[] {
  if (!Array.isArray(value)) return []
  const slots = value
    .map(normalizeSlot)
    .filter((slot): slot is SecretaryAutomationSlot => Boolean(slot))
  return Array.from(new Set(slots))
}

function normalizeFiniteTime(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function normalizeWorkflowStep(value: unknown): SecretaryAutomationWorkflowStep | null {
  if (!isRecord(value)) return null
  if (value.type === 'find') {
    const target = normalizeText(value.target, 80)
    return target ? { type: 'find', target, optional: Boolean(value.optional) || undefined } : null
  }
  if (value.type === 'activate') {
    const target = normalizeText(value.target, 80)
    return target ? { type: 'activate', target } : null
  }
  if (value.type === 'setText') {
    const target = normalizeText(value.target, 80)
    const textValue = normalizeText(value.value, 500)
    return target && textValue ? { type: 'setText', target, value: textValue } : null
  }
  if (value.type === 'press') {
    const key = normalizeText(value.key, 60)
    const modifiers = normalizeTextList(value.modifiers, 8)
    return key ? { type: 'press', key, modifiers: modifiers.length > 0 ? modifiers : undefined } : null
  }
  if (value.type === 'waitFor') {
    const target = normalizeText(value.target, 80)
    const timeoutMs = normalizeFiniteTime(value.timeoutMs, 0)
    return target ? { type: 'waitFor', target, timeoutMs: timeoutMs > 0 ? timeoutMs : undefined } : null
  }
  if (value.type === 'verify') {
    const rule = normalizeText(value.rule, 120)
    return rule ? { type: 'verify', rule } : null
  }
  return null
}

function normalizeWorkflow(value: unknown): SecretaryAutomationWorkflowStep[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeWorkflowStep)
    .filter((step): step is SecretaryAutomationWorkflowStep => Boolean(step))
    .slice(0, MAX_ITEMS)
}

function normalizeTargetPreference(value: unknown): SecretaryAutomationTargetPreference | null {
  if (!isRecord(value)) return null
  if (value.bottomArea === true) return { bottomArea: true }
  if (value.topArea === true) return { topArea: true }
  if (value.focused === true) return { focused: true }
  const nearTarget = normalizeText(value.nearTarget, 80)
  return nearTarget ? { nearTarget } : null
}

function normalizeTargetHint(value: unknown): SecretaryAutomationTargetHint | null {
  if (!isRecord(value)) return null
  const hint: SecretaryAutomationTargetHint = {}
  const roles = normalizeTextList(value.roles)
  const labels = normalizeTextList(value.labels)
  const values = normalizeTextList(value.values)
  const nearText = normalizeTextList(value.nearText)
  const prefer = Array.isArray(value.prefer)
    ? value.prefer
      .map(normalizeTargetPreference)
      .filter((entry): entry is SecretaryAutomationTargetPreference => Boolean(entry))
      .slice(0, MAX_ITEMS)
    : []

  if (roles.length > 0) hint.roles = roles
  if (labels.length > 0) hint.labels = labels
  if (values.length > 0) hint.values = values
  if (nearText.length > 0) hint.nearText = nearText
  if (prefer.length > 0) hint.prefer = prefer
  return Object.keys(hint).length > 0 ? hint : null
}

function normalizeTargets(value: unknown): Record<string, SecretaryAutomationTargetHint> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, hint]) => [normalizeText(key, 80), normalizeTargetHint(hint)] as const)
      .filter((entry): entry is [string, SecretaryAutomationTargetHint] => Boolean(entry[0] && entry[1])),
  )
}

function normalizeVerificationRule(value: unknown): SecretaryAutomationVerificationRule | null {
  if (!isRecord(value)) return null
  const type = normalizeText(value.type, 80)
  if (!type) return null
  const rule: SecretaryAutomationVerificationRule = { type }
  const text = normalizeText(value.text, 500)
  const near = normalizeText(value.near, 120)
  const target = normalizeText(value.target, 120)
  const ruleText = normalizeText(value.rule, 120)
  if (text) rule.text = text
  if (near) rule.near = near
  if (target) rule.target = target
  if (ruleText) rule.rule = ruleText
  return rule
}

function normalizeVerification(value: unknown): SecretaryAutomationVerificationRule[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeVerificationRule)
    .filter((rule): rule is SecretaryAutomationVerificationRule => Boolean(rule))
    .slice(0, MAX_ITEMS)
}

function normalizeIntentProfile(value: unknown): SecretaryAutomationIntentProfile | null {
  if (!isRecord(value)) return null
  const slots = normalizeSlots(value.slots)
  const workflow = normalizeWorkflow(value.workflow)
  const targets = normalizeTargets(value.targets)
  const verification = normalizeVerification(value.verification)
  if (slots.length === 0 || workflow.length === 0 || Object.keys(targets).length === 0) return null

  const fallback = isRecord(value.fallback)
    ? {
        allowOcr: Boolean(value.fallback.allowOcr),
        allowCoordinateInput: Boolean(value.fallback.allowCoordinateInput),
      }
    : undefined

  return {
    slots,
    workflow,
    targets,
    verification,
    fallback,
  }
}

export function normalizeAutomationProfile(
  value: unknown,
  options: { now?: number; existing?: SecretaryAutomationProfile | null } = {},
): SecretaryAutomationProfile | null {
  if (!isRecord(value)) return null
  const label = normalizeText(value.label, 80)
  const id = normalizeId(value.id, label ?? undefined)
  if (!id || !label) return null
  const app = isRecord(value.app) ? value.app : null
  if (!app) return null
  const names = normalizeTextList(app.names, 20)
  const platform = normalizePlatform(app.platform)
  if (names.length === 0 || !platform) return null
  const sendMessageIntent = normalizeIntentProfile(isRecord(value.intents) ? value.intents.send_message : null)
  if (!sendMessageIntent) return null

  const now = options.now ?? Date.now()
  const createdAt = normalizeFiniteTime(value.createdAt, options.existing?.createdAt ?? now)
  return {
    id,
    label,
    app: {
      names,
      bundleIds: normalizeTextList(app.bundleIds, 20),
      platform,
    },
    intents: {
      send_message: sendMessageIntent,
    },
    createdAt,
    updatedAt: normalizeFiniteTime(value.updatedAt, now),
  }
}

function normalizeStoredProfiles(value: unknown): SecretaryAutomationProfile[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => normalizeAutomationProfile(entry))
    .filter((profile): profile is SecretaryAutomationProfile => Boolean(profile))
    .filter((profile) => profile.id !== DEFAULT_GENERIC_MESSENGER_PROFILE_ID)
    .slice(0, MAX_PROFILES)
}

function serializeProfiles(profiles: SecretaryAutomationProfile[]): string {
  return JSON.stringify(normalizeStoredProfiles(profiles))
}

export class SecretaryAutomationProfileStore {
  constructor(private readonly persistence: AppPersistence) {}

  listProfiles(): SecretaryAutomationProfile[] {
    return [
      DEFAULT_GENERIC_MESSENGER_PROFILE,
      ...this.loadUserProfiles(),
    ]
  }

  saveProfile(profileDraft: unknown): { ok: boolean; profile?: SecretaryAutomationProfile; error?: string } {
    const current = this.loadUserProfiles()
    const draftRecord = isRecord(profileDraft) ? profileDraft : null
    const existingId = draftRecord ? normalizeId(draftRecord.id, normalizeText(draftRecord.label, 80) ?? undefined) : null
    const existing = existingId ? current.find((profile) => profile.id === existingId) ?? null : null
    const profile = normalizeAutomationProfile(profileDraft, { existing, now: Date.now() })
    if (!profile) return { ok: false, error: '자동화 프로필 형식이 올바르지 않아요.' }
    if (profile.id === DEFAULT_GENERIC_MESSENGER_PROFILE_ID) {
      return { ok: false, error: '기본 Generic Messenger 프로필은 수정할 수 없어요.' }
    }

    const next = current.filter((entry) => entry.id !== profile.id)
    next.push({ ...profile, createdAt: existing?.createdAt ?? profile.createdAt, updatedAt: Date.now() })
    this.saveUserProfiles(next)
    return { ok: true, profile: next.find((entry) => entry.id === profile.id) }
  }

  deleteProfile(id: string): { ok: boolean; error?: string } {
    const normalizedId = normalizeId(id)
    if (!normalizedId) return { ok: false, error: '삭제할 자동화 프로필 ID가 비어 있어요.' }
    if (normalizedId === DEFAULT_GENERIC_MESSENGER_PROFILE_ID) {
      return { ok: false, error: '기본 Generic Messenger 프로필은 삭제할 수 없어요.' }
    }
    const current = this.loadUserProfiles()
    const next = current.filter((profile) => profile.id !== normalizedId)
    if (next.length === current.length) return { ok: false, error: '삭제할 자동화 프로필을 찾지 못했어요.' }
    this.saveUserProfiles(next)
    return { ok: true }
  }

  private loadUserProfiles(): SecretaryAutomationProfile[] {
    const raw = this.persistence.getSecretaryProfile()[AUTOMATION_PROFILES_PROFILE_KEY]
    if (!raw) return []
    try {
      return normalizeStoredProfiles(JSON.parse(raw))
    } catch {
      return []
    }
  }

  private saveUserProfiles(profiles: SecretaryAutomationProfile[]): void {
    this.persistence.updateSecretaryProfile(AUTOMATION_PROFILES_PROFILE_KEY, serializeProfiles(profiles))
  }
}
