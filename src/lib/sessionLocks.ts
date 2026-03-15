import type { Session } from '../store/sessions'
import { isWriteLikeTool } from './claudeRuntime'

export type SessionFileLockState = {
  paths: string[]
  conflictingPaths: string[]
  conflictingSessionIds: string[]
  isLocked: boolean
  hasConflict: boolean
}

function normalizeLockedFilePath(value: string): string {
  return value.replace(/\\/g, '/').trim().toLowerCase()
}

function extractEditableFilePaths(toolName: string, toolInput: unknown): string[] {
  if (!isWriteLikeTool(toolName) || !toolInput || typeof toolInput !== 'object') return []

  const record = toolInput as {
    file_path?: unknown
    notebook_path?: unknown
    path?: unknown
  }

  const candidate = record.file_path ?? record.notebook_path ?? record.path
  if (typeof candidate !== 'string' || !candidate.trim()) return []
  return [candidate.trim()]
}

function getSessionActiveEditPaths(session: Session): string[] {
  const paths = new Map<string, string>()

  if (session.pendingPermission && isWriteLikeTool(session.pendingPermission.toolName)) {
    for (const path of extractEditableFilePaths(session.pendingPermission.toolName, session.pendingPermission.toolInput)) {
      paths.set(normalizeLockedFilePath(path), path)
    }
  }

  if (!session.isStreaming || !session.currentAssistantMsgId) {
    return Array.from(paths.values())
  }

  const currentAssistantMessage = session.messages.find((message) => message.id === session.currentAssistantMsgId)
  if (!currentAssistantMessage) return Array.from(paths.values())

  for (const toolCall of currentAssistantMessage.toolCalls) {
    if (toolCall.status !== 'running' || !isWriteLikeTool(toolCall.toolName)) continue
    for (const path of extractEditableFilePaths(toolCall.toolName, toolCall.toolInput)) {
      paths.set(normalizeLockedFilePath(path), path)
    }
  }

  return Array.from(paths.values())
}

export function buildSessionFileLockState(sessions: Session[]): Record<string, SessionFileLockState> {
  const stateBySessionId: Record<string, SessionFileLockState> = {}
  const ownersByPath = new Map<string, Array<{ sessionId: string; displayPath: string }>>()

  for (const session of sessions) {
    const paths = getSessionActiveEditPaths(session)
    stateBySessionId[session.id] = {
      paths,
      conflictingPaths: [],
      conflictingSessionIds: [],
      isLocked: paths.length > 0,
      hasConflict: false,
    }

    for (const path of paths) {
      const key = normalizeLockedFilePath(path)
      const owners = ownersByPath.get(key) ?? []
      owners.push({ sessionId: session.id, displayPath: path })
      ownersByPath.set(key, owners)
    }
  }

  for (const owners of ownersByPath.values()) {
    if (owners.length <= 1) continue
    for (const owner of owners) {
      const state = stateBySessionId[owner.sessionId]
      if (!state) continue
      state.hasConflict = true
      if (!state.conflictingPaths.includes(owner.displayPath)) {
        state.conflictingPaths.push(owner.displayPath)
      }
      for (const other of owners) {
        if (other.sessionId === owner.sessionId) continue
        if (!state.conflictingSessionIds.includes(other.sessionId)) {
          state.conflictingSessionIds.push(other.sessionId)
        }
      }
    }
  }

  return stateBySessionId
}
