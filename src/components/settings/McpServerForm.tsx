import { type McpForm } from './shared'

const INPUT_CLASS_NAME = 'w-full rounded-xl border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono text-claude-text focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10'

export function McpServerForm({
  title,
  form,
  error,
  saving,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
  autoFocusName = false,
}: {
  title: string
  form: McpForm
  error: string
  saving: boolean
  submitLabel: string
  onChange: (next: McpForm) => void
  onSubmit: () => void
  onCancel: () => void
  autoFocusName?: boolean
}) {
  const updateField = <K extends keyof McpForm>(key: K, value: McpForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  return (
    <div className="space-y-3 rounded-xl border border-claude-border bg-claude-surface p-4">
      <p className="text-xs font-semibold text-claude-text">{title}</p>

      <div>
        <label className="mb-1 block text-xs text-claude-muted">서버 이름 *</label>
        <input
          value={form.name}
          onChange={(event) => updateField('name', event.target.value)}
          placeholder="my-mcp-server"
          className={INPUT_CLASS_NAME}
          autoFocus={autoFocusName}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        {([
          { value: 'http', label: 'HTTP', badge: '권장' },
          { value: 'stdio', label: 'stdio', badge: '로컬' },
        ] as const).map(({ value, label, badge }) => (
          <label key={value} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              checked={form.serverType === value}
              onChange={() => updateField('serverType', value)}
              className="accent-claude-muted"
            />
            <span className="text-xs font-mono text-claude-text">{label}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              value === 'http'
                ? 'border border-claude-border bg-claude-panel text-claude-text'
                : 'border border-claude-border bg-claude-bg text-claude-muted'
            }`}>{badge}</span>
          </label>
        ))}
      </div>

      {form.serverType === 'http' && (
        <>
          <div>
            <label className="mb-1 block text-xs text-claude-muted">URL *</label>
            <input
              value={form.url}
              onChange={(event) => updateField('url', event.target.value)}
              placeholder="https://mcp.example.com/mcp"
              className={INPUT_CLASS_NAME}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-claude-muted">
              Headers <span className="text-claude-muted/60">(선택 · Key: Value 형식, 줄 구분)</span>
            </label>
            <textarea
              value={form.headers}
              onChange={(event) => updateField('headers', event.target.value)}
              placeholder={'Authorization: Bearer your-token\nX-API-Key: your-key'}
              rows={2}
              className={`${INPUT_CLASS_NAME} resize-none leading-relaxed`}
              spellCheck={false}
            />
          </div>
        </>
      )}

      {form.serverType === 'stdio' && (
        <>
          <div>
            <label className="mb-1 block text-xs text-claude-muted">Command *</label>
            <input
              value={form.command}
              onChange={(event) => updateField('command', event.target.value)}
              placeholder="npx"
              className={INPUT_CLASS_NAME}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-claude-muted">Args <span className="text-claude-muted/60">(여러 줄 또는 공백 구분)</span></label>
            <textarea
              value={form.args}
              onChange={(event) => updateField('args', event.target.value)}
              placeholder={'run\n-i\n--rm\nmcp/puppeteer-server'}
              rows={4}
              className={`${INPUT_CLASS_NAME} resize-y leading-relaxed`}
              spellCheck={false}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-claude-muted">
              Env vars <span className="text-claude-muted/60">(선택 · KEY=VALUE 형식, 줄 구분)</span>
            </label>
            <textarea
              value={form.env}
              onChange={(event) => updateField('env', event.target.value)}
              placeholder={'API_KEY=your-key\nBASE_URL=https://api.example.com'}
              rows={2}
              className={`${INPUT_CLASS_NAME} resize-none leading-relaxed`}
              spellCheck={false}
            />
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onSubmit}
          disabled={saving}
          className="rounded-lg bg-claude-surface-2 px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-[#44444a] disabled:opacity-50"
        >
          {saving ? '저장 중...' : submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
        >
          취소
        </button>
      </div>
    </div>
  )
}
