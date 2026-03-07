export const CURRENT_THEME_ID = 'current'

export type ThemePreset = {
  id: string
  label: string
  description: string
  swatches: [string, string, string]
}

export const THEME_PRESETS = {
  [CURRENT_THEME_ID]: {
    id: CURRENT_THEME_ID,
    label: 'Default',
    description: '현재 앱 기본값인 중성 다크 그레이 테마',
    swatches: ['#242426', '#2b2b2e', '#38383d'],
  },
  graphite: {
    id: 'graphite',
    label: 'Graphite',
    description: '거의 흑백에 가까운 저채도 다크 테마',
    swatches: ['#1e1f22', '#25262a', '#32343a'],
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    description: '차가운 청회색 기반의 선명한 다크 테마',
    swatches: ['#1d222a', '#252c36', '#34404f'],
  },
  sand: {
    id: 'sand',
    label: 'Sand',
    description: '따뜻한 회갈색 기반의 부드러운 다크 테마',
    swatches: ['#282320', '#322c28', '#463d37'],
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    description: '따뜻한 오프화이트 기반의 문서형 라이트 테마',
    swatches: ['#f4f0e8', '#ece5da', '#d8cfc1'],
  },
  mist: {
    id: 'mist',
    label: 'Mist',
    description: '살짝 푸른 회백색 기반의 깔끔한 라이트 테마',
    swatches: ['#eef3f7', '#e4ebf1', '#cad6e0'],
  },
  stone: {
    id: 'stone',
    label: 'Stone',
    description: '연한 스톤 베이지 기반의 차분한 라이트 테마',
    swatches: ['#f1ece4', '#e7dfd4', '#d2c6b7'],
  },
} as const

export type ThemeId = keyof typeof THEME_PRESETS

export function applyTheme(themeId: ThemeId = CURRENT_THEME_ID) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = themeId
}
