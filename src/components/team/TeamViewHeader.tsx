import { useI18n } from '../../hooks/useI18n'
import type { AgentTeam } from '../../store/teamTypes'
import { StatusBadge } from './TeamViewParts'

type Props = {
  embedded?: boolean
  onClose: () => void
  onOpenGuide: () => void
  onOpenSetup: () => void
  onSelectTeam: (teamId: string) => void
  projectTeams: AgentTeam[]
  resolvedActiveTeamId: string | null
}

export function TeamViewHeader({
  embedded,
  onClose,
  onOpenGuide,
  onOpenSetup,
  onSelectTeam,
  projectTeams,
  resolvedActiveTeamId,
}: Props) {
  const { t } = useI18n()

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-claude-border px-4 py-3">
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1.5 rounded-lg p-1.5 text-claude-text-muted hover:bg-claude-bg-hover hover:text-claude-text"
        title={embedded ? t('team.backToChat') : t('settings.close')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {embedded && (
          <span className="text-xs font-medium">{t('team.backToChat')}</span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {projectTeams.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => onSelectTeam(team.id)}
            className={`
              flex min-w-0 max-w-[220px] items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors
              ${team.id === resolvedActiveTeamId
                ? 'bg-claude-bg-hover font-medium text-claude-text'
                : 'text-claude-text-muted hover:text-claude-text'
              }
            `}
          >
            <span className="min-w-0 flex-1 truncate text-left">{team.name}</span>
            <StatusBadge status={team.status} />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onOpenGuide}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-claude-border bg-claude-panel px-3 py-1.5 text-xs font-medium text-claude-text shadow-sm transition-colors hover:bg-claude-bg-hover"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v5m0-8h.01" />
        </svg>
        {t('team.guide')}
      </button>

      <button
        type="button"
        onClick={onOpenSetup}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/30"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {t('team.new')}
      </button>
    </div>
  )
}
