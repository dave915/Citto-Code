import { useState } from 'react'
import { useI18n } from '../../../hooks/useI18n'
import { DEFAULT_PROJECT_PATH } from '../../../store/sessions'
import { AppButton, appFieldClassName } from '../../ui/appDesignSystem'
import { SettingsSection } from '../shared'

type Props = {
  defaultProjectPath: string
  onChange: (path: string) => void
}

export function DefaultProjectSection({ defaultProjectPath, onChange }: Props) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)

  const handleSelectDefaultProject = async () => {
    setLoading(true)
    try {
      const folder = await window.claude.selectFolder({
        defaultPath: defaultProjectPath,
        title: t('settings.general.defaultProject.dialogTitle'),
      })
      if (folder) onChange(folder)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SettingsSection
      title={t('settings.general.defaultProject.title')}
      description={t('settings.general.defaultProject.description')}
    >
      <div className="space-y-3">
        <label className="block text-xs font-medium text-claude-muted">{t('settings.general.defaultProject.currentPath')}</label>
        <input
          value={defaultProjectPath}
          readOnly
          className={appFieldClassName}
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <AppButton
            onClick={() => void handleSelectDefaultProject()}
            disabled={loading}
          >
            {loading ? t('settings.general.defaultProject.opening') : t('settings.general.defaultProject.select')}
          </AppButton>
          <AppButton
            onClick={() => onChange(DEFAULT_PROJECT_PATH)}
            tone="ghost"
          >
            {t('settings.general.defaultProject.reset')}
          </AppButton>
        </div>
      </div>
    </SettingsSection>
  )
}
