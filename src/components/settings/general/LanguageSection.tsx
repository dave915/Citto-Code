import type { AppLanguage } from '../../../lib/i18n'
import { useI18n } from '../../../hooks/useI18n'

type Props = {
  appLanguage: AppLanguage
  onChange: (language: AppLanguage) => void
}

const options: AppLanguage[] = ['ko', 'en']
const optionLabelKeys = {
  ko: 'settings.general.language.option.ko.label',
  en: 'settings.general.language.option.en.label',
} as const
const optionDescriptionKeys = {
  ko: 'settings.general.language.option.ko.description',
  en: 'settings.general.language.option.en.description',
} as const

export function LanguageSection({ appLanguage, onChange }: Props) {
  const { t } = useI18n()

  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">{t('settings.general.language.title')}</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        {t('settings.general.language.description')}
      </p>

      <div className="mt-4 grid gap-2">
        {options.map((option) => {
          const active = appLanguage === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active
                  ? 'border-[#6a6d75] bg-claude-panel'
                  : 'border-claude-border bg-claude-panel hover:bg-claude-bg'
              }`}
            >
              <div className="text-sm font-medium text-claude-text">
                {t(optionLabelKeys[option])}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-claude-muted">
                {t(optionDescriptionKeys[option])}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
