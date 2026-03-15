import { useState } from 'react'
import { useI18n } from '../../../hooks/useI18n'
import { DEFAULT_PROJECT_PATH } from '../../../store/sessions'

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
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">{t('settings.general.defaultProject.title')}</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        {t('settings.general.defaultProject.description')}
      </p>

      <div className="mt-4 rounded-xl border border-claude-border bg-claude-panel p-3">
        <label className="mb-2 block text-xs font-medium text-claude-muted">{t('settings.general.defaultProject.currentPath')}</label>
        <input
          value={defaultProjectPath}
          readOnly
          className="w-full rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-sm text-claude-text outline-none"
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSelectDefaultProject()}
            disabled={loading}
            className="rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-sm text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? t('settings.general.defaultProject.opening') : t('settings.general.defaultProject.select')}
          </button>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_PROJECT_PATH)}
            className="rounded-xl border border-claude-border bg-claude-panel px-3 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-bg hover:text-claude-text"
          >
            {t('settings.general.defaultProject.reset')}
          </button>
        </div>
      </div>
    </div>
  )
}
