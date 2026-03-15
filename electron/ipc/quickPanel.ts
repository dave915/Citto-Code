import { BrowserWindow, ipcMain } from 'electron'
import type { RecentProject } from '../preload'

type RegisterQuickPanelIpcHandlersOptions = {
  getQuickPanelProjects: () => RecentProject[]
  setQuickPanelProjects: (projects: RecentProject[]) => void
  normalizeQuickPanelProjects: (projects: RecentProject[]) => RecentProject[]
  selectFolderFromQuickPanel: (options?: { defaultPath?: string; title?: string }) => Promise<string | null>
  updateQuickPanelShortcut: (accelerator: string, enabled: boolean) => void
  hideQuickPanel: () => void
  showMainWindow: () => BrowserWindow
  sendWhenRendererReady: (window: BrowserWindow, channel: string, payload?: unknown) => void
}

export function registerQuickPanelIpcHandlers({
  getQuickPanelProjects,
  setQuickPanelProjects,
  normalizeQuickPanelProjects,
  selectFolderFromQuickPanel,
  updateQuickPanelShortcut,
  hideQuickPanel,
  showMainWindow,
  sendWhenRendererReady,
}: RegisterQuickPanelIpcHandlersOptions) {
  ipcMain.handle('quick-panel:get-recent-projects', () => {
    return getQuickPanelProjects()
  })

  ipcMain.handle('quick-panel:set-projects', (_event, { projects }: { projects: RecentProject[] }) => {
    setQuickPanelProjects(normalizeQuickPanelProjects(Array.isArray(projects) ? projects : []))
    return { ok: true }
  })

  ipcMain.handle('quick-panel:select-folder', (_event, options?: { defaultPath?: string; title?: string }) => {
    return selectFolderFromQuickPanel(options)
  })

  ipcMain.handle('quick-panel:update-shortcut', (_event, { accelerator, enabled }: { accelerator: string; enabled: boolean }) => {
    updateQuickPanelShortcut(accelerator, enabled)
    return { ok: true }
  })

  ipcMain.handle('quick-panel:submit', async (_event, { text, cwd }: { text: string; cwd: string }) => {
    hideQuickPanel()
    const window = showMainWindow()
    await new Promise((resolve) => setTimeout(resolve, 200))
    sendWhenRendererReady(window, 'quick-panel:message', { text, cwd })
  })

  ipcMain.handle('quick-panel:hide', () => {
    hideQuickPanel()
  })
}
