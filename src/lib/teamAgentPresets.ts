import { nanoid } from 'nanoid'
import type { AgentIconType } from '../components/team/AgentPixelIcon'
import type { AppLanguage } from './i18n'

type LocalizedText = Record<AppLanguage, string>
type LocalizedTags = Record<AppLanguage, string[]>

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

export type PresetCategory = {
  label: string
  description: string
  presetIds: string[]
}

type LocalizedAgentPreset = {
  presetId: string
  name: LocalizedText
  role: LocalizedText
  description: LocalizedText
  color: string
  iconType: AgentIconType
  systemPrompt: LocalizedText
  tags: LocalizedTags
}

type LocalizedPresetCategory = {
  label: LocalizedText
  description: LocalizedText
  presetIds: string[]
}

type LocalizedTeamAgent = {
  presetId: string | null
  isCustom: boolean
  name: string
  role: string
  description: string
  systemPrompt: string
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

const CUSTOM_AGENT_ROLE: LocalizedText = {
  ko: '에이전트',
  en: 'Agent',
}

const CUSTOM_AGENT_TAG: LocalizedText = {
  ko: '커스텀',
  en: 'Custom',
}

function normalizeHex(color: string) {
  const trimmed = color.trim().toUpperCase()
  if (!trimmed.startsWith('#')) return trimmed
  if (trimmed.length === 7) return trimmed
  if (trimmed.length !== 4) return trimmed

  const [, r, g, b] = trimmed
  return `#${r}${r}${g}${g}${b}${b}`
}

function localizeText(language: AppLanguage, text: LocalizedText) {
  return text[language]
}

function localizeTags(language: AppLanguage, tags: LocalizedTags) {
  return tags[language]
}

function localizeAgentPreset(language: AppLanguage, preset: LocalizedAgentPreset): AgentPreset {
  return {
    presetId: preset.presetId,
    name: localizeText(language, preset.name),
    role: localizeText(language, preset.role),
    description: localizeText(language, preset.description),
    color: preset.color,
    iconType: preset.iconType,
    systemPrompt: localizeText(language, preset.systemPrompt),
    tags: localizeTags(language, preset.tags),
  }
}

function localizePresetCategory(language: AppLanguage, category: LocalizedPresetCategory): PresetCategory {
  return {
    label: localizeText(language, category.label),
    description: localizeText(language, category.description),
    presetIds: category.presetIds,
  }
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

const LOCALIZED_AGENT_PRESETS: LocalizedAgentPreset[] = [
  {
    presetId: 'architect',
    name: { ko: '설계자', en: 'Architect' },
    role: { ko: '아키텍트', en: 'Software architect' },
    description: {
      ko: '전체 구조와 시스템 설계를 담당합니다',
      en: 'Owns the overall architecture and system design',
    },
    color: DEFAULT_AGENT_COLORS.architect ?? '#F97316',
    iconType: 'architect',
    systemPrompt: {
      ko: '당신은 소프트웨어 아키텍트입니다. 확장성, 유지보수성, 명확한 구조를 최우선으로 생각하며 전체적인 설계 관점에서 의견을 제시하세요.',
      en: 'You are a software architect. Prioritize scalability, maintainability, and clear structure, and respond from a system design perspective.',
    },
    tags: {
      ko: ['코딩', '시스템'],
      en: ['Coding', 'Systems'],
    },
  },
  {
    presetId: 'critic',
    name: { ko: '비판자', en: 'Critic' },
    role: { ko: '코드 리뷰어', en: 'Code reviewer' },
    description: {
      ko: '문제점과 개선 사항을 찾아냅니다',
      en: 'Finds weaknesses, risks, and improvement opportunities',
    },
    color: '#EF4444',
    iconType: 'critic',
    systemPrompt: {
      ko: '당신은 날카로운 코드 리뷰어입니다. 잠재적 버그, 성능 문제, 보안 취약점, 설계 결함을 찾아내고 건설적인 비판을 제시하세요.',
      en: 'You are a sharp code reviewer. Identify potential bugs, performance issues, security risks, and design flaws, and provide constructive criticism.',
    },
    tags: {
      ko: ['코딩', '리뷰'],
      en: ['Coding', 'Review'],
    },
  },
  {
    presetId: 'developer',
    name: { ko: '개발자', en: 'Developer' },
    role: { ko: '풀스택 개발자', en: 'Full-stack developer' },
    description: {
      ko: '실용적인 구현 방법을 제안합니다',
      en: 'Suggests practical implementation approaches',
    },
    color: '#10B981',
    iconType: 'developer',
    systemPrompt: {
      ko: '당신은 경험 많은 풀스택 개발자입니다. 실제 구현 가능한 구체적인 코드와 솔루션을 제시하고 실용적인 관점에서 의견을 내세요.',
      en: 'You are an experienced full-stack developer. Offer concrete, implementation-ready code and solutions from a practical perspective.',
    },
    tags: {
      ko: ['코딩', '구현'],
      en: ['Coding', 'Implementation'],
    },
  },
  {
    presetId: 'tester',
    name: { ko: '테스터', en: 'Tester' },
    role: { ko: 'QA 엔지니어', en: 'QA engineer' },
    description: {
      ko: '테스트 시나리오와 엣지 케이스를 발굴합니다',
      en: 'Surfaces test scenarios and edge cases',
    },
    color: '#F59E0B',
    iconType: 'tester',
    systemPrompt: {
      ko: '당신은 꼼꼼한 QA 엔지니어입니다. 엣지 케이스, 경계 조건, 예외 상황을 찾아내고 철저한 테스트 전략을 제시하세요.',
      en: 'You are a meticulous QA engineer. Identify edge cases, boundary conditions, and failure scenarios, and propose a thorough test strategy.',
    },
    tags: {
      ko: ['코딩', '품질'],
      en: ['Coding', 'Quality'],
    },
  },
  {
    presetId: 'security',
    name: { ko: '보안전문가', en: 'Security expert' },
    role: { ko: '보안 엔지니어', en: 'Security engineer' },
    description: {
      ko: '보안 취약점과 위협을 분석합니다',
      en: 'Analyzes security risks and threat surfaces',
    },
    color: '#8B5CF6',
    iconType: 'security',
    systemPrompt: {
      ko: '당신은 보안 전문가입니다. OWASP, 인증/인가, 데이터 보호, 취약점 등 보안 관점에서 모든 것을 검토하고 위협을 식별하세요.',
      en: 'You are a security expert. Review everything through a security lens, including OWASP risks, authn/authz, data protection, and vulnerabilities.',
    },
    tags: {
      ko: ['코딩', '보안'],
      en: ['Coding', 'Security'],
    },
  },
  {
    presetId: 'optimizer',
    name: { ko: '최적화 전문가', en: 'Optimizer' },
    role: { ko: '성능 엔지니어', en: 'Performance engineer' },
    description: {
      ko: '성능과 효율성을 극대화합니다',
      en: 'Maximizes performance and efficiency',
    },
    color: DEFAULT_AGENT_COLORS.optimizer ?? '#3B82F6',
    iconType: 'optimizer',
    systemPrompt: {
      ko: '당신은 성능 최적화 전문가입니다. 시간 복잡도, 공간 복잡도, 캐싱 전략, 데이터베이스 쿼리 최적화 등 성능 관점에서 개선점을 제시하세요.',
      en: 'You are a performance optimization expert. Suggest improvements from a performance perspective, including time and space complexity, caching, and query optimization.',
    },
    tags: {
      ko: ['코딩', '성능'],
      en: ['Coding', 'Performance'],
    },
  },
  {
    presetId: 'designer',
    name: { ko: 'UI 디자이너', en: 'UI designer' },
    role: { ko: 'UX/UI 전문가', en: 'UX/UI specialist' },
    description: {
      ko: '사용자 경험과 인터페이스를 설계합니다',
      en: 'Designs the user experience and interface',
    },
    color: '#EC4899',
    iconType: 'designer',
    systemPrompt: {
      ko: '당신은 UX/UI 전문가입니다. 사용성, 접근성, 시각적 일관성, 사용자 여정 관점에서 디자인을 검토하고 개선안을 제시하세요.',
      en: 'You are a UX/UI specialist. Review the design for usability, accessibility, visual consistency, and user journey, and propose improvements.',
    },
    tags: {
      ko: ['디자인', 'UX'],
      en: ['Design', 'UX'],
    },
  },
  {
    presetId: 'documenter',
    name: { ko: '문서화 전문가', en: 'Documenter' },
    role: { ko: '테크니컬 라이터', en: 'Technical writer' },
    description: {
      ko: '명확한 문서와 설명을 작성합니다',
      en: 'Produces clear documentation and explanations',
    },
    color: '#0EA5E9',
    iconType: 'documenter',
    systemPrompt: {
      ko: '당신은 테크니컬 라이터입니다. 명확하고 이해하기 쉬운 문서, API 명세, 사용 가이드를 작성하고 문서화 관점에서 의견을 제시하세요.',
      en: 'You are a technical writer. Produce clear documentation, API specs, and usage guides, and contribute from a documentation perspective.',
    },
    tags: {
      ko: ['문서', '커뮤니케이션'],
      en: ['Docs', 'Communication'],
    },
  },
]

const LOCALIZED_PRESET_CATEGORIES: LocalizedPresetCategory[] = [
  {
    label: { ko: '기능 설계팀', en: 'Feature design team' },
    description: {
      ko: '설계, 구현, 반론, 테스트 관점으로 기능 구조를 검토합니다',
      en: 'Reviews a feature structure from design, implementation, challenge, and testing perspectives',
    },
    presetIds: ['architect', 'developer', 'critic', 'tester'],
  },
  {
    label: { ko: '제품 개선팀', en: 'Product improvement team' },
    description: {
      ko: '제품, 디자인, 구현, 반론 관점으로 UX를 개선합니다',
      en: 'Improves UX from product, design, implementation, and challenge perspectives',
    },
    presetIds: ['architect', 'designer', 'developer', 'critic'],
  },
  {
    label: { ko: '출시 점검팀', en: 'Release review team' },
    description: {
      ko: '배포 전 버그, 보안, 예외 케이스를 집중 점검합니다',
      en: 'Checks bugs, security, and edge cases before shipping',
    },
    presetIds: ['developer', 'tester', 'security', 'critic'],
  },
  {
    label: { ko: '성능 최적화팀', en: 'Performance optimization team' },
    description: {
      ko: '병목, 효율, 회귀 위험을 함께 검토합니다',
      en: 'Reviews bottlenecks, efficiency, and regression risk together',
    },
    presetIds: ['developer', 'optimizer', 'critic', 'tester'],
  },
]

export function getAgentPresets(language: AppLanguage) {
  return LOCALIZED_AGENT_PRESETS.map((preset) => localizeAgentPreset(language, preset))
}

export function getAgentPresetById(presetId: string, language: AppLanguage) {
  const preset = LOCALIZED_AGENT_PRESETS.find((entry) => entry.presetId === presetId)
  return preset ? localizeAgentPreset(language, preset) : null
}

export function getPresetCategories(language: AppLanguage) {
  return LOCALIZED_PRESET_CATEGORIES.map((category) => localizePresetCategory(language, category))
}

export function resolveTeamAgentStrings<T extends LocalizedTeamAgent>(agent: T, language: AppLanguage) {
  if (agent.isCustom || !agent.presetId) {
    return {
      name: agent.name,
      role: agent.role,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
    }
  }

  const preset = getAgentPresetById(agent.presetId, language)
  if (!preset) {
    return {
      name: agent.name,
      role: agent.role,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
    }
  }

  return {
    name: preset.name,
    role: preset.role,
    description: preset.description,
    systemPrompt: preset.systemPrompt,
  }
}

export function getDefaultCustomAgentRole(language: AppLanguage) {
  return CUSTOM_AGENT_ROLE[language]
}

export function getCustomAgentTag(language: AppLanguage) {
  return CUSTOM_AGENT_TAG[language]
}

export function buildCustomAgentSystemPrompt(role: string, description: string, language: AppLanguage) {
  const normalizedRole = role.trim() || getDefaultCustomAgentRole(language)
  const trimmedDescription = description.trim()

  if (language === 'en') {
    return trimmedDescription
      ? `You are ${normalizedRole}. ${trimmedDescription}`
      : `You are ${normalizedRole}.`
  }

  return trimmedDescription
    ? `당신은 ${normalizedRole}입니다. ${trimmedDescription}`
    : `당신은 ${normalizedRole}입니다.`
}

export function createAgentFromPreset(preset: AgentPreset) {
  return {
    id: nanoid(),
    presetId: preset.presetId,
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

export function createCustomAgent(
  name: string,
  role: string,
  description: string,
  color: string,
  language: AppLanguage = 'ko',
) {
  const normalizedRole = role.trim() || getDefaultCustomAgentRole(language)

  return {
    id: nanoid(),
    presetId: null,
    name,
    role: normalizedRole,
    description,
    color: normalizeCustomAgentColor(color),
    emoji: '',
    iconType: 'custom' as AgentIconType,
    isCustom: true,
    systemPrompt: buildCustomAgentSystemPrompt(normalizedRole, description, language),
  }
}
