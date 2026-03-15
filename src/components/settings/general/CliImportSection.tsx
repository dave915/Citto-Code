import { useEffect, useState } from 'react'
import type { CliHistoryEntry } from '../../../../electron/preload'
import { useI18n } from '../../../hooks/useI18n'
import type { ImportedSessionData } from '../../../store/sessions'

type Props = {
  onImportSession: (data: ImportedSessionData) => unknown
}

export function CliImportSection({ onImportSession }: Props) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [cliSessions, setCliSessions] = useState<CliHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [importingPath, setImportingPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const timer = window.setTimeout(() => {
      window.claude.listCliSessions(query)
        .then((sessions) => {
          if (!cancelled) {
            setCliSessions(sessions)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCliSessions([])
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false)
          }
        })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  const handleImportCliSession = async (filePath: string) => {
    setImportingPath(filePath)
    try {
      const session = await window.claude.loadCliSession({ filePath })
      if (!session) return
      onImportSession(session)
    } finally {
      setImportingPath(null)
    }
  }

  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">{t('settings.general.cliImport.title')}</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        {t('settings.general.cliImport.description')}
      </p>

      <div className="mt-4 rounded-xl border border-claude-border bg-claude-panel p-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('settings.general.cliImport.placeholder')}
          className="w-full rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-sm text-claude-text outline-none placeholder:text-claude-muted"
          spellCheck={false}
        />

        <div className="mt-3 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="px-2 py-6 text-center text-sm text-claude-muted">{t('settings.general.cliImport.loading')}</div>
          ) : cliSessions.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-claude-muted">{t('settings.general.cliImport.empty')}</div>
          ) : (
            <div className="space-y-2">
              {cliSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-2xl border border-claude-border bg-claude-surface px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-claude-text">{session.title}</div>
                      <div className="mt-1 truncate font-mono text-[11px] text-claude-muted">{session.cwd || t('settings.general.cliImport.noPath')}</div>
                      <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-claude-muted">
                        {session.preview || t('settings.general.cliImport.noPreview')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleImportCliSession(session.filePath)}
                      disabled={importingPath === session.filePath}
                      className="rounded-xl border border-claude-border bg-claude-panel px-3 py-2 text-xs font-medium text-claude-text transition-colors hover:bg-claude-bg disabled:cursor-wait disabled:opacity-60"
                    >
                      {importingPath === session.filePath ? t('settings.general.cliImport.importing') : t('settings.general.cliImport.import')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
