import type { PermissionMode } from '../../store/sessions'
import type { ScheduledTaskDay, ScheduledTaskFrequency } from '../../store/scheduledTasks'
import type { AppLanguage } from '../../lib/i18n'

export function getPermissionOptions(language: AppLanguage = 'ko'): Array<{ value: PermissionMode; label: string; description: string }> {
  return language === 'en'
    ? [
        { value: 'default', label: 'Default', description: 'Ask before editing files.' },
        { value: 'acceptEdits', label: 'Accept edits', description: 'Automatically approve file edit requests.' },
        { value: 'bypassPermissions', label: 'Bypass', description: 'Skip all permission confirmations.' },
      ]
    : [
        { value: 'default', label: '기본', description: '파일 수정 전 확인을 요청합니다.' },
        { value: 'acceptEdits', label: '자동승인', description: '파일 편집 요청은 자동으로 승인합니다.' },
        { value: 'bypassPermissions', label: 'Bypass', description: '모든 권한 확인을 건너뜁니다.' },
      ]
}

export function getFrequencyOptions(language: AppLanguage = 'ko'): Array<{ value: ScheduledTaskFrequency; label: string; description: string }> {
  return language === 'en'
    ? [
        { value: 'manual', label: 'Manual', description: 'Runs only when you press Run now.' },
        { value: 'hourly', label: 'Hourly', description: 'Runs every hour at the selected minute.' },
        { value: 'daily', label: 'Daily', description: 'Runs every day at the selected time.' },
        { value: 'weekdays', label: 'Weekdays', description: 'Runs on weekdays at the selected time.' },
        { value: 'weekly', label: 'Weekly', description: 'Runs weekly on the selected day and time.' },
      ]
    : [
        { value: 'manual', label: 'Manual', description: '자동 실행 없이 지금 실행 버튼으로만 동작합니다.' },
        { value: 'hourly', label: 'Hourly', description: '매시간 지정한 분에 실행합니다.' },
        { value: 'daily', label: 'Daily', description: '매일 지정한 시각에 실행합니다.' },
        { value: 'weekdays', label: 'Weekdays', description: '평일에만 지정한 시각에 실행합니다.' },
        { value: 'weekly', label: 'Weekly', description: '매주 특정 요일과 시각에 실행합니다.' },
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
  return language === 'en'
    ? `${String(value).padStart(2, '0')}:00`
    : `${String(value).padStart(2, '0')}시`
}

export function formatMinute(value: number, language: AppLanguage = 'ko') {
  return language === 'en'
    ? `${String(value).padStart(2, '0')} min`
    : `${String(value).padStart(2, '0')}분`
}
