import type { SecretaryAction } from './actions'
import type { CittoRoute } from './routes'

export type SecretaryBotState = 'idle' | 'working' | 'done' | 'error'

export type SecretaryIntent = 'chat' | 'navigate' | 'execute' | 'recall'

export type SecretaryProcessResult = {
  reply: string
  intent: SecretaryIntent
  action: SecretaryAction | null
}

export type SecretaryExecuteResult = {
  ok: boolean
  output?: string
  error?: string
}

export type SecretaryProfile = Record<string, string>

export type SecretaryConversation = {
  id: string
  title: string
  cittoContext: string | null
  createdAt: number
  updatedAt: number
  archivedAt: number | null
}

export type SecretaryHistoryRole = 'user' | 'secretary'

export type SecretaryHistoryEntry = {
  id: number
  conversationId: string
  role: SecretaryHistoryRole
  content: string
  intent: SecretaryIntent | null
  createdAt: number
}

export type SecretaryPatternType = 'workflow' | 'artifact' | 'route'

export type SecretaryPattern = {
  id: number
  patternType: SecretaryPatternType
  refId: string
  label: string
  useCount: number
  lastUsedAt: number | null
}

export type SecretaryRecentSession = {
  id: string
  name: string
  cwd: string
  updatedAt: number
}

export type SecretaryArtifactRef = {
  id: string
  label: string
  type: string
  updatedAt: number
}

export type SecretaryActiveContext = {
  activeRoute: CittoRoute
  currentSessionId: string | null
  currentProjectId: string | null
  isTaskRunning: boolean
  recentSessions: SecretaryRecentSession[]
  recentArtifacts: SecretaryArtifactRef[]
}

export type SecretaryRuntimeConfig = {
  claudePath?: string | null
  envVars?: Record<string, string>
  defaultModel?: string | null
}
