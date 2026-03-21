import { getDayOptions, type ScheduledTaskDay, type ScheduledTaskFrequency } from '../../store/scheduledTasks'
import { translate, type AppLanguage } from '../../lib/i18n'
import { ScheduledTaskSelect } from './ScheduledTaskSelect'
import { HOUR_OPTIONS, MINUTE_OPTIONS, formatHour, formatMinute } from './utils'

type Props = {
  frequency: ScheduledTaskFrequency
  language: AppLanguage
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
  language,
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
  const dayOptions = getDayOptions(language)
  const requiresTime = frequency !== 'manual'
  const requiresHour = frequency === 'daily' || frequency === 'weekdays' || frequency === 'weekly'
  const quietHoursEnabled = Boolean(quietHoursStart || quietHoursEnd)

  return (
    <>
      {permissionMode === 'bypassPermissions' && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-200">
          {translate(language, 'scheduled.form.bypassWarning')}
        </div>
      )}

      {requiresTime && (
        <div className="grid gap-4 md:grid-cols-3">
          {requiresHour && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.hour')}</span>
              <ScheduledTaskSelect value={String(hour)} onChange={(value) => onHourChange(Number(value))}>
                {HOUR_OPTIONS.map((value) => (
                  <option key={value} value={value}>{formatHour(value, language)}</option>
                ))}
              </ScheduledTaskSelect>
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.minute')}</span>
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
                  {translate(language, 'scheduled.form.list')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <ScheduledTaskSelect value={String(minute)} onChange={(value) => onMinuteChange(Number(value))} className="w-full">
                  {MINUTE_OPTIONS.map((value) => (
                    <option key={value} value={value}>{formatMinute(value, language)}</option>
                  ))}
                </ScheduledTaskSelect>
                <button
                  onClick={() => onMinuteManualChange(true)}
                  className="rounded-xl border border-claude-border px-3 text-xs text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                >
                  {translate(language, 'scheduled.form.custom')}
                </button>
              </div>
            )}
          </div>

          {frequency === 'weekly' && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.day')}</span>
              <ScheduledTaskSelect value={weeklyDay} onChange={(value) => onWeeklyDayChange(value as ScheduledTaskDay)}>
                {dayOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </ScheduledTaskSelect>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.skipDays')}</span>
          <div className="flex flex-wrap gap-2">
            {dayOptions.map((option) => {
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
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.quietHours')}</span>
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
            {quietHoursEnabled
              ? translate(language, 'scheduled.form.quietHoursEnabledHint')
              : translate(language, 'scheduled.form.quietHoursEmptyHint')}
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
          <p className="text-sm font-medium text-claude-text">{translate(language, 'scheduled.form.enabledTitle')}</p>
          <p className="text-xs text-claude-muted">{translate(language, 'scheduled.form.enabledDescription')}</p>
        </div>
      </label>
    </>
  )
}
