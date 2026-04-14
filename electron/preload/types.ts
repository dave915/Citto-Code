import type { Session, ScheduledTask, Workflow, WorkflowExecution } from '../persistence-types'

type ClaudeStreamEventMeta = {
  requestId?: string
}

export type ClaudeStreamEvent =
  | (ClaudeStreamEventMeta & { type: 'stream-start'; sessionId: string; cwd: string })
  | (ClaudeStreamEventMeta & { type: 'token-usage'; sessionId: string; inputTokens: number })
  | (ClaudeStreamEventMeta & { type: 'thinking-chunk'; sessionId: string; text: string })
  | (ClaudeStreamEventMeta & { type: 'text-chunk'; sessionId: string; text: string })
  | (ClaudeStreamEventMeta & {
      type: 'tool-start'
      sessionId: string
      toolUseId: string
      toolName: string
      toolInput: unknown
      fileSnapshotBefore?: string | null
    })
  | (ClaudeStreamEventMeta & { type: 'tool-result'; sessionId: string; toolUseId: string; content: unknown; isError: boolean })
  | (ClaudeStreamEventMeta & {
      type: 'result'
      sessionId: string
      costUsd: number
      totalCostUsd: number
      isError: boolean
      durationMs: number
      resultText?: string
      permissionDenials?: Array<{ toolName: string; toolUseId: string; toolInput: unknown }>
    })
  | (ClaudeStreamEventMeta & { type: 'stream-end'; sessionId: string | null; exitCode: number | null })
  | (ClaudeStreamEventMeta & { type: 'error'; sessionId: string | null; error: string })
  | { type: 'btw-fallback-result'; requestId: string; text: string }

export type SelectedFile = {
  name: string
  path: string
  content: string
  size: number
  fileType: 'text' | 'image'
  dataUrl?: string
}

export type SkippedFile = {
  name: string
  reason: string
}

export type SelectFilesResult = {
  files: SelectedFile[]
  skipped: SkippedFile[]
}

export type FileEntry = {
  name: string
  path: string
  relativePath: string
}

export type DirEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
}

export type ModelInfo = {
  id: string
  displayName: string
  family: string
  provider: 'anthropic' | 'ollama' | 'custom' | 'gateway'
  isLocal: boolean
  isGateway?: boolean
}

export type ClaudeInstallationStatus = {
  installed: boolean
  path: string | null
  version: string | null
}

export type OpenWithApp = {
  id: string
  label: string
  iconDataUrl?: string
  iconPath?: string
}

export type GitStatusEntry = {
  path: string
  relativePath: string
  originalPath?: string | null
  statusCode: string
  stagedAdditions: number | null
  stagedDeletions: number | null
  unstagedAdditions: number | null
  unstagedDeletions: number | null
  totalAdditions: number | null
  totalDeletions: number | null
  staged: boolean
  unstaged: boolean
  untracked: boolean
  deleted: boolean
  renamed: boolean
}

export type GitRepoStatus = {
  gitAvailable: boolean
  isRepo: boolean
  rootPath: string | null
  branch: string | null
  ahead: number
  behind: number
  clean: boolean
  entries: GitStatusEntry[]
}

export type GitDiffResult = {
  ok: boolean
  diff: string
  error?: string
}

export type GitFileContentResult = {
  ok: boolean
  content: string
  error?: string
}

export type GitBranchInfo = {
  name: string
  current: boolean
}

export type GitLogEntry = {
  hash: string
  parents: string[]
  shortHash: string
  subject: string
  author: string
  relativeDate: string
  decorations: string
  graph: string
  bridgeToNext: string[]
}

export type GitLogResult = {
  ok: boolean
  entries: GitLogEntry[]
  error?: string
}

export type CliHistoryEntry = {
  id: string
  filePath: string
  claudeSessionId: string | null
  cwd: string
  title: string
  preview: string
  updatedAt: number
  source: 'project' | 'transcript'
}

export type ImportedCliToolCall = {
  toolUseId: string
  toolName: string
  toolInput: unknown
  fileSnapshotBefore?: string | null
  result?: unknown
  isError?: boolean
  status: 'running' | 'done' | 'error'
}

