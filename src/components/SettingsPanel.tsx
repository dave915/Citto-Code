import { useState, useEffect, useRef } from 'react'
import {
  useSessionsStore,
  type SidebarMode,
  type ShortcutAction,
  type ShortcutPlatform,
} from '../store/sessions'
import {
  SHORTCUT_ACTION_LABELS,
  getCurrentPlatform,
  shortcutFromKeyboardEvent,
} from '../lib/shortcuts'

type Tab = 'general' | 'mcp' | 'skill' | 'agent' | 'env'

type McpServer = {
  name: string
  command?: string
  args?: string[]
  type?: string
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

type McpForm = {
  name: string
  serverType: 'http' | 'stdio'
  command: string
  args: string
  url: string
  headers: string  // "Key: Value" per line
  env: string      // "KEY=VALUE" per line
}

const EMPTY_MCP_FORM: McpForm = { name: '', serverType: 'http', command: '', args: '', url: '', headers: '', env: '' }

export function SettingsPanel({
  onClose,
  onSidebarModeChange,
}: {
  onClose: () => void
  onSidebarModeChange: (mode: SidebarMode) => void
}) {
  const [tab, setTab] = useState<Tab>('general')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: '일반' },
    { id: 'mcp', label: 'MCP' },
    { id: 'skill', label: 'Skill' },
    { id: 'agent', label: 'Agent' },
    { id: 'env', label: '환경변수' },
  ]

  return (
    <div className="flex h-full flex-col bg-claude-bg">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-claude-border bg-claude-panel px-5 py-3.5">
          <h2 className="text-sm font-semibold text-claude-text">환경설정</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-shrink-0 border-b border-claude-border bg-claude-panel px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-claude-orange text-[#f0c49d]'
                  : 'border-transparent text-claude-muted hover:text-claude-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'general' && <GeneralTab onSidebarModeChange={onSidebarModeChange} />}
          {tab === 'mcp'   && <McpTab />}
          {tab === 'skill' && <SkillTab />}
          {tab === 'agent' && <AgentTab />}
          {tab === 'env'   && <EnvTab />}
        </div>
    </div>
  )
}

