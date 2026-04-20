import { useEffect, useState } from 'react'
import type { CliHistoryEntry } from '../../../../electron/preload'
import { useI18n } from '../../../hooks/useI18n'
import type { ImportedSessionData } from '../../../store/sessions'
import { AppButton, appFieldClassName } from '../../ui/appDesignSystem'
import { SettingsSection } from '../shared'

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
    <SettingsSection
      title={t('settings.general.cliImport.title')}
      description={t('settings.general.cliImport.description')}
    >
      <div className="space-y-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('settings.general.cliImport.placeholder')}
          className={appFieldClassName}
          spellCheck={false}
        />

        <div className="max-h-72 overflow-y-auto rounded-lg border border-claude-border bg-claude-bg/70">
          {loading ? (
            <div className="px-2 py-6 text-center text-sm text-claude-muted">{t('settings.general.cliImport.loading')}</div>
          ) : cliSessions.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-claude-muted">{t('settings.general.cliImport.empty')}</div>
          ) : (
            <div className="divide-y divide-claude-border/60">
              {cliSessions.map((session) => (
                <div
                  key={session.id}
                  className="px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-claude-text">{session.title}</div>
                      <div className="mt-1 truncate font-mono text-[11px] text-claude-muted">{session.cwd || t('settings.general.cliImport.noPath')}</div>
                      <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-claude-muted">
                        {session.preview || t('settings.general.cliImport.noPreview')}
                      </div>
                    </div>
                    <AppButton
                      onClick={() => void handleImportCliSession(session.filePath)}
                      disabled={importingPath === session.filePath}
                    >
                      {importingPath === session.filePath ? t('settings.general.cliImport.importing') : t('settings.general.cliImport.import')}
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}
