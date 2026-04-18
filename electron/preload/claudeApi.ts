import { ipcRenderer, webUtils } from 'electron'
import type {
  ClaudeAPI,
  ClaudeStreamEvent,
  WorkflowAgentSessionDoneEvent,
  WorkflowAgentSessionLinkedEvent,
  WorkflowAgentSessionStartedEvent,
  WorkflowAgentSessionTextChunkEvent,
  WorkflowExecutionDoneEvent,
  WorkflowFiredEvent,
  WorkflowNotifyEvent,
  WorkflowScheduleAdvancedEvent,
  WorkflowStepTextChunkEvent,
  WorkflowStepUpdateEvent,
} from './types'

const claudeStreamChannels = [
  'claude:stream-start',
  'claude:token-usage',
  'claude:thinking-chunk',
  'claude:text-chunk',
  'claude:tool-start',
  'claude:tool-result',
  'claude:result',
  'claude:stream-end',
  'claude:error',
  'btw:fallback-result',
] as const

export const claudeAPI: ClaudeAPI = {
  initPersistence: (params) => ipcRenderer.invoke('app-storage:init', params),
  saveSessionsSnapshot: (params) => ipcRenderer.invoke('app-storage:save-sessions', params),
  saveWorkflowsSnapshot: (params) => ipcRenderer.invoke('app-storage:save-workflows', params),
  syncClaudeRuntime: (params) => ipcRenderer.invoke('app:sync-claude-runtime', params),
  markScheduledTasksMigrated: (params) => ipcRenderer.invoke('app:mark-scheduled-tasks-migrated', params),
  sendMessage: (params) => ipcRenderer.invoke('claude:send-message', params),
  abort: (params) => ipcRenderer.invoke('claude:abort', params),
  hasActiveProcess: (params) => ipcRenderer.invoke('claude:has-active-process', params),
  selectFolder: (options) => ipcRenderer.invoke('claude:select-folder', options),
  selectFiles: () => ipcRenderer.invoke('claude:select-files'),
  openFile: (filePath) => ipcRenderer.invoke('claude:open-file', filePath),
  openInBrowser: (filePath) => ipcRenderer.invoke('claude:open-in-browser', { filePath }),
  listOpenWithApps: () => ipcRenderer.invoke('claude:list-open-with-apps'),
  openPathWithApp: (params) => ipcRenderer.invoke('claude:open-path-with-app', params),
  getModels: (envVars) => ipcRenderer.invoke('claude:get-models', { envVars }),
  listFiles: (cwd, query) => ipcRenderer.invoke('claude:list-files', { cwd, query }),
  listCurrentDir: (path) => ipcRenderer.invoke('claude:list-current-dir', { path }),
  readFile: async (filePath) => {
    const outcome = await ipcRenderer.invoke('claude:read-file', { filePath })
    return outcome?.ok ? outcome.file : null
  },
  readFileDataUrl: (filePath) => ipcRenderer.invoke('claude:read-file-data-url', { filePath }),
  capturePreviewElement: (params) => ipcRenderer.invoke('claude:capture-preview-element', params),
  startPreviewProxy: (params) => ipcRenderer.invoke('claude:start-preview-proxy', params),
  updatePreviewProxy: (params) => ipcRenderer.invoke('claude:update-preview-proxy', params),
  stopPreviewProxy: (params) => ipcRenderer.invoke('claude:stop-preview-proxy', params),
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
  checkMcpServerHealth: (params) => ipcRenderer.invoke('claude:check-mcp-server-health', params),
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
  saveTextFile: (params) => ipcRenderer.invoke('claude:save-text-file', params),
  saveZipArchive: (params) => ipcRenderer.invoke('claude:save-zip-archive', params),
  deletePath: (params) => ipcRenderer.invoke('claude:delete-path', params),
  syncWorkflows: (workflows) => ipcRenderer.invoke('app:sync-workflows', { workflows }),
  runWorkflowNow: (params) => ipcRenderer.invoke('workflow:run-now', params),
  cancelWorkflow: (params) => ipcRenderer.invoke('workflow:cancel', params),
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
  watchGitHead: (params) => ipcRenderer.invoke('git:watch-head', params),
  unwatchGitHead: (params) => ipcRenderer.invoke('git:unwatch-head', params),
  watchPreviewFiles: (params) => ipcRenderer.invoke('preview:watch-files', params),
  unwatchPreviewFiles: (params) => ipcRenderer.invoke('preview:unwatch-files', params),
  watchSubagentText: (params) => ipcRenderer.invoke('subagent:watch-text', params),
  unwatchSubagentText: (params) => ipcRenderer.invoke('subagent:unwatch-text', params),
  onClaudeEvent: (handler) => {
    const listeners = claudeStreamChannels.map((channel) => {
      const listener = (_: Electron.IpcRendererEvent, data: unknown) => {
        const eventType = (
          channel === 'btw:fallback-result'
            ? 'btw-fallback-result'
            : channel.replace('claude:', '')
        ) as ClaudeStreamEvent['type']
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
  onWorkflowFired: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowFiredEvent) => handler(payload)
    ipcRenderer.on('workflow:fired', listener)
    return () => ipcRenderer.removeListener('workflow:fired', listener)
  },
  onWorkflowScheduleAdvanced: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowScheduleAdvancedEvent) => handler(payload)
    ipcRenderer.on('workflow:schedule-advanced', listener)
    return () => ipcRenderer.removeListener('workflow:schedule-advanced', listener)
  },
  onWorkflowStepUpdate: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowStepUpdateEvent) => handler(payload)
    ipcRenderer.on('workflow:step-update', listener)
    return () => ipcRenderer.removeListener('workflow:step-update', listener)
  },
  onWorkflowStepTextChunk: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowStepTextChunkEvent) => handler(payload)
    ipcRenderer.on('workflow:step-text-chunk', listener)
    return () => ipcRenderer.removeListener('workflow:step-text-chunk', listener)
  },
  onWorkflowAgentSessionStarted: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowAgentSessionStartedEvent) => handler(payload)
    ipcRenderer.on('workflow:agent-session-started', listener)
    return () => ipcRenderer.removeListener('workflow:agent-session-started', listener)
  },
  onWorkflowAgentSessionLinked: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowAgentSessionLinkedEvent) => handler(payload)
    ipcRenderer.on('workflow:agent-session-linked', listener)
    return () => ipcRenderer.removeListener('workflow:agent-session-linked', listener)
  },
  onWorkflowAgentSessionTextChunk: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowAgentSessionTextChunkEvent) => handler(payload)
    ipcRenderer.on('workflow:agent-session-text-chunk', listener)
    return () => ipcRenderer.removeListener('workflow:agent-session-text-chunk', listener)
  },
  onWorkflowAgentSessionDone: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowAgentSessionDoneEvent) => handler(payload)
    ipcRenderer.on('workflow:agent-session-done', listener)
    return () => ipcRenderer.removeListener('workflow:agent-session-done', listener)
  },
  onWorkflowExecutionDone: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowExecutionDoneEvent) => handler(payload)
    ipcRenderer.on('workflow:execution-done', listener)
    return () => ipcRenderer.removeListener('workflow:execution-done', listener)
  },
  onWorkflowNotify: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: WorkflowNotifyEvent) => handler(payload)
    ipcRenderer.on('workflow:notify', listener)
    return () => ipcRenderer.removeListener('workflow:notify', listener)
  },
  onGitHeadChanged: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { cwd: string; headPath: string }) => handler(payload)
    ipcRenderer.on('git:head-changed', listener)
    return () => ipcRenderer.removeListener('git:head-changed', listener)
  },
  onPreviewFileChanged: (handler) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      payload: {
        watchId: string
        rootPath: string
        filePath: string
      },
    ) => handler(payload)
    ipcRenderer.on('preview:file-changed', listener)
    return () => ipcRenderer.removeListener('preview:file-changed', listener)
  },
  onSubagentTextChunk: (handler) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      payload: {
        tabId: string
        toolUseId: string
        transcriptPath: string | null
        subagentSessionId?: string | null
        chunk: string
        done?: boolean
        error?: string
      },
    ) => handler(payload)
    ipcRenderer.on('subagent:text-chunk', listener)
    return () => ipcRenderer.removeListener('subagent:text-chunk', listener)
  },
}
