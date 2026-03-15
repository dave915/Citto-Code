import type { RefObject } from 'react'
import type { Session } from '../../store/sessions'
import { getDirName, getSessionDisplayName, type SessionLockState } from './sidebarUtils'

type Props = {
  session: Session
  lockState?: SessionLockState
  activeSessionId: string | null
  editingSessionId: string | null
  editingName: string
  inputRef: RefObject<HTMLInputElement>
  showProjectLabel: boolean
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
  compact = false,
  dense = false,
  onSelectSession,
  onRenameSession,
  onToggleFavorite,
  onRemoveSession,
  setEditingSessionId,
  setEditingName,
}: Props) {
  const isActive = session.id === activeSessionId
  const isEditing = editingSessionId === session.id
  const itemCls = isActive
    ? 'bg-claude-sidebar-active text-claude-text'
    : 'text-claude-muted hover:bg-claude-sidebar-hover hover:text-claude-text'
  const rowSpacingCls = compact
    ? 'gap-0.5 px-1 py-0.5 rounded-lg'
    : dense
      ? 'gap-1.5 px-2 py-1.5 rounded-xl'
      : 'gap-2 px-2.5 py-2.5 rounded-2xl'
  const buttonGapCls = compact ? 'gap-1.5 rounded-lg' : dense ? 'gap-1.5 rounded-xl' : 'gap-2 rounded-xl'
  const rowAlignCls = compact ? 'items-center' : 'items-start'
  const buttonAlignCls = compact ? 'items-center' : 'items-start'
  const indicatorCls = compact
    ? 'flex-shrink-0 w-2 h-2 rounded-full bg-claude-orange animate-pulse'
    : 'mt-1 flex-shrink-0 w-2 h-2 rounded-full bg-claude-orange animate-pulse'
  const iconCls = compact
    ? 'w-4 h-4 flex-shrink-0 opacity-60'
    : 'w-4 h-4 mt-0.5 flex-shrink-0 opacity-60'

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
    <div className={`group flex transition-colors ${rowAlignCls} ${rowSpacingCls} ${itemCls}`}>
      <button
        onClick={() => onSelectSession(session.id)}
        onDoubleClick={startRename}
        className={`min-w-0 flex-1 flex text-left outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 ${buttonAlignCls} ${buttonGapCls}`}
      >
        {session.isStreaming ? (
          <span className={indicatorCls} />
        ) : (
          <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}

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
              className="w-full rounded-xl border border-claude-border bg-claude-surface px-2.5 py-1.5 text-sm font-medium text-claude-text outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10"
            />
          ) : (
            <p className={`truncate text-[15px] font-medium ${compact ? 'leading-5' : ''}`}>{getSessionDisplayName(session)}</p>
          )}
          {showProjectLabel && session.cwd && session.cwd !== '~' && (
            <p className="mt-0.5 truncate pr-1 font-mono text-[11px] opacity-50">
              {getDirName(session.cwd)}
            </p>
          )}
        </div>
      </button>

      {!isEditing && (
        <div className="flex flex-shrink-0 items-center gap-0.5 self-center">
          {lockState?.hasConflict ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-red-200/80"
              title={lockState.conflictingPaths.length > 0
                ? `같은 파일을 다른 세션에서도 수정 중: ${lockState.conflictingPaths.join(', ')}`
                : '같은 파일을 다른 세션에서도 수정 중'}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </span>
          ) : lockState?.isLocked ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-claude-muted/70"
              title="파일 수정 작업 진행 중"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 1 1 8 0v3" />
              </svg>
            </span>
          ) : null}
          <button
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite(session.id)
            }}
            className={`rounded-lg p-1.5 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 hover:bg-white/10 ${session.favorite ? 'text-claude-text hover:text-claude-text' : 'text-claude-muted/60 hover:text-claude-text'}`}
            title={session.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={session.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m12 3.5 2.626 5.322 5.874.854-4.25 4.142 1.003 5.852L12 16.908 6.747 19.67l1.003-5.852L3.5 9.676l5.874-.854L12 3.5z" />
            </svg>
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation()
              onRemoveSession(session.id)
            }}
            className="rounded-lg p-1.5 text-claude-muted/60 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 hover:bg-white/10 hover:text-claude-text"
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
