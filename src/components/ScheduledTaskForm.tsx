import { useMemo, useState, type ReactNode } from 'react'
import type { PermissionMode } from '../store/sessions'
import {
  DAY_OPTIONS,
  type ScheduledTask,
  type ScheduledTaskDay,
  type ScheduledTaskFrequency,
  type ScheduledTaskInput,
} from '../store/scheduledTasks'

type Props = {
  initialTask?: ScheduledTask | null
  defaultProjectPath: string
  onCancel: () => void
  onSubmit: (input: ScheduledTaskInput) => void
}

const PERMISSION_OPTIONS: Array<{ value: PermissionMode; label: string; description: string }> = [
  { value: 'default', label: '기본', description: '파일 수정 전 확인을 요청합니다.' },
  { value: 'acceptEdits', label: '자동승인', description: '파일 편집 요청은 자동으로 승인합니다.' },
  { value: 'bypassPermissions', label: 'Bypass', description: '모든 권한 확인을 건너뜁니다.' },
]

const FREQUENCY_OPTIONS: Array<{ value: ScheduledTaskFrequency; label: string; description: string }> = [
  { value: 'manual', label: 'Manual', description: '자동 실행 없이 지금 실행 버튼으로만 동작합니다.' },
  { value: 'hourly', label: 'Hourly', description: '매시간 지정한 분에 실행합니다.' },
  { value: 'daily', label: 'Daily', description: '매일 지정한 시각에 실행합니다.' },
  { value: 'weekdays', label: 'Weekdays', description: '평일에만 지정한 시각에 실행합니다.' },
  { value: 'weekly', label: 'Weekly', description: '매주 특정 요일과 시각에 실행합니다.' },
]

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5)
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index)

function normalizeSelectedFolder(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const found = value.find((item): item is string => typeof item === 'string')
    return found ?? null
  }
  if (value && typeof value === 'object') {
    const candidate = (value as { path?: unknown; filePath?: unknown }).path
      ?? (value as { path?: unknown; filePath?: unknown }).filePath
    return typeof candidate === 'string' ? candidate : null
  }
  return null
}

function formatHour(value: number) {
  return `${String(value).padStart(2, '0')}시`
}

function formatMinute(value: number) {
  return `${String(value).padStart(2, '0')}분`
}

function Sel({
  value,
  onChange,
  children,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-claude-border bg-claude-panel px-3 pr-9 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-claude-muted"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5 10 12.5 15 7.5" />
      </svg>
    </div>
  )
}

