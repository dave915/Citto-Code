import { useI18n } from '../../../hooks/useI18n'

type Props = {
  secretaryEnabled: boolean
  onToggle: (value: boolean) => void
}

export function SecretarySection({ secretaryEnabled, onToggle }: Props) {
  const { t } = useI18n()

  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-claude-text">{t('settings.general.secretary.title')}</p>
          <p className="mt-1 text-xs leading-relaxed text-claude-muted">
            {t('settings.general.secretary.description')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!secretaryEnabled)}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors ${
            secretaryEnabled
              ? 'border-[#6a6d75] bg-claude-panel'
              : 'border-claude-border bg-claude-panel/70'
          }`}
          aria-pressed={secretaryEnabled}
          title={secretaryEnabled ? t('settings.general.secretary.disable') : t('settings.general.secretary.enable')}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-claude-text transition-transform ${
              secretaryEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
