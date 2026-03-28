import { app, BrowserWindow, ipcMain, nativeImage, Notification, Tray, Menu, globalShortcut, powerMonitor } from 'electron'
import { killAllClaudeProcesses, registerClaudeIpcHandlers } from './ipc/claude'
import { registerFileIpcHandlers } from './ipc/files'
import { registerGitIpcHandlers } from './ipc/git'
import { registerQuickPanelIpcHandlers } from './ipc/quickPanel'
import { registerSettingsIpcHandlers } from './ipc/settings'
import { registerStorageIpcHandlers } from './ipc/storage'
import { createWindowController } from './main/windowController'
import { appendClaudeResponseLog, installDevLogForwarding } from './main/devLogger'
import { AppPersistence } from './persistence'
import {
  MIME_TYPES_BY_EXTENSION,
  listOpenWithApps,
  openPathWithApp,
  readSelectedFile,
} from './services/fileService'
import { createScheduledTaskScheduler, mapPersistedScheduledTaskToSyncItem } from './services/scheduledTaskScheduler'
import { fetchModelsFromApi } from './services/modelService'
import { createGitHeadWatchService } from './services/gitHeadWatchService'
import {
  commitGit,
  createGitBranch,
  deleteGitBranch,
  getGitBranches,
  getGitCommitDiff,
  getGitCommitFileContent,
  getGitDiff,
  getGitFileContent,
  getGitLog,
  getGitStatus,
  initGitRepo,
  pullGit,
  pushGit,
  restoreGitFile,
  setGitStaged,
  switchGitBranch,
} from './services/gitService'
import {
  getProjectNameFromPath,
  getUserHomePath,
  importShellEnvironmentVars,
  resolveTargetPath,
} from './services/shellEnvironmentService'
import { createSettingsDataService } from './services/settingsDataService'
import { createSubagentWatchService } from './services/subagentWatchService'
import { createTrayImage, resolveAppIconPath } from './services/trayImageService'

const IS_DEV = process.env.NODE_ENV === 'development'
const DEFAULT_PROJECT_PATH = '~/Desktop'

let tray: Tray | null = null

const windowController = createWindowController({
  isDev: IS_DEV,
  getProjectNameFromPath,
  resolveAppIconPath,
  resolveTargetPath,
})

const appPersistence = new AppPersistence()
const scheduledTaskScheduler = createScheduledTaskScheduler({
  getMainWindow: windowController.getMainWindow,
  showMainWindow: windowController.showMainWindow,
  sendWhenRendererReady: windowController.sendWhenRendererReady,
  getProjectNameFromPath,
})
const gitHeadWatchService = createGitHeadWatchService()
const subagentWatchService = createSubagentWatchService({
  getHomePath: () => getUserHomePath(),
})
const settingsDataService = createSettingsDataService({
  getHomePath: () => getUserHomePath(),
  getProjectNameFromPath,
  defaultProjectPath: DEFAULT_PROJECT_PATH,
})

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: '새 세션',
      click: () => {
        windowController.sendWhenRendererReady(windowController.showMainWindow(), 'tray:new-session')
      },
    },
    {
      label: '보이기',
      click: () => {
        windowController.showMainWindow()
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.quit()
      },
    },
  ])
}

function createTray() {
  if (tray) return tray

  const image = createTrayImage()
  if (image.isEmpty()) {
    console.error('[tray] failed to create tray image')
    return null
  }

  try {
    tray = new Tray(image)
  } catch (error) {
    console.error('[tray] failed to create tray', error)
    return null
  }

  tray.setToolTip('Citto Code')

  tray.on('click', () => {
    if (windowController.isQuickPanelEnabled()) {
      windowController.toggleQuickPanel()
      return
    }
    windowController.showMainWindow()
  })

  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildTrayMenu())
  })

  return tray
}

