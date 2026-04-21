import type { AppLanguage } from '../../../lib/i18n'
import { useI18n } from '../../../hooks/useI18n'
import { cx } from '../../ui/appDesignSystem'
import { SettingsSection } from '../shared'

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
    <SettingsSection
      title={t('settings.general.language.title')}
      description={t('settings.general.language.description')}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = appLanguage === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={cx(
                'rounded-md border px-3 py-2.5 text-left transition-colors',
                active
                  ? 'border-claude-orange/30 bg-claude-bg text-claude-text'
                  : 'border-transparent bg-claude-panel/40 text-claude-text hover:bg-claude-bg',
              )}
            >
              <div className="text-[13px] font-medium text-claude-text">
                {t(optionLabelKeys[option])}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-claude-muted">
                {t(optionDescriptionKeys[option])}
              </div>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}