export function ScheduledTaskForm({
  initialTask,
  defaultProjectPath,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialTask?.name ?? '')
  const [prompt, setPrompt] = useState(initialTask?.prompt ?? '')
  const [projectPath, setProjectPath] = useState(initialTask?.projectPath ?? defaultProjectPath)
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(initialTask?.permissionMode ?? 'default')
  const [frequency, setFrequency] = useState<ScheduledTaskFrequency>(initialTask?.frequency ?? 'daily')
  const [enabled, setEnabled] = useState(initialTask?.enabled ?? true)
  const [hour, setHour] = useState(initialTask?.hour ?? 9)
  const [minute, setMinute] = useState(initialTask?.minute ?? 0)
  const [weeklyDay, setWeeklyDay] = useState<ScheduledTaskDay>(initialTask?.weeklyDay ?? 'mon')
  const [skipDays, setSkipDays] = useState<ScheduledTaskDay[]>(initialTask?.skipDays ?? [])
  const [quietHoursStart, setQuietHoursStart] = useState(initialTask?.quietHoursStart ?? null)
  const [quietHoursEnd, setQuietHoursEnd] = useState(initialTask?.quietHoursEnd ?? null)
  const [minuteManual, setMinuteManual] = useState(initialTask ? !MINUTE_OPTIONS.includes(initialTask.minute) : false)
  const [error, setError] = useState('')

  const title = initialTask ? '예약 작업 수정' : '예약 작업 추가'
  const requiresTime = frequency !== 'manual'
  const requiresHour = frequency === 'daily' || frequency === 'weekdays' || frequency === 'weekly'

  const quietHoursEnabled = Boolean(quietHoursStart || quietHoursEnd)
  const selectedFrequency = useMemo(
    () => FREQUENCY_OPTIONS.find((option) => option.value === frequency),
    [frequency],
  )

  const handleSelectFolder = async () => {
    const selected = normalizeSelectedFolder(await window.claude.selectFolder({
      defaultPath: projectPath || defaultProjectPath,
      title: '작업 폴더 선택',
    }))
    if (!selected) return
    setProjectPath(selected)
  }

  const toggleSkipDay = (day: ScheduledTaskDay) => {
    setSkipDays((current) => (
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    ))
  }

  const submit = () => {
    if (!name.trim()) {
      setError('작업 이름을 입력하세요.')
      return
    }
    if (!prompt.trim()) {
      setError('프롬프트를 입력하세요.')
      return
    }
    if (!projectPath.trim()) {
      setError('작업 폴더를 선택하세요.')
      return
    }
    if (minute < 0 || minute > 59) {
      setError('분은 0~59 사이여야 합니다.')
      return
    }
    if ((quietHoursStart && !quietHoursEnd) || (!quietHoursStart && quietHoursEnd)) {
      setError('조용한 시간대는 시작과 종료를 모두 지정하세요.')
      return
    }

    setError('')
    onSubmit({
      name: name.trim(),
      prompt: prompt.trim(),
      projectPath: projectPath.trim(),
      permissionMode,
      frequency,
      enabled,
      hour,
      minute,
      weeklyDay,
      skipDays,
      quietHoursStart,
      quietHoursEnd,
    })
  }

  return (
    <div className="rounded-[24px] border border-claude-border bg-claude-panel p-5 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-claude-text">{title}</h3>
          <p className="mt-1 text-sm text-claude-muted">
            지정한 시각에 새 Claude 세션을 자동 실행합니다.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
          title="닫기"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">작업 이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 아침 점검"
            className="h-10 w-full rounded-xl border border-claude-border bg-claude-panel px-3 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">프롬프트</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            placeholder="매일 아침 에러 로그를 요약해줘"
            className="w-full rounded-2xl border border-claude-border bg-claude-panel px-3 py-2.5 text-sm leading-relaxed text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">작업 폴더</span>
          <div className="relative">
            <input
              value={projectPath}
              onChange={(event) => setProjectPath(event.target.value)}
              placeholder={defaultProjectPath}
              className="h-10 w-full rounded-xl border border-claude-border bg-claude-panel px-3 pr-11 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
            />
            <button
              onClick={handleSelectFolder}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
              title="폴더 선택"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z" />
              </svg>
            </button>
          </div>
        </label>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-claude-muted">빈도</span>
            <Sel value={frequency} onChange={(value) => setFrequency(value as ScheduledTaskFrequency)}>
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Sel>
            <p className="mt-1.5 text-xs text-claude-muted">{selectedFrequency?.description}</p>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-claude-muted">권한 모드</span>
            <Sel value={permissionMode} onChange={(value) => setPermissionMode(value as PermissionMode)}>
              {PERMISSION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Sel>
          </div>
        </div>

        {permissionMode === 'bypassPermissions' && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-200">
            Bypass는 파일 수정과 외부 명령 실행까지 자동 승인합니다. 작업 프롬프트를 반드시 검토한 뒤 사용하세요.
          </div>
        )}

        {requiresTime && (
          <div className="grid gap-4 md:grid-cols-3">
            {requiresHour && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-claude-muted">시각</span>
                <Sel value={String(hour)} onChange={(value) => setHour(Number(value))}>
                  {HOUR_OPTIONS.map((value) => (
                    <option key={value} value={value}>{formatHour(value)}</option>
                  ))}
                </Sel>
              </div>
            )}

            <div>
              <span className="mb-1.5 block text-xs font-medium text-claude-muted">분</span>
              {minuteManual ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minute}
                    onChange={(event) => setMinute(Math.min(59, Math.max(0, Number(event.target.value) || 0)))}
                    className="h-10 w-full rounded-xl border border-claude-border bg-claude-panel px-3 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
                  />
                  <button
                    onClick={() => setMinuteManual(false)}
                    className="rounded-xl border border-claude-border px-3 text-xs text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                  >
                    목록
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Sel value={String(minute)} onChange={(value) => setMinute(Number(value))} className="w-full">
                    {MINUTE_OPTIONS.map((value) => (
                      <option key={value} value={value}>{formatMinute(value)}</option>
                    ))}
                  </Sel>
                  <button
                    onClick={() => setMinuteManual(true)}
                    className="rounded-xl border border-claude-border px-3 text-xs text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                  >
                    직접입력
                  </button>
                </div>
              )}
            </div>

            {frequency === 'weekly' && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-claude-muted">요일</span>
                <Sel value={weeklyDay} onChange={(value) => setWeeklyDay(value as ScheduledTaskDay)}>
                  {DAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Sel>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-claude-muted">실행 안 할 요일</span>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((option) => {
                const selected = skipDays.includes(option.value)
                return (
                  <button
                    key={option.value}
                    onClick={() => toggleSkipDay(option.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-red-500/40 bg-red-500/15 text-red-200'
                        : 'border-claude-border bg-claude-panel text-claude-muted hover:text-claude-text'
                    }`}
                  >
                    {option.shortLabel}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-claude-muted">조용한 시간대</span>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input
                type="time"
                value={quietHoursStart ?? ''}
                onChange={(event) => setQuietHoursStart(event.target.value || null)}
                className="h-10 rounded-xl border border-claude-border bg-claude-panel px-3 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
              />
              <span className="text-sm text-claude-muted">~</span>
              <input
                type="time"
                value={quietHoursEnd ?? ''}
                onChange={(event) => setQuietHoursEnd(event.target.value || null)}
                className="h-10 rounded-xl border border-claude-border bg-claude-panel px-3 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
              />
            </div>
            <p className="mt-1.5 text-xs text-claude-muted">
              {quietHoursEnabled ? '자정을 넘는 구간도 지원합니다. 예: 22:00 ~ 08:00' : '비워두면 항상 실행합니다.'}
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2.5 rounded-2xl border border-claude-border bg-claude-surface px-3.5 py-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-claude-border bg-claude-panel text-claude-text"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-claude-text">활성화</p>
            <p className="text-xs text-claude-muted">비활성화하면 스케줄러에서 제외됩니다.</p>
          </div>
        </label>

        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-xl border border-claude-border px-3.5 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
        >
          취소
        </button>
        <button
          onClick={submit}
          className="rounded-xl bg-claude-surface-2 px-3.5 py-2 text-sm font-medium text-claude-text transition-colors hover:brightness-110"
        >
          {initialTask ? '변경 저장' : '작업 추가'}
        </button>
      </div>
    </div>
  )
}
