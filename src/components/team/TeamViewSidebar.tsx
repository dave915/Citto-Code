import { useI18n } from '../../hooks/useI18n'
import type { AgentTeam } from '../../store/teamTypes'
import { TeamButton, cx } from './teamDesignSystem'
import { StatusBadge } from './TeamViewParts'

type Props = {
  activeTeamId: string | null
  embedded?: boolean
  onClose: () => void
  onOpenGuide: () => void
  onOpenSetup: () => void
  onSelectTeam: (teamId: string) => void
  teams: AgentTeam[]
}

export function TeamViewSidebar({
  activeTeamId,
  embedded,
  onClose,
  onOpenGuide,
  onOpenSetup,
  onSelectTeam,
  teams,
}: Props) {
  const { t } = useI18n()

  return (
    <aside className="flex h-full w-[188px] shrink-0 select-none flex-col border-r border-claude-border bg-claude-sidebar">
      <div className="draggable-region h-[42px] shrink-0 border-b border-claude-border bg-claude-panel" />

      <div className="flex flex-col gap-1 px-2 py-2">
        <button
          type="button"
          onClick={onClose}
          className="flex h-[30px] w-full items-center gap-2 rounded-md border border-transparent px-2 text-[13px] font-medium text-claude-text transition-colors hover:border-claude-border/60 hover:bg-claude-sidebar-hover"
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="min-w-0 truncate text-left">
            {embedded ? t('team.backToChat') : t('settings.close')}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSetup}
          className="flex h-[30px] w-full items-center gap-2 rounded-md border border-transparent px-2 text-[13px] font-medium text-claude-text transition-colors hover:border-claude-border/60 hover:bg-claude-sidebar-hover"
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span className="min-w-0 truncate text-left">{t('team.new')}</span>
        </button>

        <button
          type="button"
          onClick={onOpenGuide}
          className="flex h-[30px] w-full items-center gap-2 rounded-md border border-transparent px-2 text-[13px] font-medium text-claude-text transition-colors hover:border-claude-border/60 hover:bg-claude-sidebar-hover"
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <circle cx="12" cy="12" r="8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v5m0-8h.01" />
          </svg>
          <span className="min-w-0 truncate text-left">{t('team.guide')}</span>
        </button>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pb-1">
          <p className="text-[11px] font-semibold text-claude-muted/72">{t('team.empty.title')}</p>
          <span className="rounded border border-claude-border bg-claude-panel px-1.5 py-0.5 text-[10px] leading-none text-claude-muted/70">
            {teams.length}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
          {teams.length === 0 ? (
            <p className="px-2 py-2 text-[12px] leading-5 text-claude-muted/72">
              {t('team.sidebar.empty')}
            </p>
          ) : (
            teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => onSelectTeam(team.id)}
                className={cx(
                  'flex min-h-[58px] w-full flex-col items-stretch gap-1 rounded-md border px-2 py-2 text-left transition-colors',
                  team.id === activeTeamId
                    ? 'border-claude-border/80 bg-claude-sidebar-active text-claude-text'
                    : 'border-claude-border/45 bg-transparent text-claude-muted hover:bg-claude-sidebar-hover hover:text-claude-text',
                )}
              >
                <span className="truncate text-[12px] font-medium leading-4">{team.name}</span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-claude-muted/70">
                    {t('team.sidebar.agentCount', { count: team.agents.length })}
                  </span>
                  <StatusBadge status={team.status} />
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
