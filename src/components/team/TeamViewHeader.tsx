import { useI18n } from '../../hooks/useI18n'
import type { AgentTeam } from '../../store/teamTypes'
import { TeamButton, cx } from './teamDesignSystem'
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
    <div className="flex shrink-0 items-center gap-2 border-b border-claude-border bg-claude-bg px-4 py-2.5">
      <TeamButton
        onClick={onClose}
        size={embedded ? 'sm' : 'icon'}
        tone="ghost"
        className={embedded ? 'pr-2.5' : undefined}
        title={embedded ? t('team.backToChat') : t('settings.close')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {embedded && (
          <span className="text-xs font-medium">{t('team.backToChat')}</span>
        )}
      </TeamButton>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {projectTeams.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => onSelectTeam(team.id)}
            className={cx(
              'flex min-w-0 max-w-[220px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
              team.id === resolvedActiveTeamId
                ? 'border-claude-border bg-claude-surface text-claude-text'
                : 'border-transparent text-claude-muted hover:border-claude-border/70 hover:bg-claude-panel hover:text-claude-text',
            )}
          >
            <span className="min-w-0 flex-1 truncate text-left">{team.name}</span>
            <StatusBadge status={team.status} />
          </button>
        ))}
      </div>

      <TeamButton onClick={onOpenGuide} tone="secondary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v5m0-8h.01" />
        </svg>
        {t('team.guide')}
      </TeamButton>

      <TeamButton onClick={onOpenSetup} tone="accent">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {t('team.new')}
      </TeamButton>
    </div>
  )
}
