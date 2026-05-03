import { app, BrowserWindow, globalShortcut, screen, shell } from 'electron'
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
  let secretaryFloatingWindow: BrowserWindow | null = null
  let secretaryAccelerator = process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space'
  let secretaryEnabled = true
  let secretaryPanelOpen = false
  let secretaryFloatingExpanded = false
  let secretaryFloatingAnchor: { x: number; y: number } | null = null
  let secretaryFloatingPlacement: SecretaryFloatingPlacement = { horizontal: 'left', vertical: 'top' }
  let secretaryRegisteredAccelerator: string | null = null
  let secretaryFloatingResizeTimer: NodeJS.Timeout | null = null

  const secretaryCharacterSlotSize = 96
  const secretaryFloatingGap = 6
  const secretaryCollapsedContentSize = { width: 306, height: 86 }
  const secretaryExpandedContentSize = { width: 448, height: 558 }
  const secretaryCollapsedSize = {
    width: Math.max(secretaryCollapsedContentSize.width, secretaryCharacterSlotSize),
    height: secretaryCollapsedContentSize.height + secretaryCharacterSlotSize + secretaryFloatingGap,
  }
  const secretaryExpandedSize = {
    width: Math.max(secretaryExpandedContentSize.width, secretaryCharacterSlotSize),
    height: secretaryExpandedContentSize.height + secretaryCharacterSlotSize + secretaryFloatingGap,
  }

  type SecretaryFloatingPlacement = {
    horizontal: 'left' | 'right'
    vertical: 'top' | 'bottom'
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

  function getSecretaryFloatingSize() {
    return secretaryFloatingExpanded ? secretaryExpandedSize : secretaryCollapsedSize
  }

  function getDefaultSecretaryFloatingAnchor(display = screen.getPrimaryDisplay()) {
    const { workArea } = display
    const margin = 18

    return {
      x: workArea.x + workArea.width - margin - secretaryCharacterSlotSize / 2,
      y: workArea.y + workArea.height - margin - secretaryCharacterSlotSize / 2,
    }
  }

  function clampSecretaryFloatingAnchor(anchor: { x: number; y: number }, display = screen.getDisplayNearestPoint(anchor)) {
    const { workArea } = display
    const inset = secretaryCharacterSlotSize / 2
    const minX = workArea.x + inset
    const maxX = workArea.x + workArea.width - inset
    const minY = workArea.y + inset
    const maxY = workArea.y + workArea.height - inset

    return {
      x: Math.min(Math.max(anchor.x, minX), maxX),
      y: Math.min(Math.max(anchor.y, minY), maxY),
    }
  }

  function resolveSecretaryFloatingPlacement(anchor: { x: number; y: number }, display = screen.getDisplayNearestPoint(anchor)): SecretaryFloatingPlacement {
    const { workArea } = display
    const middleX = workArea.x + workArea.width / 2
    const middleY = workArea.y + workArea.height / 2

    return {
      horizontal: anchor.x < middleX ? 'right' : 'left',
      vertical: anchor.y < middleY ? 'bottom' : 'top',
    }
  }

  function getSecretaryFloatingBoundsForAnchor(
    anchor: { x: number; y: number },
    placement: SecretaryFloatingPlacement,
  ) {
    const size = getSecretaryFloatingSize()
    const characterCenterOffset = secretaryCharacterSlotSize / 2

    return {
      x: placement.horizontal === 'left'
        ? Math.round(anchor.x - size.width + characterCenterOffset)
        : Math.round(anchor.x - characterCenterOffset),
      y: placement.vertical === 'top'
        ? Math.round(anchor.y - size.height + characterCenterOffset)
        : Math.round(anchor.y - characterCenterOffset),
      width: size.width,
      height: size.height,
    }
  }

  function clampSecretaryFloatingBounds(bounds: Electron.Rectangle, display = screen.getDisplayMatching(bounds)) {
    const { workArea } = display
    const maxX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width)
    const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height)

    return {
      ...bounds,
      x: Math.min(Math.max(bounds.x, workArea.x), maxX),
      y: Math.min(Math.max(bounds.y, workArea.y), maxY),
    }
  }

  function setSecretaryFloatingBounds(window: BrowserWindow, bounds: Electron.Rectangle, display = screen.getDisplayMatching(bounds)) {
    window.setBounds(clampSecretaryFloatingBounds(bounds, display))
  }

  function sendSecretaryFloatingPlacement(window: BrowserWindow) {
    sendWhenRendererReady(window, 'secretary:floating-placement', secretaryFloatingPlacement)
  }

  function layoutSecretaryFloatingWindow(window: BrowserWindow) {
    const currentAnchor = secretaryFloatingAnchor ?? getDefaultSecretaryFloatingAnchor()
    const display = screen.getDisplayNearestPoint(currentAnchor)
    const anchor = clampSecretaryFloatingAnchor(currentAnchor, display)
    const placement = resolveSecretaryFloatingPlacement(anchor, display)

    secretaryFloatingAnchor = anchor
    secretaryFloatingPlacement = placement
    setSecretaryFloatingBounds(window, getSecretaryFloatingBoundsForAnchor(anchor, placement), display)
    sendSecretaryFloatingPlacement(window)
  }

  function moveSecretaryFloatingBy(deltaX: number, deltaY: number) {
    const window = secretaryFloatingWindow
    if (!window || window.isDestroyed()) return
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return
    const roundedDeltaX = Math.round(deltaX)
    const roundedDeltaY = Math.round(deltaY)
    if (roundedDeltaX === 0 && roundedDeltaY === 0) return

    const anchor = secretaryFloatingAnchor ?? getDefaultSecretaryFloatingAnchor()
    secretaryFloatingAnchor = {
      x: anchor.x + roundedDeltaX,
      y: anchor.y + roundedDeltaY,
    }
    layoutSecretaryFloatingWindow(window)
  }

  function createSecretaryFloatingWindow() {
    const appIconPath = resolveAppIconPath()
    const size = getSecretaryFloatingSize()
    const window = new BrowserWindow({
      width: size.width,
      height: size.height,
      minWidth: 280,
      minHeight: 110,
      maxWidth: 640,
      maxHeight: 760,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      acceptFirstMouse: true,
      resizable: true,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      title: 'Citto Secretary',
      icon: appIconPath,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    setupExternalNavigation(window)
    window.setAlwaysOnTop(true, 'floating')
    window.setMovable(false)
    window.setIgnoreMouseEvents(false)
    layoutSecretaryFloatingWindow(window)

    window.on('closed', () => {
      if (secretaryFloatingResizeTimer) {
        clearTimeout(secretaryFloatingResizeTimer)
        secretaryFloatingResizeTimer = null
      }
      if (secretaryFloatingWindow === window) {
        secretaryFloatingWindow = null
        secretaryPanelOpen = false
      }
    })

    if (isDev) {
      void window.loadURL('http://localhost:5173/secretary-panel.html')
    } else {
      void window.loadFile(join(__dirname, '../renderer/secretary-panel.html'))
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

  function getSecretaryFloatingWindow() {
    return secretaryFloatingWindow
  }

  function showSecretaryFloatingWindow() {
    secretaryFloatingExpanded = false
    const window = secretaryFloatingWindow ?? createSecretaryFloatingWindow()
    secretaryFloatingWindow = window
    window.setIgnoreMouseEvents(false)
    window.setMovable(false)
    layoutSecretaryFloatingWindow(window)
    window.show()
    window.focus()
    secretaryPanelOpen = true
    sendWhenRendererReady(window, 'secretary:panel-toggle', true)
    return window
  }

  function hideSecretaryFloatingWindow() {
    secretaryFloatingExpanded = false
    if (!secretaryFloatingWindow) {
      secretaryPanelOpen = false
      return
    }
    secretaryFloatingWindow.hide()
    secretaryPanelOpen = false
    sendWhenRendererReady(secretaryFloatingWindow, 'secretary:panel-toggle', false)
  }

  function setSecretaryFloatingExpanded(expanded: boolean) {
    const wasExpanded = secretaryFloatingExpanded
    secretaryFloatingExpanded = expanded
    const window = secretaryFloatingWindow
    if (!window || window.isDestroyed()) return
    if (secretaryFloatingResizeTimer) {
      clearTimeout(secretaryFloatingResizeTimer)
      secretaryFloatingResizeTimer = null
    }

    const applyResize = () => {
      if (window.isDestroyed()) return
      window.setIgnoreMouseEvents(false)
      window.setMovable(false)
      layoutSecretaryFloatingWindow(window)
      window.show()
      window.focus()
      window.moveTop()
    }

    if (expanded && !wasExpanded) {
      secretaryFloatingResizeTimer = setTimeout(() => {
        secretaryFloatingResizeTimer = null
        applyResize()
      }, 120)
      return
    }

    applyResize()
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
    if (open) {
      showSecretaryFloatingWindow()
      return
    }
    hideSecretaryFloatingWindow()
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
    getSecretaryFloatingWindow,
    getSecretaryPanelOpen,
    isSecretaryEnabled: () => secretaryEnabled,
    moveSecretaryFloatingBy,
    registerSecretaryShortcut,
    sendWhenRendererReady,
    setSecretaryFloatingExpanded,
    setSecretaryPanelOpen,
    showMainWindow,
    showSecretaryFloatingWindow,
    toggleSecretaryPanel,
    updateSecretaryShortcut,
  }
}
