import { execFile, spawn } from 'child_process'
import { existsSync, realpathSync } from 'fs'
import { delimiter, dirname, join } from 'path'
import { homedir } from 'os'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const CUA_MCP_SERVER_NAME = 'cua-computer-use'
const ACCESSIBILITY_MCP_SERVER_NAME = 'citto-accessibility-use'
const VISUAL_MCP_SERVER_NAME = 'citto-visual-use'
const CUA_ALLOWED_TOOL_NAMES = [
  'check_permissions',
  'click',
  'double_click',
  'drag',
  'get_cursor_position',
  'get_screen_size',
  'get_window_state',
  'hotkey',
  'launch_app',
  'list_apps',
  'list_windows',
  'move_cursor',
  'press_key',
  'right_click',
  'screenshot',
  'scroll',
  'set_value',
  'type_text',
  'zoom',
] as const
const VISUAL_ALLOWED_TOOL_NAMES = [
  'activate_app',
  'capture_window_ocr',
  'click_window',
  'double_click_window',
  'hotkey',
  'launch_app',
  'list_apps',
  'list_windows',
  'press_key',
  'type_text',
] as const
const ACCESSIBILITY_ALLOWED_TOOL_NAMES = [
  'activate_app',
  'find_ui_targets',
  'get_ui_tree',
  'list_apps',
  'perform_ui_action',
  'verify_ui_state',
] as const
const CUA_DRIVER_INSTALL_COMMAND =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"'
const CUA_DRIVER_MCP_ARGS = ['mcp', '--claude-code-computer-use-compat'] as const
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000
const INSTALL_READY_TIMEOUT_MS = 2 * 60 * 1000
const INSTALL_READY_POLL_MS = 500
const DAEMON_START_TIMEOUT_MS = 8000
const DAEMON_STATUS_POLL_MS = 250

type ComputerUseStatus = {
  available: boolean
  provider: 'cua-driver' | 'citto-accessibility-use' | 'citto-visual-use'
  command: string | null
  detail: string
  setupCommand: string
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function expandHomePath(path: string): string {
  return path.replace(/^~(?=$|\/)/, homedir())
}

function getPathCandidates(): string[] {
  const envPath = typeof process.env.CUA_DRIVER_PATH === 'string'
    ? process.env.CUA_DRIVER_PATH.trim()
    : ''
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : ''
  const bundledCandidates = resourcesPath
    ? [
        join(resourcesPath, 'cua-driver', 'cua-driver'),
        join(resourcesPath, 'CuaDriver.app', 'Contents', 'MacOS', 'cua-driver'),
        join(resourcesPath, 'CuaDriver.app', 'Contents', 'MacOS', 'CuaDriver'),
      ]
    : []
  const pathEntries = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((entry) => `${entry}/cua-driver`)

  return unique([
    envPath,
    '~/.local/bin/cua-driver',
    '/usr/local/bin/cua-driver',
    '/opt/homebrew/bin/cua-driver',
    ...bundledCandidates,
    ...pathEntries,
  ]).map(expandHomePath)
}

function resolveExistingCuaDriverPath(): string | null {
  if (process.platform !== 'darwin') return null
  return getPathCandidates().find((candidate) => existsSync(candidate)) ?? null
}

function resolveRealPath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isCuaDriverInstallReady(command: string): boolean {
  if (!existsSync(command)) return false
  const realCommand = resolveRealPath(command)
  if (!existsSync(realCommand)) return false

  const appBundlePath = getCuaDriverAppBundlePath(command)
  if (!appBundlePath) return true

  return existsSync(join(appBundlePath, 'Contents', 'Info.plist'))
    && existsSync(join(appBundlePath, 'Contents', 'MacOS'))
    && existsSync(realCommand)
}

function resolveReadyCuaDriverPath(): string | null {
  if (process.platform !== 'darwin') return null
  return getPathCandidates().find((candidate) => isCuaDriverInstallReady(candidate)) ?? null
}

async function waitForCuaDriverInstallReady(): Promise<string | null> {
  const deadline = Date.now() + INSTALL_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const readyCommand = resolveReadyCuaDriverPath()
    if (readyCommand) return readyCommand
    await sleep(INSTALL_READY_POLL_MS)
  }
  return resolveReadyCuaDriverPath()
}

