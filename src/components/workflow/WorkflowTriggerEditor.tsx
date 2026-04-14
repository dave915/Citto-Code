import { useMemo, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { Workflow, WorkflowTriggerFrequency } from '../../store/workflowTypes'
import { ScheduledTaskSelect } from '../scheduledTaskForm/ScheduledTaskSelect'

type Props = {
  workflow: Workflow
  onCancel: () => void
  onSubmit: (params: { trigger: Workflow['trigger']; active: boolean }) => void
}

const DAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function createDefaultScheduleTrigger(): Extract<Workflow['trigger'], { type: 'schedule' }> {
  return {
    type: 'schedule',
    frequency: 'daily',
    hour: 9,
    minute: 0,
    dayOfWeek: 1,
  }
}

function clampHour(value: number) {
  return Math.max(0, Math.min(23, Math.floor(value)))
}

function clampMinute(value: number) {
  return Math.max(0, Math.min(59, Math.floor(value)))
}

function clampDayOfWeek(value: number) {
  return Math.max(0, Math.min(6, Math.floor(value)))
}

export function WorkflowTriggerEditor({
  workflow,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useI18n()
  const initialScheduleTrigger = useMemo(
    () => (workflow.trigger.type === 'schedule' ? { ...workflow.trigger } : createDefaultScheduleTrigger()),
    [workflow],
  )
  const [triggerType, setTriggerType] = useState<Workflow['trigger']['type']>(workflow.trigger.type)
  const [scheduleTrigger, setScheduleTrigger] = useState(initialScheduleTrigger)
  const [active, setActive] = useState(workflow.trigger.type === 'schedule' ? workflow.active : false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (triggerType === 'manual') {
      onSubmit({
        trigger: { type: 'manual' },
        active: false,
      })
      return
    }

    onSubmit({
      trigger: {
        ...scheduleTrigger,
        hour: clampHour(scheduleTrigger.hour),
        minute: clampMinute(scheduleTrigger.minute),
        dayOfWeek: clampDayOfWeek(scheduleTrigger.dayOfWeek),
      },
      active,
    })
  }

  return (
    <aside className="absolute right-4 top-4 z-40 flex h-[min(560px,calc(100%-6rem))] w-[420px] flex-col overflow-hidden rounded-md border border-claude-border bg-claude-panel shadow-2xl">
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-claude-border px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-claude-text">
                {t('workflow.canvas.action.trigger')}
              </div>
              <div className="mt-1 truncate text-[12px] text-claude-muted">
                {workflow.name}
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2"
            >
              {t('workflow.form.cancel')}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section className="grid gap-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.triggerType')}</span>
              <ScheduledTaskSelect
                value={triggerType}
                onChange={(value) => {
                  setTriggerType(value === 'schedule' ? 'schedule' : 'manual')
                }}
              >
                <option value="manual">{t('workflow.trigger.manual')}</option>
                <option value="schedule">{t('workflow.trigger.schedule')}</option>
              </ScheduledTaskSelect>
            </label>

            {triggerType === 'schedule' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.active')}</span>
                <button
                  type="button"
                  onClick={() => setActive((current) => !current)}
                  className={`flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm transition-colors ${
                    active
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                      : 'border-claude-border bg-claude-bg text-claude-text'
                  }`}
                >
                  <span>{active ? t('workflow.details.active') : t('workflow.details.inactive')}</span>
                  <span className="text-[11px] text-claude-muted">{t('workflow.form.activeDescription')}</span>
                </button>
              </label>
            ) : null}
          </section>

          {triggerType === 'schedule' ? (
            <section className="grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.frequency')}</span>
                <ScheduledTaskSelect
                  value={scheduleTrigger.frequency}
                  onChange={(value) => {
                    setScheduleTrigger((current) => ({
                      ...current,
                      frequency: value as WorkflowTriggerFrequency,
                    }))
                  }}
                >
                  <option value="hourly">{t('workflow.frequency.hourly')}</option>
                  <option value="daily">{t('workflow.frequency.daily')}</option>
                  <option value="weekdays">{t('workflow.frequency.weekdays')}</option>
                  <option value="weekly">{t('workflow.frequency.weekly')}</option>
                </ScheduledTaskSelect>
              </label>

              {scheduleTrigger.frequency !== 'hourly' ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.hour')}</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={scheduleTrigger.hour}
                    onChange={(event) => {
                      const nextHour = Number(event.target.value)
                      setScheduleTrigger((current) => ({
                        ...current,
                        hour: Number.isFinite(nextHour) ? nextHour : 0,
                      }))
                    }}
                    className="h-10 w-full rounded-md border border-claude-border bg-claude-bg px-3 text-sm text-claude-text outline-none"
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.minute')}</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={scheduleTrigger.minute}
                  onChange={(event) => {
                    const nextMinute = Number(event.target.value)
                    setScheduleTrigger((current) => ({
                      ...current,
                      minute: Number.isFinite(nextMinute) ? nextMinute : 0,
                    }))
                  }}
                  className="h-10 w-full rounded-md border border-claude-border bg-claude-bg px-3 text-sm text-claude-text outline-none"
                />
              </label>

              {scheduleTrigger.frequency === 'weekly' ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.dayOfWeek')}</span>
                  <ScheduledTaskSelect
                    value={String(scheduleTrigger.dayOfWeek)}
                    onChange={(value) => {
                      const nextDay = Number(value)
                      setScheduleTrigger((current) => ({
                        ...current,
                        dayOfWeek: Number.isFinite(nextDay) ? nextDay : 0,
                      }))
                    }}
                  >
                    {DAY_OPTIONS.map((dayIndex) => {
                      const dayKey = DAY_KEYS[dayIndex]
                      return (
                        <option key={dayIndex} value={String(dayIndex)}>
                          {t(`scheduled.day.${dayKey}.label`)}
                        </option>
                      )
                    })}
                  </ScheduledTaskSelect>
                </label>
              ) : null}
            </section>
          ) : (
            <section className="rounded-md border border-dashed border-claude-border bg-claude-bg/60 px-4 py-4 text-sm text-claude-muted">
              {t('workflow.frequency.summary.manual')}
            </section>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-claude-border px-4 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-claude-border bg-claude-surface px-3 py-1.5 text-sm text-claude-text transition-colors hover:bg-claude-surface-2"
          >
            {t('workflow.form.cancel')}
          </button>
          <button
            type="submit"
            className="rounded-md border border-claude-orange/40 bg-claude-orange/20 px-3 py-1.5 text-sm font-medium text-claude-text transition-colors hover:bg-claude-orange/25"
          >
            {t('workflow.form.save')}
          </button>
        </div>
      </form>
    </aside>
  )
}
