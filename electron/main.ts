import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Notification, Tray, Menu, globalShortcut, powerMonitor, screen } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync } from 'fs'
import { killAllClaudeProcesses, registerClaudeIpcHandlers } from './ipc/claude'
import { registerFileIpcHandlers } from './ipc/files'
import { registerGitIpcHandlers } from './ipc/git'
import { registerQuickPanelIpcHandlers } from './ipc/quickPanel'
import { registerSettingsIpcHandlers } from './ipc/settings'
import { registerStorageIpcHandlers } from './ipc/storage'
import { AppPersistence } from './persistence'
import {
  MIME_TYPES_BY_EXTENSION,
  listOpenWithApps,
  openPathWithApp,
  readSelectedFile,
} from './services/fileService'
import { createScheduledTaskScheduler, mapPersistedScheduledTaskToSyncItem } from './services/scheduledTaskScheduler'
import { fetchModelsFromApi } from './services/modelService'
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
import { createTrayImage, resolveAppIconPath } from './services/trayImageService'

const IS_DEV = process.env.NODE_ENV === 'development'
let mainWindow: BrowserWindow | null = null
let quickPanelWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quickPanelAccelerator = process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space'
let quickPanelEnabled = true
let quickPanelRegisteredAccelerator: string | null = null
let devLogForwardingInstalled = false
const appPersistence = new AppPersistence()
const scheduledTaskScheduler = createScheduledTaskScheduler({
  getMainWindow: () => mainWindow,
  showMainWindow,
  sendWhenRendererReady,
  getProjectNameFromPath,
})

