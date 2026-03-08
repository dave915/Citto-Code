import { contextBridge, ipcRenderer } from 'electron'

export type ClaudeStreamEvent =
  | { type: 'stream-start'; sessionId: string; cwd: string }
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

export type GitBranchInfo = {
  name: string
  current: boolean
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
  readMcpServers: () => Promise<Record<string, unknown>>
  writeMcpServers: (mcpServers: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
  listClaudeDir: (subdir: string) => Promise<{ name: string; path: string }[]>
  listSkills: () => Promise<{ name: string; path: string; dir: string; legacy: boolean }[]>
  listDirAbs: (dirPath: string) => Promise<{ name: string; path: string }[]>
  writeClaudeFile: (params: { subdir: string; name: string; content: string }) => Promise<{ ok: boolean; path?: string; error?: string }>
  writeFileAbs: (params: { filePath: string; content: string }) => Promise<{ ok: boolean; path?: string; error?: string }>
  deletePath: (params: { targetPath: string; recursive?: boolean }) => Promise<{ ok: boolean; error?: string }>
  checkInstallation: (claudePath?: string) => Promise<ClaudeInstallationStatus>
  notify: (params: { title: string; body: string }) => Promise<void>
  toggleWindowMaximize: () => Promise<void>
  onClaudeEvent: (handler: (event: ClaudeStreamEvent) => void) => () => void
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
  readMcpServers: () => ipcRenderer.invoke('claude:read-mcp-servers'),
  writeMcpServers: (mcpServers) => ipcRenderer.invoke('claude:write-mcp-servers', { mcpServers }),
  listClaudeDir: (subdir) => ipcRenderer.invoke('claude:list-claude-dir', { subdir }),
  listSkills: () => ipcRenderer.invoke('claude:list-skills'),
  listDirAbs: (dirPath) => ipcRenderer.invoke('claude:list-dir-abs', { dirPath }),
  writeClaudeFile: (params) => ipcRenderer.invoke('claude:write-claude-file', params),
  writeFileAbs: (params) => ipcRenderer.invoke('claude:write-file-abs', params),
  deletePath: (params) => ipcRenderer.invoke('claude:delete-path', params),
  checkInstallation: (claudePath) => ipcRenderer.invoke('claude:check-installation', { claudePath }),
  notify: (params) => ipcRenderer.invoke('app:notify', params),
  toggleWindowMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),

  onClaudeEvent: (handler) => {
    const channels = [
      'claude:stream-start', 'claude:text-chunk', 'claude:tool-start',
      'claude:tool-result', 'claude:result', 'claude:stream-end', 'claude:error',
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
}

contextBridge.exposeInMainWorld('claude', claudeAPI)

declare global {
  interface Window {
    claude: ClaudeAPI
  }
}
