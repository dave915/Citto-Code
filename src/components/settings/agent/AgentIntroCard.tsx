import { useI18n } from '../../../hooks/useI18n'

export function AgentIntroCard() {
  const { t } = useI18n()

  return (
    <div className="mb-4 rounded-md border border-claude-border bg-claude-panel/45 px-4 py-3">
      <p className="mb-1 text-xs font-semibold text-claude-text">{t('settings.agent.introTitle')}</p>
      <p className="text-xs leading-relaxed text-claude-muted">
        {t('settings.agent.introDescription')}
      </p>
    </div>
  )
}
