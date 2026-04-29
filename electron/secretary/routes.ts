export const CITTO_ROUTES = {
  home: { path: '/', label: '홈' },
  chat: { path: '/chat', label: '채팅' },
  roundTable: { path: '/round-table', label: '라운드테이블' },
  workflow: { path: '/workflow', label: '워크플로우' },
  settings: { path: '/settings', label: '설정' },
  secretary: { path: '/secretary', label: '씨토 비서' },
} as const

export type CittoRoute = keyof typeof CITTO_ROUTES

export function isCittoRoute(value: unknown): value is CittoRoute {
  return typeof value === 'string' && value in CITTO_ROUTES
}
