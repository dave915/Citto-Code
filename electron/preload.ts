import { contextBridge, ipcRenderer, webUtils } from 'electron'

export type ClaudeStreamEvent =
  | { type: 'stream-start'; sessionId: string; cwd: string }
  | { type: 'thinking-chunk'; sessionId: string; text: string }
  | { type: 'text-chunk'; sessionId: string; text: string }
  | {
      type: 'tool-start'
      sessionId: string
      toolUseId: string
      toolName: string
      toolInput: unknown
      fileSnapshotBefore?: string | null
    }
  | { type: 'tool-result'; sessionId: string; toolUseId: string; content: unknown; isError: boolean }
  | {
      type: 'result'
      sessionId: string
      costUsd: number
      totalCostUsd: number
      isError: boolean
      durationMs: number
      resultText?: string
      permissionDenials?: Array<{ toolName: string; toolUseId: string; toolInput: unknown }>
    }
  | { type: 'stream-end'; sessionId: string | null; exitCode: number | null }
  | { type: 'error'; sessionId: string | null; error: string }

export type SelectedFile = {
  name: string
  path: string
  content: string
  size: number
  fileType: 'text' | 'image'
  dataUrl?: string
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
  shortHash: string
  subject: string
  author: string
  relativeDate: string
  decorations: string
  graph: string
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

export type McpConfigScope = 'user' | 'local' | 'project'

export type McpReadResult = {
  scope: McpConfigScope
  available: boolean
  targetPath: string
  projectPath: string | null
  mcpServers: Record<string, unknown>
  message?: string
}

export type QuickPanelAPI = {
  submit: (message: string, projectPath?: string) => Promise<void>
  hide: () => Promise<void>
  getRecentProjects: () => Promise<RecentProject[]>
  selectFolder: (options?: { defaultPath?: string; title?: string }) => Promise<string | null>
  onShow: (handler: () => void) => () => void
}

export type ClaudeAPI = {
  sendMessage: (params: {
    sessionId: string | null
    prompt: string
    cwd: string
    claudePath?: string
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
    planMode?: boolean
    model?: string
    envVars?: Record<string, string>
  }) => Promise<{ tempKey: string } | undefined>
  abort: (params: { sessionId: string }) => Promise<void>
  hasActiveProcess: (params: { sessionId: string }) => Promise<boolean>
  selectFolder: (options?: { defaultPath?: string; title?: string }) => Promise<string | null>
  selectFiles: () => Promise<SelectedFile[]>
  openFile: (filePath: string) => Promise<void>
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
  deletePath: (params: { targetPath: string; recursive?: boolean }) => Promise<{ ok: boolean; error?: string }>
  syncScheduledTasks: (tasks: ScheduledTaskSyncItem[]) => Promise<{ ok: boolean; error?: string }>
  runScheduledTaskNow: (params: { taskId: string }) => Promise<{ ok: boolean; error?: string }>
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
  onClaudeEvent: (handler: (event: ClaudeStreamEvent) => void) => () => void
  onQuickPanelMessage: (handler: (payload: { text: string; cwd: string }) => void) => () => void
  onTrayNewSession: (handler: () => void) => () => void
  onScheduledTaskFired: (handler: (event: ScheduledTaskFiredEvent) => void) => () => void
  onScheduledTaskAdvance: (handler: (event: ScheduledTaskAdvanceEvent) => void) => () => void
}

const quickPanelAPI: QuickPanelAPI = {
  submit: (message, projectPath) => ipcRenderer.invoke('quick-panel:submit', { text: message, cwd: projectPath }),
  hide: () => ipcRenderer.invoke('quick-panel:hide'),
  getRecentProjects: () => ipcRenderer.invoke('quick-panel:get-recent-projects'),
  selectFolder: (options) => ipcRenderer.invoke('quick-panel:select-folder', options),
  onShow: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('quick-panel:show', listener)
    return () => ipcRenderer.removeListener('quick-panel:show', listener)
  },
}

