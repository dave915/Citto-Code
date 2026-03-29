import type { Session } from '../../store/sessions'
import { getProjectNameFromPath } from '../../store/sessions'
import { translate, type AppLanguage } from '../../lib/i18n'

export type SessionLockState = {
  isLocked: boolean
  hasConflict: boolean
  conflictingPaths: string[]
}

export type SessionGroup = {
  cwd: string
  label: string
  sessions: Session[]
}

export type SidebarSortMode = 'manual' | 'updated' | 'created'

export function getDirName(path: string): string {
  return getProjectNameFromPath(path)
}

const DEFAULT_SESSION_NAMES = new Set([translate('ko', 'sidebar.newSession'), translate('en', 'sidebar.newSession')])

export function isDefaultSessionName(name: string): boolean {
  return DEFAULT_SESSION_NAMES.has(name)
}

export function getSessionDisplayName(session: Session, language: AppLanguage = 'ko'): string {
  if (!isDefaultSessionName(session.name)) return session.name
  if (session.cwd && session.cwd !== '~') return getDirName(session.cwd)
  return translate(language, 'sidebar.newSession')
}

export function getSessionProjectLabel(session: Session): string | null {
  if (!session.cwd || session.cwd === '~') return null
  return getDirName(session.cwd)
}

export function getSessionCreatedAt(session: Session): number | null {
  return session.messages[0]?.createdAt ?? session.messages.at(-1)?.createdAt ?? null
}

export function getSessionLastActivityAt(session: Session): number | null {
  return session.messages.at(-1)?.createdAt ?? getSessionCreatedAt(session)
}

export function groupSessionsByProject(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>()

  for (const session of sessions) {
    const cwd = session.cwd || '~'
    const existing = groups.get(cwd)
    if (existing) {
      existing.sessions.push(session)
      continue
    }

    groups.set(cwd, {
      cwd,
      label: getDirName(cwd),
      sessions: [session],
    })
  }

  return Array.from(groups.values())
}

function getSessionSortTimestamp(session: Session, sortMode: Exclude<SidebarSortMode, 'manual'>): number | null {
  return sortMode === 'created' ? getSessionCreatedAt(session) : getSessionLastActivityAt(session)
}

export function orderSessionsForSidebar(sessions: Session[], sortMode: SidebarSortMode): Session[] {
  if (sortMode === 'manual') return [...sessions]

  return [...sessions]
    .map((session, index) => ({ session, index }))
    .sort((left, right) => {
      const leftTimestamp = getSessionSortTimestamp(left.session, sortMode) ?? Number.NEGATIVE_INFINITY
      const rightTimestamp = getSessionSortTimestamp(right.session, sortMode) ?? Number.NEGATIVE_INFINITY
      if (leftTimestamp === rightTimestamp) return left.index - right.index
      return rightTimestamp - leftTimestamp
    })
    .map(({ session }) => session)
}

export function getGroupSortTimestamp(sessions: Session[], sortMode: SidebarSortMode): number | null {
  if (sortMode === 'manual') return null

  return sessions.reduce<number | null>((latest, session) => {
    const timestamp = getSessionSortTimestamp(session, sortMode)
    if (timestamp == null) return latest
    if (latest == null) return timestamp
    return Math.max(latest, timestamp)
  }, null)
}

export function formatSidebarRelativeTime(timestamp: number | null, language: AppLanguage = 'ko'): string | null {
  if (timestamp == null) return null

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (deltaSeconds < 60) return translate(language, 'sidebar.time.justNow')

  const deltaMinutes = Math.floor(deltaSeconds / 60)
  if (deltaMinutes < 60) {
    return translate(language, 'sidebar.time.minutes', { count: deltaMinutes })
  }

  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) {
    return translate(language, 'sidebar.time.hours', { count: deltaHours })
  }

  const deltaDays = Math.floor(deltaHours / 24)
  if (deltaDays < 7) {
    return translate(language, 'sidebar.time.days', { count: deltaDays })
  }

  const deltaWeeks = Math.floor(deltaDays / 7)
  if (deltaWeeks < 5) {
    return translate(language, 'sidebar.time.weeks', { count: deltaWeeks })
  }

  const deltaMonths = Math.floor(deltaDays / 30)
  if (deltaMonths < 12) {
    return translate(language, 'sidebar.time.months', { count: deltaMonths })
  }

  return translate(language, 'sidebar.time.years', { count: Math.floor(deltaDays / 365) })
}