export type ImportedCliMessage = {
  role: 'user' | 'assistant'
  text: string
  toolCalls: ImportedCliToolCall[]
  createdAt: number
}

export type ImportedCliSession = {
  sessionId: string | null
  name: string
  cwd: string
  messages: ImportedCliMessage[]
  lastCost?: number
  model?: string | null
}

export type RecentProject = {
  path: string
  name: string
  lastUsedAt: number
}

export type PluginSkill = {
  name: string
  path: string
  dir: string
  pluginName: string
  pluginPath: string
}

export type ScheduledTaskFrequency = 'manual' | 'hourly' | 'daily' | 'weekdays' | 'weekly'
export type ScheduledTaskDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export type ScheduledTaskSyncItem = {
  id: string
  name: string
  prompt: string
  projectPath: string
  model: string | null
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
  frequency: ScheduledTaskFrequency
  enabled: boolean
  hour: number
  minute: number
  weeklyDay: ScheduledTaskDay
  skipDays: ScheduledTaskDay[]
  quietHoursStart: string | null
  quietHoursEnd: string | null
  nextRunAt: number | null
}

export type ScheduledTaskFiredEvent = {
  taskId: string
  name: string
  prompt: string
  cwd: string
  model: string | null
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
  firedAt: number
  catchUp: boolean
  manual: boolean
}

export type ScheduledTaskAdvanceEvent = {
  taskId: string
  firedAt: number
  skipped?: boolean
  reason?: string
  catchUp?: boolean
  manual?: boolean
}

export type GitHeadChangedEvent = {
  cwd: string
  headPath: string
}

export type WorkflowFiredEvent = {
  workflowId: string
  workflowName: string
  executionId: string
  triggeredBy: 'manual' | 'schedule'
  firedAt: number
}

export type WorkflowStepUpdateEvent = {
  executionId: string
  stepId: string
  status: 'running' | 'done' | 'error' | 'skipped'
  output?: string
  error?: string
}

export type WorkflowStepTextChunkEvent = {
  executionId: string
  stepId: string
  chunk: string
}

export type WorkflowExecutionDoneEvent = {
  executionId: string
  workflowId: string
  status: 'done' | 'error' | 'cancelled'
  durationMs: number
}

export type SubagentTextChunkEvent = {
  tabId: string
  toolUseId: string
  transcriptPath: string | null
  subagentSessionId?: string | null
  chunk: string
  done?: boolean
  error?: string
}

export type McpConfigScope = 'user' | 'local' | 'project'

export type McpReadResult = {
  scope: McpConfigScope
  available: boolean
  targetPath: string
  projectPath: string | null
  mcpServers: Record<string, unknown>
  message?: string
}

export type McpHealthCheckStatus = 'checking' | 'ok' | 'auth-required' | 'missing-command' | 'error'

export type McpHealthCheckResult = {
  status: McpHealthCheckStatus
  message?: string
  checkedAt: number
}

export type QuickPanelAPI = {
  submit: (message: string, projectPath?: string) => Promise<void>
  hide: () => Promise<void>
  getRecentProjects: () => Promise<RecentProject[]>
  selectFolder: (options?: { defaultPath?: string; title?: string }) => Promise<string | null>
  onShow: (handler: () => void) => () => void
}

export type PersistenceSnapshot = {
  sessions: Session[]
  scheduledTasks: ScheduledTask[]
  workflows: Workflow[]
  workflowExecutions: WorkflowExecution[]
  migratedSessions: boolean
  migratedScheduledTasks: boolean
}

