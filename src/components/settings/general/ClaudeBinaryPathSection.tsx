import { useEffect, useState } from 'react'
import { useI18n } from '../../../hooks/useI18n'
import { AppChip, appFieldClassName } from '../../ui/appDesignSystem'
import { SettingsSection } from '../shared'

type PathStatus = { ok: true; version: string | null } | { ok: false } | null

type Props = {
  claudeBinaryPath: string
  onChange: (path: string) => void
}

export function ClaudeBinaryPathSection({ claudeBinaryPath, onChange }: Props) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(claudeBinaryPath)
  const [pathStatus, setPathStatus] = useState<PathStatus>(null)

  useEffect(() => {
    setDraft(claudeBinaryPath)
  }, [claudeBinaryPath])

  useEffect(() => {
    let cancelled = false

    if (!draft.trim()) {
      setPathStatus(null)
    }

    const timer = window.setTimeout(async () => {
      if (!cancelled && draft !== claudeBinaryPath) {
        onChange(draft)
      }

      if (!draft.trim()) return

      const result = await window.claude.checkInstallation(draft).catch(() => ({
        installed: false,
        version: null,
      }))
      if (cancelled) return
      setPathStatus(result.installed ? { ok: true, version: result.version } : { ok: false })
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [claudeBinaryPath, draft, onChange])

  return (
    <SettingsSection
      title={t('settings.general.claudePath.title')}
      description={(
        <>
        {t('settings.general.claudePath.description').split('`which claude`')[0]}
        <code className="rounded bg-claude-border px-1 py-0.5 font-mono">which claude</code>
        {t('settings.general.claudePath.description').split('`which claude`')[1]}
        </>
      )}
    >
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="~/.local/bin/claude"
        className={appFieldClassName}
        spellCheck={false}
      />
      {pathStatus !== null ? (
        <div className="mt-3">
          {pathStatus.ok ? (
            <AppChip tone="success">{pathStatus.version ?? t('settings.general.claudePath.verified')}</AppChip>
          ) : (
            <AppChip tone="danger">{t('settings.general.claudePath.notFound')}</AppChip>
          )}
        </div>
      ) : null}
    </SettingsSection>
  )
}
