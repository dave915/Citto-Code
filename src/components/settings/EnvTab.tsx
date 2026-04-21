import { useEffect, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { useSessionsStore } from '../../store/sessions'
import { AppButton, appFieldClassName, cx } from '../ui/appDesignSystem'

type EnvGroup = {
  id: string
  title: string
  desc: string
  keys: string[]
}

function groupEnvVars(envVars: Record<string, string>): EnvGroup[] {
  const keys = Object.keys(envVars)
  if (keys.length === 0) return []

  // Heuristic grouping
  const serviceKeys = keys.filter((k) =>
    k.includes('BASE_URL') || k.includes('TOKEN') || k.includes('KEY') || k.includes('SECRET'),
  )
  const flagKeys = keys.filter((k) =>
    k.includes('ENABLE') || k.includes('DISABLE') || k.includes('FLAG') || k.includes('DEBUG'),
  )
  const otherKeys = keys.filter((k) => !serviceKeys.includes(k) && !flagKeys.includes(k))

  const groups: EnvGroup[] = []

  if (serviceKeys.length > 0) {
    groups.push({ id: 'service', title: '서비스 연결', desc: '토큰과 엔드포인트', keys: serviceKeys })
  }
  if (flagKeys.length > 0) {
    groups.push({ id: 'flags', title: '실험 플래그', desc: '기능 토글과 개발 옵션', keys: flagKeys })
  }
  if (otherKeys.length > 0) {
    groups.push({ id: 'other', title: '기타', desc: '일반 환경변수', keys: otherKeys })
  }

  if (groups.length === 0 && keys.length > 0) {
    groups.push({ id: 'all', title: '전체', desc: '모든 환경변수', keys })
  }

  return groups
}

export function EnvTab({ onCountUpdate }: { onCountUpdate?: (count: number) => void }) {
  const { t } = useI18n()
  const { envVars, removeEnvVar, setEnvVar } = useSessionsStore()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState(() => JSON.stringify(envVars, null, 2))
  const [jsonError, setJsonError] = useState('')

  const groups = groupEnvVars(envVars)
  const allCount = Object.keys(envVars).length

  useEffect(() => {
    onCountUpdate?.(allCount)
  }, [allCount, onCountUpdate])

  useEffect(() => {
    setJsonText(JSON.stringify(envVars, null, 2))
  }, [envVars])

  // Auto-select first group
  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id)
    }
  }, [groups.length, selectedGroupId])

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null
  const displayKeys = selectedGroup ? selectedGroup.keys : Object.keys(envVars)

  const handleSaveJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as unknown
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        setJsonError(t('settings.env.invalidTopLevel'))
        return
      }
      const next = parsed as Record<string, unknown>
      for (const key of Object.keys(envVars)) {
        if (!(key in next)) removeEnvVar(key)
      }
      for (const [key, value] of Object.entries(next)) {
        setEnvVar(key, value == null ? '' : String(value))
      }
      setJsonError('')
      setJsonMode(false)
    } catch (cause) {
      setJsonError(cause instanceof Error ? cause.message : t('settings.env.parseFailed'))
    }
  }

  const handleAddVar = () => {
    const key = editKey.trim()
    if (!key) return
    setEnvVar(key, editValue)
    setEditKey('')
    setEditValue('')
    setEditing(false)
  }

  return (
    <div className="flex h-full">
      {/* Middle: env group list */}
      <div className="flex w-[286px] shrink-0 flex-col border-r border-claude-border bg-claude-sidebar/50">
        <div className="flex h-[42px] items-center justify-between border-b border-claude-border/50 px-3">
          <p className="text-[13px] font-semibold text-claude-text">{t('settings.tab.env')}</p>
          <AppButton
            size="icon"
            tone="ghost"
            onClick={() => setEditing(true)}
            title={t('common.add')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </AppButton>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {/* All vars option */}
          <div className="mb-2">
            <button
              onClick={() => setSelectedGroupId(null)}
              className={cx(
                'flex min-h-[40px] w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors',
                selectedGroupId === null ? 'bg-claude-surface' : 'hover:bg-claude-panel',
              )}
            >
              <svg className="h-3.5 w-3.5 shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span className={cx(
                'min-w-0 flex-1 truncate text-[13px] font-medium',
                selectedGroupId === null ? 'text-claude-text' : 'text-claude-text/80',
              )}>
                전체
              </span>
              <span className={cx(
                'shrink-0 text-[11px] tabular-nums',
                selectedGroupId === null ? 'text-claude-muted' : 'text-claude-muted/50',
              )}>
                {allCount}
              </span>
            </button>
          </div>

          {/* Groups */}
          {groups.length > 1 && (
            <div>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">
                그룹
              </p>
              <div className="space-y-0.5">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cx(
                      'flex min-h-[44px] w-full flex-col items-start rounded-md px-3 py-2 text-left transition-colors',
                      selectedGroupId === group.id ? 'bg-claude-surface' : 'hover:bg-claude-panel',
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className={cx(
                        'text-[13px] font-medium leading-none',
                        selectedGroupId === group.id ? 'text-claude-text' : 'text-claude-text/80',
                      )}>
                        {group.title}
                      </span>
                      <span className={cx(
                        'text-[11px] tabular-nums',
                        selectedGroupId === group.id ? 'text-claude-muted' : 'text-claude-muted/50',
                      )}>
                        {group.keys.length}
                      </span>
                    </div>
                    <span className="mt-0.5 text-[11px] text-claude-muted">{group.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* Right: env var detail */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-claude-bg">
        {/* Header */}
        <div className="flex h-[42px] items-center justify-between border-b border-claude-border/50 px-4">
          <p className="text-[13px] font-semibold text-claude-text">
            {selectedGroup?.title ?? '전체 환경변수'}
          </p>
          <div className="flex items-center gap-2">
            {jsonMode ? (
              <>
                <AppButton tone="accent" onClick={handleSaveJson}>{t('common.save')}</AppButton>
                <AppButton tone="ghost" onClick={() => { setJsonMode(false); setJsonError('') }}>{t('common.cancel')}</AppButton>
              </>
            ) : (
              <AppButton
                tone="ghost"
                onClick={() => { setJsonText(JSON.stringify(envVars, null, 2)); setJsonMode(true) }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7 4 12l4 5M16 7l4 5-4 5M14 4l-4 16" />
                </svg>
                JSON 편집
              </AppButton>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {jsonMode ? (
            <div>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className={`${appFieldClassName} h-72 resize-y bg-claude-panel font-mono text-xs leading-relaxed`}
                spellCheck={false}
              />
              {jsonError && <p className="mt-2 text-xs text-red-500">{jsonError}</p>}
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-md bg-claude-panel/45 px-3 py-2 text-center">
                  <p className="text-[10px] font-medium text-claude-muted/70">총 항목</p>
                  <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-claude-text">{displayKeys.length}</p>
                </div>
                <div className="rounded-md bg-claude-panel/45 px-3 py-2 text-center">
                  <p className="text-[10px] font-medium text-claude-muted/70">저장됨</p>
                  <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-claude-text">
                    {displayKeys.filter((k) => envVars[k]).length}
                  </p>
                </div>
                <div className="rounded-md bg-claude-panel/45 px-3 py-2 text-center">
                  <p className="text-[10px] font-medium text-claude-muted/70">빈 값</p>
                  <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-claude-text">
                    {displayKeys.filter((k) => !envVars[k]).length}
                  </p>
                </div>
              </div>

              {/* Add form */}
              {editing && (
                <div className="mb-4 rounded-md border border-claude-border bg-claude-bg p-3">
                  <p className="mb-2 text-[13px] font-medium text-claude-text">{t('common.add')} 환경변수</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={editKey}
                      onChange={(e) => setEditKey(e.target.value)}
                      placeholder="VARIABLE_NAME"
                      className={`${appFieldClassName} font-mono text-xs`}
                    />
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddVar()}
                      placeholder="value"
                      className={`${appFieldClassName} font-mono text-xs`}
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <AppButton onClick={handleAddVar} tone="accent">{t('common.save')}</AppButton>
                    <AppButton onClick={() => { setEditing(false); setEditKey(''); setEditValue('') }} tone="ghost">{t('common.cancel')}</AppButton>
                  </div>
                </div>
              )}

              {/* Variable table */}
              {displayKeys.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[13px] text-claude-muted">{t('settings.env.noVariables')}</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-claude-border">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-x-4 border-b border-claude-border bg-claude-panel/70 px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">변수명</span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">상태</span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">값</span>
                    <span />
                  </div>
                  {displayKeys.map((key) => {
                    const value = envVars[key]
                    const isMasked = key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET')
                    return (
                      <div
                        key={key}
                        className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-x-4 border-b border-claude-border/50 px-3 py-2 last:border-b-0"
                      >
                        <span className="min-w-0 truncate font-mono text-xs font-semibold text-claude-text">{key}</span>
                        <span className={cx(
                          'shrink-0 rounded-full border px-2 py-0.5 text-[10px]',
                          value
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                            : 'border-claude-border bg-claude-panel text-claude-muted',
                        )}>
                          {value ? '저장됨' : '비어 있음'}
                        </span>
                        <span className="min-w-0 truncate font-mono text-xs text-claude-muted">
                          {!value ? (
                            <em className="opacity-40">not set</em>
                          ) : isMasked ? (
                            <span className="tracking-widest">{'•'.repeat(Math.min(value.length, 16))}</span>
                          ) : (
                            value
                          )}
                        </span>
                        <button
                          onClick={() => removeEnvVar(key)}
                          className="shrink-0 rounded p-1 text-claude-muted/40 transition-colors hover:text-red-400"
                          title={t('common.delete')}
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