function appendClaudeResponseLog(entry: Record<string, unknown>) {
  if (!IS_DEV) return
  try {
    const logsDir = join(app.getPath('userData'), 'logs')
    mkdirSync(logsDir, { recursive: true })
    const logPath = join(logsDir, 'claude-response.jsonl')
    appendFileSync(
      logPath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n\n`,
      'utf-8'
    )
  } catch {
    // Logging failures should not affect Claude execution.
  }
}

const QUICK_PANEL_WIDTH = 780
const QUICK_PANEL_HEIGHT = 520
const DEFAULT_PROJECT_PATH = '~/Desktop'
const settingsDataService = createSettingsDataService({
  getHomePath: () => getUserHomePath(),
  getProjectNameFromPath,
  defaultProjectPath: DEFAULT_PROJECT_PATH,
})

type RecentProject = {
  path: string
  name: string
  lastUsedAt: number
}

let quickPanelProjects: RecentProject[] = []

function formatDevLogArg(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack ?? value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function sendToAllWindows(channel: string, payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function installDevLogForwarding() {
  if (!IS_DEV || devLogForwardingInstalled) return
  devLogForwardingInstalled = true

  const originalLog = console.log.bind(console)
  const originalError = console.error.bind(console)

  console.log = (...args: unknown[]) => {
    originalLog(...args)
    sendToAllWindows('dev:main-log', {
      level: 'log',
      args: args.map(formatDevLogArg),
    })
  }

  console.error = (...args: unknown[]) => {
    originalError(...args)
    sendToAllWindows('dev:main-log', {
      level: 'error',
      args: args.map(formatDevLogArg),
    })
  }
}

function setupExternalNavigation(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (url === window.webContents.getURL()) return
    if (!/^https?:\/\//i.test(url)) return
    event.preventDefault()
    void shell.openExternal(url)
  })
}

function focusWindow(window: BrowserWindow) {
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

function sendWhenRendererReady(window: BrowserWindow, channel: string, payload?: unknown) {
  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', () => {
      window.webContents.send(channel, payload)
    })
    return
  }

  window.webContents.send(channel, payload)
}

function createWindow(): BrowserWindow {
  const appIconPath = resolveAppIconPath()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#F5F0EB',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon: appIconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  setupExternalNavigation(win)

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function showMainWindow() {
  const window = mainWindow ?? createWindow()
  mainWindow = window
  if (process.platform === 'darwin') {
    app.show()
    app.focus({ steal: true })
  }
  focusWindow(window)
  return window
}

function createQuickPanelWindow(): BrowserWindow {
  if (quickPanelWindow && !quickPanelWindow.isDestroyed()) {
    return quickPanelWindow
  }

  quickPanelWindow = new BrowserWindow({
    width: QUICK_PANEL_WIDTH,
    height: QUICK_PANEL_HEIGHT,
    frame: false,
    show: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  setupExternalNavigation(quickPanelWindow)

  quickPanelWindow.on('closed', () => {
    quickPanelWindow = null
  })

  if (IS_DEV) {
    void quickPanelWindow.loadURL('http://localhost:5173/quick-panel.html')
  } else {
    void quickPanelWindow.loadFile(join(__dirname, '../renderer/quick-panel.html'))
  }

  return quickPanelWindow
}

function positionQuickPanel(window: BrowserWindow) {
  const activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const bounds = activeDisplay.workArea
  const width = QUICK_PANEL_WIDTH
  const height = QUICK_PANEL_HEIGHT
  const x = Math.round(bounds.x + Math.max((bounds.width - width) / 2, 0))
  const y = Math.round(bounds.y + Math.max(bounds.height - height - 40, 24))
  window.setBounds({ x, y, width, height })
}

function hideQuickPanel() {
  if (quickPanelWindow && !quickPanelWindow.isDestroyed()) {
    quickPanelWindow.hide()
  }
}

function toggleQuickPanel() {
  if (!quickPanelEnabled) return
  const window = createQuickPanelWindow()

  if (window.isVisible()) {
    window.hide()
    return
  }

  positionQuickPanel(window)
  window.show()
  window.focus()
  sendWhenRendererReady(window, 'quick-panel:show')
}

async function selectFolderFromQuickPanel(options?: { defaultPath?: string; title?: string }) {
  const panelWindow = createQuickPanelWindow()
  const restoreOnTop = panelWindow.isAlwaysOnTop()
  if (restoreOnTop) {
    panelWindow.setAlwaysOnTop(false)
  }

  try {
    const result = await dialog.showOpenDialog(panelWindow, {
      properties: ['openDirectory'],
      title: options?.title ?? '프로젝트 폴더 선택',
      defaultPath: options?.defaultPath ? resolveTargetPath(options.defaultPath) : undefined,
    })

    return result.canceled ? null : (result.filePaths[0] ?? null)
  } finally {
    if (!panelWindow.isDestroyed() && restoreOnTop) {
      panelWindow.setAlwaysOnTop(true)
      if (panelWindow.isVisible()) {
        panelWindow.focus()
      }
    }
  }
}

function normalizeAcceleratorForElectron(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  return trimmed
    .split('+')
    .map((token) => {
      const lower = token.trim().toLowerCase()
      if (lower === 'cmd') return 'Command'
      if (lower === 'ctrl') return 'Control'
      if (lower === 'alt' || lower === 'option') return process.platform === 'darwin' ? 'Option' : 'Alt'
      if (lower === 'space') return 'Space'
      if (lower === 'esc') return 'Escape'
      if (token.length === 1) return token.toUpperCase()
      return token
    })
    .join('+')
}

function registerQuickPanelShortcut() {
  if (quickPanelRegisteredAccelerator) {
    globalShortcut.unregister(quickPanelRegisteredAccelerator)
    quickPanelRegisteredAccelerator = null
  }

  if (!quickPanelEnabled) return

  const accelerator = normalizeAcceleratorForElectron(quickPanelAccelerator)
  if (!accelerator) return

  const registered = globalShortcut.register(accelerator, () => {
    toggleQuickPanel()
  })

  if (registered) {
    quickPanelRegisteredAccelerator = accelerator
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: '새 세션',
      click: () => {
        sendWhenRendererReady(showMainWindow(), 'tray:new-session')
      },
    },
    {
      label: '보이기',
      click: () => {
        showMainWindow()
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
    if (quickPanelEnabled) {
      toggleQuickPanel()
      return
    }
    showMainWindow()
  })

  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildTrayMenu())
  })

  return tray
}

function normalizeQuickPanelProjects(projects: RecentProject[]): RecentProject[] {
  const seen = new Set<string>()
  const normalized: RecentProject[] = []

  for (const project of projects) {
    const path = typeof project.path === 'string' ? project.path.trim() : ''
    if (!path || seen.has(path)) continue
    seen.add(path)
    normalized.push({
      path,
      name: typeof project.name === 'string' && project.name.trim()
        ? project.name.trim()
        : getProjectNameFromPath(path),
      lastUsedAt: Number.isFinite(project.lastUsedAt) ? project.lastUsedAt : 0,
    })
  }

  return normalized
}

app.whenReady().then(async () => {
  importShellEnvironmentVars()
  installDevLogForwarding()
  await appPersistence.initialize(app.getPath('userData'))
  scheduledTaskScheduler.setTasks(
    appPersistence.loadScheduledTasks().map(mapPersistedScheduledTaskToSyncItem),
  )

  const appIconPath = resolveAppIconPath()
  if (process.platform === 'darwin' && appIconPath) {
    const icon = nativeImage.createFromPath(appIconPath)
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }

  mainWindow = createWindow()
  createTray()
  registerQuickPanelShortcut()
  showMainWindow()
  scheduledTaskScheduler.start()
  void scheduledTaskScheduler.checkMissedRuns()

  powerMonitor.on('resume', () => {
    void scheduledTaskScheduler.checkMissedRuns()
  })
  powerMonitor.on('unlock-screen', () => {
    void scheduledTaskScheduler.checkMissedRuns()
  })

  registerFileIpcHandlers({
    getMainWindow: () => mainWindow,
    showMainWindow,
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
    getQuickPanelProjects: () => quickPanelProjects,
    setQuickPanelProjects: (projects) => {
      quickPanelProjects = projects
    },
    normalizeQuickPanelProjects,
    selectFolderFromQuickPanel,
    updateQuickPanelShortcut: (accelerator, enabled) => {
      quickPanelAccelerator = accelerator
      quickPanelEnabled = enabled
      registerQuickPanelShortcut()
    },
    hideQuickPanel,
    showMainWindow,
    sendWhenRendererReady,
  })

  registerClaudeIpcHandlers({
    fetchModelsFromApi,
    appendClaudeResponseLog,
    getUserHomePath,
    resolveTargetPath,
  })

  registerStorageIpcHandlers({
    appPersistence,
    userDataPath: app.getPath('userData'),
    scheduledTaskScheduler,
    mapPersistedScheduledTaskToSyncItem,
  })

  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
      return
    }
    win.maximize()
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
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  killAllClaudeProcesses()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  scheduledTaskScheduler.stop()
  killAllClaudeProcesses()
  globalShortcut.unregisterAll()
})
