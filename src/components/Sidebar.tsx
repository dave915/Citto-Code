import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Session, SidebarMode } from '../store/sessions'

type Props = {
  sessions: Session[]
  activeSessionId: string | null
  sidebarMode: SidebarMode
  newSessionShortcutLabel: string
  settingsShortcutLabel: string
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  onNewSession: (cwd?: string) => void
  onRemoveSession: (id: string) => void
  onSelectFolder: (sessionId: string) => void
  onOpenSettings: () => void
}

type SessionGroup = {
  cwd: string
  label: string
  sessions: Session[]
}

function getDirName(p: string): string {
  if (!p || p === '~') return '~'
  const parts = p.split('/').filter(Boolean)
  return parts[parts.length - 1] || p
}

function getSessionDisplayName(session: Session): string {
  if (session.name !== '새 세션') return session.name
  if (session.cwd && session.cwd !== '~') return getDirName(session.cwd)
  return '새 세션'
}

function groupSessionsByProject(sessions: Session[]): SessionGroup[] {
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

type SessionRowProps = {
  session: Session
  activeSessionId: string | null
  editingSessionId: string | null
  editingName: string
  inputRef: RefObject<HTMLInputElement>
  showProjectLabel: boolean
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  onRemoveSession: (id: string) => void
  onSelectFolder: (sessionId: string) => void
  setEditingSessionId: (id: string | null) => void
  setEditingName: (name: string) => void
}

function SessionRow({
  session,
  activeSessionId,
  editingSessionId,
  editingName,
  inputRef,
  showProjectLabel,
  onSelectSession,
  onRenameSession,
  onRemoveSession,
  onSelectFolder,
  setEditingSessionId,
  setEditingName,
}: SessionRowProps) {
  const isActive = session.id === activeSessionId
  const isEditing = editingSessionId === session.id
  const itemCls = isActive
    ? 'bg-claude-sidebar-active text-white'
    : 'text-gray-400 hover:text-white hover:bg-claude-sidebar-hover'

  const startRename = () => {
    setEditingSessionId(session.id)
    setEditingName(getSessionDisplayName(session))
  }

  const cancelRename = () => {
    setEditingSessionId(null)
    setEditingName('')
  }

  const commitRename = () => {
    const nextName = editingName.trim()
    if (nextName && nextName !== session.name) {
      onRenameSession(session.id, nextName)
    }
    cancelRename()
  }

  return (
    <div className={`group flex items-start gap-1.5 rounded-lg px-2 py-2 transition-colors ${itemCls}`}>
      <button
        onClick={() => onSelectSession(session.id)}
        onDoubleClick={startRename}
        className="min-w-0 flex-1 flex items-start gap-2 text-left"
      >
        {session.isStreaming ? (
          <span className="mt-1 flex-shrink-0 w-2 h-2 rounded-full bg-claude-orange animate-pulse" />
        ) : (
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              ref={inputRef}
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelRename()
                }
              }}
              className="w-full bg-white/10 border border-white/15 rounded px-2 py-1 text-sm font-medium text-white outline-none focus:border-claude-orange/70"
            />
          ) : (
            <p className="truncate font-medium">{getSessionDisplayName(session)}</p>
          )}
          {showProjectLabel && session.cwd && session.cwd !== '~' && (
            <p className="truncate text-xs opacity-50 mt-0.5 font-mono pr-1">
              {getDirName(session.cwd)}
            </p>
          )}
        </div>
      </button>

      {!isEditing && (
        <div className="flex flex-shrink-0 items-center gap-0.5 self-center">
          <button
            onClick={(e) => { e.stopPropagation(); onSelectFolder(session.id) }}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10"
            title="폴더 변경"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onRemoveSession(session.id) }}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10"
            title="세션 삭제"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4h8v2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 10v6M14 10v6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export function Sidebar({
  sessions,
  activeSessionId,
  sidebarMode,
  newSessionShortcutLabel,
  settingsShortcutLabel,
  onSelectSession,
  onRenameSession,
  onNewSession,
  onRemoveSession,
  onSelectFolder,
  onOpenSettings,
}: Props) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const projectGroups = groupSessionsByProject(sessions)

  useEffect(() => {
    if (!editingSessionId) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [editingSessionId])

  useEffect(() => {
    if (sidebarMode !== 'project') return
    setCollapsedProjects((prev) => {
      const next = { ...prev }
      let changed = false
      for (const group of projectGroups) {
        if (!(group.cwd in next)) {
          next[group.cwd] = false
          changed = true
        }
      }
      for (const key of Object.keys(next)) {
        if (!projectGroups.some((group) => group.cwd === key)) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [sidebarMode, projectGroups])

  return (
    <aside className="w-full flex-shrink-0 bg-claude-sidebar flex flex-col h-full select-none">
      <div className="pt-10 pb-2 draggable-region" />

      <div className="px-3 mb-2 flex flex-col gap-1">
        <button
          onClick={() => onNewSession()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-claude-sidebar-hover text-sm transition-colors"
          title={`${sidebarMode === 'project' ? '프로젝트 추가' : '새 세션'} (${newSessionShortcutLabel})`}
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {sidebarMode === 'project' ? '프로젝트 추가' : '새 세션'}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 space-y-3">
        {sidebarMode === 'project' ? (
          projectGroups.map((group) => (
            <section key={group.cwd} className="space-y-1">
              <div className="flex items-center gap-1 px-1">
                <button
                  onClick={() => setCollapsedProjects((prev) => ({ ...prev, [group.cwd]: !prev[group.cwd] }))}
                  className="min-w-0 flex-1 flex items-center gap-2 px-1 py-1 text-gray-300 hover:text-white text-left"
                >
                  <svg
                    className={`w-3.5 h-3.5 flex-shrink-0 opacity-80 transition-transform ${collapsedProjects[group.cwd] ? '' : 'rotate-90'}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                  </svg>
                  <svg className="w-4 h-4 flex-shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="truncate text-sm font-semibold">{group.label}</span>
                </button>
                <button
                  onClick={() => onNewSession(group.cwd)}
                  className="flex-shrink-0 p-1 rounded text-gray-500 hover:text-white hover:bg-white/10"
                  title="이 프로젝트에 새 세션 추가"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              {!collapsedProjects[group.cwd] && (
                <div className="pl-3 space-y-0.5 border-l border-white/5 ml-3">
                  {group.sessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      activeSessionId={activeSessionId}
                      editingSessionId={editingSessionId}
                      editingName={editingName}
                      inputRef={inputRef}
                      showProjectLabel={false}
                      onSelectSession={onSelectSession}
                      onRenameSession={onRenameSession}
                      onRemoveSession={onRemoveSession}
                      onSelectFolder={onSelectFolder}
                      setEditingSessionId={setEditingSessionId}
                      setEditingName={setEditingName}
                    />
                  ))}
                </div>
              )}
            </section>
          ))
        ) : (
          <div className="space-y-0.5">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                activeSessionId={activeSessionId}
                editingSessionId={editingSessionId}
                editingName={editingName}
                inputRef={inputRef}
                showProjectLabel
                onSelectSession={onSelectSession}
                onRenameSession={onRenameSession}
                onRemoveSession={onRemoveSession}
                onSelectFolder={onSelectFolder}
                setEditingSessionId={setEditingSessionId}
                setEditingName={setEditingName}
              />
            ))}
          </div>
        )}
      </nav>

      <div className="px-3 py-3">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-claude-sidebar-hover text-sm transition-colors"
          title={`설정 (${settingsShortcutLabel})`}
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          설정
        </button>
      </div>
    </aside>
  )
}