function GeneralTab({ onSidebarModeChange }: { onSidebarModeChange: (mode: SidebarMode) => void }) {
  const { sidebarMode, shortcutConfig, setShortcut } = useSessionsStore()
  const currentPlatform = getCurrentPlatform()
  const platformLabel = currentPlatform === 'mac' ? 'macOS' : 'Windows'
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null)

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
        <p className="text-sm font-semibold text-claude-text">사이드바 표시 방식</p>
        <p className="text-xs text-claude-muted mt-1 leading-relaxed">
          세션을 평면 목록으로 보거나, 프로젝트별로 묶어서 볼 수 있습니다.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {([
            {
              value: 'session',
              title: '세션 기준',
              desc: '모든 세션을 생성 순서대로 바로 표시',
            },
            {
              value: 'project',
              title: '프로젝트 기준',
              desc: '같은 폴더의 세션을 프로젝트 아래로 그룹화',
            },
          ] as const).map((option) => {
            const active = sidebarMode === option.value
            return (
              <button
                key={option.value}
                onClick={() => onSidebarModeChange(option.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? 'border-[#5a4637] bg-[#2a221d]'
                    : 'border-claude-border bg-claude-panel hover:border-[#5a4637]'
                }`}
              >
                <div className="text-sm font-medium text-claude-text">{option.title}</div>
                <div className="text-xs text-claude-muted mt-1 leading-relaxed">{option.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-claude-text">단축키</p>
            <p className="text-xs text-claude-muted mt-1 leading-relaxed">
              현재 사용 중인 플랫폼인 <span className="font-medium text-claude-text">{platformLabel}</span> 단축키만 표시합니다.
              입력칸을 선택한 뒤 원하는 키 조합을 직접 누르세요. 권한 모드 변경은 기본값을 Claude Code와 동일한 <span className="font-medium text-claude-text">Shift+Tab</span>으로 맞췄습니다.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-claude-muted">동작</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-claude-muted">{platformLabel}</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(SHORTCUT_ACTION_LABELS) as ShortcutAction[]).map((action) => (
                <tr
                  key={action}
                  className={recordingAction === action ? 'bg-[#2a221d]/80' : ''}
                >
                  <td className="px-3 py-2 text-sm text-claude-text">{SHORTCUT_ACTION_LABELS[action]}</td>
                  <td className="px-3 py-2">
                    <div className="relative">
                      <input
                        value={shortcutConfig[action][currentPlatform]}
                        readOnly
                        onFocus={() => setRecordingAction(action)}
                        onBlur={() => setRecordingAction((current) => (current === action ? null : current))}
                        onKeyDown={(e) => {
                          e.preventDefault()
                          if (e.key === 'Backspace' || e.key === 'Delete') {
                            setShortcut(action, currentPlatform, '')
                            return
                          }
                          const next = shortcutFromKeyboardEvent(e.nativeEvent, currentPlatform)
                          if (next) setShortcut(action, currentPlatform, next)
                        }}
                        className={`w-full rounded-lg border px-3 py-2 pr-20 text-sm font-mono focus:outline-none focus:ring-1 ${
                          recordingAction === action
                            ? 'border-claude-orange bg-[#2a221d] ring-claude-orange/30'
                            : 'border-claude-border bg-claude-panel text-claude-text focus:border-claude-orange focus:ring-claude-orange/20'
                        }`}
                        placeholder={currentPlatform === 'mac' ? 'Cmd+K' : 'Ctrl+K'}
                        spellCheck={false}
                      />
                      <span
                        className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-medium ${
                          recordingAction === action
                            ? 'bg-claude-orange text-white'
                            : 'bg-claude-panel text-claude-muted'
                        }`}
                      >
                        {recordingAction === action ? '입력 중' : '클릭 후 입력'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── MCP Tab ──────────────────────────────────────────────────────────────────

function parseHeadersStr(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 1) continue
    const k = line.slice(0, idx).trim()
    const v = line.slice(idx + 1).trim()
    if (k) result[k] = v
  }
  return result
}

function parseEnvStr(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const idx = line.indexOf('=')
    if (idx < 1) continue
    const k = line.slice(0, idx).trim()
    const v = line.slice(idx + 1).trim()
    if (k) result[k] = v
  }
  return result
}

function parseArgsStr(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .flatMap((line) => line.trim().split(/\s+/))
    .filter(Boolean)
}

function serverToForm(s: McpServer): McpForm {
  const serverType = s.type === 'stdio' ? 'stdio' : 'http'
  const headers = s.headers ? Object.entries(s.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : ''
  const env = s.env ? Object.entries(s.env).map(([k, v]) => `${k}=${v}`).join('\n') : ''
  return {
    name: s.name,
    serverType,
    command: s.command ?? '',
    args: s.args?.join('\n') ?? '',
    url: s.url ?? '',
    headers,
    env,
  }
}

function buildEntry(f: McpForm): Record<string, unknown> {
  const entry: Record<string, unknown> = { type: f.serverType }
  if (f.serverType === 'stdio') {
    entry.command = f.command.trim()
    if (f.args.trim()) entry.args = parseArgsStr(f.args)
    if (f.env.trim()) entry.env = parseEnvStr(f.env)
  } else {
    entry.url = f.url.trim()
    if (f.headers.trim()) entry.headers = parseHeadersStr(f.headers)
  }
  return entry
}

function McpTab() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [rawMcp, setRawMcp] = useState<Record<string, unknown>>({})

  // 추가 폼
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<McpForm>(EMPTY_MCP_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // 편집
  const [editingServer, setEditingServer] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<McpForm>(EMPTY_MCP_FORM)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // 삭제 확인
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const loadServers = () => {
    setLoading(true)
    window.claude.readMcpServers().then((raw) => {
      setRawMcp(raw)
      setServers(Object.entries(raw).map(([name, cfg]) => ({ name, ...(cfg as Omit<McpServer, 'name'>) })))
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadServers() }, [])

  const handleSave = async () => {
    const name = form.name.trim()
    if (!name) { setFormError('이름을 입력하세요.'); return }
    if (form.serverType === 'stdio' && !form.command.trim()) { setFormError('커맨드를 입력하세요.'); return }
    if (form.serverType !== 'stdio' && !form.url.trim()) { setFormError('URL을 입력하세요.'); return }

    setSaving(true)
    setFormError('')
    const updated = { ...rawMcp, [name]: buildEntry(form) }
    const result = await window.claude.writeMcpServers(updated)
    setSaving(false)
    if (!result.ok) { setFormError(result.error ?? '저장 실패'); return }

    setShowAdd(false)
    setForm(EMPTY_MCP_FORM)
    loadServers()
  }

  const handleEditStart = (s: McpServer) => {
    if (editingServer === s.name) { setEditingServer(null); return }
    setShowAdd(false)
    setConfirmDelete(null)
    setEditingServer(s.name)
    setEditForm(serverToForm(s))
    setEditError('')
  }

  const handleEditSave = async () => {
    if (!editingServer) return
    const newName = editForm.name.trim()
    if (!newName) { setEditError('이름을 입력하세요.'); return }
    if (editForm.serverType === 'stdio' && !editForm.command.trim()) { setEditError('커맨드를 입력하세요.'); return }
    if (editForm.serverType !== 'stdio' && !editForm.url.trim()) { setEditError('URL을 입력하세요.'); return }

    setEditSaving(true)
    setEditError('')
    // 이름이 바뀐 경우 기존 항목 삭제 후 새 이름으로 추가
    const { [editingServer]: _, ...rest } = rawMcp
    const updated = { ...rest, [newName]: buildEntry({ ...editForm, name: newName }) }
    const result = await window.claude.writeMcpServers(updated)
    setEditSaving(false)
    if (!result.ok) { setEditError(result.error ?? '저장 실패'); return }

    setEditingServer(null)
    loadServers()
  }

  const handleDelete = async (name: string) => {
    const { [name]: _, ...rest } = rawMcp
    const result = await window.claude.writeMcpServers(rest)
    if (!result.ok) return
    setConfirmDelete(null)
    if (editingServer === name) setEditingServer(null)
    loadServers()
  }

  const inputCls = "w-full rounded-xl border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono text-claude-text focus:outline-none focus:border-claude-orange/60 focus:ring-1 focus:ring-claude-orange/20"

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-claude-muted">~/.claude.json의 mcpServers 목록</p>
        <button
          onClick={() => { setShowAdd(true); setForm(EMPTY_MCP_FORM); setFormError('') }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-claude-orange hover:bg-claude-orange/90 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          추가
        </button>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <div className="border border-claude-orange/40 rounded-xl p-4 bg-orange-50 space-y-3">
          <p className="text-xs font-semibold text-claude-text">새 MCP 서버 추가</p>

          {/* 이름 */}
          <div>
            <label className="text-xs text-claude-muted mb-1 block">서버 이름 *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="my-mcp-server"
              className={inputCls}
              autoFocus
            />
          </div>

          {/* 타입 선택 */}
          <div className="flex gap-4 flex-wrap">
            {([
              { value: 'http', label: 'HTTP', badge: '권장' },
              { value: 'stdio', label: 'stdio', badge: '로컬' },
            ] as const).map(({ value, label, badge }) => (
              <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={form.serverType === value}
                  onChange={() => setForm({ ...form, serverType: value })}
                  className="accent-claude-orange"
                />
                <span className="text-xs font-mono text-claude-text">{label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  value === 'http' ? 'bg-green-100 text-green-700' :
                  'bg-claude-bg text-claude-muted border border-claude-border'
                }`}>{badge}</span>
              </label>
            ))}
          </div>

          {/* HTTP 필드 */}
          {form.serverType === 'http' && (
            <>
              <div>
                <label className="text-xs text-claude-muted mb-1 block">URL *</label>
                <input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://mcp.example.com/mcp"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs text-claude-muted mb-1 block">
                  Headers <span className="text-claude-muted/60">(선택 · Key: Value 형식, 줄 구분)</span>
                </label>
                <textarea
                  value={form.headers}
                  onChange={(e) => setForm({ ...form, headers: e.target.value })}
                  placeholder={'Authorization: Bearer your-token\nX-API-Key: your-key'}
                  rows={2}
                  className={`${inputCls} resize-none leading-relaxed`}
                  spellCheck={false}
                />
              </div>
            </>
          )}

          {/* stdio 필드 */}
          {form.serverType === 'stdio' && (
            <>
              <div>
                <label className="text-xs text-claude-muted mb-1 block">Command *</label>
                <input
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder="npx"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs text-claude-muted mb-1 block">Args <span className="text-claude-muted/60">(여러 줄 또는 공백 구분)</span></label>
                <textarea
                  value={form.args}
                  onChange={(e) => setForm({ ...form, args: e.target.value })}
                  placeholder={'run\n-i\n--rm\nmcp/puppeteer-server'}
                  rows={4}
                  className={`${inputCls} resize-y leading-relaxed`}
                  spellCheck={false}
                />
              </div>
              <div>
                <label className="text-xs text-claude-muted mb-1 block">
                  Env vars <span className="text-claude-muted/60">(선택 · KEY=VALUE 형식, 줄 구분)</span>
                </label>
                <textarea
                  value={form.env}
                  onChange={(e) => setForm({ ...form, env: e.target.value })}
                  placeholder={'API_KEY=your-key\nBASE_URL=https://api.example.com'}
                  rows={2}
                  className={`${inputCls} resize-none leading-relaxed`}
                  spellCheck={false}
                />
              </div>
            </>
          )}

          {formError && <p className="text-xs text-red-500">{formError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 bg-claude-orange hover:bg-claude-orange/90 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 border border-claude-border text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 서버 목록 */}
      {servers.length === 0 && !showAdd ? (
        <EmptyState
          icon="🔌"
          title="MCP 서버 없음"
          desc={<>오른쪽 상단 추가 버튼으로 서버를 등록하세요.</>}
        />
      ) : (
        servers.map((s) => {
          const typeColor = s.type === 'http' ? 'text-green-700 bg-green-50 border-green-200'
            : s.type === 'sse' ? 'text-amber-700 bg-amber-50 border-amber-200'
            : 'text-claude-muted bg-white border-claude-border'
          return (
            <div key={s.name} className="border border-claude-border rounded-xl p-4 bg-claude-bg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-claude-text">{s.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.type && (
                    <span className={`text-xs border rounded-md px-2 py-0.5 font-medium ${typeColor}`}>
                      {s.type}{s.type === 'sse' ? ' (지원 중단)' : ''}
                    </span>
                  )}
                  <button
                    onClick={() => handleEditStart(s)}
                    className="px-2.5 py-1 text-xs border border-claude-border text-claude-muted rounded-lg hover:text-claude-text hover:bg-white transition-colors"
                  >
                    {editingServer === s.name ? '닫기' : '수정'}
                  </button>
                  {confirmDelete === s.name ? (
                    <>
                      <button
                        onClick={() => handleDelete(s.name)}
                        className="px-2.5 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                      >
                        삭제 확인
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2.5 py-1 text-xs border border-claude-border text-claude-muted rounded-lg hover:text-claude-text hover:bg-white transition-colors"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setConfirmDelete(s.name); setShowAdd(false) }}
                      className="px-2.5 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
              {s.command && (
                <div className="font-mono text-xs text-claude-muted bg-white border border-claude-border rounded-lg px-3 py-2 mt-2">
                  {s.command}{s.args?.length ? ' ' + s.args.join(' ') : ''}
                </div>
              )}
              {s.url && (
                <div className="font-mono text-xs text-claude-muted bg-white border border-claude-border rounded-lg px-3 py-2 mt-2 break-all">
                  {s.url}
                </div>
              )}
              {s.headers && Object.keys(s.headers).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.keys(s.headers).map((k) => (
                    <span key={k} className="text-xs bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 font-mono text-blue-700">
                      {k}
                    </span>
                  ))}
                </div>
              )}
              {s.env && Object.keys(s.env).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.keys(s.env).map((k) => (
                    <span key={k} className="text-xs bg-white border border-claude-border rounded px-1.5 py-0.5 font-mono text-claude-muted">
                      {k}
                    </span>
                  ))}
                </div>
              )}
              {editingServer === s.name && (
                <div className="mt-3 border border-claude-orange/40 rounded-xl p-4 bg-orange-50 space-y-3">
                  <p className="text-xs font-semibold text-claude-text">MCP 서버 수정</p>

                  <div>
                    <label className="text-xs text-claude-muted mb-1 block">서버 이름 *</label>
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="my-mcp-server"
                      className={inputCls}
                    />
                  </div>

                  <div className="flex gap-4 flex-wrap">
                    {([
                      { value: 'http', label: 'HTTP', badge: '권장' },
                      { value: 'stdio', label: 'stdio', badge: '로컬' },
                    ] as const).map(({ value, label, badge }) => (
                      <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          checked={editForm.serverType === value}
                          onChange={() => setEditForm({ ...editForm, serverType: value })}
                          className="accent-claude-orange"
                        />
                        <span className="text-xs font-mono text-claude-text">{label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          value === 'http' ? 'bg-green-100 text-green-700' :
                          'bg-claude-bg text-claude-muted border border-claude-border'
                        }`}>{badge}</span>
                      </label>
                    ))}
                  </div>

                  {editForm.serverType === 'http' && (
                    <>
                      <div>
                        <label className="text-xs text-claude-muted mb-1 block">URL *</label>
                        <input
                          value={editForm.url}
                          onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                          placeholder="https://mcp.example.com/mcp"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-claude-muted mb-1 block">
                          Headers <span className="text-claude-muted/60">(선택 · Key: Value 형식, 줄 구분)</span>
                        </label>
                        <textarea
                          value={editForm.headers}
                          onChange={(e) => setEditForm({ ...editForm, headers: e.target.value })}
                          placeholder={'Authorization: Bearer your-token\nX-API-Key: your-key'}
                          rows={2}
                          className={`${inputCls} resize-none leading-relaxed`}
                          spellCheck={false}
                        />
                      </div>
                    </>
                  )}

                  {editForm.serverType === 'stdio' && (
                    <>
                      <div>
                        <label className="text-xs text-claude-muted mb-1 block">Command *</label>
                        <input
                          value={editForm.command}
                          onChange={(e) => setEditForm({ ...editForm, command: e.target.value })}
                          placeholder="npx"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-claude-muted mb-1 block">Args <span className="text-claude-muted/60">(여러 줄 또는 공백 구분)</span></label>
                        <textarea
                          value={editForm.args}
                          onChange={(e) => setEditForm({ ...editForm, args: e.target.value })}
                          placeholder={'run\n-i\n--rm\nmcp/puppeteer-server'}
                          rows={4}
                          className={`${inputCls} resize-y leading-relaxed`}
                          spellCheck={false}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-claude-muted mb-1 block">
                          Env vars <span className="text-claude-muted/60">(선택 · KEY=VALUE 형식, 줄 구분)</span>
                        </label>
                        <textarea
                          value={editForm.env}
                          onChange={(e) => setEditForm({ ...editForm, env: e.target.value })}
                          placeholder={'API_KEY=your-key\nBASE_URL=https://api.example.com'}
                          rows={2}
                          className={`${inputCls} resize-none leading-relaxed`}
                          spellCheck={false}
                        />
                      </div>
                    </>
                  )}

                  {editError && <p className="text-xs text-red-500">{editError}</p>}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleEditSave}
                      disabled={editSaving}
                      className="px-3 py-1.5 bg-claude-orange hover:bg-claude-orange/90 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      {editSaving ? '저장 중...' : '변경 저장'}
                    </button>
                    <button
                      onClick={() => setEditingServer(null)}
                      className="px-3 py-1.5 border border-claude-border text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Skill Tab ─────────────────────────────────────────────────────────────────

type Skill = { name: string; path: string; dir: string; legacy: boolean }

function SkillTab() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // 삭제 확인
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // 확장/파일 목록
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [skillFiles, setSkillFiles] = useState<Record<string, { name: string; path: string }[]>>({})
  const [addFileFor, setAddFileFor] = useState<{ name: string; dir: string } | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [fileFormError, setFileFormError] = useState('')
  const [creatingFile, setCreatingFile] = useState(false)
  const fileNameRef = useRef<HTMLInputElement>(null)

  // 인라인 편집기
  const [editingFile, setEditingFile] = useState<{ name: string; path: string } | null>(null)
  const [editContent, setEditContent] = useState('')
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const loadSkills = () => {
    setLoading(true)
    window.claude.listSkills().then(setSkills).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadSkills() }, [])
  useEffect(() => { if (showAdd) setTimeout(() => nameRef.current?.focus(), 50) }, [showAdd])
  useEffect(() => { if (addFileFor) setTimeout(() => fileNameRef.current?.focus(), 50) }, [addFileFor])

  const loadSkillFiles = (skill: Skill) => {
    window.claude.listDirAbs(skill.dir).then((files) => {
      setSkillFiles((prev) => ({ ...prev, [skill.name]: files }))
    }).catch(() => {})
  }

  const handleDelete = async (skill: Skill) => {
    const result = await window.claude.deletePath({ targetPath: skill.dir, recursive: true })
    if (!result.ok) return
    setConfirmDelete(null)
    if (expandedSkill === skill.name) setExpandedSkill(null)
    if (editingFile) setEditingFile(null)
    loadSkills()
  }

  const handleExpand = (skill: Skill) => {
    if (expandedSkill === skill.name) {
      setExpandedSkill(null)
      setAddFileFor(null)
      setEditingFile(null)
    } else {
      setExpandedSkill(skill.name)
      setAddFileFor(null)
      setEditingFile(null)
      loadSkillFiles(skill)
    }
  }

  const handleEditFile = async (file: { name: string; path: string }) => {
    setEditingFile({ name: file.name, path: file.path })
    setAddFileFor(null)
    setSaveError('')
    setLoadingEdit(true)
    const result = await window.claude.readFile(file.path)
    setLoadingEdit(false)
    setEditContent(result?.content ?? '')
  }

  const handleSaveFile = async () => {
    if (!editingFile) return
    setSaving(true)
    setSaveError('')
    const result = await window.claude.writeFileAbs({ filePath: editingFile.path, content: editContent })
    setSaving(false)
    if (!result.ok) { setSaveError(result.error ?? '저장 실패'); return }
    setEditingFile(null)
  }

  const handleCreate = async () => {
    const raw = newName.trim()
    if (!raw) { setFormError('이름을 입력하세요.'); return }
    const skillName = raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64)
    const content = `---\nname: ${skillName}\ndescription: 이 Skill에 대한 설명과 사용 시기를 입력하세요.\n---\n\n# ${skillName}\n\nSkill 지침을 여기에 작성하세요.\n`
    setCreating(true)
    setFormError('')
    const result = await window.claude.writeClaudeFile({ subdir: `skills/${skillName}`, name: 'SKILL.md', content })
    setCreating(false)
    if (!result.ok) { setFormError(result.error ?? '생성 실패'); return }
    setShowAdd(false)
    setNewName('')
    loadSkills()
    if (result.path) window.claude.openFile(result.path)
  }

  const handleCreateFile = async () => {
    if (!addFileFor) return
    const fileName = newFileName.trim()
    if (!fileName) { setFileFormError('파일 이름을 입력하세요.'); return }
    const filePath = `${addFileFor.dir}/${fileName}`
    const baseName = fileName.split('/').pop() ?? fileName
    const content = fileName.endsWith('.md') ? `# ${baseName.replace(/\.md$/, '')}\n\n내용을 입력하세요.\n` : ''
    setCreatingFile(true)
    setFileFormError('')
    const result = await window.claude.writeFileAbs({ filePath, content })
    setCreatingFile(false)
    if (!result.ok) { setFileFormError(result.error ?? '생성 실패'); return }
    setAddFileFor(null)
    setNewFileName('')
    const skillForReload = skills.find((s) => s.name === addFileFor.name)
    if (skillForReload) loadSkillFiles(skillForReload)
    if (result.path) {
      // 생성 직후 편집기로 열기
      handleEditFile({ name: fileName, path: result.path })
    }
  }

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="p-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
        <p className="text-xs font-semibold text-blue-700 mb-1">Skill이란?</p>
        <p className="text-xs text-blue-600 leading-relaxed">
          <code className="bg-blue-100 px-1 rounded">~/.claude/skills/&lt;name&gt;/SKILL.md</code> 에 정의하는 슬래시 명령어입니다.
          하위 파일(template.md, examples/ 등)을 추가해 더 풍부한 Skill을 만들 수 있습니다.
        </p>
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-claude-muted">~/.claude/skills/ 에 등록된 Skill</p>
        <button
          onClick={() => { setShowAdd(true); setNewName(''); setFormError('') }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-claude-orange hover:bg-claude-orange/90 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          추가
        </button>
      </div>

      {/* 새 Skill 추가 폼 */}
      {showAdd && (
        <div className="border border-blue-300/60 rounded-xl p-3 bg-blue-50 mb-3 space-y-2">
          <p className="text-xs font-semibold text-blue-700">새 Skill 추가</p>
          <p className="text-xs text-blue-500">~/.claude/skills/&lt;name&gt;/SKILL.md 로 생성됩니다</p>
          <input
            ref={nameRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="skill-name (소문자, 숫자, 하이픈)"
            className="w-full text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          />
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
              {creating ? '생성 중...' : '생성'}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 border border-claude-border text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors">
              취소
            </button>
          </div>
        </div>
      )}

      {/* Skill 목록 */}
      {skills.length === 0 ? (
        <EmptyState icon="⚡" title="정의된 Skill 없음" desc={<>추가 버튼으로 커스텀 명령어를 만들 수 있습니다.</>} />
      ) : (
        <div className="space-y-2">
          {skills.map((s) => {
            const isExpanded = expandedSkill === s.name
            const files = skillFiles[s.name] ?? []
            return (
              <div key={s.path} className={`border rounded-xl overflow-hidden bg-claude-bg transition-colors ${isExpanded ? 'border-blue-300' : 'border-claude-border'}`}>
                {/* 메인 행 */}
                <div className="flex items-center gap-3 p-3">
                  <span className="text-base flex-shrink-0">⚡</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-claude-text truncate">/{s.name}</p>
                      {s.legacy && <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 flex-shrink-0">legacy</span>}
                    </div>
                    <p className="text-xs text-claude-muted truncate font-mono">
                      {s.legacy ? `commands/${s.name}` : `skills/${s.name}/SKILL.md`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {confirmDelete === s.name ? (
                      <>
                        <span className="text-xs text-red-500 mr-1">삭제?</span>
                        <button onClick={() => handleDelete(s)}
                          className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">확인</button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 text-xs border border-claude-border text-claude-muted rounded-lg hover:text-claude-text transition-colors">취소</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setConfirmDelete(s.name)}
                          className="p-1.5 rounded text-claude-muted hover:text-red-500 hover:bg-white transition-colors" title="삭제">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <button onClick={() => window.claude.openFile(s.path)}
                          className="p-1.5 rounded text-claude-muted hover:text-claude-text hover:bg-white transition-colors" title="외부 에디터로 열기">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                        <button onClick={() => handleExpand(s)}
                          className="p-1.5 rounded text-claude-muted hover:text-claude-text hover:bg-white transition-colors" title="파일 목록">
                          <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 확장 영역 */}
                {isExpanded && (
                  <div className="border-t border-claude-border bg-white">
                    {/* 파일 목록 */}
                    <div className="px-4 py-2">
                      {files.length === 0 ? (
                        <p className="text-xs text-claude-muted py-1">파일 없음</p>
                      ) : (
                        <div className="space-y-0.5">
                          {files.map((f) => {
                            const isEditing = editingFile?.path === f.path
                            return (
                              <div key={f.path}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg group transition-colors ${isEditing ? 'bg-blue-50' : 'hover:bg-claude-bg'}`}>
                                <svg className="w-3 h-3 text-claude-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className={`text-xs font-mono flex-1 truncate ${isEditing ? 'text-blue-600 font-semibold' : 'text-claude-text'}`}>{f.name}</span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                  {/* 앱에서 편집 */}
                                  <button onClick={() => handleEditFile(f)}
                                    className="p-1 rounded hover:bg-white text-claude-muted hover:text-blue-600 transition-colors" title="앱에서 편집">
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  {/* 외부 에디터로 열기 */}
                                  <button onClick={() => window.claude.openFile(f.path)}
                                    className="p-1 rounded hover:bg-white text-claude-muted hover:text-claude-text transition-colors" title="외부 에디터로 열기">
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* 인라인 편집기 */}
                    {editingFile && (
                      <div className="border-t border-blue-200 bg-blue-50/40 px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono font-semibold text-blue-700">{editingFile.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-claude-muted">⌘S 저장</span>
                            <button onClick={() => setEditingFile(null)}
                              className="p-0.5 rounded text-claude-muted hover:text-claude-text transition-colors">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {loadingEdit ? (
                          <div className="flex items-center justify-center h-24 text-claude-muted">
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                            </svg>
                          </div>
                        ) : (
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSaveFile() }
                            }}
                            className="w-full h-56 text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-white resize-y focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 leading-relaxed"
                            spellCheck={false}
                          />
                        )}
                        {saveError && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
                        <div className="flex gap-2 mt-2">
                          <button onClick={handleSaveFile} disabled={saving || loadingEdit}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                            {saving ? '저장 중...' : '저장'}
                          </button>
                          <button onClick={() => setEditingFile(null)}
                            className="px-3 py-1.5 border border-claude-border text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors">
                            취소
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 파일 추가 */}
                    {!editingFile && (
                      <div className="px-4 pb-3 border-t border-claude-border/40">
                        {addFileFor?.name === s.name ? (
                          <div className="pt-2 space-y-2">
                            <p className="text-xs font-medium text-claude-text">파일 추가</p>
                            <input
                              ref={fileNameRef}
                              value={newFileName}
                              onChange={(e) => setNewFileName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                              placeholder="template.md 또는 examples/sample.md"
                              className="w-full text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-claude-bg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                            />
                            {fileFormError && <p className="text-xs text-red-500">{fileFormError}</p>}
                            <div className="flex gap-2">
                              <button onClick={handleCreateFile} disabled={creatingFile}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                                {creatingFile ? '생성 중...' : '생성'}
                              </button>
                              <button onClick={() => setAddFileFor(null)}
                                className="px-3 py-1.5 border border-claude-border text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors">
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAddFileFor({ name: s.name, dir: s.dir }); setNewFileName(''); setFileFormError('') }}
                            className="mt-2 flex items-center gap-1 text-xs text-claude-muted hover:text-blue-600 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            파일 추가
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Agent Tab ─────────────────────────────────────────────────────────────────

function AgentTab() {
  const [files, setFiles] = useState<{ name: string; path: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // 인라인 편집기
  const [editingFile, setEditingFile] = useState<{ name: string; path: string } | null>(null)
  const [editContent, setEditContent] = useState('')
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // 삭제 확인
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const loadFiles = () => {
    window.claude.listClaudeDir('agents').then(setFiles).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadFiles() }, [])
  useEffect(() => { if (showAdd) setTimeout(() => nameRef.current?.focus(), 50) }, [showAdd])

  const handleEditFile = async (f: { name: string; path: string }) => {
    if (editingFile?.path === f.path) { setEditingFile(null); return }
    setShowAdd(false)
    setEditingFile({ name: f.name, path: f.path })
    setSaveError('')
    setLoadingEdit(true)
    const result = await window.claude.readFile(f.path)
    setLoadingEdit(false)
    setEditContent(result?.content ?? '')
  }

  const handleSaveFile = async () => {
    if (!editingFile) return
    setSaving(true)
    setSaveError('')
    const result = await window.claude.writeFileAbs({ filePath: editingFile.path, content: editContent })
    setSaving(false)
    if (!result.ok) { setSaveError(result.error ?? '저장 실패'); return }
    setEditingFile(null)
  }

  const handleDelete = async (f: { name: string; path: string }) => {
    const result = await window.claude.deletePath({ targetPath: f.path })
    if (!result.ok) return
    setConfirmDelete(null)
    if (editingFile?.path === f.path) setEditingFile(null)
    loadFiles()
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) { setFormError('이름을 입력하세요.'); return }
    const fileName = name.endsWith('.md') ? name : `${name}.md`
    const agentName = fileName.replace(/\.md$/, '')
    const content = `---\nname: ${agentName}\ndescription: 이 에이전트에 대한 설명을 입력하세요.\n---\n\n# ${agentName}\n\n이 에이전트의 역할과 지침을 여기에 작성하세요.\n\n## 역할\n\n특화된 역할 설명...\n\n## 지침\n\n- 지침 1\n- 지침 2\n`

    setCreating(true)
    setFormError('')
    const result = await window.claude.writeClaudeFile({ subdir: 'agents', name: fileName, content })
    setCreating(false)
    if (!result.ok) { setFormError(result.error ?? '생성 실패'); return }

    setShowAdd(false)
    setNewName('')
    await loadFiles()
    if (result.path) handleEditFile({ name: fileName, path: result.path })
  }

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="p-4">
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
        <p className="text-xs font-semibold text-purple-700 mb-1">Agent란?</p>
        <p className="text-xs text-purple-600 leading-relaxed">
          ~/.claude/agents/ 폴더에 .md 파일로 정의하는 서브 에이전트입니다.
          특정 역할과 도구 제한을 가진 전문화된 에이전트를 만들 수 있습니다.
        </p>
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-claude-muted">~/.claude/agents/ 에 등록된 Agent</p>
        <button
          onClick={() => { setShowAdd(true); setNewName(''); setFormError(''); setEditingFile(null) }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-claude-orange hover:bg-claude-orange/90 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          추가
        </button>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <div className="border border-purple-300/60 rounded-xl p-3 bg-purple-50 mb-3 space-y-2">
          <p className="text-xs font-semibold text-purple-700">새 Agent 추가</p>
          <input
            ref={nameRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="agent-name (.md 자동 추가)"
            className="w-full text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-white focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200"
          />
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {creating ? '생성 중...' : '생성'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 border border-claude-border text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <EmptyState
          icon="🤖"
          title="정의된 Agent 없음"
          desc={<>추가 버튼으로 커스텀 에이전트를 정의할 수 있습니다.</>}
        />
      ) : (
        <div className="space-y-2">
          {files.map((f) => {
            const isEditing = editingFile?.path === f.path
            return (
              <div key={f.path} className={`border rounded-xl overflow-hidden bg-claude-bg transition-colors ${isEditing ? 'border-purple-300' : 'border-claude-border'}`}>
                {/* 메인 행 */}
                <div className="flex items-center gap-3 p-3 group">
                  <span className="text-base flex-shrink-0">🤖</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-claude-text truncate">{f.name.replace(/\.md$/, '')}</p>
                    <p className="text-xs text-claude-muted truncate font-mono">{f.name}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {confirmDelete === f.path ? (
                      <>
                        <span className="text-xs text-red-500 mr-1">삭제?</span>
                        <button onClick={() => handleDelete(f)}
                          className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">확인</button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 text-xs border border-claude-border text-claude-muted rounded-lg hover:text-claude-text transition-colors">취소</button>
                      </>
                    ) : (
                      <>
                        {/* 삭제 */}
                        <button
                          onClick={() => setConfirmDelete(f.path)}
                          className="p-1.5 rounded text-claude-muted hover:text-red-500 hover:bg-white transition-colors"
                          title="삭제"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        {/* 앱에서 편집 */}
                        <button
                          onClick={() => handleEditFile(f)}
                          className={`p-1.5 rounded transition-colors ${isEditing ? 'text-purple-600 bg-purple-50' : 'text-claude-muted hover:text-purple-600 hover:bg-white'}`}
                          title="앱에서 편집"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {/* 외부 에디터로 열기 */}
                        <button
                          onClick={() => window.claude.openFile(f.path)}
                          className="p-1.5 rounded text-claude-muted hover:text-claude-text hover:bg-white transition-colors"
                          title="외부 에디터로 열기"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 인라인 편집기 */}
                {isEditing && (
                  <div className="border-t border-purple-200 bg-purple-50/40 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-semibold text-purple-700">{f.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-claude-muted">⌘S 저장</span>
                        <button onClick={() => setEditingFile(null)}
                          className="p-0.5 rounded text-claude-muted hover:text-claude-text transition-colors">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {loadingEdit ? (
                      <div className="flex items-center justify-center h-24 text-claude-muted">
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                        </svg>
                      </div>
                    ) : (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSaveFile() }
                        }}
                        className="w-full h-56 text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-white resize-y focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200 leading-relaxed"
                        spellCheck={false}
                      />
                    )}
                    {saveError && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
                    <div className="flex gap-2 mt-2">
                      <button onClick={handleSaveFile} disabled={saving || loadingEdit}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                        {saving ? '저장 중...' : '저장'}
                      </button>
                      <button onClick={() => setEditingFile(null)}
                        className="px-3 py-1.5 border border-claude-border text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors">
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Env Tab ───────────────────────────────────────────────────────────────────

function EnvTab() {
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
        setError('최상위는 JSON 객체여야 합니다.')
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON 파싱 실패')
    }
  }

  const entries = Object.entries(envVars)

  return (
    <div className="p-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <p className="text-xs font-semibold text-amber-700 mb-1">환경변수</p>
        <p className="text-xs text-amber-600 leading-relaxed">
          Claude Code 실행 시 함께 전달되는 환경변수입니다. 기본은 키/값 목록으로 보이고, 수정 시 JSON 객체로 편집합니다.
        </p>
      </div>

      <div className="border border-claude-border rounded-xl bg-claude-bg p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-claude-text">{editing ? 'JSON 입력' : '환경변수 목록'}</p>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-claude-orange hover:bg-claude-orange/90 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    setJsonText(JSON.stringify(envVars, null, 2))
                    setError('')
                    setEditing(false)
                  }}
                  className="px-3 py-1.5 border border-claude-border text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors"
                >
                  취소
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setJsonText(JSON.stringify(envVars, null, 2))
                  setError('')
                  setEditing(true)
                }}
                className="px-3 py-1.5 border border-claude-border bg-white text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors"
              >
                수정
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={'{\n  "ANTHROPIC_API_KEY": "your-key",\n  "ANTHROPIC_BASE_URL": "https://api.example.com"\n}'}
              className="w-full h-72 text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-white resize-y focus:outline-none focus:border-claude-orange/60 focus:ring-1 focus:ring-claude-orange/20 leading-relaxed"
              spellCheck={false}
            />
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </>
        ) : entries.length === 0 ? (
          <div className="text-center py-10 text-claude-muted">
            <p className="text-xs">설정된 환경변수가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border border-claude-border bg-white px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-xs font-mono font-semibold text-claude-text">{key}</span>
                <span className="text-xs text-claude-muted">=</span>
                <span className="min-w-0 flex-1 truncate text-xs font-mono text-claude-muted">{value || <em className="opacity-50">빈 값</em>}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 공통 컴포넌트 ─────────────────────────────────────────────────────────────

function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-16 text-claude-muted">
      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
      </svg>
    </div>
  )
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <span className="text-3xl mb-3">{icon}</span>
      <p className="text-sm font-medium text-claude-text mb-1">{title}</p>
      <p className="text-xs text-claude-muted leading-relaxed">{desc}</p>
    </div>
  )
}
