import { useMemo, useState } from 'react'
import type { PermissionMode } from '../store/sessions'
import { useSessionsStore } from '../store/sessions'
import {
  type ScheduledTask,
  type ScheduledTaskDay,
  type ScheduledTaskFrequency,
  type ScheduledTaskInput,
} from '../store/scheduledTasks'
import { useInputModelData } from '../hooks/useInputModelData'
import { useI18n } from '../hooks/useI18n'
import { sanitizeEnvVars } from '../lib/claudeRuntime'
import { TaskBasicsSection } from './scheduledTaskForm/TaskBasicsSection'
import { TaskScheduleSection } from './scheduledTaskForm/TaskScheduleSection'
import { getFrequencyOptions, MINUTE_OPTIONS, normalizeSelectedFolder } from './scheduledTaskForm/utils'

type Props = {
  initialTask?: ScheduledTask | null
  defaultProjectPath: string
  onCancel: () => void
  onSubmit: (input: ScheduledTaskInput) => void
}

export function ScheduledTaskForm({
  initialTask,
  defaultProjectPath,
  onCancel,
  onSubmit,
}: Props) {
  const { language, t } = useI18n()
  const [name, setName] = useState(initialTask?.name ?? '')
  const [prompt, setPrompt] = useState(initialTask?.prompt ?? '')
  const [projectPath, setProjectPath] = useState(initialTask?.projectPath ?? defaultProjectPath)
  const [model, setModel] = useState<string | null>(initialTask?.model ?? null)
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
  const envVars = useSessionsStore((state) => state.envVars)
  const sanitizedEnvVars = useMemo(() => sanitizeEnvVars(envVars), [envVars])
  const { models, modelsLoading } = useInputModelData(sanitizedEnvVars, language)

  const title = initialTask ? t('scheduled.form.editTitle') : t('scheduled.form.addTitle')
  const selectedFrequency = useMemo(
    () => getFrequencyOptions(language).find((option) => option.value === frequency),
    [frequency, language],
  )

  const handleSelectFolder = async () => {
    const selected = normalizeSelectedFolder(await window.claude.selectFolder({
      defaultPath: projectPath || defaultProjectPath,
      title: t('scheduled.form.selectTaskFolder'),
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
      setError(t('scheduled.form.enterName'))
      return
    }
    if (!prompt.trim()) {
      setError(t('scheduled.form.enterPrompt'))
      return
    }
    if (!projectPath.trim()) {
      setError(t('scheduled.form.selectFolder'))
      return
    }
    if (minute < 0 || minute > 59) {
      setError(t('scheduled.form.minuteRange'))
      return
    }
    if ((quietHoursStart && !quietHoursEnd) || (!quietHoursStart && quietHoursEnd)) {
      setError(t('scheduled.form.quietHoursBoth'))
      return
    }

    setError('')
    onSubmit({
      name: name.trim(),
      prompt: prompt.trim(),
      projectPath: projectPath.trim(),
      model,
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
    <div className="flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-[12px] border border-claude-border bg-claude-panel p-5 shadow-2xl">
      <div className="mb-4 flex flex-shrink-0 items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-claude-text">{title}</h3>
          <p className="mt-1 text-sm text-claude-muted">
            {t('scheduled.form.description')}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
          title={t('common.close')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-4">
          <TaskBasicsSection
            name={name}
            language={language}
            prompt={prompt}
            projectPath={projectPath}
            defaultProjectPath={defaultProjectPath}
            model={model}
            models={models}
            modelsLoading={modelsLoading}
            frequency={frequency}
            permissionMode={permissionMode}
            selectedFrequencyDescription={selectedFrequency?.description}
            onNameChange={setName}
            onPromptChange={setPrompt}
            onProjectPathChange={setProjectPath}
            onModelChange={setModel}
            onSelectFolder={handleSelectFolder}
            onFrequencyChange={setFrequency}
            onPermissionModeChange={setPermissionMode}
          />

          <TaskScheduleSection
            frequency={frequency}
            language={language}
            permissionMode={permissionMode}
            enabled={enabled}
            hour={hour}
            minute={minute}
            weeklyDay={weeklyDay}
            skipDays={skipDays}
            quietHoursStart={quietHoursStart}
            quietHoursEnd={quietHoursEnd}
            minuteManual={minuteManual}
            onEnabledChange={setEnabled}
            onHourChange={setHour}
            onMinuteChange={setMinute}
            onWeeklyDayChange={setWeeklyDay}
            onToggleSkipDay={toggleSkipDay}
            onQuietHoursStartChange={setQuietHoursStart}
            onQuietHoursEndChange={setQuietHoursEnd}
            onMinuteManualChange={setMinuteManual}
          />

          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-shrink-0 justify-end gap-2 border-t border-claude-border pt-4">
        <button
          onClick={onCancel}
          className="rounded-xl border border-claude-border px-3.5 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={submit}
          className="rounded-xl bg-claude-surface-2 px-3.5 py-2 text-sm font-medium text-claude-text transition-colors hover:brightness-110"
        >
          {initialTask ? t('scheduled.form.saveChanges') : t('scheduled.form.addTask')}
        </button>
      </div>
    </div>
  )
}
