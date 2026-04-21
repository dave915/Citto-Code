import { useI18n } from '../../hooks/useI18n'
import type { AgentTeam } from '../../store/teamTypes'
import { TeamButton } from './teamDesignSystem'
import { StatusBadge } from './TeamViewParts'

type Props = {
  activeTeam: AgentTeam | null
  onOpenGuide: () => void
  onOpenSetup: () => void
}

export function TeamViewHeader({
  activeTeam,
  onOpenGuide,
  onOpenSetup,
}: Props) {
  const { t } = useI18n()

  return (
    <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-claude-border bg-claude-bg px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="min-w-0 truncate text-[13px] font-semibold text-claude-text">
          {activeTeam?.name ?? t('team.empty.title')}
        </p>
        {activeTeam && <StatusBadge status={activeTeam.status} />}
        {activeTeam && (
          <span className="truncate text-[11px] text-claude-muted/70">
            {t('team.sidebar.agentCount', { count: activeTeam.agents.length })}
          </span>
        )}
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
