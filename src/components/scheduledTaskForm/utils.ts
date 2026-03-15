import type { PermissionMode } from '../../store/sessions'
import type { ScheduledTaskDay, ScheduledTaskFrequency } from '../../store/scheduledTasks'

export const PERMISSION_OPTIONS: Array<{ value: PermissionMode; label: string; description: string }> = [
  { value: 'default', label: '기본', description: '파일 수정 전 확인을 요청합니다.' },
  { value: 'acceptEdits', label: '자동승인', description: '파일 편집 요청은 자동으로 승인합니다.' },
  { value: 'bypassPermissions', label: 'Bypass', description: '모든 권한 확인을 건너뜁니다.' },
]

export const FREQUENCY_OPTIONS: Array<{ value: ScheduledTaskFrequency; label: string; description: string }> = [
  { value: 'manual', label: 'Manual', description: '자동 실행 없이 지금 실행 버튼으로만 동작합니다.' },
  { value: 'hourly', label: 'Hourly', description: '매시간 지정한 분에 실행합니다.' },
  { value: 'daily', label: 'Daily', description: '매일 지정한 시각에 실행합니다.' },
  { value: 'weekdays', label: 'Weekdays', description: '평일에만 지정한 시각에 실행합니다.' },
  { value: 'weekly', label: 'Weekly', description: '매주 특정 요일과 시각에 실행합니다.' },
]

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

export function formatHour(value: number) {
  return `${String(value).padStart(2, '0')}시`
}

export function formatMinute(value: number) {
  return `${String(value).padStart(2, '0')}분`
}
