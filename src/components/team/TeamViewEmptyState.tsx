import type { AgentIconType } from './AgentPixelIcon'
import { AgentPixelIcon } from './AgentPixelIcon'
import { useI18n } from '../../hooks/useI18n'

export function TeamViewEmptyState({ onCreateTeam }: { onCreateTeam: () => void }) {
  const { t } = useI18n()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-claude-bg">
      <div className="flex items-end gap-2">
        {(['architect', 'critic', 'developer'] as AgentIconType[]).map((type, index) => (
          <div
            key={type}
            className="animate-bounce"
            style={{ animationDelay: `${index * 150}ms`, animationDuration: '2s' }}
          >
            <AgentPixelIcon
              type={type}
              size={index === 1 ? 64 : 48}
              color={index === 0 ? '#F97316' : index === 1 ? '#EF4444' : '#10B981'}
            />
          </div>
        ))}
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold text-claude-text">{t('team.empty.title')}</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-claude-text-muted">
          {t('team.empty.descriptionTop')}
          <br />
          {t('team.empty.descriptionBottom')}
        </p>
      </div>

      <button
        type="button"
        onClick={onCreateTeam}
        className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-blue-700"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {t('team.empty.createFirst')}
      </button>
    </div>
  )
}
