import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../hooks/useI18n'
import type { Session, SidebarMode } from '../store/sessions'
import { useWorkflowStore } from '../store/workflowStore'
import { SidebarContent } from './sidebar/SidebarContent'
import { SidebarFooter } from './sidebar/SidebarFooter'
import {
  groupSessionsByProject,
  type SessionLockState,
  type SidebarSortMode,
} from './sidebar/sidebarUtils'

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
  onOpenWorkflow: () => void
  onOpenSettings: () => void
  onSidebarModeChange: (mode: SidebarMode) => void
  workflowOpen: boolean
  settingsOpen: boolean
}

function SidebarActionButton({
  label,
  icon,
  active = false,
  badge,
  title,
  onClick,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  badge?: number
  title?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[30px] w-full items-center gap-2 rounded-md border px-2 py-1.5 text-[13px] font-medium outline-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/35 ${
        active
          ? 'border-claude-border bg-claude-surface text-claude-text'
          : 'border-transparent bg-transparent text-claude-text hover:border-claude-border/60 hover:bg-claude-sidebar-hover hover:text-claude-text'
      }`}
      title={title ?? label}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge && badge > 0 ? (
        <span className="rounded-full border border-claude-border bg-claude-panel px-2 py-0.5 text-[11px] text-claude-muted">
          {badge}
        </span>
      ) : null}
    </button>
  )
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
  onOpenWorkflow,
  onOpenSettings,
  onSidebarModeChange,
  workflowOpen,
  settingsOpen,
}: Props) {
  const { t } = useI18n()
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [sortMode, setSortMode] = useState<SidebarSortMode>('updated')
  const inputRef = useRef<HTMLInputElement>(null)
  const favoriteSessions = useMemo(
    () => sessions.filter((session) => session.favorite),
    [sessions],
  )
  const nonFavoriteSessions = useMemo(
    () => sessions.filter((session) => !session.favorite),
    [sessions],
  )
  const projectGroups = useMemo(
    () => groupSessionsByProject(nonFavoriteSessions),
    [nonFavoriteSessions],
  )
  const projectGroupCwdsSignature = useMemo(
    () => projectGroups.map((group) => group.cwd).join('\n'),
    [projectGroups],
  )
  const workflowCount = useWorkflowStore((state) => state.workflows.length)

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
  }, [projectGroupCwdsSignature, projectGroups, sidebarMode])

  const handleSetAllProjectsCollapsed = (collapsed: boolean) => {
    if (projectGroups.length === 0) return
    setCollapsedProjects((prev) => {
      const next = { ...prev }
      for (const group of projectGroups) {
        next[group.cwd] = collapsed
      }
      return next
    })
  }

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
    <aside className="flex h-full w-full flex-shrink-0 select-none flex-col border-r border-claude-border bg-claude-sidebar">
      <div className="draggable-region h-[42px] shrink-0 border-b border-claude-border bg-claude-panel" />

      <div className="mb-1.5 flex flex-col gap-0.5 px-2 py-2">
        <SidebarActionButton
          label={t('sidebar.newSession')}
          title={`${t('sidebar.newSession')} (${newSessionShortcutLabel})`}
          onClick={() => onNewSession()}
          icon={(
            <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          )}
        />
        <SidebarActionButton
          label={t('sidebar.workflows')}
          active={workflowOpen}
          badge={workflowCount}
          onClick={onOpenWorkflow}
          icon={(
            <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="5" width="6" height="6" rx="1" />
              <rect x="14" y="5" width="6" height="6" rx="1" />
              <rect x="9" y="13" width="6" height="6" rx="1" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 11v2m10-2v2m-5-2v2" />
            </svg>
          )}
        />
      </div>

      <SidebarContent
        sidebarMode={sidebarMode}
        sortMode={sortMode}
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
        onSidebarModeChange={onSidebarModeChange}
        onSortModeChange={setSortMode}
        onSetAllProjectsCollapsed={handleSetAllProjectsCollapsed}
        onReorderSession={handleReorderSession}
        onReorderProject={handleReorderProject}
        onToggleProject={(cwd) => {
          setCollapsedProjects((prev) => ({ ...prev, [cwd]: !prev[cwd] }))
        }}
        setEditingSessionId={setEditingSessionId}
        setEditingName={setEditingName}
      />

      <SidebarFooter
        settingsOpen={settingsOpen}
        settingsShortcutLabel={settingsShortcutLabel}
        onOpenSettings={onOpenSettings}
      />
    </aside>
  )
}