const claudeAPI: ClaudeAPI = {
  sendMessage: (params) => ipcRenderer.invoke('claude:send-message', params),
  abort: (params) => ipcRenderer.invoke('claude:abort', params),
  hasActiveProcess: (params) => ipcRenderer.invoke('claude:has-active-process', params),
  selectFolder: (options) => ipcRenderer.invoke('claude:select-folder', options),
  selectFiles: () => ipcRenderer.invoke('claude:select-files'),
  openFile: (filePath) => ipcRenderer.invoke('claude:open-file', filePath),
  listOpenWithApps: () => ipcRenderer.invoke('claude:list-open-with-apps'),
  openPathWithApp: (params) => ipcRenderer.invoke('claude:open-path-with-app', params),
  getModels: (envVars) => ipcRenderer.invoke('claude:get-models', { envVars }),
  listFiles: (cwd, query) => ipcRenderer.invoke('claude:list-files', { cwd, query }),
  listCurrentDir: (path) => ipcRenderer.invoke('claude:list-current-dir', { path }),
  readFile: (filePath) => ipcRenderer.invoke('claude:read-file', { filePath }),
  readFileDataUrl: (filePath) => ipcRenderer.invoke('claude:read-file-data-url', { filePath }),
  getGitStatus: (cwd) => ipcRenderer.invoke('claude:get-git-status', { cwd }),
  getGitDiff: (params) => ipcRenderer.invoke('claude:get-git-diff', params),
  getGitLog: (params) => ipcRenderer.invoke('claude:get-git-log', params),
  getGitCommitDiff: (params) => ipcRenderer.invoke('claude:get-git-commit-diff', params),
  getGitFileContent: (params) => ipcRenderer.invoke('claude:get-git-file-content', params),
  getGitCommitFileContent: (params) => ipcRenderer.invoke('claude:get-git-commit-file-content', params),
  getGitBranches: (cwd) => ipcRenderer.invoke('claude:get-git-branches', { cwd }),
  setGitStaged: (params) => ipcRenderer.invoke('claude:set-git-staged', params),
  restoreGitFile: (params) => ipcRenderer.invoke('claude:restore-git-file', params),
  commitGit: (params) => ipcRenderer.invoke('claude:commit-git', params),
  createGitBranch: (params) => ipcRenderer.invoke('claude:create-git-branch', params),
  switchGitBranch: (params) => ipcRenderer.invoke('claude:switch-git-branch', params),
  pullGit: (params) => ipcRenderer.invoke('claude:pull-git', params),
  pushGit: (params) => ipcRenderer.invoke('claude:push-git', params),
  deleteGitBranch: (params) => ipcRenderer.invoke('claude:delete-git-branch', params),
  initGitRepo: (params) => ipcRenderer.invoke('claude:init-git-repo', params),
  readClaudeSettings: () => ipcRenderer.invoke('claude:read-settings'),
  writeSettings: (settings) => ipcRenderer.invoke('claude:write-settings', { settings }),
  readMcpServers: (params) => ipcRenderer.invoke('claude:read-mcp-servers', params),
  writeMcpServers: (params) => ipcRenderer.invoke('claude:write-mcp-servers', params),
  listProjectPaths: () => ipcRenderer.invoke('claude:list-project-paths'),
  readProjectMcpServers: (projectPath) => ipcRenderer.invoke('claude:read-project-mcp-servers', { projectPath }),
  writeProjectMcpServer: (params) => ipcRenderer.invoke('claude:write-project-mcp-server', params),
  deleteProjectMcpServer: (params) => ipcRenderer.invoke('claude:delete-project-mcp-server', params),
  readDotMcpServers: (projectPath) => ipcRenderer.invoke('claude:read-dotmcp-servers', { projectPath }),
  writeDotMcpServer: (params) => ipcRenderer.invoke('claude:write-dotmcp-server', params),
  deleteDotMcpServer: (params) => ipcRenderer.invoke('claude:delete-dotmcp-server', params),
  listClaudeDir: (subdir) => ipcRenderer.invoke('claude:list-claude-dir', { subdir }),
  listSkills: () => ipcRenderer.invoke('claude:list-skills'),
  listPluginSkills: () => ipcRenderer.invoke('claude:list-plugin-skills'),
  listDirAbs: (dirPath) => ipcRenderer.invoke('claude:list-dir-abs', { dirPath }),
  writeClaudeFile: (params) => ipcRenderer.invoke('claude:write-claude-file', params),
  writeFileAbs: (params) => ipcRenderer.invoke('claude:write-file-abs', params),
  deletePath: (params) => ipcRenderer.invoke('claude:delete-path', params),
  syncScheduledTasks: (tasks) => ipcRenderer.invoke('scheduled-tasks:sync', { tasks }),
  runScheduledTaskNow: (params) => ipcRenderer.invoke('scheduled-tasks:run-now', params),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  checkInstallation: (claudePath) => ipcRenderer.invoke('claude:check-installation', { claudePath }),
  notify: (params) => ipcRenderer.invoke('app:notify', params),
  toggleWindowMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  listCliSessions: (query) => ipcRenderer.invoke('claude:list-cli-sessions', { query }),
  loadCliSession: (params) => ipcRenderer.invoke('claude:load-cli-session', params),
  getRecentProjects: () => ipcRenderer.invoke('quick-panel:get-recent-projects'),
  setQuickPanelProjects: (projects) => ipcRenderer.invoke('quick-panel:set-projects', { projects }),
  updateQuickPanelShortcut: (params) => ipcRenderer.invoke('quick-panel:update-shortcut', params),
  quickPanelSubmit: (params) => ipcRenderer.invoke('quick-panel:submit', params),
  quickPanelHide: () => ipcRenderer.invoke('quick-panel:hide'),

  onClaudeEvent: (handler) => {
    const channels = [
      'claude:stream-start',
      'claude:thinking-chunk',
      'claude:text-chunk',
      'claude:tool-start',
      'claude:tool-result',
      'claude:result',
      'claude:stream-end',
      'claude:error',
    ] as const

    const listeners = channels.map((channel) => {
      const listener = (_: Electron.IpcRendererEvent, data: unknown) => {
        const eventType = channel.replace('claude:', '') as ClaudeStreamEvent['type']
        handler({ type: eventType, ...(data as object) } as ClaudeStreamEvent)
      }
      ipcRenderer.on(channel, listener)
      return { channel, listener }
    })

    return () => {
      for (const { channel, listener } of listeners) {
        ipcRenderer.removeListener(channel, listener)
      }
    }
  },

  onQuickPanelMessage: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { text: string; cwd: string }) => handler(payload)
    ipcRenderer.on('quick-panel:message', listener)
    return () => ipcRenderer.removeListener('quick-panel:message', listener)
  },

  onTrayNewSession: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('tray:new-session', listener)
    return () => ipcRenderer.removeListener('tray:new-session', listener)
  },

  onScheduledTaskFired: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: ScheduledTaskFiredEvent) => handler(payload)
    ipcRenderer.on('scheduled-tasks:fired', listener)
    return () => ipcRenderer.removeListener('scheduled-tasks:fired', listener)
  },

  onScheduledTaskAdvance: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: ScheduledTaskAdvanceEvent) => handler(payload)
    ipcRenderer.on('scheduled-tasks:advance', listener)
    return () => ipcRenderer.removeListener('scheduled-tasks:advance', listener)
  },
}

if (process.env.NODE_ENV === 'development') {
  ipcRenderer.on('dev:main-log', (_event, payload: { level: 'log' | 'error'; args: string[] }) => {
    const logger = payload.level === 'error' ? console.error : console.log
    logger('[Main]', ...payload.args)
  })
}

contextBridge.exposeInMainWorld('claude', claudeAPI)
contextBridge.exposeInMainWorld('quickPanel', quickPanelAPI)

declare global {
  interface Window {
    claude: ClaudeAPI
    quickPanel: QuickPanelAPI
  }
}