async function runCuaDriver(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync(command, args, {
    timeout: 5000,
    windowsHide: true,
    env: {
      ...process.env,
      CUA_DRIVER_TELEMETRY_ENABLED: process.env.CUA_DRIVER_TELEMETRY_ENABLED ?? '0',
    },
  })
}

async function isCuaDriverDaemonRunning(command: string): Promise<boolean> {
  try {
    const result = await runCuaDriver(command, ['status'])
    return /daemon is running/i.test(`${result.stdout}\n${result.stderr}`)
  } catch {
    return false
  }
}

async function waitForCuaDriverDaemon(command: string): Promise<void> {
  const deadline = Date.now() + DAEMON_START_TIMEOUT_MS
  let lastError: Error | null = null

  while (Date.now() < deadline) {
    try {
      if (await isCuaDriverDaemonRunning(command)) return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
    await sleep(DAEMON_STATUS_POLL_MS)
  }

  throw lastError ?? new Error('Cua Driver daemon did not report running before timeout.')
}

function spawnCuaDriverDaemon(command: string): void {
  const child = spawn(command, ['serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      CUA_DRIVER_TELEMETRY_ENABLED: process.env.CUA_DRIVER_TELEMETRY_ENABLED ?? '0',
      CUA_DRIVER_NO_RELAUNCH: process.env.CUA_DRIVER_NO_RELAUNCH ?? '1',
    },
  })
  child.unref()
}

async function startCuaDriverDaemon(command: string): Promise<void> {
  if (await isCuaDriverDaemonRunning(command)) return

  const appBundlePath = getCuaDriverAppBundlePath(command)
  if (appBundlePath) {
    await execFileAsync('open', ['-n', '-g', appBundlePath, '--args', 'serve'], {
      timeout: 5000,
      windowsHide: true,
    })
  } else {
    spawnCuaDriverDaemon(command)
  }
  await waitForCuaDriverDaemon(command)
}

async function requestCuaDriverPermissions(command: string): Promise<void> {
  try {
    await runCuaDriver(command, ['check_permissions'])
  } catch {
    // Permission prompts are best-effort. The execution policy also checks
    // permissions before driving any app and reports missing grants.
  }
}

function getCuaDriverAppBundlePath(command: string): string | null {
  const pathsToCheck = unique([command, resolveRealPath(command)])
  for (const path of pathsToCheck) {
    let current = dirname(path)
    for (let index = 0; index < 6; index += 1) {
      if (current.endsWith('CuaDriver.app')) return current
      const next = dirname(current)
      if (next === current) break
      current = next
    }
  }
  return null
}

async function runInstaller(): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync('/bin/bash', [
    '-c',
    'set -euo pipefail; curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh | /bin/bash',
  ], {
    timeout: INSTALL_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      CUA_DRIVER_TELEMETRY_ENABLED: process.env.CUA_DRIVER_TELEMETRY_ENABLED ?? '0',
    },
  })
}

function createUnavailableStatus(detail: string): ComputerUseStatus {
  return {
    available: false,
    provider: 'cua-driver',
    command: null,
    detail,
    setupCommand: CUA_DRIVER_INSTALL_COMMAND,
  }
}

function createAvailableStatus(command: string): ComputerUseStatus {
  return {
    available: true,
    provider: 'cua-driver',
    command,
    detail: `Cua Driver가 설치되어 있습니다: ${command}`,
    setupCommand: CUA_DRIVER_INSTALL_COMMAND,
  }
}

function isNativeVisualMode(): boolean {
  const driver = (process.env.CITTO_VISUAL_USE_DRIVER ?? 'native').trim().toLowerCase()
  return driver !== 'cua' && driver !== 'cua-driver'
}

