import type { RefObject } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { Session } from '../../store/sessions'
import {
  getSessionDisplayName,
  getSessionProjectLabel,
  isDefaultSessionName,
  type SessionLockState,
} from './sidebarUtils'

type Props = {
  session: Session
  lockState?: SessionLockState
  activeSessionId: string | null
  editingSessionId: string | null
  editingName: string
  inputRef: RefObject<HTMLInputElement>
  showProjectLabel: boolean
  timestampLabel?: string | null
  compact?: boolean
  dense?: boolean
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  onToggleFavorite: (id: string) => void
  onRemoveSession: (id: string) => void
  setEditingSessionId: (id: string | null) => void
  setEditingName: (name: string) => void
}

export function SessionRow({
  session,
  lockState,
  activeSessionId,
  editingSessionId,
  editingName,
  inputRef,
  showProjectLabel,
  timestampLabel = null,
  compact = false,
  dense = false,
  onSelectSession,
  onRenameSession,
  onToggleFavorite,
  onRemoveSession,
  setEditingSessionId,
  setEditingName,
}: Props) {
  const { language, t } = useI18n()
  const displayName = getSessionDisplayName(session, language)
  const projectLabel = getSessionProjectLabel(session)
  const shouldShowProjectLabel = Boolean(showProjectLabel && projectLabel && projectLabel !== displayName)
  const showStreamingIndicator = session.isStreaming
  const isActive = session.id === activeSessionId
  const isEditing = editingSessionId === session.id
  const itemCls = isActive
    ? 'border-claude-border/80 bg-claude-sidebar-active text-claude-text'
    : 'border-transparent text-claude-muted hover:bg-claude-sidebar-hover hover:text-claude-text'
  const rowSpacingCls = compact
    ? 'gap-1.5 rounded-md px-1.5 py-1'
    : dense
      ? 'min-h-[30px] gap-1.5 rounded-md px-2 py-1'
      : 'min-h-[32px] gap-2 rounded-md px-2 py-1'
  const buttonGapCls = compact ? 'gap-1.5 rounded-md' : dense ? 'gap-1.5 rounded-md' : 'gap-2 rounded-md'
  const rowAlignCls = compact || !shouldShowProjectLabel ? 'items-center' : 'items-start'
  const buttonAlignCls = compact || !shouldShowProjectLabel ? 'items-center' : 'items-start'
  const indicatorCls = compact
    ? 'h-2 w-2 flex-shrink-0 rounded-full bg-claude-orange animate-pulse'
    : shouldShowProjectLabel
      ? 'mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-claude-orange animate-pulse'
      : 'h-2 w-2 flex-shrink-0 rounded-full bg-claude-orange animate-pulse'

  const startRename = () => {
    setEditingSessionId(session.id)
    setEditingName(displayName)
  }

  const cancelRename = () => {
    setEditingSessionId(null)
    setEditingName('')
  }

  const commitRename = () => {
    const nextName = editingName.trim()
    const matchesLocalizedDefault = isDefaultSessionName(session.name) && nextName === displayName
    if (nextName && nextName !== session.name && !matchesLocalizedDefault) {
      onRenameSession(session.id, nextName)
    }
    cancelRename()
  }

  return (
    <div className={`group/session relative flex border transition-colors ${rowAlignCls} ${rowSpacingCls} ${itemCls}`}>
      <button
        onClick={() => onSelectSession(session.id)}
        onDoubleClick={startRename}
        className={`flex min-w-0 flex-1 pr-1 text-left outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/35 ${buttonAlignCls} ${buttonGapCls}`}
      >
        {showStreamingIndicator ? (
          <span className={indicatorCls} />
        ) : null}

        <div className={`min-w-0 flex-1 ${compact ? 'flex items-center' : ''}`}>
          {isEditing ? (
            <input
              ref={inputRef}
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitRename()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelRename()
                }
              }}
              className="w-full rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[13px] font-medium text-claude-text outline-none focus:border-claude-border focus:ring-1 focus:ring-claude-orange/20"
            />
          ) : (
            <p className={`truncate text-[12px] font-medium ${compact ? 'leading-5' : 'leading-4'}`}>{displayName}</p>
          )}
          {shouldShowProjectLabel && projectLabel && (
            <p className={`truncate pr-1 font-mono text-[10px] opacity-45 ${compact ? '' : 'mt-0.5'}`}>
              {projectLabel}
            </p>
          )}
        </div>
      </button>

      {!isEditing && (
        <div className="ml-2 flex flex-shrink-0 items-center gap-1 self-center">
          {lockState?.hasConflict ? (
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-red-200/80"
              title={lockState.conflictingPaths.length > 0
                ? t('sidebar.conflictEditing', { paths: lockState.conflictingPaths.join(', ') })
                : t('sidebar.conflictEditingShort')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </span>
          ) : lockState?.isLocked ? (
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-claude-muted/70"
              title={t('sidebar.locked')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 1 1 8 0v3" />
              </svg>
            </span>
          ) : null}
          {timestampLabel && (
            <span className="min-w-[1.75rem] pr-0.5 text-right text-[11px] font-medium tabular-nums text-claude-muted/50 transition-opacity group-hover/session:opacity-0 group-focus-within/session:opacity-0">
              {timestampLabel}
            </span>
          )}
          <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/session:pointer-events-auto group-hover/session:opacity-100 group-focus-within/session:pointer-events-auto group-focus-within/session:opacity-100">
            <button
              onClick={(event) => {
                event.stopPropagation()
                onToggleFavorite(session.id)
              }}
              className={`rounded-md p-1.5 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/35 hover:bg-claude-surface ${session.favorite ? 'text-claude-text hover:text-claude-text' : 'text-claude-muted/60 hover:text-claude-text'}`}
              title={session.favorite ? t('sidebar.removeFavorite') : t('sidebar.addFavorite')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={session.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="m12 3.5 2.626 5.322 5.874.854-4.25 4.142 1.003 5.852L12 16.908 6.747 19.67l1.003-5.852L3.5 9.676l5.874-.854L12 3.5z" />
              </svg>
            </button>

            <button
              onClick={(event) => {
                event.stopPropagation()
                onRemoveSession(session.id)
              }}
              className="rounded-md p-1.5 text-claude-muted/60 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/35 hover:bg-claude-surface hover:text-claude-text"
              title={t('sidebar.deleteSession')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4h8v2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 10v6M14 10v6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
