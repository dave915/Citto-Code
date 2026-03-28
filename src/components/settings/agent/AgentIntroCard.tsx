import { useI18n } from '../../../hooks/useI18n'

export function AgentIntroCard() {
  const { t } = useI18n()

  return (
    <div className="mb-4 rounded-xl border border-claude-border bg-claude-surface p-4">
      <p className="mb-1 text-xs font-semibold text-claude-text">{t('settings.agent.introTitle')}</p>
      <p className="text-xs leading-relaxed text-claude-muted">
        {t('settings.agent.introDescription')}
      </p>
    </div>
  )
}
