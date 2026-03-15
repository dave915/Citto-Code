import type { NotificationMode } from '../../../store/sessions'
import { useI18n } from '../../../hooks/useI18n'

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
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">{t('settings.general.notifications.title')}</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        {t('settings.general.notifications.description')}
      </p>

      <div className="mt-4 grid gap-2">
        {options.map((option) => {
          const active = notificationMode === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active
                  ? 'border-[#6a6d75] bg-claude-panel'
                  : 'border-claude-border bg-claude-panel hover:bg-claude-bg'
              }`}
            >
              <div className="text-sm font-medium text-claude-text">{option.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-claude-muted">{option.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
