import { useEffect, useRef, useState } from 'react'
import type { Session } from '../store/sessions'

type Props = {
  sessions: Session[]
  activeSessionId: string
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  onNewSession: () => void
  onRemoveSession: (id: string) => void
  onSelectFolder: (sessionId: string) => void
  onOpenSettings: () => void
}

function getDirName(p: string): string {
  if (!p || p === '~') return '~'
  const parts = p.split('/').filter(Boolean)
  return parts[parts.length - 1] || p
}

function getSessionDisplayName(session: Session): string {
  if (session.name !== '새 세션') return session.name
  if (session.cwd && session.cwd !== '~') {
    const parts = session.cwd.split('/')
    return parts[parts.length - 1] || session.cwd
  }
  return '새 세션'
}

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onRenameSession,
  onNewSession,
  onRemoveSession,
  onSelectFolder,
  onOpenSettings,
}: Props) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editingSessionId) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [editingSessionId])

  const startRename = (session: Session) => {
    setEditingSessionId(session.id)
    setEditingName(getSessionDisplayName(session))
  }

  const cancelRename = () => {
    setEditingSessionId(null)
    setEditingName('')
  }

  const commitRename = (session: Session) => {
    const nextName = editingName.trim()
    if (nextName && nextName !== session.name) {
      onRenameSession(session.id, nextName)
    }
    cancelRename()
  }

  return (
    <aside className="w-60 flex-shrink-0 bg-claude-sidebar flex flex-col h-full select-none">
      {/* Draggable titlebar area */}
      <div className="pt-10 pb-2 draggable-region" />

      {/* 환경설정 + 새 세션 버튼 */}
      <div className="px-3 mb-2 flex flex-col gap-1">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-claude-sidebar-hover text-sm transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          환경설정
        </button>
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-claude-sidebar-hover text-sm transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          새 세션
        </button>
      </div>

      {/* Session list */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const isEditing = editingSessionId === session.id
          const itemCls = isActive
            ? 'bg-claude-sidebar-active text-white'
            : 'text-gray-400 hover:text-white hover:bg-claude-sidebar-hover'

          return (
            <div
              key={session.id}
              className={`group flex items-start gap-1.5 rounded-lg px-2 py-2 transition-colors ${itemCls}`}
            >
              <button
                onClick={() => onSelectSession(session.id)}
                onDoubleClick={() => startRename(session)}
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
                      onBlur={() => commitRename(session)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitRename(session)
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
                  {session.cwd && session.cwd !== '~' && (
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

                  {sessions.length > 1 && (
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
                  )}
                </div>
              )}
            </div>
          )
        })}
      </nav>

    </aside>
  )
}
