import { useState, type RefObject } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { Session } from '../../store/sessions'
import { SessionRow } from './SessionRow'
import { sortSessions, type SessionGroup, type SessionLockState } from './sidebarUtils'

type Props = {
  sidebarMode: 'session' | 'project'
  favoriteSessions: Session[]
  nonFavoriteSessions: Session[]
  projectGroups: SessionGroup[]
  collapsedProjects: Record<string, boolean>
  activeSessionId: string | null
  editingSessionId: string | null
  editingName: string
  inputRef: RefObject<HTMLInputElement>
  sessionLockState: Record<string, SessionLockState>
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  onToggleFavorite: (id: string) => void
  onRemoveSession: (id: string) => void
  onNewSession: (cwd?: string) => void
  onReorderSession: (sourceId: string, targetId: string) => void
  onReorderProject: (sourceCwd: string, targetCwd: string) => void
  onToggleProject: (cwd: string) => void
  setEditingSessionId: (id: string | null) => void
  setEditingName: (name: string) => void
}

export function SidebarContent({
  sidebarMode,
  favoriteSessions,
  nonFavoriteSessions,
  projectGroups,
  collapsedProjects,
  activeSessionId,
  editingSessionId,
  editingName,
  inputRef,
  sessionLockState,
  onSelectSession,
  onRenameSession,
  onToggleFavorite,
  onRemoveSession,
  onNewSession,
  onReorderSession,
  onReorderProject,
  onToggleProject,
  setEditingSessionId,
  setEditingName,
}: Props) {
  const { t } = useI18n()
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null)
  const [sessionDropTargetId, setSessionDropTargetId] = useState<string | null>(null)
  const [draggingProjectCwd, setDraggingProjectCwd] = useState<string | null>(null)
  const [projectDropTargetCwd, setProjectDropTargetCwd] = useState<string | null>(null)

  return (
    <>
      {favoriteSessions.length > 0 && (
        <div className="mb-0 px-3">
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-claude-muted/60">
            {t('sidebar.favorites')}
          </div>
          <div className="space-y-0.5">
            {favoriteSessions.map((session) => (
              <SessionRow
                key={`favorite-${session.id}`}
                session={session}
                activeSessionId={activeSessionId}
                editingSessionId={editingSessionId}
                editingName={editingName}
                inputRef={inputRef}
                showProjectLabel
                dense={sidebarMode === 'session'}
                lockState={sessionLockState[session.id]}
                onSelectSession={onSelectSession}
                onRenameSession={onRenameSession}
                onToggleFavorite={onToggleFavorite}
                onRemoveSession={onRemoveSession}
                setEditingSessionId={setEditingSessionId}
                setEditingName={setEditingName}
              />
            ))}
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {sidebarMode === 'project' ? (
          projectGroups.map((group) => (
            <section key={group.cwd} className="space-y-0.5">
              <div
                draggable
                onDragStart={(event) => {
                  setDraggingProjectCwd(group.cwd)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (draggingProjectCwd && draggingProjectCwd !== group.cwd) {
                    setProjectDropTargetCwd(group.cwd)
                  }
                }}
                onDragLeave={() => {
                  setProjectDropTargetCwd((current) => (current === group.cwd ? null : current))
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggingProjectCwd) onReorderProject(draggingProjectCwd, group.cwd)
                  setDraggingProjectCwd(null)
                  setProjectDropTargetCwd(null)
                }}
                onDragEnd={() => {
                  setDraggingProjectCwd(null)
                  setProjectDropTargetCwd(null)
                }}
                className={`flex items-center gap-1 rounded-xl px-1 transition-colors ${
                  projectDropTargetCwd === group.cwd ? 'bg-white/5' : ''
                }`}
              >
                <button
                  onClick={() => onToggleProject(group.cwd)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 hover:text-claude-text"
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
                  <span className="truncate text-[16px] font-semibold">{group.label}</span>
                </button>
                <button
                  onClick={() => {
                    if (collapsedProjects[group.cwd]) onToggleProject(group.cwd)
                    onNewSession(group.cwd)
                  }}
                  className="flex-shrink-0 rounded-lg p-1.5 text-claude-muted/60 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 hover:bg-white/10 hover:text-claude-text"
                  title={t('sidebar.addSessionToProject')}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              {!collapsedProjects[group.cwd] && (
                <div className="ml-3 space-y-0.5 border-l border-white/5 pl-3">
                  {sortSessions(group.sessions).map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      activeSessionId={activeSessionId}
                      editingSessionId={editingSessionId}
                      editingName={editingName}
                      inputRef={inputRef}
                      showProjectLabel={false}
                      compact
                      lockState={sessionLockState[session.id]}
                      onSelectSession={onSelectSession}
                      onRenameSession={onRenameSession}
                      onToggleFavorite={onToggleFavorite}
                      onRemoveSession={onRemoveSession}
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
            {sortSessions(nonFavoriteSessions).map((session) => (
              <div
                key={session.id}
                draggable
                onDragStart={(event) => {
                  setDraggingSessionId(session.id)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (draggingSessionId && draggingSessionId !== session.id) {
                    setSessionDropTargetId(session.id)
                  }
                }}
                onDragLeave={() => {
                  setSessionDropTargetId((current) => (current === session.id ? null : current))
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggingSessionId) onReorderSession(draggingSessionId, session.id)
                  setDraggingSessionId(null)
                  setSessionDropTargetId(null)
                }}
                onDragEnd={() => {
                  setDraggingSessionId(null)
                  setSessionDropTargetId(null)
                }}
                className={`rounded-2xl transition-colors ${
                  sessionDropTargetId === session.id ? 'bg-white/5' : ''
                }`}
              >
                <SessionRow
                  session={session}
                  activeSessionId={activeSessionId}
                  editingSessionId={editingSessionId}
                  editingName={editingName}
                  inputRef={inputRef}
                  showProjectLabel
                  dense
                  lockState={sessionLockState[session.id]}
                  onSelectSession={onSelectSession}
                  onRenameSession={onRenameSession}
                  onToggleFavorite={onToggleFavorite}
                  onRemoveSession={onRemoveSession}
                  setEditingSessionId={setEditingSessionId}
                  setEditingName={setEditingName}
                />
              </div>
            ))}
          </div>
        )}
      </nav>
    </>
  )
}
