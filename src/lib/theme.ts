export const CURRENT_THEME_ID = 'current'

export const THEME_PRESETS = {
  [CURRENT_THEME_ID]: {
    id: CURRENT_THEME_ID,
    label: '현재 테마',
    description: '지금 앱에 적용된 다크 그레이 테마',
  },
} as const

export type ThemeId = keyof typeof THEME_PRESETS

export function applyTheme(themeId: ThemeId = CURRENT_THEME_ID) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = themeId
}