export type ClaudeAPI = {
  initPersistence: (params?: {
    legacySessions?: Session[]
    legacyScheduledTasks?: ScheduledTask[]
  }) => Promise<PersistenceSnapshot>
  saveSessionsSnapshot: (params: { sessions: Session[] }) => Promise<{ ok: boolean; error?: string }>
  saveScheduledTasksSnapshot: (params: { tasks: ScheduledTask[] }) => Promise<{ ok: boolean; error?: string }>
  saveWorkflowsSnapshot: (params: { workflows: Workflow[]; executions: WorkflowExecution[] }) => Promise<{ ok: boolean; error?: string }>
  sendMessage: (params: {
    sessionId: string | null
    tabId?: string
    prompt: string
    attachments?: SelectedFile[]
    cwd: string
    requestId?: string
    allowConcurrent?: boolean
    claudePath?: string
    bare?: boolean
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
    planMode?: boolean
    model?: string
    envVars?: Record<string, string>
  }) => Promise<{ tempKey: string } | undefined>
  abort: (params: { sessionId: string }) => Promise<void>
  hasActiveProcess: (params: { sessionId: string }) => Promise<boolean>
  selectFolder: (options?: { defaultPath?: string; title?: string }) => Promise<string | null>
  selectFiles: () => Promise<SelectFilesResult>
  openFile: (filePath: string) => Promise<void>
  openInBrowser: (filePath: string) => Promise<{ ok: boolean; error?: string }>
  listOpenWithApps: () => Promise<OpenWithApp[]>
  openPathWithApp: (params: { targetPath: string; appId: string }) => Promise<{ ok: boolean; error?: string }>
  getModels: (envVars?: Record<string, string>) => Promise<ModelInfo[]>
  listFiles: (cwd: string, query: string) => Promise<FileEntry[]>
  listCurrentDir: (path: string) => Promise<DirEntry[]>
  readFile: (filePath: string) => Promise<SelectedFile | null>
  readFileDataUrl: (filePath: string) => Promise<string | null>
  getGitStatus: (cwd: string) => Promise<GitRepoStatus>
  getGitDiff: (params: { cwd: string; filePath: string }) => Promise<GitDiffResult>
  getGitLog: (params: { cwd: string; limit?: number }) => Promise<GitLogResult>
  getGitCommitDiff: (params: { cwd: string; commitHash: string }) => Promise<GitDiffResult>
  getGitFileContent: (params: { cwd: string; commitHash: string; filePath: string }) => Promise<GitFileContentResult>
  getGitCommitFileContent: (params: { cwd: string; commitHash: string; filePath: string }) => Promise<GitFileContentResult>
  getGitBranches: (cwd: string) => Promise<{ ok: boolean; branches: GitBranchInfo[]; error?: string }>
  setGitStaged: (params: { cwd: string; filePath: string; staged: boolean }) => Promise<{ ok: boolean; error?: string }>
  restoreGitFile: (params: { cwd: string; filePath: string }) => Promise<{ ok: boolean; error?: string }>
  commitGit: (params: { cwd: string; message: string }) => Promise<{ ok: boolean; commitHash?: string; error?: string }>
  createGitBranch: (params: { cwd: string; name: string }) => Promise<{ ok: boolean; branchName?: string; error?: string }>
  switchGitBranch: (params: { cwd: string; name: string }) => Promise<{ ok: boolean; error?: string }>
  pullGit: (params: { cwd: string }) => Promise<{ ok: boolean; error?: string }>
  pushGit: (params: { cwd: string }) => Promise<{ ok: boolean; error?: string }>
  deleteGitBranch: (params: { cwd: string; name: string }) => Promise<{ ok: boolean; error?: string }>
  initGitRepo: (params: { cwd: string }) => Promise<{ ok: boolean; error?: string }>
  readClaudeSettings: () => Promise<Record<string, unknown>>
  writeSettings: (settings: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
  readMcpServers: (params?: { scope?: McpConfigScope; cwd?: string | null }) => Promise<McpReadResult>
  writeMcpServers: (params: { scope?: McpConfigScope; cwd?: string | null; mcpServers: Record<string, unknown> }) => Promise<{ ok: boolean; error?: string }>
  checkMcpServerHealth: (params: { name: string; config: Record<string, unknown> }) => Promise<McpHealthCheckResult>
  listProjectPaths: () => Promise<string[]>
  readProjectMcpServers: (projectPath: string) => Promise<McpReadResult>
  writeProjectMcpServer: (params: { projectPath: string; name: string; config: Record<string, unknown> }) => Promise<{ ok: boolean; error?: string }>
  deleteProjectMcpServer: (params: { projectPath: string; name: string }) => Promise<{ ok: boolean; error?: string }>
  readDotMcpServers: (projectPath: string) => Promise<McpReadResult>
  writeDotMcpServer: (params: { projectPath: string; name: string; config: Record<string, unknown> }) => Promise<{ ok: boolean; error?: string }>
  deleteDotMcpServer: (params: { projectPath: string; name: string }) => Promise<{ ok: boolean; error?: string }>
  listClaudeDir: (subdir: string) => Promise<{ name: string; path: string }[]>
  listSkills: () => Promise<{ name: string; path: string; dir: string; legacy: boolean }[]>
  listPluginSkills: () => Promise<PluginSkill[]>
  listDirAbs: (dirPath: string) => Promise<{ name: string; path: string }[]>
  writeClaudeFile: (params: { subdir: string; name: string; content: string }) => Promise<{ ok: boolean; path?: string; error?: string }>
  writeFileAbs: (params: { filePath: string; content: string }) => Promise<{ ok: boolean; path?: string; error?: string }>
  saveTextFile: (params: {
    suggestedName: string
    defaultPath?: string
    content: string
    filters?: Array<{ name: string; extensions: string[] }>
  }) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>
  deletePath: (params: { targetPath: string; recursive?: boolean }) => Promise<{ ok: boolean; error?: string }>
  syncScheduledTasks: (tasks: ScheduledTaskSyncItem[]) => Promise<{ ok: boolean; error?: string }>
  runScheduledTaskNow: (params: { taskId: string }) => Promise<{ ok: boolean; error?: string }>
  syncWorkflows: (workflows: Workflow[]) => Promise<{ ok: boolean; error?: string }>
  runWorkflowNow: (params: { workflowId: string }) => Promise<{ ok: boolean; error?: string }>
  cancelWorkflow: (params: { workflowId: string }) => Promise<{ ok: boolean; error?: string }>
  getPathForFile: (file: File) => string
  checkInstallation: (claudePath?: string) => Promise<ClaudeInstallationStatus>
  notify: (params: { title: string; body: string }) => Promise<void>
  toggleWindowMaximize: () => Promise<void>
  listCliSessions: (query?: string) => Promise<CliHistoryEntry[]>
  loadCliSession: (params: { filePath: string }) => Promise<ImportedCliSession | null>
  getRecentProjects: () => Promise<RecentProject[]>
  setQuickPanelProjects: (projects: RecentProject[]) => Promise<{ ok: boolean }>
  updateQuickPanelShortcut: (params: { accelerator: string; enabled: boolean }) => Promise<{ ok: boolean; error?: string }>
  quickPanelSubmit: (params: { text: string; cwd: string }) => Promise<void>
  quickPanelHide: () => Promise<void>
  watchGitHead: (params: { cwd: string }) => Promise<{ watchId: string | null }>
  unwatchGitHead: (params: { watchId: string }) => Promise<void>
  watchSubagentText: (params: {
    tabId: string
    toolUseId: string
    cwd: string
    parentSessionId: string | null
    subagentSessionId?: string | null
    agentId?: string | null
    transcriptPath?: string | null
  }) => Promise<{ watchId: string | null; transcriptPath: string | null }>
  unwatchSubagentText: (params: { watchId: string }) => Promise<void>
  onClaudeEvent: (handler: (event: ClaudeStreamEvent) => void) => () => void
  onQuickPanelMessage: (handler: (payload: { text: string; cwd: string }) => void) => () => void
  onTrayNewSession: (handler: () => void) => () => void
  onScheduledTaskFired: (handler: (event: ScheduledTaskFiredEvent) => void) => () => void
  onScheduledTaskAdvance: (handler: (event: ScheduledTaskAdvanceEvent) => void) => () => void
  onWorkflowFired: (handler: (event: WorkflowFiredEvent) => void) => () => void
  onWorkflowStepUpdate: (handler: (event: WorkflowStepUpdateEvent) => void) => () => void
  onWorkflowStepTextChunk: (handler: (event: WorkflowStepTextChunkEvent) => void) => () => void
  onWorkflowExecutionDone: (handler: (event: WorkflowExecutionDoneEvent) => void) => () => void
  onGitHeadChanged: (handler: (event: GitHeadChangedEvent) => void) => () => void
  onSubagentTextChunk: (handler: (event: SubagentTextChunkEvent) => void) => () => void
}
