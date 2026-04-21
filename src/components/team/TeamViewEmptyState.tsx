import type { AgentIconType } from './AgentPixelIcon'
import { AgentPixelIcon } from './AgentPixelIcon'
import { useI18n } from '../../hooks/useI18n'
import { TeamButton } from './teamDesignSystem'

export function TeamViewEmptyState({ onCreateTeam }: { onCreateTeam: () => void }) {
  const { t } = useI18n()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-claude-bg px-5">
      <div className="flex items-end gap-2">
        {(['architect', 'critic', 'developer'] as AgentIconType[]).map((type, index) => (
          <div
            key={type}
            className="animate-bounce"
            style={{ animationDelay: `${index * 150}ms`, animationDuration: '2s' }}
          >
            <AgentPixelIcon
              type={type}
              size={index === 1 ? 56 : 42}
              color={index === 0 ? '#F97316' : index === 1 ? '#EF4444' : '#10B981'}
            />
          </div>
        ))}
      </div>

      <div className="text-center">
        <h2 className="text-[18px] font-semibold text-claude-text">{t('team.empty.title')}</h2>
        <p className="mt-2 max-w-sm text-[13px] leading-6 text-claude-muted">
          {t('team.empty.descriptionTop')}
          <br />
          {t('team.empty.descriptionBottom')}
        </p>
      </div>

      <TeamButton onClick={onCreateTeam} tone="accent" className="px-4">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {t('team.empty.createFirst')}
      </TeamButton>
    </div>
  )
}
