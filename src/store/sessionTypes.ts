import type { ThemeId } from '../lib/theme'
import type { AppLanguage } from '../lib/i18n'

export type ToolCallStatus = 'running' | 'done' | 'error'
export type SubagentState = 'pending' | 'running' | 'done' | 'error'

export type ToolCallBlock = {
  id: string
  toolUseId: string
  toolName: string
  toolInput: unknown
  fileSnapshotBefore?: string | null
  result?: unknown
  isError?: boolean
  status: ToolCallStatus
  streamingText?: string
  subagentState?: SubagentState
  subagentSessionId?: string | null
  subagentAgentId?: string | null
  subagentTranscriptPath?: string | null
}

export type PendingPermissionRequest = {
  toolName: string
  toolUseId: string
  toolInput: unknown
}

export type PendingQuestionOption = {
  label: string
  description?: string
}

export type PendingQuestionRequest = {
  toolUseId: string
  question: string
  header?: string
  multiSelect?: boolean
  options: PendingQuestionOption[]
}

export type AttachedFile = {
  id: string
  name: string
  path: string
  content: string
  size: number
  fileType?: 'text' | 'image'
}

export type BtwCard = {
  id: string
  question: string
  answer: string
  isStreaming: boolean
  isOpen: boolean
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  thinking?: string
  toolCalls: ToolCallBlock[]
  attachedFiles?: AttachedFile[]
  btwCards?: BtwCard[]
  createdAt: number
}

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'
export type SidebarMode = 'session' | 'project'
export type NotificationMode = 'all' | 'background' | 'off'

export type ModelSwitchNotice = {
  kind: 'backend'
  fromModel: string | null
  toModel: string | null
  createdAt: number
}

export type ShortcutAction =
  | 'toggleSidebar'
  | 'toggleFiles'
  | 'toggleSessionInfo'
  | 'newSession'
  | 'openSettings'
  | 'openCommandPalette'
  | 'toggleQuickPanel'
  | 'cyclePermissionMode'
  | 'toggleBypassPermissions'

export type ShortcutPlatform = 'mac' | 'windows'

export type ShortcutBinding = {
  mac: string
  windows: string
}

export type ShortcutConfig = Record<ShortcutAction, ShortcutBinding>

export type Session = {
  id: string
  sessionId: string | null
  name: string
  favorite: boolean
  cwd: string
  messages: Message[]
  isStreaming: boolean
  currentAssistantMsgId: string | null
  error: string | null
  pendingPermission: PendingPermissionRequest | null
  pendingQuestion: PendingQuestionRequest | null
  tokenUsage: number | null
  lastCost?: number
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
  modelSwitchNotice: ModelSwitchNotice | null
  linkedTeamId?: string | null
}

export type ImportedToolCall = Omit<ToolCallBlock, 'id'>

export type ImportedMessage = {
  role: 'user' | 'assistant'
  text: string
  thinking?: string
  toolCalls: ImportedToolCall[]
  attachedFiles?: AttachedFile[]
  btwCards?: BtwCard[]
  createdAt: number
}

export type ImportedSessionData = {
  sessionId: string | null
  name: string
  cwd: string
  messages: ImportedMessage[]
  tokenUsage?: number | null
  lastCost?: number
  permissionMode?: PermissionMode
  planMode?: boolean
  model?: string | null
  favorite?: boolean
}

export type SessionsStore = {
  sessions: Session[]
  activeSessionId: string | null
  appLanguage: AppLanguage
  defaultProjectPath: string
  envVars: Record<string, string>
  autoHtmlPreview: boolean
  sidebarMode: SidebarMode
  claudeBinaryPath: string
  preferredOpenWithAppId: string
  themeId: ThemeId
  notificationMode: NotificationMode
  uiFontSize: number
  uiZoomPercent: number
  quickPanelEnabled: boolean
  shortcutConfig: ShortcutConfig
  addSession: (cwd: string, name: string) => string
  importSession: (data: ImportedSessionData) => string
  reorderSessions: (sessionIds: string[]) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  setDefaultProjectPath: (path: string) => void
  setAppLanguage: (language: AppLanguage) => void
  setSidebarMode: (mode: SidebarMode) => void
  setAutoHtmlPreview: (value: boolean) => void
  setClaudeBinaryPath: (path: string) => void
  setPreferredOpenWithAppId: (appId: string) => void
  setThemeId: (themeId: ThemeId) => void
  setNotificationMode: (mode: NotificationMode) => void
  setUiFontSize: (value: number) => void
  setUiZoomPercent: (value: number) => void
  setQuickPanelEnabled: (value: boolean) => void
  setShortcut: (action: ShortcutAction, platform: ShortcutPlatform, value: string) => void
  updateSession: (id: string, updater: (s: Session) => Partial<Session>) => void
  addUserMessage: (tabId: string, text: string, files?: AttachedFile[]) => string
  startAssistantMessage: (sessionId: string) => string
  appendThinkingChunk: (sessionId: string, assistantMsgId: string, chunk: string) => void
  appendTextChunk: (sessionId: string, assistantMsgId: string, chunk: string) => void
  addBtwCard: (tabId: string, cardId: string, question: string) => string
  appendBtwCardChunk: (tabId: string, cardId: string, chunk: string) => void
  updateBtwCard: (tabId: string, cardId: string, patch: Partial<BtwCard>) => void
  toggleBtwCard: (tabId: string, cardId: string) => void
  appendSubagentText: (sessionId: string, toolUseId: string, chunk: string) => void
  addToolCall: (sessionId: string, assistantMsgId: string, toolCall: Omit<ToolCallBlock, 'id'>) => void
  resolveToolCall: (sessionId: string, toolUseId: string, result: unknown, isError: boolean) => void
  updateSubagent: (sessionId: string, toolUseId: string, patch: Partial<Pick<ToolCallBlock, 'streamingText' | 'subagentState' | 'subagentSessionId' | 'subagentAgentId' | 'subagentTranscriptPath'>>) => void
  setStreaming: (sessionId: string, value: boolean) => void
  commitStreamEnd: (sessionId: string) => void
  setClaudeSessionId: (tabId: string, claudeSessionId: string) => void
  setError: (tabId: string, error: string | null) => void
  setPendingPermission: (tabId: string, request: PendingPermissionRequest | null) => void
  setPendingQuestion: (tabId: string, request: PendingQuestionRequest | null) => void
  setTokenUsage: (tabId: string, inputTokens: number | null) => void
  setLastCost: (tabId: string, cost: number) => void
  setPermissionMode: (tabId: string, mode: PermissionMode) => void
  setPlanMode: (tabId: string, value: boolean) => void
  setModel: (tabId: string, model: string | null) => void
  setLinkedTeamId: (sessionId: string, teamId: string | null) => void
  setEnvVar: (key: string, value: string) => void
  removeEnvVar: (key: string) => void
}