function createNativeAvailableStatus(): ComputerUseStatus {
  return {
    available: true,
    provider: 'citto-accessibility-use',
    command: null,
    detail: 'citto-accessibility-use native 모드가 활성화되어 있습니다. AX element action을 우선 사용하고 citto-visual-use OCR/좌표 입력은 fallback으로 유지합니다.',
    setupCommand: CUA_DRIVER_INSTALL_COMMAND,
  }
}

function resolveAccessibilityMcpServerPath(): string {
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : ''
  const packagedPath = resourcesPath ? join(resourcesPath, 'mcp', 'cittoAccessibilityMcpServer.mjs') : ''
  if (packagedPath && existsSync(packagedPath)) return packagedPath

  const devPath = join(process.cwd(), 'electron', 'services', 'cittoAccessibilityMcpServer.mjs')
  if (existsSync(devPath)) return devPath

  return packagedPath || devPath
}

function resolveVisualMcpServerPath(): string {
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : ''
  const packagedPath = resourcesPath ? join(resourcesPath, 'mcp', 'cittoVisualMcpServer.mjs') : ''
  if (packagedPath && existsSync(packagedPath)) return packagedPath

  const devPath = join(process.cwd(), 'electron', 'services', 'cittoVisualMcpServer.mjs')
  if (existsSync(devPath)) return devPath

  return packagedPath || devPath
}

function buildMcpConfig(command: string | null): Record<string, unknown> {
  const accessibilityMcpServerPath = resolveAccessibilityMcpServerPath()
  const visualMcpServerPath = resolveVisualMcpServerPath()
  const nodeServerEnv = {
    CUA_DRIVER_TELEMETRY_ENABLED: process.env.CUA_DRIVER_TELEMETRY_ENABLED ?? '0',
    ELECTRON_RUN_AS_NODE: '1',
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin',
  }
  const accessibilityServer = {
    command: process.execPath,
    args: [accessibilityMcpServerPath],
    env: nodeServerEnv,
  }
  const visualServer = {
    command: process.execPath,
    args: [visualMcpServerPath],
    env: {
      ...(command ? { CUA_DRIVER_COMMAND: command } : {}),
      CITTO_VISUAL_USE_DRIVER: isNativeVisualMode() ? 'native' : 'cua',
      ...nodeServerEnv,
    },
  }

  if (isNativeVisualMode()) {
    return {
      mcpServers: {
        [ACCESSIBILITY_MCP_SERVER_NAME]: accessibilityServer,
        [VISUAL_MCP_SERVER_NAME]: visualServer,
      },
    }
  }

  return {
    mcpServers: {
      [CUA_MCP_SERVER_NAME]: {
        command,
        args: [...CUA_DRIVER_MCP_ARGS],
        env: {
          CUA_DRIVER_TELEMETRY_ENABLED: process.env.CUA_DRIVER_TELEMETRY_ENABLED ?? '0',
        },
      },
      [ACCESSIBILITY_MCP_SERVER_NAME]: accessibilityServer,
      [VISUAL_MCP_SERVER_NAME]: visualServer,
    },
  }
}

