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
  let virtualMouseWindow: BrowserWindow | null = null
  let virtualMouseReady: Promise<void> | null = null
  let virtualMouseHideTimer: NodeJS.Timeout | null = null
  let virtualMouseCloseTimer: NodeJS.Timeout | null = null
  let virtualMouseLastPoint: { x: number; y: number } | null = null
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

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  function buildVirtualMouseHtml() {
    return [
      '<!doctype html><html><head><meta charset="utf-8" />',
      '<style>',
      'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;}',
      ':root{--accent:#80d98b;--angle:28deg;}',
      '.root{position:relative;width:100%;height:100%;}',
      '.cursor{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;transition:opacity 160ms ease;will-change:transform,opacity;}',
      '.cursor.visible{opacity:1;}',
      '.pointer{position:absolute;left:-2px;top:-1px;width:31px;height:36px;transform:rotate(var(--angle));transform-origin:6px 5px;filter:drop-shadow(0 10px 16px rgba(0,0,0,.46));transition:transform 90ms linear;}',
      '.pointer svg{display:block;width:100%;height:100%;}',
      '.pointer path{fill:#fff8ea;stroke:#17130d;stroke-width:1.28;stroke-linejoin:round;}',
      '.badge{position:absolute;left:30px;top:19px;max-width:190px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(18,20,24,.84);color:#fff8ea;padding:6px 10px;font-size:12px;font-weight:740;letter-spacing:0;line-height:1;white-space:nowrap;box-shadow:0 12px 28px rgba(0,0,0,.30);backdrop-filter:blur(8px);}',
      '.dot{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:999px;background:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 24%,transparent);}',
      '.ring{position:absolute;left:-15px;top:-15px;width:42px;height:42px;border-radius:999px;border:2px solid var(--accent);opacity:0;transform:scale(.35);pointer-events:none;}',
      '.target{position:absolute;left:-18px;top:-18px;width:46px;height:46px;border-radius:999px;border:1px dashed color-mix(in srgb,var(--accent) 72%,transparent);opacity:.58;transform:scale(.82);animation:targetBreath 1450ms ease-in-out infinite;}',
      '.typing .target{border-radius:10px;width:9px;height:38px;left:5px;top:-13px;border:0;background:var(--accent);opacity:.92;animation:caretBlink 850ms steps(2,end) infinite;}',
      '.clicking .ring{animation:clickRing 520ms ease-out 1;}',
      '.clicking .pointer{animation:press 180ms ease-out 1;}',
      '.done .target{border-style:solid;opacity:.82;}',
      '.failed{--accent:#ff6b6b;}',
      '.danger{--accent:#ffb454;}',
      '.typing{--accent:#62c4ff;}',
      '.clicking{--accent:#f5b94e;}',
      '@keyframes targetBreath{0%,100%{transform:scale(.82);opacity:.38}50%{transform:scale(1.02);opacity:.68}}',
      '@keyframes caretBlink{0%,49%{opacity:.94}50%,100%{opacity:.18}}',
      '@keyframes clickRing{0%{transform:scale(.35);opacity:.95}100%{transform:scale(1.72);opacity:0}}',
      '@keyframes press{0%,100%{transform:rotate(var(--angle)) scale(1)}50%{transform:rotate(var(--angle)) scale(.88)}}',
      '</style></head><body>',
      '<div class="root"><div id="cursor" class="cursor"><div class="target"></div><div class="ring"></div><div id="pointer" class="pointer"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M4.6 2.7l14.8 9.7-7.05 1.72-3.62 6.72L4.6 2.7z"/></svg></div><div class="badge"><span class="dot"></span><span id="label">조작</span></div></div></div>',
      '<script>',
      '(() => {',
      'const cursor = document.getElementById("cursor");',
      'const label = document.getElementById("label");',
      'let current = null;',
      'let raf = 0;',
      'let arcSign = 1;',
      'const clamp = (value,min,max) => Math.min(max, Math.max(min, value));',
      'const ease = (t) => 1 - Math.pow(1 - t, 3);',
      'const modeClass = (mode) => ["moving","clicking","typing","waiting","danger","done","failed","idle"].includes(mode) ? mode : "moving";',
      'const setPosition = (point, angle) => {',
      '  cursor.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;',
      '  cursor.style.setProperty("--angle", `${angle}deg`);',
      '};',
      'const animateTo = (target, mode) => {',
      '  const start = current ?? target;',
      '  const dx = target.x - start.x;',
      '  const dy = target.y - start.y;',
      '  const distance = Math.hypot(dx, dy);',
      '  const duration = clamp(distance * 1.15, 220, mode === "clicking" ? 560 : 920);',
      '  const normal = distance > 0 ? { x: -dy / distance, y: dx / distance } : { x: 0, y: 0 };',
      '  const arc = clamp(distance * 0.16, 14, 92) * arcSign;',
      '  arcSign *= -1;',
      '  const control = { x: (start.x + target.x) / 2 + normal.x * arc, y: (start.y + target.y) / 2 + normal.y * arc };',
      '  const initialAngle = current ? Math.atan2(dy, dx) * 180 / Math.PI + 35 : 28;',
      '  let previous = start;',
      '  const began = performance.now();',
      '  cancelAnimationFrame(raf);',
      '  const tick = (now) => {',
      '    const t = duration <= 0 ? 1 : clamp((now - began) / duration, 0, 1);',
      '    const e = ease(t);',
      '    const one = 1 - e;',
      '    const point = {',
      '      x: one * one * start.x + 2 * one * e * control.x + e * e * target.x,',
      '      y: one * one * start.y + 2 * one * e * control.y + e * e * target.y,',
      '    };',
      '    const stepAngle = Math.hypot(point.x - previous.x, point.y - previous.y) > 0.2',
      '      ? Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI + 35',
      '      : initialAngle;',
      '    setPosition(point, stepAngle);',
      '    previous = point;',
      '    if (t < 1) raf = requestAnimationFrame(tick);',
      '    else current = target;',
      '  };',
      '  raf = requestAnimationFrame(tick);',
      '};',
      'window.CittoVirtualCursor = {',
      '  update(payload) {',
      '    const mode = modeClass(payload.mode);',
      '    const x = Number(payload.x);',
      '    const y = Number(payload.y);',
      '    if (!Number.isFinite(x) || !Number.isFinite(y) || payload.visible === false) { this.hide(); return; }',
      '    cursor.className = `cursor visible ${mode}`;',
      '    label.textContent = String(payload.label || "조작").slice(0, 28);',
      '    animateTo({ x, y }, mode);',
      '  },',
      '  hide() {',
      '    cursor.classList.remove("visible");',
      '    cancelAnimationFrame(raf);',
      '  }',
      '};',
      '})();',
      '</script>',
      '</body></html>',
    ].join('')
  }

  function getVirtualMouseOverlayBounds() {
    const displays = screen.getAllDisplays()
    const bounds = displays.map((display) => display.bounds)
    const minX = Math.min(...bounds.map((item) => item.x))
    const minY = Math.min(...bounds.map((item) => item.y))
    const maxX = Math.max(...bounds.map((item) => item.x + item.width))
    const maxY = Math.max(...bounds.map((item) => item.y + item.height))
    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    }
  }

  function createVirtualMouseWindow() {
    const overlayBounds = getVirtualMouseOverlayBounds()
    const window = new BrowserWindow({
      ...overlayBounds,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      focusable: false,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      title: 'Citto Visual Cursor',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    window.setIgnoreMouseEvents(true, { forward: true })
    window.setAlwaysOnTop(true, 'screen-saver')
    window.on('closed', () => {
      if (virtualMouseWindow === window) virtualMouseWindow = null
      virtualMouseReady = null
      if (virtualMouseHideTimer) {
        clearTimeout(virtualMouseHideTimer)
        virtualMouseHideTimer = null
      }
      if (virtualMouseCloseTimer) {
        clearTimeout(virtualMouseCloseTimer)
        virtualMouseCloseTimer = null
      }
    })
    virtualMouseReady = window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildVirtualMouseHtml())}`)
      .catch((error) => {
        console.warn('[window-controller] failed to load virtual cursor overlay', error)
        if (virtualMouseWindow === window) virtualMouseReady = null
      })
    return window
  }

  function clearVirtualMouseTimers() {
    if (virtualMouseHideTimer) {
      clearTimeout(virtualMouseHideTimer)
      virtualMouseHideTimer = null
    }
    if (virtualMouseCloseTimer) {
      clearTimeout(virtualMouseCloseTimer)
      virtualMouseCloseTimer = null
    }
  }

  function getVirtualMouseHideDelay(mode: string): number | null {
    if (mode === 'done') return 5200
    if (mode === 'failed') return 8000
    if (mode === 'idle') return 5200
    return null
  }

  function hideVirtualMouseOverlay() {
    clearVirtualMouseTimers()
    const window = virtualMouseWindow
    if (!window || window.isDestroyed()) return
    const ready = virtualMouseReady ?? Promise.resolve()
    void ready.then(() => {
      if (window.isDestroyed()) return
      void window.webContents.executeJavaScript('window.CittoVirtualCursor?.hide();', true)
      virtualMouseCloseTimer = setTimeout(() => {
        virtualMouseCloseTimer = null
        if (!window.isDestroyed()) window.hide()
      }, 220)
    })
  }

  function readFiniteNumber(value: unknown): number | null {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : null
  }

  function resolveVirtualMousePoint(screenRecord: Record<string, unknown>, cursorRecord: Record<string, unknown>) {
    const screenX = readFiniteNumber(screenRecord.x)
    const screenY = readFiniteNumber(screenRecord.y)
    if (screenX !== null && screenY !== null) return { x: screenX, y: screenY }

    const cursorX = readFiniteNumber(cursorRecord.x)
    const cursorY = readFiniteNumber(cursorRecord.y)
    if (cursorX === null || cursorY === null) return virtualMouseLastPoint

    const display = screen.getPrimaryDisplay()
    return {
      x: display.bounds.x + display.bounds.width * Math.min(100, Math.max(0, cursorX)) / 100,
      y: display.bounds.y + display.bounds.height * Math.min(100, Math.max(0, cursorY)) / 100,
    }
  }

  function showVirtualMouseOverlay(event: unknown) {
    const record = isRecord(event) ? event : {}
    const screenRecord = isRecord(record.screen) ? record.screen : {}
    const cursorRecord = isRecord(record.cursor) ? record.cursor : {}
    if (cursorRecord.visible === false) {
      hideVirtualMouseOverlay()
      return
    }
    const point = resolveVirtualMousePoint(screenRecord, cursorRecord)
    if (!point) return
    virtualMouseLastPoint = point

    const window = virtualMouseWindow && !virtualMouseWindow.isDestroyed()
      ? virtualMouseWindow
      : createVirtualMouseWindow()
    virtualMouseWindow = window

    const label = typeof cursorRecord.label === 'string' && cursorRecord.label.trim()
      ? cursorRecord.label.trim()
      : '조작'
    const mode = typeof cursorRecord.mode === 'string' ? cursorRecord.mode : 'moving'
    const overlayBounds = getVirtualMouseOverlayBounds()
    const windowBounds = window.getBounds()
    if (
      windowBounds.x !== overlayBounds.x
      || windowBounds.y !== overlayBounds.y
      || windowBounds.width !== overlayBounds.width
      || windowBounds.height !== overlayBounds.height
    ) {
      window.setBounds(overlayBounds)
    }

    const payload = {
      visible: true,
      x: point.x - overlayBounds.x,
      y: point.y - overlayBounds.y,
      label,
      mode,
    }
    const script = `window.CittoVirtualCursor?.update(${JSON.stringify(payload)});`
    const ready = virtualMouseReady ?? Promise.resolve()
    clearVirtualMouseTimers()
    void ready.then(() => {
      if (window.isDestroyed()) return
      window.showInactive()
      void window.webContents.executeJavaScript(script, true)
    })
    const hideDelay = getVirtualMouseHideDelay(mode)
    if (hideDelay !== null) {
      virtualMouseHideTimer = setTimeout(() => {
        virtualMouseHideTimer = null
        if (window.isDestroyed()) return
        void window.webContents.executeJavaScript('window.CittoVirtualCursor?.hide();', true)
        virtualMouseCloseTimer = setTimeout(() => {
          virtualMouseCloseTimer = null
          if (!window.isDestroyed()) window.hide()
        }, 220)
      }, hideDelay)
    }
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
    showVirtualMouseOverlay,
    showMainWindow,
    showSecretaryFloatingWindow,
    toggleSecretaryPanel,
    updateSecretaryShortcut,
  }
}
