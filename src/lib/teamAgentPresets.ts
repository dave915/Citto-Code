import { nanoid } from 'nanoid'
import type { AgentIconType } from '../components/team/AgentPixelIcon'

export type AgentPreset = {
  presetId: string
  name: string
  role: string
  description: string
  color: string
  iconType: AgentIconType
  systemPrompt: string
  tags: string[]
}

export const DEFAULT_AGENT_COLORS: Partial<Record<AgentIconType, string>> = {
  architect: '#F97316',
  critic: '#EF4444',
  developer: '#10B981',
  tester: '#F59E0B',
  security: '#8B5CF6',
  optimizer: '#3B82F6',
  designer: '#EC4899',
  documenter: '#0EA5E9',
}

function normalizeHex(color: string) {
  const trimmed = color.trim().toUpperCase()
  if (!trimmed.startsWith('#')) return trimmed
  if (trimmed.length === 7) return trimmed
  if (trimmed.length !== 4) return trimmed

  const [, r, g, b] = trimmed
  return `#${r}${r}${g}${g}${b}${b}`
}

export function normalizeCustomAgentColor(color: string) {
  const normalized = normalizeHex(color)

  if (normalized === '#0EA5E9') {
    return '#14B8A6'
  }

  return normalized
}

export function resolveAgentColor(iconType: AgentIconType, color: string) {
  if (iconType === 'custom') return normalizeCustomAgentColor(color)
  return DEFAULT_AGENT_COLORS[iconType] ?? color
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    presetId: 'architect',
    name: '설계자',
    role: '아키텍트',
    description: '전체 구조와 시스템 설계를 담당합니다',
    color: DEFAULT_AGENT_COLORS.architect ?? '#F97316',
    iconType: 'architect',
    systemPrompt: '당신은 소프트웨어 아키텍트입니다. 확장성, 유지보수성, 명확한 구조를 최우선으로 생각하며 전체적인 설계 관점에서 의견을 제시하세요.',
    tags: ['코딩', '시스템'],
  },
  {
    presetId: 'critic',
    name: '비판자',
    role: '코드 리뷰어',
    description: '문제점과 개선 사항을 찾아냅니다',
    color: '#EF4444',
    iconType: 'critic',
    systemPrompt: '당신은 날카로운 코드 리뷰어입니다. 잠재적 버그, 성능 문제, 보안 취약점, 설계 결함을 찾아내고 건설적인 비판을 제시하세요.',
    tags: ['코딩', '리뷰'],
  },
  {
    presetId: 'developer',
    name: '개발자',
    role: '풀스택 개발자',
    description: '실용적인 구현 방법을 제안합니다',
    color: '#10B981',
    iconType: 'developer',
    systemPrompt: '당신은 경험 많은 풀스택 개발자입니다. 실제 구현 가능한 구체적인 코드와 솔루션을 제시하고 실용적인 관점에서 의견을 내세요.',
    tags: ['코딩', '구현'],
  },
  {
    presetId: 'tester',
    name: '테스터',
    role: 'QA 엔지니어',
    description: '테스트 시나리오와 엣지 케이스를 발굴합니다',
    color: '#F59E0B',
    iconType: 'tester',
    systemPrompt: '당신은 꼼꼼한 QA 엔지니어입니다. 엣지 케이스, 경계 조건, 예외 상황을 찾아내고 철저한 테스트 전략을 제시하세요.',
    tags: ['코딩', '품질'],
  },
  {
    presetId: 'security',
    name: '보안전문가',
    role: '보안 엔지니어',
    description: '보안 취약점과 위협을 분석합니다',
    color: '#8B5CF6',
    iconType: 'security',
    systemPrompt: '당신은 보안 전문가입니다. OWASP, 인증/인가, 데이터 보호, 취약점 등 보안 관점에서 모든 것을 검토하고 위협을 식별하세요.',
    tags: ['코딩', '보안'],
  },
  {
    presetId: 'optimizer',
    name: '최적화 전문가',
    role: '성능 엔지니어',
    description: '성능과 효율성을 극대화합니다',
    color: DEFAULT_AGENT_COLORS.optimizer ?? '#3B82F6',
    iconType: 'optimizer',
    systemPrompt: '당신은 성능 최적화 전문가입니다. 시간 복잡도, 공간 복잡도, 캐싱 전략, 데이터베이스 쿼리 최적화 등 성능 관점에서 개선점을 제시하세요.',
    tags: ['코딩', '성능'],
  },
  {
    presetId: 'designer',
    name: 'UI 디자이너',
    role: 'UX/UI 전문가',
    description: '사용자 경험과 인터페이스를 설계합니다',
    color: '#EC4899',
    iconType: 'designer',
    systemPrompt: '당신은 UX/UI 전문가입니다. 사용성, 접근성, 시각적 일관성, 사용자 여정 관점에서 디자인을 검토하고 개선안을 제시하세요.',
    tags: ['디자인', 'UX'],
  },
  {
    presetId: 'documenter',
    name: '문서화 전문가',
    role: '테크니컬 라이터',
    description: '명확한 문서와 설명을 작성합니다',
    color: '#0EA5E9',
    iconType: 'documenter',
    systemPrompt: '당신은 테크니컬 라이터입니다. 명확하고 이해하기 쉬운 문서, API 명세, 사용 가이드를 작성하고 문서화 관점에서 의견을 제시하세요.',
    tags: ['문서', '커뮤니케이션'],
  },
]

// Category groups for the setup modal
export const PRESET_CATEGORIES = [
  {
    label: '개발팀',
    description: '소프트웨어 개발을 위한 기본 구성',
    presetIds: ['architect', 'developer', 'critic'],
  },
  {
    label: '품질 보증팀',
    description: '코드 품질과 신뢰성 확보',
    presetIds: ['tester', 'critic', 'security'],
  },
  {
    label: '풀스택팀',
    description: '설계부터 구현, 최적화까지',
    presetIds: ['architect', 'developer', 'optimizer'],
  },
]

export function createAgentFromPreset(preset: AgentPreset) {
  return {
    id: nanoid(),
    name: preset.name,
    role: preset.role,
    description: preset.description,
    color: resolveAgentColor(preset.iconType, preset.color),
    emoji: '',
    iconType: preset.iconType,
    isCustom: false,
    systemPrompt: preset.systemPrompt,
  }
}

export function createCustomAgent(name: string, role: string, description: string, color: string) {
  return {
    id: nanoid(),
    name,
    role,
    description,
    color: normalizeCustomAgentColor(color),
    emoji: '',
    iconType: 'custom' as AgentIconType,
    isCustom: true,
    systemPrompt: `당신은 ${role}입니다. ${description}`,
  }
}
