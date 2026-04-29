import { app, BrowserWindow, globalShortcut, shell } from 'electron'
import { join } from 'path'

type CreateWindowControllerOptions = {
  isDev: boolean
  resolveAppIconPath: () => string | undefined
}

export type WindowController = ReturnType<typeof createWindowController>

export function createWindowController({
  isDev,
  resolveAppIconPath,
}: CreateWindowControllerOptions) {
  let mainWindow: BrowserWindow | null = null
  let secretaryAccelerator = process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space'
  let secretaryEnabled = true
  let secretaryPanelOpen = false
  let secretaryRegisteredAccelerator: string | null = null

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
        secretaryPanelOpen = false
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

  function emitSecretaryPanelToggle(open: boolean) {
    secretaryPanelOpen = open
    const window = showMainWindow()
    sendWhenRendererReady(window, 'secretary:panel-toggle', secretaryPanelOpen)
  }

  function setSecretaryPanelOpen(open: boolean) {
    if (secretaryPanelOpen === open) return
    emitSecretaryPanelToggle(open)
  }

  function getSecretaryPanelOpen() {
    return secretaryPanelOpen
  }

  function toggleSecretaryPanel() {
    if (!secretaryEnabled) return
    emitSecretaryPanelToggle(!secretaryPanelOpen)
  }

  function registerSecretaryShortcut() {
    if (secretaryRegisteredAccelerator) {
      globalShortcut.unregister(secretaryRegisteredAccelerator)
      secretaryRegisteredAccelerator = null
    }

    if (!secretaryEnabled) return

    const accelerator = normalizeAcceleratorForElectron(secretaryAccelerator)
    if (!accelerator) return

    const registered = globalShortcut.register(accelerator, () => {
      toggleSecretaryPanel()
    })

    if (registered) {
      secretaryRegisteredAccelerator = accelerator
    }
  }

  function updateSecretaryShortcut(accelerator: string, enabled: boolean) {
    secretaryAccelerator = accelerator
    secretaryEnabled = enabled
    registerSecretaryShortcut()
  }

  return {
    getMainWindow,
    getSecretaryPanelOpen,
    isSecretaryEnabled: () => secretaryEnabled,
    registerSecretaryShortcut,
    sendWhenRendererReady,
    setSecretaryPanelOpen,
    showMainWindow,
    toggleSecretaryPanel,
    updateSecretaryShortcut,
  }
}
