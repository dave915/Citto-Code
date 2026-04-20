import type { NotificationMode } from '../../../store/sessions'
import { useI18n } from '../../../hooks/useI18n'
import { cx } from '../../ui/appDesignSystem'
import { SettingsSection } from '../shared'

type Props = {
  notificationMode: NotificationMode
  onChange: (mode: NotificationMode) => void
}

export function NotificationSection({ notificationMode, onChange }: Props) {
  const { t } = useI18n()
  const options: Array<{ value: NotificationMode; title: string; desc: string }> = [
    {
      value: 'background',
      title: t('settings.general.notifications.background.title'),
      desc: t('settings.general.notifications.background.description'),
    },
    {
      value: 'all',
      title: t('settings.general.notifications.all.title'),
      desc: t('settings.general.notifications.all.description'),
    },
    {
      value: 'off',
      title: t('settings.general.notifications.off.title'),
      desc: t('settings.general.notifications.off.description'),
    },
  ]

  return (
    <SettingsSection
      title={t('settings.general.notifications.title')}
      description={t('settings.general.notifications.description')}
    >
      <div className="grid gap-2">
        {options.map((option) => {
          const active = notificationMode === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cx(
                'rounded-lg border px-3 py-3 text-left transition-colors',
                active
                  ? 'border-claude-orange/30 bg-claude-bg'
                  : 'border-claude-border bg-claude-panel/65 hover:bg-claude-bg',
              )}
            >
              <div className="text-sm font-medium text-claude-text">{option.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-claude-muted">{option.desc}</div>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}
