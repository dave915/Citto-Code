import type { SidebarMode } from '../../store/sessions'
import { useI18n } from '../../hooks/useI18n'
import { SecretaryCharacter } from '../secretary/SecretaryCharacter'

export function EmptyMainState({
  sidebarMode,
  onNewSession,
}: {
  sidebarMode: SidebarMode
  onNewSession: () => void
}) {
  const { t } = useI18n()
  const isProjectMode = sidebarMode === 'project'
  const title = isProjectMode ? t('emptyMain.noProjects') : t('emptyMain.noSessions')
  const actionLabel = isProjectMode ? t('emptyMain.openNewProject') : t('emptyMain.newSession')
  const description = isProjectMode
    ? t('emptyMain.noProjectsDescription')
    : t('emptyMain.noSessionsDescription')

  return (
    <div className="flex h-full items-center justify-center bg-claude-bg px-8">
      <div className="max-w-sm text-center">
        <div className="mb-5 flex justify-center">
          <SecretaryCharacter state="idle" size={72} />
        </div>
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
