import { nanoid } from '../store/nanoid'
import type {
  ImportedMessage,
  Message,
  Session,
  ShortcutConfig,
} from '../store/sessionTypes'

export const DEFAULT_PROJECT_PATH = '~/Desktop'
export const DEFAULT_UI_FONT_SIZE = 16
export const MIN_UI_FONT_SIZE = 13
export const MAX_UI_FONT_SIZE = 20
export const DEFAULT_UI_ZOOM_PERCENT = 100
export const MIN_UI_ZOOM_PERCENT = 50
export const MAX_UI_ZOOM_PERCENT = 200

export const DEFAULT_SHORTCUT_CONFIG: ShortcutConfig = {
  toggleSidebar: { mac: 'Cmd+B', windows: 'Ctrl+B' },
  toggleFiles: { mac: 'Cmd+E', windows: 'Ctrl+E' },
  toggleSessionInfo: { mac: 'Cmd+I', windows: 'Ctrl+I' },
  newSession: { mac: 'Cmd+N', windows: 'Ctrl+N' },
  openSettings: { mac: 'Cmd+,', windows: 'Ctrl+,' },
  openCommandPalette: { mac: 'Cmd+K', windows: 'Ctrl+K' },
  toggleQuickPanel: { mac: 'Alt+Space', windows: 'Alt+Space' },
  cyclePermissionMode: { mac: 'Shift+Tab', windows: 'Shift+Tab' },
  toggleBypassPermissions: { mac: 'Cmd+Shift+Enter', windows: 'Ctrl+Shift+Enter' },
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function clampUiFontSize(value: number): number {
  return clampNumber(Math.round(value), MIN_UI_FONT_SIZE, MAX_UI_FONT_SIZE)
}

export function clampUiZoomPercent(value: number): number {
  const rounded = Math.round(value / 10) * 10
  return clampNumber(rounded, MIN_UI_ZOOM_PERCENT, MAX_UI_ZOOM_PERCENT)
}

export function getProjectNameFromPath(path: string): string {
  if (!path || path === '~') return '~'
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

export function makeDefaultSession(cwd: string, name: string): Session {
  return {
    id: nanoid(),
    sessionId: null,
    name,
    favorite: false,
    cwd,
    messages: [],
    isStreaming: false,
    currentAssistantMsgId: null,
    error: null,
    pendingPermission: null,
    pendingQuestion: null,
    permissionMode: 'default',
    planMode: false,
    model: null,
  }
}

export function normalizeImportedMessage(message: ImportedMessage): Message {
  return {
    id: nanoid(),
    role: message.role,
    text: message.text,
    toolCalls: message.toolCalls.map((toolCall) => ({
      ...toolCall,
      id: nanoid(),
    })),
    thinking: message.thinking ?? '',
    attachedFiles: message.attachedFiles,
    createdAt: message.createdAt,
  }
}

export function pruneEmptyCurrentAssistantMessage(session: Session): Message[] {
  if (!session.currentAssistantMsgId) return session.messages

  return session.messages.filter((message) => {
    if (message.id !== session.currentAssistantMsgId) return true
    return message.text.trim().length > 0 || (message.thinking?.trim().length ?? 0) > 0 || message.toolCalls.length > 0
  })
}

export function findTabByClaudeSessionId(
  sessions: Session[],
  claudeSessionId: string,
): Session | undefined {
  return sessions.find((session) => session.sessionId === claudeSessionId)
}

export type SessionMessageSearchResult = {
  sessionId: string
  sessionName: string
  cwd: string
  messageId: string
  role: Message['role']
  preview: string
  createdAt: number
}

const MESSAGE_SEARCH_RESULTS_PER_SESSION = 3
const MESSAGE_SEARCH_PREVIEW_RADIUS = 56
const MESSAGE_SEARCH_PREVIEW_MAX_LENGTH = 180

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildSearchPreview(text: string, query: string): string {
  const normalizedText = normalizeSearchText(text)
  if (!normalizedText) return ''

  const normalizedQuery = normalizeSearchText(query).toLowerCase()
  const lowerText = normalizedText.toLowerCase()
  const matchIndex = lowerText.indexOf(normalizedQuery)
  if (matchIndex < 0) {
    return normalizedText.length > MESSAGE_SEARCH_PREVIEW_MAX_LENGTH
      ? `${normalizedText.slice(0, MESSAGE_SEARCH_PREVIEW_MAX_LENGTH - 1)}…`
      : normalizedText
  }

  const start = Math.max(0, matchIndex - MESSAGE_SEARCH_PREVIEW_RADIUS)
  const end = Math.min(
    normalizedText.length,
    matchIndex + normalizedQuery.length + MESSAGE_SEARCH_PREVIEW_RADIUS,
  )
  const preview = normalizedText.slice(start, end)

  return `${start > 0 ? '…' : ''}${preview}${end < normalizedText.length ? '…' : ''}`
}

export function searchSessions(sessions: Session[], query: string): Session[] {
  const trimmed = normalizeSearchText(query).toLowerCase()
  if (!trimmed) return sessions

  return sessions.filter((session) => {
    const haystack = [
      session.name,
      session.cwd,
      session.sessionId ?? '',
      ...session.messages.flatMap((message) => [message.text, message.thinking ?? '']),
    ]
      .join('\n')
      .replace(/\s+/g, ' ')
      .toLowerCase()

    return haystack.includes(trimmed)
  })
}

export function searchSessionMessages(
  sessions: Session[],
  query: string,
  limit = 12,
): SessionMessageSearchResult[] {
  const trimmed = normalizeSearchText(query).toLowerCase()
  if (!trimmed) return []

  const matches: SessionMessageSearchResult[] = []

  for (const session of sessions) {
    let collectedForSession = 0

    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
      const message = session.messages[index]
      const normalizedText = normalizeSearchText(message.text)
      if (!normalizedText) continue
      if (!normalizedText.toLowerCase().includes(trimmed)) continue

      matches.push({
        sessionId: session.id,
        sessionName: session.name,
        cwd: session.cwd,
        messageId: message.id,
        role: message.role,
        preview: buildSearchPreview(message.text, query),
        createdAt: message.createdAt,
      })
      collectedForSession += 1

      if (collectedForSession >= MESSAGE_SEARCH_RESULTS_PER_SESSION) {
        break
      }
    }
  }

  return matches
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}