export function createComputerUseMcpService() {
  let resolvedCommand: string | null = null
  let startupError: string | null = null
  let installPromise: Promise<ComputerUseStatus> | null = null

  const refreshStatus = (): ComputerUseStatus => {
    if (process.platform !== 'darwin') {
      return createUnavailableStatus('Cua Driver 기반 computer-use는 현재 macOS 14 이상에서만 사용할 수 있습니다.')
    }
    if (isNativeVisualMode()) return createNativeAvailableStatus()

    const command = resolvedCommand && isCuaDriverInstallReady(resolvedCommand)
      ? resolvedCommand
      : resolveReadyCuaDriverPath()
    resolvedCommand = command
    if (!command) {
      if (resolveExistingCuaDriverPath()) {
        return createUnavailableStatus('Cua Driver 설치가 아직 완료되지 않았습니다. 설치가 끝난 뒤 다시 시도해 주세요.')
      }
      return createUnavailableStatus(
        `Cua Driver가 설치되어 있지 않습니다. 설치 명령: ${CUA_DRIVER_INSTALL_COMMAND}`,
      )
    }

    if (startupError) {
      return {
        ...createAvailableStatus(command),
        detail: `Cua Driver는 설치되어 있지만 daemon 시작 확인에 실패했습니다: ${startupError}`,
      }
    }

    return createAvailableStatus(command)
  }

  return {
    async start(): Promise<void> {
      if (process.platform !== 'darwin') return
      if (isNativeVisualMode()) return
      resolvedCommand = resolveReadyCuaDriverPath()
      if (!resolvedCommand) {
        const detail = resolveExistingCuaDriverPath()
          ? 'Cua Driver installation exists but is not ready yet.'
          : `Cua Driver not found. Install with: ${CUA_DRIVER_INSTALL_COMMAND}`
        console.warn(`[computer-use-mcp] ${detail}`)
        return
      }

      try {
        await startCuaDriverDaemon(resolvedCommand)
        startupError = null
      } catch (error) {
        startupError = error instanceof Error ? error.message : String(error)
        console.warn('[computer-use-mcp] failed to start Cua Driver daemon', error)
      }
    },
    getStatus(): ComputerUseStatus {
      return refreshStatus()
    },
    getClaudeMcpConfig(): Record<string, unknown> | null {
      const status = refreshStatus()
      if (!status.available) return null
      return buildMcpConfig(status.command)
    },
    async install(): Promise<ComputerUseStatus> {
      if (process.platform !== 'darwin') {
        return createUnavailableStatus('Cua Driver 기반 computer-use는 현재 macOS 14 이상에서만 사용할 수 있습니다.')
      }
      if (isNativeVisualMode()) return createNativeAvailableStatus()
      if (installPromise) return await installPromise

      installPromise = (async () => {
        const readyCommand = resolveReadyCuaDriverPath()
        if (readyCommand) {
          resolvedCommand = readyCommand
          await startCuaDriverDaemon(readyCommand)
          startupError = null
          await requestCuaDriverPermissions(readyCommand)
          return refreshStatus()
        }

        if (resolveExistingCuaDriverPath()) {
          const completedCommand = await waitForCuaDriverInstallReady()
          if (completedCommand) {
            resolvedCommand = completedCommand
            await startCuaDriverDaemon(completedCommand)
            startupError = null
            await requestCuaDriverPermissions(completedCommand)
            return refreshStatus()
          }
        }

        await runInstaller()
        resolvedCommand = await waitForCuaDriverInstallReady()
        startupError = null
        if (!resolvedCommand) {
          return createUnavailableStatus('Cua Driver 설치가 끝났지만 cua-driver 실행 파일을 찾지 못했습니다.')
        }
        await startCuaDriverDaemon(resolvedCommand)
        startupError = null
        await requestCuaDriverPermissions(resolvedCommand)
        return refreshStatus()
      })().finally(() => {
        installPromise = null
      })

      return await installPromise
    },
    getAllowedAllTools(): string[] {
      if (isNativeVisualMode()) {
        return [
          ...ACCESSIBILITY_ALLOWED_TOOL_NAMES.map((toolName) => `mcp__${ACCESSIBILITY_MCP_SERVER_NAME}__${toolName}`),
          ...VISUAL_ALLOWED_TOOL_NAMES.map((toolName) => `mcp__${VISUAL_MCP_SERVER_NAME}__${toolName}`),
        ]
      }
      return [
        ...CUA_ALLOWED_TOOL_NAMES.map((toolName) => `mcp__${CUA_MCP_SERVER_NAME}__${toolName}`),
        ...ACCESSIBILITY_ALLOWED_TOOL_NAMES.map((toolName) => `mcp__${ACCESSIBILITY_MCP_SERVER_NAME}__${toolName}`),
        ...VISUAL_ALLOWED_TOOL_NAMES.map((toolName) => `mcp__${VISUAL_MCP_SERVER_NAME}__${toolName}`),
      ]
    },
    dispose(): void {
      // Cua Driver is a shared host daemon. Do not stop it when Citto exits,
      // because other agents may be using the same installation.
    },
  }
}
