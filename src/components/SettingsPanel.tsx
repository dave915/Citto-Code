import { useState, useEffect, useRef } from 'react'
import type { CliHistoryEntry } from '../../electron/preload'
import {
  DEFAULT_PROJECT_PATH,
  type NotificationMode,
  useSessionsStore,
  type SidebarMode,
  type ShortcutAction,
  type ShortcutPlatform,
} from '../store/sessions'
import { THEME_PRESETS, applyTheme, type ThemeId } from '../lib/theme'
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
        <div className="flex flex-shrink-0 gap-1 border-b border-claude-border bg-claude-panel px-2 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-claude-surface-2 text-claude-text'
                  : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
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
  const {
    sidebarMode,
    defaultProjectPath,
    themeId,
    notificationMode,
    quickPanelEnabled,
    shortcutConfig,
    claudeBinaryPath,
    setDefaultProjectPath,
    setThemeId,
    setNotificationMode,
    setQuickPanelEnabled,
    setShortcut,
    setClaudeBinaryPath,
    importSession,
  } = useSessionsStore()
  const currentPlatform = getCurrentPlatform()
  const platformLabel = currentPlatform === 'mac' ? 'macOS' : 'Windows'
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null)
  const [claudePathDraft, setClaudePathDraft] = useState(claudeBinaryPath)
  const [pathStatus, setPathStatus] = useState<{ ok: true; version: string | null } | { ok: false } | null>(null)
  const themeOptions = Object.values(THEME_PRESETS) as Array<{
    id: ThemeId
    label: string
    description: string
    swatches: [string, string, string]
  }>
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [themePreviewId, setThemePreviewId] = useState<ThemeId | null>(null)
  const [themeHighlightId, setThemeHighlightId] = useState<ThemeId>(themeId)
  const [defaultProjectLoading, setDefaultProjectLoading] = useState(false)
  const [cliQuery, setCliQuery] = useState('')
  const [cliSessions, setCliSessions] = useState<CliHistoryEntry[]>([])
  const [cliLoading, setCliLoading] = useState(false)
  const [cliImportingPath, setCliImportingPath] = useState<string | null>(null)
  const themeMenuRef = useRef<HTMLDivElement | null>(null)

  const activeThemeId = themePreviewId ?? themeId

  useEffect(() => {
    if (!themeMenuOpen) {
      setThemeHighlightId(themeId)
      setThemePreviewId(null)
      applyTheme(themeId)
    }
  }, [themeId, themeMenuOpen])

  useEffect(() => {
    if (!themeMenuOpen) return

    themeMenuRef.current?.focus()

    const handlePointerDown = (event: MouseEvent) => {
      if (!themeMenuRef.current?.parentElement?.contains(event.target as Node)) {
        setThemeMenuOpen(false)
        setThemePreviewId(null)
        setThemeHighlightId(themeId)
        applyTheme(themeId)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [themeMenuOpen, themeId])

  useEffect(() => {
    setClaudePathDraft(claudeBinaryPath)
  }, [claudeBinaryPath])

  useEffect(() => {
    let cancelled = false
    setCliLoading(true)

    const timer = window.setTimeout(() => {
      window.claude.listCliSessions(cliQuery)
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
            setCliLoading(false)
          }
        })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [cliQuery])

  useEffect(() => {
    let cancelled = false

    if (!claudePathDraft.trim()) {
      setPathStatus(null)
    }

    const timer = window.setTimeout(async () => {
      if (!cancelled && claudePathDraft !== claudeBinaryPath) {
        setClaudeBinaryPath(claudePathDraft)
      }

      if (!claudePathDraft.trim()) return

      const res = await window.claude.checkInstallation(claudePathDraft).catch(() => ({
        installed: false,
        version: null,
      }))
      if (cancelled) return
      setPathStatus(res.installed ? { ok: true, version: res.version } : { ok: false })
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [claudeBinaryPath, claudePathDraft, setClaudeBinaryPath])

  const previewTheme = (nextThemeId: ThemeId) => {
    setThemeHighlightId(nextThemeId)
    setThemePreviewId(nextThemeId)
    applyTheme(nextThemeId)
  }

  const commitTheme = (nextThemeId: ThemeId) => {
    setThemeId(nextThemeId)
    setThemeHighlightId(nextThemeId)
    setThemePreviewId(null)
    applyTheme(nextThemeId)
    setThemeMenuOpen(false)
  }

  const closeThemeMenu = () => {
    setThemeMenuOpen(false)
    setThemePreviewId(null)
    setThemeHighlightId(themeId)
    applyTheme(themeId)
  }

  const moveThemeHighlight = (direction: 1 | -1) => {
    const currentIndex = themeOptions.findIndex((option) => option.id === themeHighlightId)
    const safeIndex = currentIndex < 0 ? 0 : currentIndex
    const nextIndex = Math.min(themeOptions.length - 1, Math.max(0, safeIndex + direction))
    previewTheme(themeOptions[nextIndex].id)
  }

  const handleSelectDefaultProject = async () => {
    setDefaultProjectLoading(true)
    try {
      const folder = await window.claude.selectFolder({
        defaultPath: defaultProjectPath,
        title: '기본 프로젝트 폴더 선택',
      })
      if (folder) setDefaultProjectPath(folder)
    } finally {
      setDefaultProjectLoading(false)
    }
  }

  const handleImportCliSession = async (filePath: string) => {
    setCliImportingPath(filePath)
    try {
      const session = await window.claude.loadCliSession({ filePath })
      if (!session) return
      importSession(session)
    } finally {
      setCliImportingPath(null)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <p className="text-sm font-semibold text-claude-text">테마</p>
        <p className="mt-1 text-xs leading-relaxed text-claude-muted">
          기본 테마는 Default입니다. 아래 프리셋 중에서 바로 바꿔서 사용할 수 있습니다.
        </p>

        <div className="mt-4 rounded-xl border border-claude-border bg-claude-panel p-3">
          <label className="mb-2 block text-xs font-medium text-claude-muted">프리셋</label>
          <div className="relative flex items-center gap-3">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => {
                  if (themeMenuOpen) {
                    closeThemeMenu()
                    return
                  }
                  setThemeHighlightId(themeId)
                  setThemePreviewId(themeId)
                  applyTheme(themeId)
                  setThemeMenuOpen(true)
                }}
                onKeyDown={(event) => {
                  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !themeMenuOpen) {
                    event.preventDefault()
                    setThemeHighlightId(themeId)
                    setThemePreviewId(themeId)
                    applyTheme(themeId)
                    setThemeMenuOpen(true)
                    return
                  }
                }}
                className="flex w-full items-center justify-between rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
                aria-haspopup="listbox"
                aria-expanded={themeMenuOpen}
              >
                <span>{THEME_PRESETS[activeThemeId].label}</span>
                <svg className={`h-4 w-4 text-claude-muted transition-transform ${themeMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {themeMenuOpen && (
                <div
                  ref={themeMenuRef}
                  tabIndex={0}
                  role="listbox"
                  aria-activedescendant={`theme-option-${themeHighlightId}`}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      moveThemeHighlight(1)
                      return
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      moveThemeHighlight(-1)
                      return
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitTheme(themeHighlightId)
                      return
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      closeThemeMenu()
                    }
                  }}
                  className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-2xl border border-claude-border bg-claude-panel outline-none"
                >
                  {themeOptions.map((theme) => {
                    const highlighted = theme.id === themeHighlightId
                    return (
                      <button
                        key={theme.id}
                        id={`theme-option-${theme.id}`}
                        type="button"
                        role="option"
                        aria-selected={highlighted}
                        onMouseEnter={() => previewTheme(theme.id)}
                        onFocus={() => previewTheme(theme.id)}
                        onClick={() => commitTheme(theme.id)}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                          highlighted ? 'bg-claude-surface-2 text-claude-text' : 'text-claude-text hover:bg-claude-surface'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{theme.label}</div>
                          <div className={`mt-0.5 text-xs leading-relaxed ${highlighted ? 'text-claude-muted' : 'text-claude-muted'}`}>
                            {theme.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {theme.swatches.map((swatch) => (
                            <span
                              key={swatch}
                              className="h-3 w-3 rounded-full border border-white/10"
                              style={{ backgroundColor: swatch }}
                            />
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {THEME_PRESETS[activeThemeId].swatches.map((swatch) => (
                <span
                  key={swatch}
                  className="h-3 w-3 rounded-full border border-white/10"
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-claude-muted">
            {THEME_PRESETS[activeThemeId].description}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <p className="text-sm font-semibold text-claude-text">기본 프로젝트 폴더</p>
        <p className="mt-1 text-xs leading-relaxed text-claude-muted">
          새 세션이나 폴더 선택 창이 처음 열릴 위치입니다. 기본값은 Desktop이며, 언제든 다른 폴더로 바꿀 수 있습니다.
        </p>

        <div className="mt-4 rounded-xl border border-claude-border bg-claude-panel p-3">
          <label className="mb-2 block text-xs font-medium text-claude-muted">현재 경로</label>
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
              disabled={defaultProjectLoading}
              className="rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-sm text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-wait disabled:opacity-60"
            >
              {defaultProjectLoading ? '폴더 여는 중...' : '폴더 선택'}
            </button>
            <button
              type="button"
              onClick={() => setDefaultProjectPath(DEFAULT_PROJECT_PATH)}
              className="rounded-xl border border-claude-border bg-claude-panel px-3 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-bg hover:text-claude-text"
            >
              Desktop으로 복원
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <p className="text-sm font-semibold text-claude-text">Claude 실행 경로</p>
        <p className="mt-1 text-xs leading-relaxed text-claude-muted">
          비워두면 자동으로 감지합니다. 터미널에서{' '}
          <code className="rounded bg-claude-border px-1 py-0.5 font-mono">which claude</code>로
          경로를 확인할 수 있습니다.
        </p>
        <input
          value={claudePathDraft}
          onChange={(event) => setClaudePathDraft(event.target.value)}
          placeholder="~/.local/bin/claude"
          className="mt-3 w-full rounded-xl border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text outline-none focus:border-claude-accent"
          spellCheck={false}
        />
        {pathStatus !== null && (
          pathStatus.ok
            ? <p className="mt-1.5 text-xs text-green-400">✓ {pathStatus.version ?? '경로 확인됨'}</p>
            : <p className="mt-1.5 text-xs text-red-400">경로를 찾을 수 없습니다</p>
        )}
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <p className="text-sm font-semibold text-claude-text">작업 완료 알림</p>
        <p className="mt-1 text-xs leading-relaxed text-claude-muted">
          Claude 작업이 끝났을 때 알림을 언제 받을지 선택합니다. 중단한 작업이나 권한/선택지 대기 상태는 제외됩니다.
        </p>

        <div className="mt-4 grid gap-2">
          {([
            {
              value: 'background',
              title: '백그라운드일 때만',
              desc: '앱이 뒤에 있거나 포커스가 없을 때만 알림을 보냅니다.',
            },
            {
              value: 'all',
              title: '항상 받기',
              desc: '앱이 앞에 있어도 작업 완료 알림을 보냅니다.',
            },
            {
              value: 'off',
              title: '받지 않음',
              desc: '작업 완료 알림을 보내지 않습니다.',
            },
          ] satisfies Array<{ value: NotificationMode; title: string; desc: string }>).map((option) => {
            const active = notificationMode === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setNotificationMode(option.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? 'border-[#6a6d75] bg-claude-panel'
                    : 'border-claude-border bg-claude-panel hover:bg-claude-bg'
                }`}
              >
                <div className="text-sm font-medium text-claude-text">{option.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-claude-muted">{option.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-claude-text">퀵 패널</p>
            <p className="mt-1 text-xs leading-relaxed text-claude-muted">
              글로벌 단축키로 Spotlight 스타일 입력창을 열 수 있습니다. 비활성화하면 메인 프로세스 글로벌 단축키 등록도 함께 해제됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setQuickPanelEnabled(!quickPanelEnabled)}
            className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors ${
              quickPanelEnabled
                ? 'border-[#6a6d75] bg-claude-panel'
                : 'border-claude-border bg-claude-panel/70'
            }`}
            aria-pressed={quickPanelEnabled}
            title={quickPanelEnabled ? '퀵 패널 끄기' : '퀵 패널 켜기'}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-claude-text transition-transform ${
                quickPanelEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
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
                    ? 'border-[#6a6d75] bg-claude-panel'
                    : 'border-claude-border bg-claude-panel hover:bg-claude-bg'
                }`}
              >
                <div className="text-sm font-medium text-claude-text">{option.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-claude-muted">{option.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <p className="text-sm font-semibold text-claude-text">CLI 세션 히스토리 가져오기</p>
        <p className="mt-1 text-xs leading-relaxed text-claude-muted">
          로컬 Claude CLI 세션 파일을 검색해서 현재 앱으로 가져옵니다. 프로젝트 경로와 최근 프롬프트를 기준으로 찾을 수 있습니다.
        </p>

        <div className="mt-4 rounded-xl border border-claude-border bg-claude-panel p-3">
          <input
            value={cliQuery}
            onChange={(event) => setCliQuery(event.target.value)}
            placeholder="프로젝트 경로 또는 프롬프트 검색"
            className="w-full rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-sm text-claude-text outline-none placeholder:text-claude-muted"
            spellCheck={false}
          />

          <div className="mt-3 max-h-72 overflow-y-auto">
            {cliLoading ? (
              <div className="px-2 py-6 text-center text-sm text-claude-muted">세션 목록을 불러오는 중...</div>
            ) : cliSessions.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-claude-muted">표시할 CLI 세션이 없습니다.</div>
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
                        <div className="mt-1 truncate font-mono text-[11px] text-claude-muted">{session.cwd || '경로 없음'}</div>
                        <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-claude-muted">
                          {session.preview || '미리보기 없음'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleImportCliSession(session.filePath)}
                        disabled={cliImportingPath === session.filePath}
                        className="rounded-xl border border-claude-border bg-claude-panel px-3 py-2 text-xs font-medium text-claude-text transition-colors hover:bg-claude-bg disabled:cursor-wait disabled:opacity-60"
                      >
                        {cliImportingPath === session.filePath ? '가져오는 중...' : '가져오기'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
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
                  className={recordingAction === action ? 'bg-[#34363c]' : ''}
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
                            ? 'border-[#6a6d75] bg-[#2f3137] text-white ring-white/15'
                            : 'border-claude-border bg-claude-panel text-claude-text focus:border-claude-border focus:ring-white/10'
                        }`}
                        placeholder={currentPlatform === 'mac' ? 'Cmd+K' : 'Ctrl+K'}
                        spellCheck={false}
                      />
                      <span
                        className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-medium ${
                          recordingAction === action
                            ? 'bg-[#44474f] text-white'
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

  const inputCls = "w-full rounded-xl border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono text-claude-text focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10"

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-claude-muted">~/.claude.json의 mcpServers 목록</p>
        <button
          onClick={() => { setShowAdd(true); setForm(EMPTY_MCP_FORM); setFormError('') }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-claude-text bg-claude-surface hover:bg-claude-surface-2 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          추가
        </button>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <div className="border border-claude-border rounded-xl p-4 bg-claude-surface space-y-3">
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
                  className="accent-claude-muted"
                />
                <span className="text-xs font-mono text-claude-text">{label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  value === 'http' ? 'bg-claude-panel text-claude-text border border-claude-border' :
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
              className="px-3 py-1.5 bg-claude-surface-2 hover:bg-[#44444a] disabled:opacity-50 text-claude-text text-xs font-medium rounded-lg transition-colors"
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
          const typeColor = 'text-claude-muted bg-claude-panel border-claude-border'
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
                    className="px-2.5 py-1 text-xs border border-claude-border text-claude-muted rounded-lg hover:text-claude-text hover:bg-claude-panel transition-colors"
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
                        className="px-2.5 py-1 text-xs border border-claude-border text-claude-muted rounded-lg hover:text-claude-text hover:bg-claude-panel transition-colors"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setConfirmDelete(s.name); setShowAdd(false) }}
                      className="px-2.5 py-1 text-xs border border-red-900/40 text-red-300 rounded-lg hover:bg-red-950/30 transition-colors"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
              {s.command && (
                <div className="font-mono text-xs text-claude-muted bg-claude-panel border border-claude-border rounded-lg px-3 py-2 mt-2">
                  {s.command}{s.args?.length ? ' ' + s.args.join(' ') : ''}
                </div>
              )}
              {s.url && (
                <div className="font-mono text-xs text-claude-muted bg-claude-panel border border-claude-border rounded-lg px-3 py-2 mt-2 break-all">
                  {s.url}
                </div>
              )}
              {s.headers && Object.keys(s.headers).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.keys(s.headers).map((k) => (
                    <span key={k} className="text-xs bg-claude-panel border border-claude-border rounded px-1.5 py-0.5 font-mono text-claude-muted">
                      {k}
                    </span>
                  ))}
                </div>
              )}
              {s.env && Object.keys(s.env).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.keys(s.env).map((k) => (
                    <span key={k} className="text-xs bg-claude-panel border border-claude-border rounded px-1.5 py-0.5 font-mono text-claude-muted">
                      {k}
                    </span>
                  ))}
                </div>
              )}
              {editingServer === s.name && (
                <div className="mt-3 border border-claude-border rounded-xl p-4 bg-claude-surface space-y-3">
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
                          className="accent-claude-muted"
                        />
                        <span className="text-xs font-mono text-claude-text">{label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          value === 'http' ? 'bg-claude-panel text-claude-text border border-claude-border' :
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
                      className="px-3 py-1.5 bg-claude-surface-2 hover:bg-[#44444a] disabled:opacity-50 text-claude-text text-xs font-medium rounded-lg transition-colors"
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
      <div className="bg-claude-surface border border-claude-border rounded-xl p-4 mb-4">
        <p className="text-xs font-semibold text-claude-text mb-1">Skill이란?</p>
        <p className="text-xs text-claude-muted leading-relaxed">
          <code className="bg-claude-panel px-1 rounded">~/.claude/skills/&lt;name&gt;/SKILL.md</code> 에 정의하는 슬래시 명령어입니다.
          하위 파일(template.md, examples/ 등)을 추가해 더 풍부한 Skill을 만들 수 있습니다.
        </p>
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-claude-muted">~/.claude/skills/ 에 등록된 Skill</p>
        <button
          onClick={() => { setShowAdd(true); setNewName(''); setFormError('') }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-claude-text bg-claude-surface hover:bg-claude-surface-2 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          추가
        </button>
      </div>

      {/* 새 Skill 추가 폼 */}
      {showAdd && (
        <div className="border border-claude-border rounded-xl p-3 bg-claude-surface mb-3 space-y-2">
          <p className="text-xs font-semibold text-claude-text">새 Skill 추가</p>
          <p className="text-xs text-claude-muted">~/.claude/skills/&lt;name&gt;/SKILL.md 로 생성됩니다</p>
          <input
            ref={nameRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="skill-name (소문자, 숫자, 하이픈)"
            className="w-full text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-claude-panel focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10"
          />
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating}
              className="px-3 py-1.5 bg-claude-surface-2 hover:bg-[#44444a] disabled:opacity-50 text-claude-text text-xs font-medium rounded-lg transition-colors">
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
              <div key={s.path} className={`border rounded-xl overflow-hidden bg-claude-bg transition-colors ${isExpanded ? 'border-claude-border' : 'border-claude-border'}`}>
                {/* 메인 행 */}
                <div className="flex items-center gap-3 p-3">
                  <span className="text-base flex-shrink-0">⚡</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-claude-text truncate">/{s.name}</p>
                      {s.legacy && <span className="text-xs text-claude-muted bg-claude-panel border border-claude-border rounded px-1.5 py-0.5 flex-shrink-0">legacy</span>}
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
                          className="p-1.5 rounded text-claude-muted hover:text-red-500 hover:bg-claude-panel transition-colors" title="삭제">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <button onClick={() => window.claude.openFile(s.path)}
                          className="p-1.5 rounded text-claude-muted hover:text-claude-text hover:bg-claude-panel transition-colors" title="외부 에디터로 열기">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                        <button onClick={() => handleExpand(s)}
                          className="p-1.5 rounded text-claude-muted hover:text-claude-text hover:bg-claude-panel transition-colors" title="파일 목록">
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
                  <div className="border-t border-claude-border bg-claude-panel">
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
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg group transition-colors ${isEditing ? 'bg-claude-surface' : 'hover:bg-claude-bg'}`}>
                                <svg className="w-3 h-3 text-claude-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className={`text-xs font-mono flex-1 truncate ${isEditing ? 'text-claude-text font-semibold' : 'text-claude-text'}`}>{f.name}</span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                  {/* 앱에서 편집 */}
                                  <button onClick={() => handleEditFile(f)}
                                    className="p-1 rounded hover:bg-claude-panel text-claude-muted hover:text-claude-text transition-colors" title="앱에서 편집">
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  {/* 외부 에디터로 열기 */}
                                  <button onClick={() => window.claude.openFile(f.path)}
                                    className="p-1 rounded hover:bg-claude-panel text-claude-muted hover:text-claude-text transition-colors" title="외부 에디터로 열기">
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
                      <div className="border-t border-claude-border bg-claude-surface px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono font-semibold text-claude-text">{editingFile.name}</span>
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
                          className="w-full h-56 text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-claude-panel resize-y focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10 leading-relaxed"
                            spellCheck={false}
                          />
                        )}
                        {saveError && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
                        <div className="flex gap-2 mt-2">
                          <button onClick={handleSaveFile} disabled={saving || loadingEdit}
                            className="px-3 py-1.5 bg-claude-surface-2 hover:bg-[#44444a] disabled:opacity-50 text-claude-text text-xs font-medium rounded-lg transition-colors">
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
                              className="w-full text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-claude-panel focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10"
                            />
                            {fileFormError && <p className="text-xs text-red-500">{fileFormError}</p>}
                            <div className="flex gap-2">
                              <button onClick={handleCreateFile} disabled={creatingFile}
                                className="px-3 py-1.5 bg-claude-surface-2 hover:bg-[#44444a] disabled:opacity-50 text-claude-text text-xs font-medium rounded-lg transition-colors">
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
                            className="mt-2 flex items-center gap-1 text-xs text-claude-muted hover:text-claude-text transition-colors"
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
      <div className="bg-claude-surface border border-claude-border rounded-xl p-4 mb-4">
        <p className="text-xs font-semibold text-claude-text mb-1">Agent란?</p>
        <p className="text-xs text-claude-muted leading-relaxed">
          ~/.claude/agents/ 폴더에 .md 파일로 정의하는 서브 에이전트입니다.
          특정 역할과 도구 제한을 가진 전문화된 에이전트를 만들 수 있습니다.
        </p>
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-claude-muted">~/.claude/agents/ 에 등록된 Agent</p>
        <button
          onClick={() => { setShowAdd(true); setNewName(''); setFormError(''); setEditingFile(null) }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-claude-text bg-claude-surface hover:bg-claude-surface-2 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          추가
        </button>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <div className="border border-claude-border rounded-xl p-3 bg-claude-surface mb-3 space-y-2">
          <p className="text-xs font-semibold text-claude-text">새 Agent 추가</p>
          <input
            ref={nameRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="agent-name (.md 자동 추가)"
            className="w-full text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-claude-panel focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10"
          />
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-3 py-1.5 bg-claude-surface-2 hover:bg-[#44444a] disabled:opacity-50 text-claude-text text-xs font-medium rounded-lg transition-colors"
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
              <div key={f.path} className={`border rounded-xl overflow-hidden bg-claude-bg transition-colors ${isEditing ? 'border-claude-border' : 'border-claude-border'}`}>
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
                          className="p-1.5 rounded text-claude-muted hover:text-red-500 hover:bg-claude-panel transition-colors"
                          title="삭제"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        {/* 앱에서 편집 */}
                        <button
                          onClick={() => handleEditFile(f)}
                          className={`p-1.5 rounded transition-colors ${isEditing ? 'text-claude-text bg-claude-panel' : 'text-claude-muted hover:text-claude-text hover:bg-claude-panel'}`}
                          title="앱에서 편집"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {/* 외부 에디터로 열기 */}
                        <button
                          onClick={() => window.claude.openFile(f.path)}
                          className="p-1.5 rounded text-claude-muted hover:text-claude-text hover:bg-claude-panel transition-colors"
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
                  <div className="border-t border-claude-border bg-claude-surface px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-semibold text-claude-text">{f.name}</span>
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
                        className="w-full h-56 text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-claude-panel resize-y focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10 leading-relaxed"
                        spellCheck={false}
                      />
                    )}
                    {saveError && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
                    <div className="flex gap-2 mt-2">
                      <button onClick={handleSaveFile} disabled={saving || loadingEdit}
                        className="px-3 py-1.5 bg-claude-surface-2 hover:bg-[#44444a] disabled:opacity-50 text-claude-text text-xs font-medium rounded-lg transition-colors">
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
      <div className="bg-claude-surface border border-claude-border rounded-xl p-4 mb-4">
        <p className="text-xs font-semibold text-claude-text mb-1">환경변수</p>
        <p className="text-xs text-claude-muted leading-relaxed">
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
                  className="px-3 py-1.5 bg-claude-surface-2 hover:bg-[#44444a] text-claude-text text-xs font-medium rounded-lg transition-colors"
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
                className="px-3 py-1.5 border border-claude-border bg-claude-panel text-claude-muted text-xs rounded-lg hover:text-claude-text transition-colors"
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
              className="w-full h-72 text-xs font-mono px-3 py-2 border border-claude-border rounded-lg bg-claude-panel resize-y focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10 leading-relaxed"
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
              <div key={key} className="flex items-center gap-3 rounded-lg border border-claude-border bg-claude-panel px-3 py-2.5">
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
