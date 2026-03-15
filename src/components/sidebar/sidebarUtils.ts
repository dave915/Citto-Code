import type { Session } from '../../store/sessions'
import { getProjectNameFromPath } from '../../store/sessions'

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

export function getSessionDisplayName(session: Session): string {
  if (session.name !== '새 세션') return session.name
  if (session.cwd && session.cwd !== '~') return getDirName(session.cwd)
  return '새 세션'
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
