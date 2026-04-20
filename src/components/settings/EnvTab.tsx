import { useEffect, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { useSessionsStore } from '../../store/sessions'
import { AppButton, AppPanel, appFieldClassName } from '../ui/appDesignSystem'

export function EnvTab() {
  const { t } = useI18n()
  const { envVars, removeEnvVar, setEnvVar } = useSessionsStore()
  const [jsonText, setJsonText] = useState(() => JSON.stringify(envVars, null, 2))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setJsonText(JSON.stringify(envVars, null, 2))
  }, [envVars])

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonText) as unknown
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        setError(t('settings.env.invalidTopLevel'))
        return
      }

      const next = parsed as Record<string, unknown>
      for (const key of Object.keys(envVars)) {
        if (!(key in next)) removeEnvVar(key)
      }
      for (const [key, value] of Object.entries(next)) {
        setEnvVar(key, value == null ? '' : String(value))
      }
      setError('')
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.env.parseFailed'))
    }
  }

  const entries = Object.entries(envVars)

  return (
    <div className="p-4">
      <AppPanel className="mb-4 bg-claude-panel/70 p-4 shadow-none">
        <p className="text-sm font-medium text-claude-text">{t('settings.env.title')}</p>
        <p className="mt-2 text-xs leading-relaxed text-claude-muted">{t('settings.env.description')}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-claude-muted">{t('settings.env.ollamaHint')}</p>
      </AppPanel>

      <AppPanel className="bg-claude-bg p-4 shadow-none">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-claude-text">{editing ? t('settings.env.jsonEditor') : t('settings.env.listTitle')}</p>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <AppButton onClick={handleSave} tone="accent">
                  {t('common.save')}
                </AppButton>
                <AppButton
                  onClick={() => {
                    setJsonText(JSON.stringify(envVars, null, 2))
                    setError('')
                    setEditing(false)
                  }}
                  tone="ghost"
                >
                  {t('common.cancel')}
                </AppButton>
              </>
            ) : (
              <AppButton
                onClick={() => {
                  setJsonText(JSON.stringify(envVars, null, 2))
                  setError('')
                  setEditing(true)
                }}
                tone="secondary"
              >
                {t('settings.env.edit')}
              </AppButton>
            )}
          </div>
        </div>

        {editing ? (
          <>
            <textarea
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              placeholder={'{\n  "ANTHROPIC_API_KEY": "your-key",\n  "ANTHROPIC_BASE_URL": "https://api.example.com",\n  "ANTHROPIC_AUTH_TOKEN": "ollama"\n}'}
              className={`${appFieldClassName} h-72 resize-y bg-claude-panel text-xs font-mono leading-relaxed`}
              spellCheck={false}
            />
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-claude-muted">
            <p className="text-xs">{t('settings.env.noVariables')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border border-claude-border bg-claude-panel/90 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-xs font-mono font-semibold text-claude-text">{key}</span>
                <span className="text-xs text-claude-muted">=</span>
                <span className="min-w-0 flex-1 truncate text-xs font-mono text-claude-muted">{value || <em className="opacity-50">{t('common.emptyValue')}</em>}</span>
              </div>
            ))}
          </div>
        )}
      </AppPanel>
    </div>
  )
}
