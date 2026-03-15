import { useEffect, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { useSessionsStore } from '../../store/sessions'

export function EnvTab() {
  const { language } = useI18n()
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
        setError(language === 'en' ? 'The top level must be a JSON object.' : '최상위는 JSON 객체여야 합니다.')
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
      setError(cause instanceof Error ? cause.message : (language === 'en' ? 'Failed to parse JSON' : 'JSON 파싱 실패'))
    }
  }

  const entries = Object.entries(envVars)

  return (
    <div className="p-4">
      <div className="mb-4 rounded-xl border border-claude-border bg-claude-surface p-4">
        <p className="mb-1 text-xs font-semibold text-claude-text">{language === 'en' ? 'Environment variables' : '환경변수'}</p>
        <p className="text-xs leading-relaxed text-claude-muted">
          {language === 'en'
            ? 'These environment variables are passed when Claude Code runs. By default they are shown as a key/value list, and you edit them as a JSON object.'
            : 'Claude Code 실행 시 함께 전달되는 환경변수입니다. 기본은 키/값 목록으로 보이고, 수정 시 JSON 객체로 편집합니다.'}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-claude-muted">
          {language === 'en'
            ? 'Ollama is now connected automatically when you choose a local model. Only set `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` when you need manual connection.'
            : 'Ollama는 이제 로컬 모델 선택 시 자동 연결됩니다. 수동 연결이 필요할 때만 `ANTHROPIC_BASE_URL`과 `ANTHROPIC_AUTH_TOKEN`을 지정하세요.'}
        </p>
      </div>

      <div className="rounded-xl border border-claude-border bg-claude-bg p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-claude-text">{editing ? (language === 'en' ? 'JSON editor' : 'JSON 입력') : (language === 'en' ? 'Environment variables' : '환경변수 목록')}</p>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  className="rounded-lg bg-claude-surface-2 px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-[#44444a]"
                >
                  {language === 'en' ? 'Save' : '저장'}
                </button>
                <button
                  onClick={() => {
                    setJsonText(JSON.stringify(envVars, null, 2))
                    setError('')
                    setEditing(false)
                  }}
                  className="rounded-lg border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
                >
                  {language === 'en' ? 'Cancel' : '취소'}
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setJsonText(JSON.stringify(envVars, null, 2))
                  setError('')
                  setEditing(true)
                }}
                className="rounded-lg border border-claude-border bg-claude-panel px-3 py-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
              >
                {language === 'en' ? 'Edit' : '수정'}
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <>
            <textarea
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              placeholder={'{\n  "ANTHROPIC_API_KEY": "your-key",\n  "ANTHROPIC_BASE_URL": "https://api.example.com",\n  "ANTHROPIC_AUTH_TOKEN": "ollama"\n}'}
              className="h-72 w-full resize-y rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono leading-relaxed focus:border-claude-border focus:outline-none focus:ring-1 focus:ring-white/10"
              spellCheck={false}
            />
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-claude-muted">
            <p className="text-xs">{language === 'en' ? 'No environment variables are configured.' : '설정된 환경변수가 없습니다.'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border border-claude-border bg-claude-panel px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-xs font-mono font-semibold text-claude-text">{key}</span>
                <span className="text-xs text-claude-muted">=</span>
                <span className="min-w-0 flex-1 truncate text-xs font-mono text-claude-muted">{value || <em className="opacity-50">{language === 'en' ? 'Empty value' : '빈 값'}</em>}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
