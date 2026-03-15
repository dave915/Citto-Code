import type { Session } from '../../store/sessions'
import { getProjectNameFromPath } from '../../store/sessions'
import type { AppLanguage } from '../../lib/i18n'

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

export function getDirName(path: string): string {
  return getProjectNameFromPath(path)
}

const DEFAULT_SESSION_NAMES = new Set(['새 세션', 'New session'])

export function isDefaultSessionName(name: string): boolean {
  return DEFAULT_SESSION_NAMES.has(name)
}

export function getSessionDisplayName(session: Session, language: AppLanguage = 'ko'): string {
  if (!isDefaultSessionName(session.name)) return session.name
  if (session.cwd && session.cwd !== '~') return getDirName(session.cwd)
  return language === 'en' ? 'New session' : '새 세션'
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

export function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    return 0
  })
}
