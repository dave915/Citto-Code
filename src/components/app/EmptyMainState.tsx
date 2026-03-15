import type { SidebarMode } from '../../store/sessions'

export function EmptyMainState({
  sidebarMode,
  onNewSession,
}: {
  sidebarMode: SidebarMode
  onNewSession: () => void
}) {
  const isProjectMode = sidebarMode === 'project'
  const title = isProjectMode ? '열린 프로젝트가 없습니다' : '열린 세션이 없습니다'
  const actionLabel = isProjectMode ? '새 프로젝트 열기' : '새 세션'
  const description = isProjectMode
    ? '새 프로젝트 열기를 누르면 프로젝트 폴더를 고를 수 있습니다. 선택하지 않으면 설정한 기본 프로젝트 폴더로 바로 시작합니다.'
    : '새 세션을 누르면 프로젝트 폴더를 고를 수 있습니다. 선택하지 않으면 설정한 기본 프로젝트 폴더로 바로 시작합니다.'

  return (
    <div className="flex h-full items-center justify-center bg-claude-bg px-8">
      <div className="max-w-sm text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-claude-text">{title}</h2>
        <p className="mt-2 text-[15px] leading-7 text-claude-muted">
          {description}
        </p>
        <button
          onClick={onNewSession}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-claude-border bg-claude-surface px-4 py-3 text-sm font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
