import { useEffect, useState } from 'react'
import { useI18n } from '../../../hooks/useI18n'

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
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">{t('settings.general.claudePath.title')}</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        {t('settings.general.claudePath.description').split('`which claude`')[0]}
        <code className="rounded bg-claude-border px-1 py-0.5 font-mono">which claude</code>
        {t('settings.general.claudePath.description').split('`which claude`')[1]}
      </p>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="~/.local/bin/claude"
        className="mt-3 w-full rounded-xl border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text outline-none focus:border-claude-accent"
        spellCheck={false}
      />
      {pathStatus !== null && (
        pathStatus.ok
          ? <p className="mt-1.5 text-xs text-green-400">✓ {pathStatus.version ?? t('settings.general.claudePath.verified')}</p>
          : <p className="mt-1.5 text-xs text-red-400">{t('settings.general.claudePath.notFound')}</p>
      )}
    </div>
  )
}
