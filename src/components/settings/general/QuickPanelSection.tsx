import { useI18n } from '../../../hooks/useI18n'

type Props = {
  quickPanelEnabled: boolean
  onToggle: (value: boolean) => void
}

export function QuickPanelSection({ quickPanelEnabled, onToggle }: Props) {
  const { t } = useI18n()

  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-claude-text">{t('settings.general.quickPanel.title')}</p>
          <p className="mt-1 text-xs leading-relaxed text-claude-muted">
            {t('settings.general.quickPanel.description')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!quickPanelEnabled)}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors ${
            quickPanelEnabled
              ? 'border-[#6a6d75] bg-claude-panel'
              : 'border-claude-border bg-claude-panel/70'
          }`}
          aria-pressed={quickPanelEnabled}
          title={quickPanelEnabled ? t('settings.general.quickPanel.disable') : t('settings.general.quickPanel.enable')}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-claude-text transition-transform ${
              quickPanelEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
