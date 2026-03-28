import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import type { Session, SidebarMode } from '../store/sessions'
import { useScheduledTasksStore } from '../store/scheduledTasks'
import { SidebarContent } from './sidebar/SidebarContent'
import { SidebarFooter } from './sidebar/SidebarFooter'
import { groupSessionsByProject, sortSessions, type SessionLockState } from './sidebar/sidebarUtils'

type Props = {
  sessions: Session[]
  activeSessionId: string | null
  sessionLockState: Record<string, SessionLockState>
  sidebarMode: SidebarMode
  newSessionShortcutLabel: string
  settingsShortcutLabel: string
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  onToggleFavorite: (id: string) => void
  onNewSession: (cwd?: string) => void
  onReorderSessions: (sessionIds: string[]) => void
  onRemoveSession: (id: string) => void
  onSelectFolder: (sessionId: string) => void
  onOpenSchedule: () => void
  onOpenSettings: () => void
  scheduleOpen: boolean
}

export function Sidebar({
  sessions,
  activeSessionId,
  sessionLockState,
  sidebarMode,
  newSessionShortcutLabel,
  settingsShortcutLabel,
  onSelectSession,
  onRenameSession,
  onToggleFavorite,
  onNewSession,
  onReorderSessions,
  onRemoveSession,
  onSelectFolder: _onSelectFolder,
  onOpenSchedule,
  onOpenSettings,
  scheduleOpen,
}: Props) {
  const { t } = useI18n()
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const primaryActionLabel = sidebarMode === 'project' ? t('sidebar.newProject') : t('sidebar.newSession')
  const favoriteSessions = sortSessions(sessions.filter((session) => session.favorite))
  const nonFavoriteSessions = sessions.filter((session) => !session.favorite)
  const projectGroups = groupSessionsByProject(nonFavoriteSessions)
  const activeScheduledTaskCount = useScheduledTasksStore((state) => (
    state.tasks.filter((task) => task.enabled && task.frequency !== 'manual').length
  ))

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

  const commitNonFavoriteOrder = (orderedNonFavoriteIds: string[]) => {
    const reorderedNonFavoriteIds = new Set(orderedNonFavoriteIds)
    const nextNonFavoriteIds = [
      ...orderedNonFavoriteIds,
      ...sessions.filter((session) => !session.favorite && !reorderedNonFavoriteIds.has(session.id)).map((session) => session.id),
    ]
    let nonFavoriteIndex = 0
    const nextOrder = sessions.map((session) => {
      if (session.favorite) return session.id
      const nextId = nextNonFavoriteIds[nonFavoriteIndex]
      nonFavoriteIndex += 1
      return nextId
    })
    onReorderSessions(nextOrder)
  }

  const handleReorderSession = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const currentIds = nonFavoriteSessions.map((session) => session.id)
    const sourceIndex = currentIds.indexOf(sourceId)
    const targetIndex = currentIds.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const nextIds = [...currentIds]
    const [moved] = nextIds.splice(sourceIndex, 1)
    nextIds.splice(targetIndex, 0, moved)
    commitNonFavoriteOrder(nextIds)
  }

  const handleReorderProject = (sourceCwd: string, targetCwd: string) => {
    if (sourceCwd === targetCwd) return
    const currentGroupOrder = projectGroups.map((group) => group.cwd)
    const sourceIndex = currentGroupOrder.indexOf(sourceCwd)
    const targetIndex = currentGroupOrder.indexOf(targetCwd)
    if (sourceIndex < 0 || targetIndex < 0) return

    const nextGroupOrder = [...currentGroupOrder]
    const [moved] = nextGroupOrder.splice(sourceIndex, 1)
    nextGroupOrder.splice(targetIndex, 0, moved)

    const orderedSessionIds = nextGroupOrder.flatMap((cwd) => (
      projectGroups.find((group) => group.cwd === cwd)?.sessions.map((session) => session.id) ?? []
    ))
    commitNonFavoriteOrder(orderedSessionIds)
  }

  return (
    <aside className="flex h-full w-full flex-shrink-0 select-none flex-col border-r border-white/5 bg-claude-sidebar">
      <div className="pt-10 pb-2 draggable-region" />

      <div className="mb-3 flex flex-col gap-1 px-3">
        <button
          onClick={() => onNewSession()}
          className="flex w-full items-center gap-2 rounded-2xl border border-white/[0.035] bg-white/[0.03] px-3.5 py-2.5 text-sm text-claude-text outline-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 hover:bg-claude-sidebar-hover hover:text-claude-text"
          title={`${primaryActionLabel} (${newSessionShortcutLabel})`}
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {primaryActionLabel}
        </button>
      </div>

      <SidebarContent
        sidebarMode={sidebarMode}
        favoriteSessions={favoriteSessions}
        nonFavoriteSessions={nonFavoriteSessions}
        projectGroups={projectGroups}
        collapsedProjects={collapsedProjects}
        activeSessionId={activeSessionId}
        editingSessionId={editingSessionId}
        editingName={editingName}
        inputRef={inputRef}
        sessionLockState={sessionLockState}
        onSelectSession={onSelectSession}
        onRenameSession={onRenameSession}
        onToggleFavorite={onToggleFavorite}
        onRemoveSession={onRemoveSession}
        onNewSession={onNewSession}
        onReorderSession={handleReorderSession}
        onReorderProject={handleReorderProject}
        onToggleProject={(cwd) => {
          setCollapsedProjects((prev) => ({ ...prev, [cwd]: !prev[cwd] }))
        }}
        setEditingSessionId={setEditingSessionId}
        setEditingName={setEditingName}
      />

      <SidebarFooter
        activeScheduledTaskCount={activeScheduledTaskCount}
        scheduleOpen={scheduleOpen}
        settingsShortcutLabel={settingsShortcutLabel}
        onOpenSchedule={onOpenSchedule}
        onOpenSettings={onOpenSettings}
      />
    </aside>
  )
}
