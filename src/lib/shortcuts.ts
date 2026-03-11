import {
  DEFAULT_SHORTCUT_CONFIG,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutConfig,
  type ShortcutPlatform,
} from '../store/sessions'

type ParsedShortcut = {
  key: string
  meta: boolean
  ctrl: boolean
  shift: boolean
  alt: boolean
}

export const SHORTCUT_ACTION_LABELS: Record<ShortcutAction, string> = {
  toggleSidebar: '사이드바 열기/닫기',
  toggleFiles: '파일 탐색기 열기/닫기',
  toggleSessionInfo: '세션 정보 열기/닫기',
  newSession: '새 세션 / 프로젝트 추가',
  openSettings: '설정 열기',
  openCommandPalette: '커맨드 팔레트 열기',
  toggleQuickPanel: '퀵 패널 열기/닫기',
  cyclePermissionMode: '권한 모드 변경',
  toggleBypassPermissions: '전체허용 켜기/끄기',
}

export function getCurrentPlatform(): ShortcutPlatform {
  if (typeof navigator === 'undefined') return 'windows'
  return /mac/i.test(navigator.platform) ? 'mac' : 'windows'
}

export function getShortcutForPlatform(binding: ShortcutBinding | undefined, platform: ShortcutPlatform): string {
  return binding?.[platform] ?? ''
}

export function getShortcutLabel(config: ShortcutConfig, action: ShortcutAction, platform = getCurrentPlatform()): string {
  const binding = config[action]
  const fallbackBinding = DEFAULT_SHORTCUT_CONFIG[action]
  return binding?.[platform] ?? fallbackBinding?.[platform] ?? ''
}

export function matchShortcut(event: KeyboardEvent, shortcut: string | undefined): boolean {
  const parsed = parseShortcut(shortcut)
  if (!parsed) return false

  const eventKey = normalizeKey(event.key)
  return (
    eventKey === parsed.key &&
    event.metaKey === parsed.meta &&
    event.ctrlKey === parsed.ctrl &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  )
}

export function normalizeShortcutInput(value: string | undefined): string {
  const parsed = parseShortcut(value)
  if (!parsed) return value?.trim() ?? ''

  const parts: string[] = []
  if (parsed.meta) parts.push('Cmd')
  if (parsed.ctrl) parts.push('Ctrl')
  if (parsed.alt) parts.push('Alt')
  if (parsed.shift) parts.push('Shift')
  parts.push(displayKey(parsed.key))
  return parts.join('+')
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent, platform: ShortcutPlatform): string | null {
  const key = normalizeKey(event.key)
  if (key === 'meta' || key === 'control' || key === 'shift' || key === 'alt') return null

  const parts: string[] = []
  if (platform === 'mac' && event.metaKey) parts.push('Cmd')
  if (platform === 'windows' && event.ctrlKey) parts.push('Ctrl')
  if (platform === 'mac' && event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(displayKey(key))
  return parts.join('+')
}

function parseShortcut(shortcut: string | undefined): ParsedShortcut | null {
  if (!shortcut) return null
  const tokens = shortcut
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) return null

  let meta = false
  let ctrl = false
  let shift = false
  let alt = false
  let key = ''

  for (const token of tokens) {
    const normalized = token.toLowerCase()
    if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
      meta = true
      continue
    }
    if (normalized === 'ctrl' || normalized === 'control') {
      ctrl = true
      continue
    }
    if (normalized === 'shift') {
      shift = true
      continue
    }
    if (normalized === 'alt' || normalized === 'option') {
      alt = true
      continue
    }

    key = normalizeKey(token)
  }

  if (!key) return null
  return { key, meta, ctrl, shift, alt }
}

function normalizeKey(key: string): string {
  if (key === ' ') return 'space'
  if (key.toLowerCase() === 'escape') return 'esc'
  return key.toLowerCase()
}

function displayKey(key: string): string {
  if (key === 'esc') return 'Esc'
  if (key === 'space') return 'Space'
  if (key === ',') return ','
  return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)
}
