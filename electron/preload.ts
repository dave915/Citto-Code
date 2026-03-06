import { contextBridge, ipcRenderer } from 'electron'

export type ClaudeStreamEvent =
  | { type: 'stream-start'; sessionId: string; cwd: string }
  | { type: 'text-chunk'; sessionId: string; text: string }
  | { type: 'tool-start'; sessionId: string; toolUseId: string; toolName: string; toolInput: unknown }
  | { type: 'tool-result'; sessionId: string; toolUseId: string; content: unknown; isError: boolean }
  | { type: 'result'; sessionId: string; costUsd: number; totalCostUsd: number; isError: boolean; durationMs: number }
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

export type ClaudeAPI = {
  sendMessage: (params: {
    sessionId: string | null
    prompt: string
    cwd: string
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
    planMode?: boolean
    model?: string
    envVars?: Record<string, string>
  }) => Promise<{ tempKey: string } | undefined>
  abort: (params: { sessionId: string }) => Promise<void>
  selectFolder: () => Promise<string | null>
  selectFiles: () => Promise<SelectedFile[]>
  openFile: (filePath: string) => Promise<void>
  getModels: () => Promise<ModelInfo[]>
  listFiles: (cwd: string, query: string) => Promise<FileEntry[]>
  listCurrentDir: (path: string) => Promise<DirEntry[]>
  readFile: (filePath: string) => Promise<SelectedFile | null>
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
  onClaudeEvent: (handler: (event: ClaudeStreamEvent) => void) => () => void
}

const claudeAPI: ClaudeAPI = {
  sendMessage: (params) => ipcRenderer.invoke('claude:send-message', params),
  abort: (params) => ipcRenderer.invoke('claude:abort', params),
  selectFolder: () => ipcRenderer.invoke('claude:select-folder'),
  selectFiles: () => ipcRenderer.invoke('claude:select-files'),
  openFile: (filePath) => ipcRenderer.invoke('claude:open-file', filePath),
  getModels: () => ipcRenderer.invoke('claude:get-models'),
  listFiles: (cwd, query) => ipcRenderer.invoke('claude:list-files', { cwd, query }),
  listCurrentDir: (path) => ipcRenderer.invoke('claude:list-current-dir', { path }),
  readFile: (filePath) => ipcRenderer.invoke('claude:read-file', { filePath }),
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
