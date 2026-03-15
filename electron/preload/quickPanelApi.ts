import { ipcRenderer } from 'electron'
import type { QuickPanelAPI } from './types'

export const quickPanelAPI: QuickPanelAPI = {
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
