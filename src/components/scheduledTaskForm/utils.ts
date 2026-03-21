import type { PermissionMode } from '../../store/sessions'
import type { ScheduledTaskDay, ScheduledTaskFrequency } from '../../store/scheduledTasks'
import { translate, type AppLanguage } from '../../lib/i18n'

export function getPermissionOptions(language: AppLanguage = 'ko'): Array<{ value: PermissionMode; label: string; description: string }> {
  return [
    {
      value: 'default',
      label: translate(language, 'scheduled.permission.default.label'),
      description: translate(language, 'scheduled.permission.default.description'),
    },
    {
      value: 'acceptEdits',
      label: translate(language, 'scheduled.permission.acceptEdits.label'),
      description: translate(language, 'scheduled.permission.acceptEdits.description'),
    },
    {
      value: 'bypassPermissions',
      label: translate(language, 'scheduled.permission.bypass.label'),
      description: translate(language, 'scheduled.permission.bypass.description'),
    },
  ]
}

export function getFrequencyOptions(language: AppLanguage = 'ko'): Array<{ value: ScheduledTaskFrequency; label: string; description: string }> {
  return [
    {
      value: 'manual',
      label: translate(language, 'scheduled.frequency.manual.label'),
      description: translate(language, 'scheduled.frequency.manual.description'),
    },
    {
      value: 'hourly',
      label: translate(language, 'scheduled.frequency.hourly.label'),
      description: translate(language, 'scheduled.frequency.hourly.description'),
    },
    {
      value: 'daily',
      label: translate(language, 'scheduled.frequency.daily.label'),
      description: translate(language, 'scheduled.frequency.daily.description'),
    },
    {
      value: 'weekdays',
      label: translate(language, 'scheduled.frequency.weekdays.label'),
      description: translate(language, 'scheduled.frequency.weekdays.description'),
    },
    {
      value: 'weekly',
      label: translate(language, 'scheduled.frequency.weekly.label'),
      description: translate(language, 'scheduled.frequency.weekly.description'),
    },
  ]
}

export const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5)
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index)

export function normalizeSelectedFolder(value: unknown): string | null {
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

export function formatHour(value: number, language: AppLanguage = 'ko') {
  return translate(language, 'scheduled.format.hour', { value })
}

export function formatMinute(value: number, language: AppLanguage = 'ko') {
  return translate(language, 'scheduled.format.minute', { value })
}
