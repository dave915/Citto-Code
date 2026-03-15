import { DAY_OPTIONS, type ScheduledTaskDay, type ScheduledTaskFrequency } from '../../store/scheduledTasks'
import { ScheduledTaskSelect } from './ScheduledTaskSelect'
import { HOUR_OPTIONS, MINUTE_OPTIONS, formatHour, formatMinute } from './utils'

type Props = {
  frequency: ScheduledTaskFrequency
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
  enabled: boolean
  hour: number
  minute: number
  weeklyDay: ScheduledTaskDay
  skipDays: ScheduledTaskDay[]
  quietHoursStart: string | null
  quietHoursEnd: string | null
  minuteManual: boolean
  onEnabledChange: (value: boolean) => void
  onHourChange: (value: number) => void
  onMinuteChange: (value: number) => void
  onWeeklyDayChange: (value: ScheduledTaskDay) => void
  onToggleSkipDay: (value: ScheduledTaskDay) => void
  onQuietHoursStartChange: (value: string | null) => void
  onQuietHoursEndChange: (value: string | null) => void
  onMinuteManualChange: (value: boolean) => void
}

export function TaskScheduleSection({
  frequency,
  permissionMode,
  enabled,
  hour,
  minute,
  weeklyDay,
  skipDays,
  quietHoursStart,
  quietHoursEnd,
  minuteManual,
  onEnabledChange,
  onHourChange,
  onMinuteChange,
  onWeeklyDayChange,
  onToggleSkipDay,
  onQuietHoursStartChange,
  onQuietHoursEndChange,
  onMinuteManualChange,
}: Props) {
  const requiresTime = frequency !== 'manual'
  const requiresHour = frequency === 'daily' || frequency === 'weekdays' || frequency === 'weekly'
  const quietHoursEnabled = Boolean(quietHoursStart || quietHoursEnd)

  return (
    <>
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
              <ScheduledTaskSelect value={String(hour)} onChange={(value) => onHourChange(Number(value))}>
                {HOUR_OPTIONS.map((value) => (
                  <option key={value} value={value}>{formatHour(value)}</option>
                ))}
              </ScheduledTaskSelect>
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
                  onChange={(event) => onMinuteChange(Math.min(59, Math.max(0, Number(event.target.value) || 0)))}
                  className="h-10 w-full rounded-xl border border-claude-border bg-claude-panel px-3 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
                />
                <button
                  onClick={() => onMinuteManualChange(false)}
                  className="rounded-xl border border-claude-border px-3 text-xs text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                >
                  목록
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <ScheduledTaskSelect value={String(minute)} onChange={(value) => onMinuteChange(Number(value))} className="w-full">
                  {MINUTE_OPTIONS.map((value) => (
                    <option key={value} value={value}>{formatMinute(value)}</option>
                  ))}
                </ScheduledTaskSelect>
                <button
                  onClick={() => onMinuteManualChange(true)}
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
              <ScheduledTaskSelect value={weeklyDay} onChange={(value) => onWeeklyDayChange(value as ScheduledTaskDay)}>
                {DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </ScheduledTaskSelect>
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
                  onClick={() => onToggleSkipDay(option.value)}
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
              onChange={(event) => onQuietHoursStartChange(event.target.value || null)}
              className="h-10 rounded-xl border border-claude-border bg-claude-panel px-3 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
            />
            <span className="text-sm text-claude-muted">~</span>
            <input
              type="time"
              value={quietHoursEnd ?? ''}
              onChange={(event) => onQuietHoursEndChange(event.target.value || null)}
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
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="h-4 w-4 rounded border-claude-border bg-claude-panel text-claude-text"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-claude-text">활성화</p>
          <p className="text-xs text-claude-muted">비활성화하면 스케줄러에서 제외됩니다.</p>
        </div>
      </label>
    </>
  )
}
