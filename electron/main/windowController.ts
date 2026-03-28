import { app, BrowserWindow, dialog, globalShortcut, screen, shell, type Rectangle } from 'electron'
import { join } from 'path'
import type { RecentProject } from '../preload'

const QUICK_PANEL_WIDTH = 780
const QUICK_PANEL_HEIGHT = 520

type CreateWindowControllerOptions = {
  isDev: boolean
  getProjectNameFromPath: (path: string) => string
  resolveAppIconPath: () => string | undefined
  resolveTargetPath: (path: string) => string
}

export type WindowController = ReturnType<typeof createWindowController>

export function createWindowController({
  isDev,
  getProjectNameFromPath,
  resolveAppIconPath,
  resolveTargetPath,
}: CreateWindowControllerOptions) {
  let mainWindow: BrowserWindow | null = null
  let quickPanelWindow: BrowserWindow | null = null
  let quickPanelAccelerator = process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space'
  let quickPanelEnabled = true
  let quickPanelRegisteredAccelerator: string | null = null
  let quickPanelProjects: RecentProject[] = []

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

  function createWindow() {
    const appIconPath = resolveAppIconPath()
    const window = new BrowserWindow({
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

    setupExternalNavigation(window)

    window.on('closed', () => {
      if (mainWindow === window) {
        mainWindow = null
      }
    })

    if (isDev) {
      void window.loadURL('http://localhost:5173')
      window.webContents.openDevTools()
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return window
  }

  function getMainWindow() {
    return mainWindow
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

  function createQuickPanelWindow() {
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

    if (isDev) {
      void quickPanelWindow.loadURL('http://localhost:5173/quick-panel.html')
    } else {
      void quickPanelWindow.loadFile(join(__dirname, '../renderer/quick-panel.html'))
    }

    return quickPanelWindow
  }

  function getQuickPanelBounds(): Rectangle {
    const activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const bounds = activeDisplay.workArea
    const width = QUICK_PANEL_WIDTH
    const height = QUICK_PANEL_HEIGHT
    const x = Math.round(bounds.x + Math.max((bounds.width - width) / 2, 0))
    const y = Math.round(bounds.y + Math.max(bounds.height - height - 40, 24))

    return { x, y, width, height }
  }

  function positionQuickPanel(window: BrowserWindow) {
    window.setBounds(getQuickPanelBounds())
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

  function updateQuickPanelShortcut(accelerator: string, enabled: boolean) {
    quickPanelAccelerator = accelerator
    quickPanelEnabled = enabled
    registerQuickPanelShortcut()
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

  return {
    getMainWindow,
    getQuickPanelProjects: () => quickPanelProjects,
    hideQuickPanel,
    isQuickPanelEnabled: () => quickPanelEnabled,
    normalizeQuickPanelProjects,
    registerQuickPanelShortcut,
    selectFolderFromQuickPanel,
    sendWhenRendererReady,
    setQuickPanelProjects: (projects: RecentProject[]) => {
      quickPanelProjects = projects
    },
    showMainWindow,
    toggleQuickPanel,
    updateQuickPanelShortcut,
  }
}
