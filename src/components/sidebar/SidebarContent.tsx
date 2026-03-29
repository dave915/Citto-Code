import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { Session, SidebarMode } from '../../store/sessions'
import { SessionRow } from './SessionRow'
import {
  formatSidebarRelativeTime,
  getGroupSortTimestamp,
  getSessionCreatedAt,
  getSessionLastActivityAt,
  orderSessionsForSidebar,
  type SessionGroup,
  type SessionLockState,
  type SidebarSortMode,
} from './sidebarUtils'

type Props = {
  sidebarMode: SidebarMode
  sortMode: SidebarSortMode
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
  onSidebarModeChange: (mode: SidebarMode) => void
  onSortModeChange: (mode: SidebarSortMode) => void
  onSetAllProjectsCollapsed: (collapsed: boolean) => void
  onReorderSession: (sourceId: string, targetId: string) => void
  onReorderProject: (sourceCwd: string, targetCwd: string) => void
  onToggleProject: (cwd: string) => void
  setEditingSessionId: (id: string | null) => void
  setEditingName: (name: string) => void
}

export function SidebarContent({
  sidebarMode,
  sortMode,
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
  onSidebarModeChange,
  onSortModeChange,
  onSetAllProjectsCollapsed,
  onReorderSession,
  onReorderProject,
  onToggleProject,
  setEditingSessionId,
  setEditingName,
}: Props) {
  const { language, t } = useI18n()
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null)
  const [sessionDropTargetId, setSessionDropTargetId] = useState<string | null>(null)
  const [draggingProjectCwd, setDraggingProjectCwd] = useState<string | null>(null)
  const [projectDropTargetCwd, setProjectDropTargetCwd] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<'display' | null>(null)
  const menuRootRef = useRef<HTMLDivElement>(null)
  const canManualReorder = sortMode === 'manual'

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRootRef.current?.contains(event.target as Node)) return
      setOpenMenu(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const orderedFavoriteSessions = useMemo(
    () => orderSessionsForSidebar(favoriteSessions, sortMode),
    [favoriteSessions, sortMode],
  )

  const orderedNonFavoriteSessions = useMemo(
    () => orderSessionsForSidebar(nonFavoriteSessions, sortMode),
    [nonFavoriteSessions, sortMode],
  )

  const orderedProjectGroups = useMemo(() => {
    const nextGroups = projectGroups.map((group, index) => ({
      ...group,
      sessions: orderSessionsForSidebar(group.sessions, sortMode),
      sortTimestamp: getGroupSortTimestamp(group.sessions, sortMode),
      originalIndex: index,
    }))

    if (sortMode === 'manual') return nextGroups

    return nextGroups.sort((left, right) => {
      const leftTimestamp = left.sortTimestamp ?? Number.NEGATIVE_INFINITY
      const rightTimestamp = right.sortTimestamp ?? Number.NEGATIVE_INFINITY
      if (leftTimestamp === rightTimestamp) return left.originalIndex - right.originalIndex
      return rightTimestamp - leftTimestamp
    })
  }, [projectGroups, sortMode])

  const organizationLabel = sidebarMode === 'project'
    ? t('sidebar.organization.project')
    : t('sidebar.organization.session')
  const sortLabel = sortMode === 'manual'
    ? t('sidebar.sort.manual')
    : sortMode === 'created'
      ? t('sidebar.sort.created')
      : t('sidebar.sort.updated')
  const allProjectsCollapsed = sidebarMode === 'project'
    && orderedProjectGroups.length > 0
    && orderedProjectGroups.every((group) => collapsedProjects[group.cwd])

  const getSessionTimestamp = (session: Session) => (
    formatSidebarRelativeTime(
      sortMode === 'created' ? getSessionCreatedAt(session) : getSessionLastActivityAt(session),
      language,
    )
  )

  const threadCount = favoriteSessions.length + nonFavoriteSessions.length

  return (
    <>
      {orderedFavoriteSessions.length > 0 && (
        <div className="mb-3 px-2.5">
          <div className="mb-1.5 flex items-center gap-2 px-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-claude-muted/55">
              {t('sidebar.favorites')}
            </p>
            <span className="rounded-full border border-white/[0.05] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-claude-muted/60">
              {orderedFavoriteSessions.length}
            </span>
          </div>
          <div className="space-y-px">
            {orderedFavoriteSessions.map((session) => (
              <SessionRow
                key={`favorite-${session.id}`}
                session={session}
                activeSessionId={activeSessionId}
                editingSessionId={editingSessionId}
                editingName={editingName}
                inputRef={inputRef}
                showProjectLabel
                dense
                timestampLabel={getSessionTimestamp(session)}
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

      <div className="mb-1 px-2.5">
        <div className="flex items-center justify-between gap-3 pl-2 pr-1 py-0.5">
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-claude-muted/72">
            {t('sidebar.threads')}
          </p>

          <div ref={menuRootRef} className="flex items-center gap-1">
            {sidebarMode === 'project' && orderedProjectGroups.length > 0 && (
              <button
                onClick={() => onSetAllProjectsCollapsed(!allProjectsCollapsed)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-claude-muted/70 transition-colors hover:bg-white/[0.04] hover:text-claude-text"
                title={allProjectsCollapsed ? t('sidebar.projectSessions.show') : t('sidebar.projectSessions.hide')}
                aria-label={allProjectsCollapsed ? t('sidebar.projectSessions.show') : t('sidebar.projectSessions.hide')}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  {allProjectsCollapsed ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 10l5 5 5-5" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 14l5-5 5 5" />
                  )}
                </svg>
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setOpenMenu((current) => (current === 'display' ? null : 'display'))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-claude-muted/70 transition-colors hover:bg-white/[0.04] hover:text-claude-text"
                title={`${t('sidebar.organization.title')} / ${t('sidebar.sort.title')}: ${organizationLabel}, ${sortLabel}`}
                aria-label={`${t('sidebar.organization.title')} / ${t('sidebar.sort.title')}: ${organizationLabel}, ${sortLabel}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 12h10" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 17h4" />
                </svg>
              </button>

              {openMenu === 'display' && (
                <div className="absolute left-0 top-[calc(100%+0.4rem)] z-30 w-56 overflow-hidden rounded-2xl border border-claude-border bg-claude-panel shadow-2xl">
                  <div className="border-b border-claude-border px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-claude-muted/70">
                    {t('sidebar.organization.title')} / {t('sidebar.sort.title')}
                  </div>
                  <div className="p-1.5">
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-claude-muted/60">
                      {t('sidebar.organization.title')}
                    </p>
                    {(['session', 'project'] as const).map((mode) => {
                      const active = sidebarMode === mode
                      const label = mode === 'project'
                        ? t('sidebar.organization.project')
                        : t('sidebar.organization.session')
                      return (
                        <button
                          key={mode}
                          onClick={() => {
                            onSidebarModeChange(mode)
                            setOpenMenu(null)
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                            active ? 'bg-claude-surface text-claude-text' : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
                          }`}
                        >
                          <span className="min-w-0 flex-1">{label}</span>
                          {active && (
                            <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      )
                    })}

                    <div className="mx-2 my-1 border-t border-claude-border/70" />

                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-claude-muted/60">
                      {t('sidebar.sort.title')}
                    </p>
                    {([
                      { value: 'updated', label: t('sidebar.sort.updated') },
                      { value: 'created', label: t('sidebar.sort.created') },
                      { value: 'manual', label: t('sidebar.sort.manual') },
                    ] as const).map((option) => {
                      const active = sortMode === option.value
                      return (
                        <button
                          key={option.value}
                          onClick={() => {
                            onSortModeChange(option.value)
                            setOpenMenu(null)
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                            active ? 'bg-claude-surface text-claude-text' : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
                          }`}
                        >
                          <span className="min-w-0 flex-1">{option.label}</span>
                          {active && (
                            <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => onNewSession()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-claude-muted/70 transition-colors hover:bg-white/[0.04] hover:text-claude-text"
              title={t('sidebar.newSession')}
              aria-label={t('sidebar.newSession')}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 0 0 2 2h8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14v6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 17h6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 pb-2.5">
        {sidebarMode === 'project' ? (
          orderedProjectGroups.map((group) => (
            <section key={group.cwd} className="space-y-0.5">
              <div
                draggable={canManualReorder}
                onDragStart={(event) => {
                  if (!canManualReorder) return
                  setDraggingProjectCwd(group.cwd)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  if (!canManualReorder) return
                  event.preventDefault()
                  if (draggingProjectCwd && draggingProjectCwd !== group.cwd) {
                    setProjectDropTargetCwd(group.cwd)
                  }
                }}
                onDragLeave={() => {
                  if (!canManualReorder) return
                  setProjectDropTargetCwd((current) => (current === group.cwd ? null : current))
                }}
                onDrop={(event) => {
                  if (!canManualReorder) return
                  event.preventDefault()
                  if (draggingProjectCwd) onReorderProject(draggingProjectCwd, group.cwd)
                  setDraggingProjectCwd(null)
                  setProjectDropTargetCwd(null)
                }}
                onDragEnd={() => {
                  if (!canManualReorder) return
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
                    className={`h-3.5 w-3.5 flex-shrink-0 opacity-80 transition-transform ${collapsedProjects[group.cwd] ? '' : 'rotate-90'}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                  </svg>
                  <svg className="h-4 w-4 flex-shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="truncate text-[14px] font-semibold">{group.label}</span>
                </button>
                <button
                  onClick={() => {
                    if (collapsedProjects[group.cwd]) onToggleProject(group.cwd)
                    onNewSession(group.cwd)
                  }}
                  className="flex-shrink-0 rounded-lg p-1.5 text-claude-muted/60 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 hover:bg-white/10 hover:text-claude-text"
                  title={t('sidebar.addSessionToProject')}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              {!collapsedProjects[group.cwd] && (
                <div className="ml-3 space-y-px border-l border-white/5 pl-3">
                  {group.sessions.map((session) => (
                    <div
                      key={session.id}
                      draggable={canManualReorder}
                      onDragStart={(event) => {
                        if (!canManualReorder) return
                        setDraggingSessionId(session.id)
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={(event) => {
                        if (!canManualReorder) return
                        event.preventDefault()
                        if (draggingSessionId && draggingSessionId !== session.id) {
                          setSessionDropTargetId(session.id)
                        }
                      }}
                      onDragLeave={() => {
                        if (!canManualReorder) return
                        setSessionDropTargetId((current) => (current === session.id ? null : current))
                      }}
                      onDrop={(event) => {
                        if (!canManualReorder) return
                        event.preventDefault()
                        if (draggingSessionId) onReorderSession(draggingSessionId, session.id)
                        setDraggingSessionId(null)
                        setSessionDropTargetId(null)
                      }}
                      onDragEnd={() => {
                        if (!canManualReorder) return
                        setDraggingSessionId(null)
                        setSessionDropTargetId(null)
                      }}
                      className={`rounded-xl transition-colors ${
                        sessionDropTargetId === session.id ? 'bg-white/5' : ''
                      }`}
                    >
                      <SessionRow
                        session={session}
                        activeSessionId={activeSessionId}
                        editingSessionId={editingSessionId}
                        editingName={editingName}
                        inputRef={inputRef}
                        showProjectLabel={false}
                        compact
                        timestampLabel={getSessionTimestamp(session)}
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
            </section>
          ))
        ) : (
          <div className="space-y-px">
            {orderedNonFavoriteSessions.map((session) => (
              <div
                key={session.id}
                draggable={canManualReorder}
                onDragStart={(event) => {
                  if (!canManualReorder) return
                  setDraggingSessionId(session.id)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  if (!canManualReorder) return
                  event.preventDefault()
                  if (draggingSessionId && draggingSessionId !== session.id) {
                    setSessionDropTargetId(session.id)
                  }
                }}
                onDragLeave={() => {
                  if (!canManualReorder) return
                  setSessionDropTargetId((current) => (current === session.id ? null : current))
                }}
                onDrop={(event) => {
                  if (!canManualReorder) return
                  event.preventDefault()
                  if (draggingSessionId) onReorderSession(draggingSessionId, session.id)
                  setDraggingSessionId(null)
                  setSessionDropTargetId(null)
                }}
                onDragEnd={() => {
                  if (!canManualReorder) return
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
                  timestampLabel={getSessionTimestamp(session)}
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
        {threadCount === 0 && (
          <div className="rounded-2xl border border-dashed border-white/5 px-4 py-6 text-center text-sm text-claude-muted/65">
            {t('sidebar.emptyThreads')}
          </div>
        )}
      </nav>
    </>
  )
}