app.whenReady().then(async () => {
  importShellEnvironmentVars()
  installDevLogForwarding(IS_DEV)
  await appPersistence.initialize(app.getPath('userData'))
  scheduledTaskScheduler.setTasks(
    appPersistence.loadScheduledTasks().map(mapPersistedScheduledTaskToSyncItem),
  )

  const appIconPath = resolveAppIconPath()
  if (process.platform === 'darwin' && appIconPath) {
    const icon = nativeImage.createFromPath(appIconPath)
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }

  createTray()
  windowController.registerQuickPanelShortcut()
  windowController.showMainWindow()
  scheduledTaskScheduler.start()
  void scheduledTaskScheduler.checkMissedRuns()

  powerMonitor.on('resume', () => {
    void scheduledTaskScheduler.checkMissedRuns()
  })
  powerMonitor.on('unlock-screen', () => {
    void scheduledTaskScheduler.checkMissedRuns()
  })

  registerFileIpcHandlers({
    getMainWindow: windowController.getMainWindow,
    showMainWindow: windowController.showMainWindow,
    readSelectedFile,
    resolveTargetPath,
    listOpenWithApps,
    openPathWithApp,
    mimeTypesByExtension: MIME_TYPES_BY_EXTENSION,
  })

  registerGitIpcHandlers({
    getGitStatus,
    getGitDiff,
    getGitLog,
    getGitCommitDiff,
    getGitFileContent,
    getGitCommitFileContent,
    getGitBranches,
    setGitStaged,
    restoreGitFile,
    commitGit,
    createGitBranch,
    switchGitBranch,
    pullGit,
    pushGit,
    deleteGitBranch,
    initGitRepo,
  })

  registerSettingsIpcHandlers({
    ...settingsDataService,
  })

  registerQuickPanelIpcHandlers({
    getQuickPanelProjects: windowController.getQuickPanelProjects,
    setQuickPanelProjects: windowController.setQuickPanelProjects,
    normalizeQuickPanelProjects: windowController.normalizeQuickPanelProjects,
    selectFolderFromQuickPanel: windowController.selectFolderFromQuickPanel,
    updateQuickPanelShortcut: windowController.updateQuickPanelShortcut,
    hideQuickPanel: windowController.hideQuickPanel,
    showMainWindow: windowController.showMainWindow,
    sendWhenRendererReady: windowController.sendWhenRendererReady,
  })

  registerClaudeIpcHandlers({
    fetchModelsFromApi,
    appendClaudeResponseLog: (entry) => appendClaudeResponseLog(IS_DEV, entry),
    getUserHomePath,
    resolveTargetPath,
  })

  registerStorageIpcHandlers({
    appPersistence,
    userDataPath: app.getPath('userData'),
    scheduledTaskScheduler,
    mapPersistedScheduledTaskToSyncItem,
  })

  ipcMain.handle('git:watch-head', (event, { cwd }: { cwd: string }) => {
    return gitHeadWatchService.register(event.sender, cwd)
  })

  ipcMain.handle('git:unwatch-head', (_event, { watchId }: { watchId: string }) => {
    gitHeadWatchService.unregister(watchId)
  })

  ipcMain.handle(
    'subagent:watch-text',
    (
      event,
      params: {
        tabId: string
        toolUseId: string
        cwd: string
        parentSessionId: string | null
        subagentSessionId?: string | null
        agentId?: string | null
        transcriptPath?: string | null
      },
    ) => {
      return subagentWatchService.register(event.sender, params)
    },
  )

  ipcMain.handle('subagent:unwatch-text', (_event, { watchId }: { watchId: string }) => {
    subagentWatchService.unregister(watchId)
  })

  ipcMain.handle('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window.isMaximized()) {
      window.unmaximize()
      return
    }
    window.maximize()
  })

  ipcMain.handle('app:notify', (_event, { title, body }: { title: string; body: string }) => {
    if (!Notification.isSupported()) return
    const notification = new Notification({
      title,
      body,
      silent: false,
    })
    notification.show()
  })

  app.on('activate', () => {
    windowController.showMainWindow()
  })
})

app.on('window-all-closed', () => {
  killAllClaudeProcesses()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  scheduledTaskScheduler.stop()
  gitHeadWatchService.dispose()
  subagentWatchService.dispose()
  killAllClaudeProcesses()
  globalShortcut.unregisterAll()
})
