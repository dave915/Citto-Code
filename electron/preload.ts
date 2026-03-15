import { contextBridge, ipcRenderer } from 'electron'
import { claudeAPI } from './preload/claudeApi'
import { quickPanelAPI } from './preload/quickPanelApi'
import type { ClaudeAPI, QuickPanelAPI } from './preload/types'

export * from './preload/types'

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
