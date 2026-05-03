import type { SecretaryAction } from './actions'
import type { CittoRoute } from './routes'
import type { PermissionMode } from '../persistence-types'

export type SecretaryBotState = 'idle' | 'working' | 'done' | 'error'

export type SecretaryIntent = 'chat' | 'navigate' | 'execute' | 'recall'

export type SecretaryProcessResult = {
  reply: string
  intent: SecretaryIntent
  action: SecretaryAction | null
  searchResults?: SecretarySearchResult[]
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
  action: SecretaryAction | null
  searchResults: SecretarySearchResult[]
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

export type SecretaryWorkflowRef = {
  id: string
  name: string
}

export type SecretarySearchResult = {
  id: string
  label: string
  type: string
  excerpt?: string
  route?: CittoRoute
  sessionId?: string
  messageId?: string
  conversationId?: string
  updatedAt?: number
}

export type SecretaryRendererActionRequest = {
  requestId: string
  action: SecretaryAction
}

export type SecretaryActiveContext = {
  activeRoute: CittoRoute
  currentSessionId: string | null
  currentProjectId: string | null
  currentSessionName?: string | null
  currentProjectPath?: string | null
  currentModel?: string | null
  permissionMode?: PermissionMode | null
  planMode?: boolean
  themeId?: string | null
  uiFontSize?: number | null
  sidebarCollapsed?: boolean
  settingsTab?: string | null
  selectedFileNames?: string[]
  isTaskRunning: boolean
  recentSessions: SecretaryRecentSession[]
  recentArtifacts: SecretaryArtifactRef[]
  recentWorkflows?: SecretaryWorkflowRef[]
}

export type SecretaryRuntimeConfig = {
  claudePath?: string | null
  envVars?: Record<string, string>
  defaultModel?: string | null
  permissionMode?: PermissionMode | null
  planMode?: boolean | null
}
