import { useI18n } from '../../../hooks/useI18n'
import { AppSwitch } from '../../ui/appDesignSystem'
import { SettingsSection } from '../shared'

type Props = {
  quickPanelEnabled: boolean
  onToggle: (value: boolean) => void
}

export function QuickPanelSection({ quickPanelEnabled, onToggle }: Props) {
  const { t } = useI18n()

  return (
    <SettingsSection
      title={t('settings.general.quickPanel.title')}
      description={t('settings.general.quickPanel.description')}
      action={(
        <AppSwitch
          checked={quickPanelEnabled}
          onClick={() => onToggle(!quickPanelEnabled)}
          title={quickPanelEnabled ? t('settings.general.quickPanel.disable') : t('settings.general.quickPanel.enable')}
        />
      )}
    />
  )
}
