import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Notification, Tray, Menu, globalShortcut, powerMonitor, screen } from 'electron'
import { join, dirname, extname, relative, posix } from 'path'
import { tmpdir, userInfo } from 'os'
import { spawn, spawnSync, ChildProcess, execSync } from 'child_process'
import { appendFileSync, existsSync, readFile as fsReadFile, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync, unlinkSync, rmSync } from 'fs'
import { request as httpsRequest } from 'https'
import { request as httpRequest } from 'http'
import { deflateSync } from 'zlib'

const activeProcesses = new Map<string, ChildProcess>()
const IS_DEV = process.env.NODE_ENV === 'development'
let mainWindow: BrowserWindow | null = null
let quickPanelWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quickPanelAccelerator = process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space'
let quickPanelEnabled = true
let quickPanelRegisteredAccelerator: string | null = null
let devLogForwardingInstalled = false
const streamedAssistantStateBySession = new Map<string, { sawTextDelta: boolean; sawThinkingDelta: boolean }>()

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

// 모델 캐시 (5분)
let modelsCache: { list: ModelInfo[]; fetchedAt: number; cacheKey: string } | null = null
const CACHE_TTL = 5 * 60 * 1000

export type ModelInfo = {
  id: string
  displayName: string   // e.g. "Sonnet 4.5"
  family: string        // e.g. "sonnet"
}

type OpenWithApp = {
  id: string
  label: string
  iconDataUrl?: string
  iconPath?: string
}

type MacOpenWithApp = OpenWithApp & {
  bundleIds: string[]
}

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

type SelectedFileResult = {
  name: string
  path: string
  content: string
  size: number
  fileType: 'text' | 'image'
  dataUrl?: string
}

const SHELL_IMPORTED_ENV_KEYS = new Set([
  'CLAUDE_CODE_USE_BEDROCK',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  'ANTHROPIC_AUTH_TOKEN',
  'NODE_EXTRA_CA_CERTS',
])
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'

function readEnvVar(envVars: Record<string, string> | undefined, key: string): string {
  const value = envVars?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

type ApiConfig = {
  apiKey: string
  authToken: string
  baseUrl: string
}

type GitStatusEntry = {
  path: string
  relativePath: string
  originalPath?: string | null
  statusCode: string
  stagedAdditions: number | null
  stagedDeletions: number | null
  unstagedAdditions: number | null
  unstagedDeletions: number | null
  totalAdditions: number | null
  totalDeletions: number | null
  staged: boolean
  unstaged: boolean
  untracked: boolean
  deleted: boolean
  renamed: boolean
}

type GitRepoStatus = {
  gitAvailable: boolean
  isRepo: boolean
  rootPath: string | null
  branch: string | null
  ahead: number
  behind: number
  clean: boolean
  entries: GitStatusEntry[]
}

type GitBranchInfo = {
  name: string
  current: boolean
}

type GitLogEntry = {
  hash: string
  shortHash: string
  subject: string
  author: string
  relativeDate: string
  decorations: string
  graph: string
}

type GitLogResult = {
  ok: boolean
  entries: GitLogEntry[]
  error?: string
}

type GitFileContentResult = {
  ok: boolean
  content: string
  error?: string
}

type CliHistoryEntry = {
  id: string
  filePath: string
  claudeSessionId: string | null
  cwd: string
  title: string
  preview: string
  updatedAt: number
  source: 'project' | 'transcript'
}

type ImportedCliToolCall = {
  toolUseId: string
  toolName: string
  toolInput: unknown
  fileSnapshotBefore?: string | null
  result?: unknown
  isError?: boolean
  status: 'running' | 'done' | 'error'
}

type ImportedCliMessage = {
  role: 'user' | 'assistant'
  text: string
  toolCalls: ImportedCliToolCall[]
  createdAt: number
}

type ImportedCliSession = {
  sessionId: string | null
  name: string
  cwd: string
  messages: ImportedCliMessage[]
  lastCost?: number
  model?: string | null
}

type RecentProject = {
  path: string
  name: string
  lastUsedAt: number
}

type PluginSkill = {
  name: string
  path: string
  dir: string
  pluginName: string
  pluginPath: string
}

type ScheduledTaskFrequency = 'manual' | 'hourly' | 'daily' | 'weekdays' | 'weekly'
type ScheduledTaskDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

type ScheduledTaskSyncItem = {
  id: string
  name: string
  prompt: string
  projectPath: string
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions'
  frequency: ScheduledTaskFrequency
  enabled: boolean
  hour: number
  minute: number
  weeklyDay: ScheduledTaskDay
  skipDays: ScheduledTaskDay[]
  quietHoursStart: string | null
  quietHoursEnd: string | null
  nextRunAt: number | null
}

type McpConfigScope = 'user' | 'local' | 'project'

type McpReadResult = {
  scope: McpConfigScope
  available: boolean
  targetPath: string
  projectPath: string | null
  mcpServers: Record<string, unknown>
  message?: string
}

let quickPanelProjects: RecentProject[] = []
let scheduledTasks: ScheduledTaskSyncItem[] = []
let scheduledTaskInterval: NodeJS.Timeout | null = null
let nextScheduledTaskTimeout: NodeJS.Timeout | null = null

const SCHEDULE_POLL_INTERVAL = 60 * 1000
const MISSED_RUN_LIMIT = 7 * 24 * 60 * 60 * 1000
const CATCHUP_THRESHOLD = 5 * 60 * 1000

const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-6',    displayName: 'Opus 4.6',    family: 'opus' },
  { id: 'claude-sonnet-4-6',  displayName: 'Sonnet 4.6',  family: 'sonnet' },
  { id: 'claude-opus-4-5',    displayName: 'Opus 4.5',    family: 'opus' },
  { id: 'claude-sonnet-4-5',  displayName: 'Sonnet 4.5',  family: 'sonnet' },
  { id: 'claude-haiku-4-5',   displayName: 'Haiku 4.5',   family: 'haiku' },
]

const MAC_OPEN_WITH_APPS: MacOpenWithApp[] = [
  { id: 'vscode', label: 'VS Code', bundleIds: ['com.microsoft.VSCode'] },
  { id: 'finder', label: 'Finder', bundleIds: ['com.apple.finder'] },
  { id: 'terminal', label: 'Terminal', bundleIds: ['com.apple.Terminal'] },
  { id: 'iterm2', label: 'iTerm2', bundleIds: ['com.googlecode.iterm2'] },
  { id: 'warp', label: 'Warp', bundleIds: ['dev.warp.Warp-Stable', 'dev.warp.Warp'] },
  { id: 'xcode', label: 'Xcode', bundleIds: ['com.apple.dt.Xcode'] },
  { id: 'intellij-idea', label: 'IntelliJ IDEA', bundleIds: ['com.jetbrains.intellij'] },
  { id: 'webstorm', label: 'WebStorm', bundleIds: ['com.jetbrains.WebStorm'] },
]

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {}
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeJsonObject(filePath: string, value: Record<string, unknown>) {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

function sanitizeMcpServers(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function sanitizeMcpServerConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function normalizeMcpProjectPath(cwd?: string | null): string | null {
  if (typeof cwd !== 'string') return null
  const trimmed = cwd.trim()
  if (!trimmed || trimmed === '~') return null
  const home = process.env.HOME ?? ''
  if (trimmed === '~') return home || null
  if (trimmed.startsWith('~/')) return home ? join(home, trimmed.slice(2)) : trimmed
  return trimmed
}

function getClaudeJsonPath() {
  return join(process.env.HOME ?? '', '.claude.json')
}

function listProjectPaths() {
  const root = readJsonObject(getClaudeJsonPath())
  const projects = isRecord(root.projects) ? root.projects : {}
  return Array.from(new Set(
    Object.keys(projects)
      .map((value) => normalizeMcpProjectPath(value) ?? value)
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b))
}

function readMcpServersForScope(scope: McpConfigScope, cwd?: string | null): McpReadResult {
  const claudeJsonPath = getClaudeJsonPath()
  const projectPath = normalizeMcpProjectPath(cwd)

  if (scope === 'user') {
    const root = readJsonObject(claudeJsonPath)
    return {
      scope,
      available: true,
      targetPath: claudeJsonPath,
      projectPath,
      mcpServers: sanitizeMcpServers(root.mcpServers),
    }
  }

  if (!projectPath) {
    return {
      scope,
      available: false,
      targetPath: scope === 'local' ? claudeJsonPath : '.mcp.json',
      projectPath: null,
      mcpServers: {},
      message: '현재 프로젝트 경로가 없어 이 범위를 편집할 수 없습니다.',
    }
  }

  if (scope === 'local') {
    const root = readJsonObject(claudeJsonPath)
    const projects = isRecord(root.projects) ? root.projects : {}
    const projectEntry = isRecord(projects[projectPath]) ? projects[projectPath] : {}
    return {
      scope,
      available: true,
      targetPath: claudeJsonPath,
      projectPath,
      mcpServers: sanitizeMcpServers(projectEntry.mcpServers),
    }
  }

  const projectConfigPath = join(projectPath, '.mcp.json')
  const root = readJsonObject(projectConfigPath)
  return {
    scope,
    available: true,
    targetPath: projectConfigPath,
    projectPath,
    mcpServers: sanitizeMcpServers(root.mcpServers),
  }
}

function writeMcpServersForScope(scope: McpConfigScope, cwd: string | null | undefined, mcpServers: unknown) {
  const servers = sanitizeMcpServers(mcpServers)
  const claudeJsonPath = getClaudeJsonPath()

  if (scope === 'user') {
    const root = readJsonObject(claudeJsonPath)
    writeJsonObject(claudeJsonPath, { ...root, mcpServers: servers })
    return { ok: true }
  }

  const projectPath = normalizeMcpProjectPath(cwd)
  if (!projectPath) {
    return { ok: false, error: '현재 프로젝트 경로가 없어 저장할 수 없습니다.' }
  }

  if (scope === 'local') {
    const root = readJsonObject(claudeJsonPath)
    const projects = isRecord(root.projects) ? { ...root.projects } : {}
    const currentProject = isRecord(projects[projectPath]) ? { ...projects[projectPath] } : {}
    projects[projectPath] = { ...currentProject, mcpServers: servers }
    writeJsonObject(claudeJsonPath, { ...root, projects })
    return { ok: true }
  }

  const projectConfigPath = join(projectPath, '.mcp.json')
  const root = readJsonObject(projectConfigPath)
  writeJsonObject(projectConfigPath, { ...root, mcpServers: servers })
  return { ok: true }
}

function readProjectMcpServers(projectPath: string): McpReadResult {
  return readMcpServersForScope('local', projectPath)
}

function writeProjectMcpServer(projectPath: string, name: string, config: unknown) {
  const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
  if (!normalizedProjectPath) {
    return { ok: false, error: '현재 프로젝트 경로가 없어 저장할 수 없습니다.' }
  }

  const claudeJsonPath = getClaudeJsonPath()
  const root = readJsonObject(claudeJsonPath)
  const projects = isRecord(root.projects) ? { ...root.projects } : {}
  const currentProject = isRecord(projects[normalizedProjectPath]) ? { ...projects[normalizedProjectPath] } : {}
  const currentServers = sanitizeMcpServers(currentProject.mcpServers)

  projects[normalizedProjectPath] = {
    ...currentProject,
    mcpServers: {
      ...currentServers,
      [name]: sanitizeMcpServerConfig(config),
    },
  }

  writeJsonObject(claudeJsonPath, { ...root, projects })
  return { ok: true }
}

function deleteProjectMcpServer(projectPath: string, name: string) {
  const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
  if (!normalizedProjectPath) {
    return { ok: false, error: '현재 프로젝트 경로가 없어 삭제할 수 없습니다.' }
  }

  const claudeJsonPath = getClaudeJsonPath()
  const root = readJsonObject(claudeJsonPath)
  const projects = isRecord(root.projects) ? { ...root.projects } : {}
  const currentProject = isRecord(projects[normalizedProjectPath]) ? { ...projects[normalizedProjectPath] } : {}
  const currentServers = sanitizeMcpServers(currentProject.mcpServers)
  const { [name]: _, ...rest } = currentServers

  projects[normalizedProjectPath] = {
    ...currentProject,
    mcpServers: rest,
  }

  writeJsonObject(claudeJsonPath, { ...root, projects })
  return { ok: true }
}

function readDotMcpServers(projectPath: string): McpReadResult {
  return readMcpServersForScope('project', projectPath)
}

function writeDotMcpServer(projectPath: string, name: string, config: unknown) {
  const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
  if (!normalizedProjectPath) {
    return { ok: false, error: '현재 프로젝트 경로가 없어 저장할 수 없습니다.' }
  }

  const projectConfigPath = join(normalizedProjectPath, '.mcp.json')
  const root = readJsonObject(projectConfigPath)
  const currentServers = sanitizeMcpServers(root.mcpServers)
  writeJsonObject(projectConfigPath, {
    ...root,
    mcpServers: {
      ...currentServers,
      [name]: sanitizeMcpServerConfig(config),
    },
  })
  return { ok: true }
}

function deleteDotMcpServer(projectPath: string, name: string) {
  const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
  if (!normalizedProjectPath) {
    return { ok: false, error: '현재 프로젝트 경로가 없어 삭제할 수 없습니다.' }
  }

  const projectConfigPath = join(normalizedProjectPath, '.mcp.json')
  const root = readJsonObject(projectConfigPath)
  const currentServers = sanitizeMcpServers(root.mcpServers)
  const { [name]: _, ...rest } = currentServers
  writeJsonObject(projectConfigPath, { ...root, mcpServers: rest })
  return { ok: true }
}

function resolveAppIconPath() {
  const candidates = [
    join(process.cwd(), 'build', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(dirname(app.getAppPath()), 'build', 'icon.png'),
    join(process.resourcesPath, 'build', 'icon.png'),
    join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icon.png'),
  ]

  for (const iconPath of candidates) {
    if (existsSync(iconPath)) return iconPath
  }

  return undefined
}

function resolveMacTrayTemplatePath() {
  const candidates = [
    join(process.cwd(), 'electron', 'assets', 'tray-mac-template.png'),
    join(app.getAppPath(), 'electron', 'assets', 'tray-mac-template.png'),
    join(dirname(app.getAppPath()), 'electron', 'assets', 'tray-mac-template.png'),
    join(process.resourcesPath, 'electron', 'assets', 'tray-mac-template.png'),
    join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'assets', 'tray-mac-template.png'),
  ]

  for (const assetPath of candidates) {
    if (existsSync(assetPath)) return assetPath
  }

  return undefined
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createPngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)

  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

function encodeRgbaPng(width: number, height: number, pixels: Buffer) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1)
    raw[rawOffset] = 0
    pixels.copy(raw, rawOffset + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', deflateSync(raw)),
    createPngChunk('IEND', Buffer.alloc(0)),
  ])
}

function createMacTrayImageFromAsset(assetPath: string, size: number) {
  const source = nativeImage.createFromPath(assetPath)
  if (source.isEmpty()) return null
  const image = source.resize({
    width: size,
    height: size,
    quality: 'best',
  })

  if (image.isEmpty()) return null
  return image
}

function createBurstTrayPixels(size: number, color: [number, number, number, number]) {
  const pixels = Buffer.alloc(size * size * 4, 0)
  const [r, g, b, a] = color

  const setPixel = (x: number, y: number, pixelColor: [number, number, number, number] = color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const offset = (y * size + x) * 4
    pixels[offset] = pixelColor[0]
    pixels[offset + 1] = pixelColor[1]
    pixels[offset + 2] = pixelColor[2]
    pixels[offset + 3] = pixelColor[3]
  }

  const drawDot = (cx: number, cy: number, radius: number, pixelColor: [number, number, number, number] = color) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        const dx = x - cx
        const dy = y - cy
        if ((dx * dx) + (dy * dy) <= radius * radius) {
          setPixel(x, y, pixelColor)
        }
      }
    }
  }

  const drawLine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    pixelColor: [number, number, number, number] = color,
  ) => {
    let currentX = x0
    let currentY = y0
    const deltaX = Math.abs(x1 - x0)
    const stepX = x0 < x1 ? 1 : -1
    const deltaY = -Math.abs(y1 - y0)
    const stepY = y0 < y1 ? 1 : -1
    let error = deltaX + deltaY

    while (true) {
      for (let offsetY = -thickness; offsetY <= thickness; offsetY += 1) {
        for (let offsetX = -thickness; offsetX <= thickness; offsetX += 1) {
          if ((offsetX * offsetX) + (offsetY * offsetY) <= thickness * thickness) {
            setPixel(currentX + offsetX, currentY + offsetY, pixelColor)
          }
        }
      }

      if (currentX === x1 && currentY === y1) break
      const doubleError = 2 * error
      if (doubleError >= deltaY) {
        error += deltaY
        currentX += stepX
      }
      if (doubleError <= deltaX) {
        error += deltaX
        currentY += stepY
      }
    }
  }

  const center = Math.floor(size / 2)
  const end = size - 3
  const start = 2

  drawLine(center, start, center, center - 3, 1)
  drawLine(center, center + 3, center, end, 1)
  drawLine(start, center, center - 3, center, 1)
  drawLine(center + 3, center, end, center, 1)
  drawLine(4, 4, center - 2, center - 2, 1)
  drawLine(center + 2, center + 2, size - 5, size - 5, 1)
  drawLine(size - 5, 4, center + 2, center - 2, 1)
  drawLine(center - 2, center + 2, 4, size - 5, 1)
  drawDot(center, center, 2)

  return pixels
}

function createMacMascotTrayPixels(size: number, color: [number, number, number, number]) {
  const pixels = Buffer.alloc(size * size * 4, 0)
  const clear: [number, number, number, number] = [0, 0, 0, 0]

  const setPixel = (x: number, y: number, pixelColor: [number, number, number, number] = color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const offset = (y * size + x) * 4
    pixels[offset] = pixelColor[0]
    pixels[offset + 1] = pixelColor[1]
    pixels[offset + 2] = pixelColor[2]
    pixels[offset + 3] = pixelColor[3]
  }

  const fillRect = (x: number, y: number, width: number, height: number, pixelColor: [number, number, number, number] = color) => {
    for (let row = y; row < y + height; row += 1) {
      for (let col = x; col < x + width; col += 1) {
        setPixel(col, row, pixelColor)
      }
    }
  }

  const fillCircle = (cx: number, cy: number, radius: number, pixelColor: [number, number, number, number] = color) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        const dx = x - cx
        const dy = y - cy
        if ((dx * dx) + (dy * dy) <= radius * radius) {
          setPixel(x, y, pixelColor)
        }
      }
    }
  }

  const fillLine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    pixelColor: [number, number, number, number] = color,
  ) => {
    let currentX = x0
    let currentY = y0
    const deltaX = Math.abs(x1 - x0)
    const stepX = x0 < x1 ? 1 : -1
    const deltaY = -Math.abs(y1 - y0)
    const stepY = y0 < y1 ? 1 : -1
    let error = deltaX + deltaY

    while (true) {
      fillCircle(currentX, currentY, thickness, pixelColor)
      if (currentX === x1 && currentY === y1) break
      const doubleError = 2 * error
      if (doubleError >= deltaY) {
        error += deltaY
        currentX += stepX
      }
      if (doubleError <= deltaX) {
        error += deltaX
        currentY += stepY
      }
    }
  }

  const scale = Math.max(1, Math.floor(size / 18))
  const scaled = (value: number) => Math.max(1, Math.round(value * scale))

  fillRect(scaled(4), scaled(5), scaled(10), scaled(7), color)
  fillRect(scaled(3), scaled(7), scaled(12), scaled(5), color)
  fillRect(scaled(4), scaled(11), scaled(10), scaled(2), color)
  fillCircle(scaled(7), scaled(4), scaled(3), color)
  fillCircle(scaled(11), scaled(4), scaled(3), color)
  fillCircle(scaled(3), scaled(10), scaled(3), color)
  fillCircle(scaled(15), scaled(10), scaled(3), color)
  fillRect(scaled(4), scaled(12), scaled(2), scaled(4), color)
  fillRect(scaled(7), scaled(12), scaled(2), scaled(4), color)
  fillRect(scaled(10), scaled(12), scaled(2), scaled(4), color)
  fillRect(scaled(13), scaled(12), scaled(2), scaled(4), color)

  fillCircle(scaled(7), scaled(8), scaled(1), clear)
  fillCircle(scaled(11), scaled(8), scaled(1), clear)
  fillLine(scaled(6), scaled(10), scaled(8), scaled(11), scaled(1), clear)
  fillLine(scaled(8), scaled(11), scaled(10), scaled(11), scaled(1), clear)
  fillLine(scaled(10), scaled(11), scaled(12), scaled(10), scaled(1), clear)

  return pixels
}

function createTrayImage() {
  const size = process.platform === 'darwin' ? 18 : 16
  if (process.platform === 'win32') {
    const appIconPath = resolveAppIconPath()
    if (appIconPath) {
      const appIcon = nativeImage.createFromPath(appIconPath).resize({ width: size, height: size })
      if (!appIcon.isEmpty()) {
        return appIcon
      }
    }
  }

  if (process.platform === 'darwin') {
    const templatePath = resolveMacTrayTemplatePath()
    if (templatePath) {
      const templateImage = createMacTrayImageFromAsset(templatePath, size)
      if (templateImage) {
        return templateImage
      }
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
        <defs>
          <mask id="face-cut">
            <rect width="72" height="72" fill="white" />
            <circle cx="28" cy="33" r="3.5" fill="black" />
            <circle cx="44" cy="33" r="3.5" fill="black" />
            <path
              d="M26 43 C31 47, 41 47, 46 43"
              fill="none"
              stroke="black"
              stroke-width="4"
              stroke-linecap="round"
            />
            <ellipse cx="36" cy="59" rx="8" ry="5.5" fill="black" />
          </mask>
        </defs>
        <g fill="#000000" mask="url(#face-cut)">
          <rect x="16" y="20" width="40" height="28" rx="8" />
          <circle cx="30" cy="18" r="10" />
          <circle cx="42" cy="18" r="10" />
          <circle cx="15" cy="39" r="10" />
          <circle cx="57" cy="39" r="10" />
          <rect x="19" y="46" width="6" height="16" rx="3" />
          <rect x="28" y="47" width="5" height="15" rx="2.5" />
          <rect x="39" y="47" width="5" height="15" rx="2.5" />
          <rect x="48" y="46" width="6" height="16" rx="3" />
        </g>
      </svg>
    `.trim()
    const templateImage = nativeImage.createFromDataURL(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    )
    if (!templateImage.isEmpty()) {
      templateImage.setTemplateImage(true)
      return templateImage
    }
  }

  const color: [number, number, number, number] = process.platform === 'darwin'
    ? [0, 0, 0, 255]
    : [217, 119, 87, 255]
  const pixels = process.platform === 'darwin'
    ? createMacMascotTrayPixels(size, color)
    : createBurstTrayPixels(size, color)
  const png = encodeRgbaPng(size, size, pixels)
  let image = nativeImage.createFromBuffer(png)

  if (image.isEmpty()) {
    const appIconPath = resolveAppIconPath()
    if (appIconPath) {
      image = nativeImage.createFromPath(appIconPath).resize({ width: size, height: size })
    }
  }

  if (process.platform === 'darwin' && !image.isEmpty()) {
    image.setTemplateImage(true)
  }

  return image
}

function modelDisplayName(id: string): string {
  // claude-{family}-{major}-{minor}[-YYYYMMDD]
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/)
  if (!m) return id
  const [, fam, major, minor] = m
  const name = fam.charAt(0).toUpperCase() + fam.slice(1)
  return minor ? `${name} ${major}.${minor}` : `${name} ${major}`
}

function normalizeBaseUrl(baseUrl: string): string {
  return /\/$/.test(baseUrl) ? baseUrl : `${baseUrl}/`
}

function buildApiUrl(baseUrl: string, path: string): URL {
  return new URL(path.replace(/^\/+/, ''), normalizeBaseUrl(baseUrl))
}

function isOfficialAnthropicBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    return url.protocol === 'https:' && url.hostname === 'api.anthropic.com'
  } catch {
    return false
  }
}

function isLikelyOllamaBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '0.0.0.0' ||
      /(^|\.)ollama\.com$/i.test(url.hostname)
    )
  } catch {
    return false
  }
}

function inferModelFamily(modelId: string, familyHint?: string): string {
  const lowered = (familyHint || modelId).toLowerCase()
  if (lowered.includes('opus')) return 'opus'
  if (lowered.includes('haiku')) return 'haiku'
  if (lowered.includes('sonnet')) return 'sonnet'
  if (lowered.includes('llama')) return 'llama'
  if (lowered.includes('qwen')) return 'qwen'
  if (lowered.includes('deepseek')) return 'deepseek'
  if (lowered.includes('gemma')) return 'gemma'
  if (lowered.includes('mistral')) return 'mistral'
  if (lowered.includes('phi')) return 'phi'
  const match = lowered.match(/[a-z0-9]+/)
  return match?.[0] ?? 'model'
}

function createModelInfo(id: string, displayName?: string, familyHint?: string): ModelInfo {
  const normalizedId = id.trim()
  const normalizedDisplayName = displayName?.trim()

  return {
    id: normalizedId,
    displayName: normalizedDisplayName || (/^claude-/i.test(normalizedId) ? modelDisplayName(normalizedId) : normalizedId),
    family: inferModelFamily(normalizedId, familyHint),
  }
}

function uniqueModels(models: ModelInfo[]): ModelInfo[] {
  const seen = new Set<string>()
  const deduped: ModelInfo[] = []

  for (const model of models) {
    if (!model.id || seen.has(model.id)) continue
    seen.add(model.id)
    deduped.push(model)
  }

  return deduped
}

function parseV1ModelsPayload(payload: unknown): ModelInfo[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []

  return uniqueModels(
    payload.data.flatMap((entry) => {
      if (!isRecord(entry)) return []
      const id = typeof entry.id === 'string' ? entry.id : ''
      if (!id) return []

      const displayName = typeof entry.display_name === 'string'
        ? entry.display_name
        : typeof entry.name === 'string'
          ? entry.name
          : undefined
      const family = typeof entry.family === 'string' ? entry.family : undefined
      return [createModelInfo(id, displayName, family)]
    })
  )
}

function parseOllamaTagsPayload(payload: unknown): ModelInfo[] {
  if (!isRecord(payload) || !Array.isArray(payload.models)) return []

  return uniqueModels(
    payload.models.flatMap((entry) => {
      if (!isRecord(entry)) return []

      const id = typeof entry.name === 'string'
        ? entry.name
        : typeof entry.model === 'string'
          ? entry.model
          : ''
      if (!id) return []

      const details = isRecord(entry.details) ? entry.details : null
      const family = typeof details?.family === 'string'
        ? details.family
        : Array.isArray(details?.families)
          ? details.families.find((value): value is string => typeof value === 'string')
          : undefined

      return [createModelInfo(id, id, family)]
    })
  )
}

async function requestJson(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  envVars?: Record<string, string>
): Promise<unknown | null> {
  return new Promise((resolve) => {
    let url: URL
    try {
      url = buildApiUrl(baseUrl, path)
    } catch {
      resolve(null)
      return
    }

    const isHttps = url.protocol === 'https:'
    const requester = isHttps ? httpsRequest : httpRequest
    const extraCaCertPath = readEnvVar(envVars, 'NODE_EXTRA_CA_CERTS') || (process.env.NODE_EXTRA_CA_CERTS ?? '')

    const req = requester(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'GET',
        headers,
        ca: extraCaCertPath && existsSync(extraCaCertPath) ? readFileSync(extraCaCertPath) : undefined,
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if ((res.statusCode ?? 500) >= 400 || !data.trim()) {
            resolve(null)
            return
          }

          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(null)
          }
        })
      }
    )

    req.on('error', () => resolve(null))
    req.setTimeout(5000, () => {
      req.destroy()
      resolve(null)
    })
    req.end()
  })
}

function mergeFallbackModels(models: ModelInfo[]): ModelInfo[] {
  return uniqueModels([...models, ...FALLBACK_MODELS])
}

async function fetchOllamaModels(
  baseUrl: string,
  envVars?: Record<string, string>,
  authToken?: string,
  apiKey?: string
): Promise<ModelInfo[]> {
  const headers = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : apiKey
      ? { Authorization: `Bearer ${apiKey}` }
      : {}
  const payload = await requestJson(baseUrl, '/api/tags', headers, envVars)
  return parseOllamaTagsPayload(payload)
}

function isImageFilePath(filePath: string): boolean {
  return extname(filePath).toLowerCase() in MIME_TYPES_BY_EXTENSION
}

function readSelectedFile(filePath: string): Promise<SelectedFileResult | null> {
  return new Promise((resolve) => {
    if (isImageFilePath(filePath)) {
      fsReadFile(filePath, (err, data) => {
        if (err) {
          resolve(null)
          return
        }
        resolve({
          name: filePath.split('/').pop() ?? filePath,
          path: filePath,
          content: '',
          size: data.length,
          fileType: 'image',
        })
      })
      return
    }

    fsReadFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        resolve(null)
        return
      }
      resolve({
        name: filePath.split('/').pop() ?? filePath,
        path: filePath,
        content: data,
        size: Buffer.byteLength(data),
        fileType: 'text',
      })
    })
  })
}

function getDefaultShellPath(): string | null {
  const configuredShell = process.env.SHELL?.trim()
  if (configuredShell) return configuredShell

  const username = process.env.USER?.trim() || process.env.LOGNAME?.trim() || (() => {
    try {
      return userInfo().username
    } catch {
      return ''
    }
  })()

  if (process.platform === 'darwin' && username) {
    const result = spawnSync('dscl', ['.', '-read', `/Users/${username}`, 'UserShell'], {
      encoding: 'utf-8',
      timeout: 3000,
    })
    const shellPath = result.stdout
      .split('\n')
      .find((line) => line.startsWith('UserShell:'))
      ?.split(':')
      .slice(1)
      .join(':')
      .trim()

    if (shellPath) return shellPath
  }

  if (process.platform === 'linux' && username) {
    const result = spawnSync('getent', ['passwd', username], {
      encoding: 'utf-8',
      timeout: 3000,
    })
    const shellPath = result.stdout.trim().split(':')[6]?.trim()
    if (shellPath) return shellPath
  }

  if (existsSync('/bin/zsh')) return '/bin/zsh'
  if (existsSync('/bin/bash')) return '/bin/bash'
  return null
}

function parseImportedShellEnv(output: string, nullDelimited: boolean): Record<string, string> {
  const result: Record<string, string> = {}
  const entries = output.split(nullDelimited ? '\0' : '\n')

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = entry.slice(0, separatorIndex).trim()
    if (!SHELL_IMPORTED_ENV_KEYS.has(key)) continue

    const value = entry.slice(separatorIndex + 1).trim()
    if (!value) continue
    result[key] = value
  }

  return result
}

function importShellEnvironmentVars() {
  const shellPath = getDefaultShellPath()
  if (!shellPath) return

  if (!process.env.SHELL) {
    process.env.SHELL = shellPath
  }

  const shellName = shellPath.split('/').pop()?.toLowerCase() ?? ''
  const commandCandidates = shellName === 'fish'
    ? [
        { args: ['-i', '-l', '-c', 'env'], nullDelimited: false },
        { args: ['-l', '-c', 'env'], nullDelimited: false },
        { args: ['-i', '-c', 'env'], nullDelimited: false },
        { args: ['-c', 'env'], nullDelimited: false },
      ]
    : [
        { args: ['-ilc', 'env -0'], nullDelimited: true },
        { args: ['-lc', 'env -0'], nullDelimited: true },
        { args: ['-ic', 'env -0'], nullDelimited: true },
        { args: ['-c', 'env -0'], nullDelimited: true },
        { args: ['-ilc', 'env'], nullDelimited: false },
        { args: ['-lc', 'env'], nullDelimited: false },
        { args: ['-ic', 'env'], nullDelimited: false },
        { args: ['-c', 'env'], nullDelimited: false },
      ]

  for (const candidate of commandCandidates) {
    try {
      const result = spawnSync(shellPath, candidate.args, {
        env: process.env,
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      })

      if (result.status !== 0 || !result.stdout) continue

      const importedEnv = parseImportedShellEnv(result.stdout, candidate.nullDelimited)
      if (Object.keys(importedEnv).length === 0) continue

      for (const [key, value] of Object.entries(importedEnv)) {
        process.env[key] = value
      }
      break
    } catch {
      // 다음 후보 셸 옵션으로 재시도
    }
  }
}

function resolveTargetPath(targetPath: string): string {
  const homePath = getUserHomePath()
  if (targetPath === '~') return homePath
  if (targetPath.startsWith('~/') || targetPath.startsWith('~\\')) {
    return join(homePath, targetPath.slice(2))
  }
  return targetPath
}

function getUserHomePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME ?? env.USERPROFILE ?? app.getPath('home')
}

function getProjectNameFromPath(path: string): string {
  if (!path || path === '~') return '~'
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

function runGit(args: string[], cwd: string) {
  return spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 5000,
  })
}

function isGitAvailable() {
  const result = spawnSync('git', ['--version'], {
    encoding: 'utf-8',
    timeout: 3000,
  })
  return result.status === 0
}

function resolveGitRepoRoot(cwd: string): string | null {
  const resolvedPath = resolveTargetPath(cwd)
  if (!resolvedPath) return null

  const result = runGit(['rev-parse', '--show-toplevel'], resolvedPath)
  if (result.status !== 0) return null
  return result.stdout.trim() || null
}

function parseBranchSummary(branchLine: string) {
  const clean = branchLine.replace(/^##\s*/, '')
  const [headPart] = clean.split('...')
  let branch = headPart.trim()
  if (!branch || branch === 'HEAD') branch = 'detached HEAD'

  const aheadMatch = clean.match(/ahead (\d+)/)
  const behindMatch = clean.match(/behind (\d+)/)
  return {
    branch,
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
  }
}

function parseNumstat(output: string): { additions: number | null; deletions: number | null } {
  const line = output.split('\n').find(Boolean)?.trim()
  if (!line) return { additions: null, deletions: null }
  const [additionsText, deletionsText] = line.split('\t')
  const additions = /^\d+$/.test(additionsText ?? '') ? Number(additionsText) : null
  const deletions = /^\d+$/.test(deletionsText ?? '') ? Number(deletionsText) : null
  return { additions, deletions }
}

function decodePorcelainPath(pathText: string): string {
  const trimmed = pathText.trim()
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) return trimmed
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

function parsePorcelainPaths(pathText: string) {
  const trimmed = pathText.trim()
  const quotedRenameMatch = trimmed.match(/^"((?:\\.|[^"])*)" -> "((?:\\.|[^"])*)"$/)
  if (quotedRenameMatch) {
    return {
      renamed: true,
      originalPath: decodePorcelainPath(`"${quotedRenameMatch[1]}"`),
      relativePath: decodePorcelainPath(`"${quotedRenameMatch[2]}"`),
    }
  }

  const renameParts = trimmed.split(' -> ')
  if (renameParts.length === 2) {
    return {
      renamed: true,
      originalPath: decodePorcelainPath(renameParts[0]),
      relativePath: decodePorcelainPath(renameParts[1]),
    }
  }

  return {
    renamed: false,
    originalPath: null,
    relativePath: decodePorcelainPath(trimmed),
  }
}

function getGitEntryNumstat(repoRoot: string, entry: Omit<GitStatusEntry, 'stagedAdditions' | 'stagedDeletions' | 'unstagedAdditions' | 'unstagedDeletions' | 'totalAdditions' | 'totalDeletions'>) {
  try {
    if (entry.untracked) {
      const result = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--no-color', '--numstat', '--no-index', '--', '/dev/null', entry.path], {
        encoding: 'utf-8',
        timeout: 5000,
      })
      const counts = parseNumstat(`${result.stdout ?? ''}${result.stderr ?? ''}`)
      return {
        stagedAdditions: 0,
        stagedDeletions: 0,
        unstagedAdditions: counts.additions,
        unstagedDeletions: counts.deletions,
        totalAdditions: counts.additions,
        totalDeletions: counts.deletions,
      }
    }

    const relativePath = relative(repoRoot, entry.path)
    const stagedResult = runGit(['diff', '--cached', '--numstat', '--', relativePath], repoRoot)
    const unstagedResult = runGit(['diff', '--numstat', '--', relativePath], repoRoot)
    const totalResult = runGit(['diff', '--numstat', 'HEAD', '--', relativePath], repoRoot)
    const stagedCounts = parseNumstat(`${stagedResult.stdout ?? ''}${stagedResult.stderr ?? ''}`)
    const unstagedCounts = parseNumstat(`${unstagedResult.stdout ?? ''}${unstagedResult.stderr ?? ''}`)
    const totalCounts = parseNumstat(`${totalResult.stdout ?? ''}${totalResult.stderr ?? ''}`)
    return {
      stagedAdditions: stagedCounts.additions,
      stagedDeletions: stagedCounts.deletions,
      unstagedAdditions: unstagedCounts.additions,
      unstagedDeletions: unstagedCounts.deletions,
      totalAdditions: totalCounts.additions,
      totalDeletions: totalCounts.deletions,
    }
  } catch {
    return {
      stagedAdditions: null,
      stagedDeletions: null,
      unstagedAdditions: null,
      unstagedDeletions: null,
      totalAdditions: null,
      totalDeletions: null,
    }
  }
}

function getGitStatus(cwd: string): GitRepoStatus {
  const gitAvailable = isGitAvailable()
  if (!gitAvailable) {
    return {
      gitAvailable: false,
      isRepo: false,
      rootPath: null,
      branch: null,
      ahead: 0,
      behind: 0,
      clean: true,
      entries: [],
    }
  }

  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return {
      gitAvailable: true,
      isRepo: false,
      rootPath: null,
      branch: null,
      ahead: 0,
      behind: 0,
      clean: true,
      entries: [],
    }
  }

  const result = runGit(['status', '--porcelain=v1', '--branch'], repoRoot)
  if (result.status !== 0) {
    return {
      gitAvailable: true,
      isRepo: false,
      rootPath: null,
      branch: null,
      ahead: 0,
      behind: 0,
      clean: true,
      entries: [],
    }
  }

  const lines = result.stdout.split('\n').filter(Boolean)
  const branchLine = lines.find((line) => line.startsWith('##')) ?? '## detached HEAD'
  const { branch, ahead, behind } = parseBranchSummary(branchLine)

  const entries: GitStatusEntry[] = lines
    .filter((line) => !line.startsWith('##'))
    .map((line) => {
      if (line.startsWith('?? ')) {
        const relativePath = decodePorcelainPath(line.slice(3))
        const entryBase = {
          path: join(repoRoot, relativePath),
          relativePath,
          originalPath: null,
          statusCode: '??',
          staged: false,
          unstaged: true,
          untracked: true,
          deleted: false,
          renamed: false,
        }
        return {
          ...entryBase,
          ...getGitEntryNumstat(repoRoot, entryBase),
        }
      }

      const x = line[0] ?? ' '
      const y = line[1] ?? ' '
      const rest = line.slice(3).trim()
      const { renamed, relativePath, originalPath } = parsePorcelainPaths(rest)
      const staged = x !== ' '
      const unstaged = y !== ' '
      const untracked = x === '?' || y === '?'
      const deleted = x === 'D' || y === 'D'

      const entryBase = {
        path: join(repoRoot, relativePath),
        relativePath,
        originalPath: originalPath ? join(repoRoot, originalPath) : null,
        statusCode: `${x}${y}`.trim() || 'M',
        staged,
        unstaged,
        untracked,
        deleted,
        renamed: x === 'R' || y === 'R' || renamed,
      }
      return {
        ...entryBase,
        ...getGitEntryNumstat(repoRoot, entryBase),
      }
    })

  return {
    gitAvailable: true,
    isRepo: true,
    rootPath: repoRoot,
    branch,
    ahead,
    behind,
    clean: entries.length === 0,
    entries,
  }
}

function getGitDiff(cwd: string, filePath: string): { ok: boolean; diff: string; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, diff: '', error: 'Git 저장소가 아닙니다.' }
  }

  const status = getGitStatus(cwd)
  const entry = status.entries.find((item) => item.path === filePath || item.originalPath === filePath)
  const relativePath = relative(repoRoot, filePath)

  try {
    if (entry?.untracked) {
      const result = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--no-color', '--no-index', '--', '/dev/null', filePath], {
        encoding: 'utf-8',
        timeout: 5000,
      })
      const diff = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
      return { ok: result.status === 0 || result.status === 1, diff }
    }

    const result = runGit(['diff', '--no-color', '--find-renames', 'HEAD', '--', relativePath], repoRoot)
    const diff = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    if (result.status !== 0 && !diff) {
      return { ok: false, diff: '', error: result.stderr.trim() || 'diff를 불러오지 못했습니다.' }
    }

    return { ok: true, diff }
  } catch (error) {
    return { ok: false, diff: '', error: String(error) }
  }
}

function getGitBranches(cwd: string): { ok: boolean; branches: GitBranchInfo[]; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, branches: [], error: 'Git 저장소가 아닙니다.' }
  }

  const result = runGit(['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(HEAD)', 'refs/heads'], repoRoot)
  if (result.status !== 0) {
    return { ok: false, branches: [], error: result.stderr.trim() || '브랜치 목록을 불러오지 못했습니다.' }
  }

  const branches = result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, currentMark] = line.split('\t')
      return {
        name: name.trim(),
        current: currentMark?.trim() === '*',
      }
    })

  return { ok: true, branches }
}

function getGitLog(cwd: string, limit?: number): GitLogResult {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, entries: [], error: 'Git 저장소가 아닙니다.' }
  }

  const format = '%x1f%H%x1f%h%x1f%s%x1f%an%x1f%cr%x1f%D'
  const args = [
    'log',
    '--graph',
    '--decorate=short',
    '--date-order',
    `--pretty=format:${format}`,
  ]
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    args.splice(4, 0, `--max-count=${Math.max(1, Math.round(limit))}`)
  }
  const result = runGit(args, repoRoot)

  if (result.status !== 0) {
    return { ok: false, entries: [], error: result.stderr.trim() || 'Git 로그를 불러오지 못했습니다.' }
  }

  const entries = result.stdout
    .split('\n')
    .flatMap((line) => {
      const parts = line.split('\x1f')
      if (parts.length < 7) return []
      const [graph, hash, shortHash, subject, author, relativeDate, decorations] = parts
      return [{
        hash: hash.trim(),
        shortHash: shortHash.trim(),
        subject: subject.trim(),
        author: author.trim(),
        relativeDate: relativeDate.trim(),
        decorations: decorations.trim(),
        graph: graph.replace(/\s+$/, ''),
      } satisfies GitLogEntry]
    })

  return { ok: true, entries }
}

function getGitCommitDiff(cwd: string, commitHash: string): { ok: boolean; diff: string; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, diff: '', error: 'Git 저장소가 아닙니다.' }
  }

  const trimmedCommitHash = commitHash.trim()
  if (!trimmedCommitHash) {
    return { ok: false, diff: '', error: '커밋 해시가 필요합니다.' }
  }

  try {
    const result = runGit(['show', '--no-color', '--find-renames', '--format=', trimmedCommitHash], repoRoot)
    const diff = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    if (result.status !== 0 && !diff) {
      return { ok: false, diff: '', error: result.stderr.trim() || '커밋 diff를 불러오지 못했습니다.' }
    }

    return { ok: true, diff }
  } catch (error) {
    return { ok: false, diff: '', error: String(error) }
  }
}

function getGitFileContent(cwd: string, commitHash: string, filePath: string): GitFileContentResult {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, content: '', error: 'Git 저장소가 아닙니다.' }
  }

  const trimmedCommitHash = commitHash.trim()
  if (!trimmedCommitHash) {
    return { ok: false, content: '', error: '커밋 해시가 필요합니다.' }
  }

  const trimmedFilePath = filePath.trim()
  if (!trimmedFilePath) {
    return { ok: false, content: '', error: '파일 경로가 필요합니다.' }
  }

  const relativePath = posix.normalize(
    (trimmedFilePath.startsWith(repoRoot) ? relative(repoRoot, trimmedFilePath) : trimmedFilePath)
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
  )

  if (!relativePath || relativePath === '.' || relativePath.startsWith('../')) {
    return { ok: false, content: '', error: '유효한 저장소 내부 파일 경로가 아닙니다.' }
  }

  try {
    const result = runGit(['show', `${trimmedCommitHash}:${relativePath}`], repoRoot)
    if (result.status !== 0) {
      return { ok: false, content: '', error: result.stderr.trim() || '커밋 파일 내용을 불러오지 못했습니다.' }
    }

    return { ok: true, content: result.stdout ?? '' }
  } catch (error) {
    return { ok: false, content: '', error: String(error) }
  }
}

function getGitCommitFileContent(cwd: string, commitHash: string, filePath: string): GitFileContentResult {
  return getGitFileContent(cwd, commitHash, filePath)
}

function setGitStaged(cwd: string, filePath: string, staged: boolean): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const relativePath = relative(repoRoot, filePath)
  const args = staged
    ? ['add', '--', relativePath]
    : ['restore', '--staged', '--', relativePath]
  const result = runGit(args, repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || 'Git 상태를 바꾸지 못했습니다.' }
  }
  return { ok: true }
}

function restoreGitFile(cwd: string, filePath: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const status = getGitStatus(cwd)
  const entry = status.entries.find((item) => item.path === filePath || item.originalPath === filePath)
  if (!entry) return { ok: false, error: '되돌릴 파일 상태를 찾지 못했습니다.' }

  if (entry.untracked) {
    try {
      rmSync(entry.path, { force: true, recursive: true })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  }

  const restoreTargets = Array.from(
    new Set(
      [entry.path, entry.originalPath]
        .filter((value): value is string => Boolean(value))
        .map((value) => relative(repoRoot, value)),
    ),
  )

  const result = runGit(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...restoreTargets], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '파일을 되돌리지 못했습니다.' }
  }

  return { ok: true }
}

function commitGit(cwd: string, message: string): { ok: boolean; commitHash?: string; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { ok: false, error: '커밋 메시지를 입력하세요.' }

  const result = runGit(['commit', '-m', trimmedMessage], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '커밋하지 못했습니다.' }
  }

  const hashResult = runGit(['rev-parse', '--short', 'HEAD'], repoRoot)
  return {
    ok: true,
    commitHash: hashResult.status === 0 ? hashResult.stdout.trim() : undefined,
  }
}

function normalizeCodexBranchName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, '-').replace(/^\/+/, '')
  if (!trimmed) return ''
  return trimmed
}

function createGitBranch(cwd: string, name: string): { ok: boolean; branchName?: string; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const branchName = normalizeCodexBranchName(name)
  if (!branchName) return { ok: false, error: '브랜치 이름을 입력하세요.' }

  const result = runGit(['switch', '-c', branchName], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '브랜치를 생성하지 못했습니다.' }
  }

  return { ok: true, branchName }
}

function switchGitBranch(cwd: string, name: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, error: '브랜치 이름이 비어 있습니다.' }

  const result = runGit(['switch', trimmedName], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '브랜치를 전환하지 못했습니다.' }
  }

  return { ok: true }
}

function pullGit(cwd: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const result = runGit(['pull', '--ff-only'], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || 'git pull을 실행하지 못했습니다.' }
  }

  return { ok: true }
}

function pushGit(cwd: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const result = runGit(['push'], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || 'git push를 실행하지 못했습니다.' }
  }

  return { ok: true }
}

function deleteGitBranch(cwd: string, name: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, error: '브랜치 이름이 비어 있습니다.' }

  const status = getGitStatus(cwd)
  if (status.branch === trimmedName) {
    return { ok: false, error: '현재 브랜치는 삭제할 수 없습니다.' }
  }

  const result = runGit(['branch', '-d', trimmedName], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '브랜치를 삭제하지 못했습니다.' }
  }

  return { ok: true }
}

function initGitRepo(cwd: string): { ok: boolean; error?: string } {
  if (!isGitAvailable()) return { ok: false, error: 'Git이 설치되지 않았습니다.' }

  const targetPath = resolveTargetPath(cwd)
  if (!targetPath) return { ok: false, error: '경로를 확인할 수 없습니다.' }

  const result = runGit(['init'], targetPath)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || 'git init을 실행하지 못했습니다.' }
  }

  return { ok: true }
}

function findBundlePath(bundleId: string): string | null {
  try {
    const result = spawnSync('mdfind', [`kMDItemCFBundleIdentifier == "${bundleId}"`], {
      encoding: 'utf-8',
      timeout: 2000,
    })
    if (result.status !== 0) return null
    const firstPath = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
    return firstPath ?? null
  } catch {
    return null
  }
}

async function listOpenWithApps(): Promise<OpenWithApp[]> {
  if (process.platform !== 'darwin') return []

  const apps = await Promise.all(
    MAC_OPEN_WITH_APPS.map(async (app): Promise<OpenWithApp | null> => {
      const appPath = app.bundleIds.map(findBundlePath).find((candidate): candidate is string => Boolean(candidate))
      if (!appPath) return null

      let iconDataUrl: string | undefined
      let iconPath: string | undefined
      try {
        const bundleIconPath = resolveBundleIconPath(appPath)
        const convertedIconPath = bundleIconPath ? convertIcnsToPng(bundleIconPath, app.id) : undefined
        if (convertedIconPath) {
          iconPath = convertedIconPath
        }

        iconDataUrl = iconPath ? convertPngToDataUrl(iconPath) : undefined
        if (!iconDataUrl) {
          const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createFromPath(appPath)
          if (icon && !icon.isEmpty()) {
            iconDataUrl = icon.resize({ width: 32, height: 32 }).toDataURL()
          }
        }
      } catch {
        iconDataUrl = undefined
      }

      return { id: app.id, label: app.label, iconDataUrl, iconPath }
    })
  )

  return apps.filter((entry): entry is OpenWithApp => entry !== null)
}

function resolveBundleIconPath(appPath: string): string | null {
  try {
    const infoPlistPath = join(appPath, 'Contents', 'Info.plist')
    if (!existsSync(infoPlistPath)) return null

    const iconNameRaw = execSync(`/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "${infoPlistPath}"`, {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim()

    if (!iconNameRaw) return null

    const iconName = extname(iconNameRaw) ? iconNameRaw : `${iconNameRaw}.icns`
    const iconPath = join(appPath, 'Contents', 'Resources', iconName)
    return existsSync(iconPath) ? iconPath : null
  } catch {
    return null
  }
}

function convertPngToDataUrl(iconPath: string): string | undefined {
  try {
    const data = readFileSync(iconPath)
    return `data:image/png;base64,${data.toString('base64')}`
  } catch {
    return undefined
  }
}

function convertIcnsToPng(iconPath: string, cacheKey: string): string | undefined {
  const outputPath = join(tmpdir(), `claude-ui-open-with-${cacheKey}.png`)

  try {
    if (existsSync(outputPath)) {
      return outputPath
    }

    const result = spawnSync('sips', ['-s', 'format', 'png', iconPath, '--out', outputPath], {
      encoding: 'utf-8',
      timeout: 5000,
    })

    if (result.status !== 0 || !existsSync(outputPath)) {
      return undefined
    }

    return outputPath
  } catch {
    try { if (existsSync(outputPath)) unlinkSync(outputPath) } catch { /* ignore */ }
    return undefined
  }
}

async function openPathWithApp(targetPath: string, appId: string): Promise<{ ok: boolean; error?: string }> {
  const resolvedPath = resolveTargetPath(targetPath)
  if (!resolvedPath) return { ok: false, error: '열 경로를 찾지 못했습니다.' }

  if (appId === 'default' || process.platform !== 'darwin') {
    const error = await shell.openPath(resolvedPath)
    return error ? { ok: false, error } : { ok: true }
  }

  const app = MAC_OPEN_WITH_APPS.find((candidate) => candidate.id === appId)
  if (!app) return { ok: false, error: '지원하지 않는 앱입니다.' }

  const bundleId = app.bundleIds.find((candidate) => Boolean(findBundlePath(candidate)))
  if (!bundleId) return { ok: false, error: `${app.label} 앱을 찾지 못했습니다.` }

  try {
    const result = spawnSync('open', ['-b', bundleId, resolvedPath], {
      encoding: 'utf-8',
      timeout: 5000,
    })
    if (result.status !== 0) {
      return { ok: false, error: result.stderr.trim() || `${app.label}에서 열지 못했습니다.` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

async function getApiConfig(envVars?: Record<string, string>): Promise<ApiConfig> {
  const envApiKey = readEnvVar(envVars, 'ANTHROPIC_API_KEY')
  const envAuthToken = readEnvVar(envVars, 'ANTHROPIC_AUTH_TOKEN')
  const envBaseUrl = readEnvVar(envVars, 'ANTHROPIC_BASE_URL')
  let apiKey = envApiKey || (process.env.ANTHROPIC_API_KEY ?? '')
  let authToken = envAuthToken || (process.env.ANTHROPIC_AUTH_TOKEN ?? '')
  let baseUrl = envBaseUrl || (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com')

  try {
    const settingsPath = join(process.env.HOME ?? '', '.claude', 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    if (!envBaseUrl && settings.baseURL) baseUrl = settings.baseURL
    if (!apiKey && settings.apiKeyHelper) {
      apiKey = execSync(settings.apiKeyHelper, { encoding: 'utf-8', timeout: 5000 }).trim()
    }
  } catch { /* ignore */ }

  return { apiKey, authToken, baseUrl }
}

async function fetchModelsFromApi(envVars?: Record<string, string>): Promise<ModelInfo[]> {
  const { apiKey, authToken, baseUrl } = await getApiConfig(envVars)
  const usingOfficialAnthropic = isOfficialAnthropicBaseUrl(baseUrl)
  const usingOllama = isLikelyOllamaBaseUrl(baseUrl)
  const remoteHeaders: Record<string, string> = {}
  if (apiKey) remoteHeaders['x-api-key'] = apiKey
  if (authToken) remoteHeaders.Authorization = `Bearer ${authToken}`
  if (!usingOllama) remoteHeaders['anthropic-version'] = '2023-06-01'

  let configuredModels: ModelInfo[] = []

  if (usingOllama) {
    configuredModels = await fetchOllamaModels(baseUrl, envVars, authToken, apiKey)
  } else if (apiKey || authToken) {
    const modelsPayload = await requestJson(baseUrl, '/v1/models', remoteHeaders, envVars)
    configuredModels = parseV1ModelsPayload(modelsPayload)
  } else if (usingOfficialAnthropic) {
    configuredModels = FALLBACK_MODELS
  }

  const localOllamaModels = usingOllama
    ? configuredModels
    : await fetchOllamaModels(DEFAULT_OLLAMA_BASE_URL, envVars)

  const mergedConfiguredModels = usingOfficialAnthropic
    ? mergeFallbackModels(configuredModels)
    : configuredModels
  const mergedModels = uniqueModels([
    ...localOllamaModels,
    ...mergedConfiguredModels,
  ])

  if (mergedModels.length > 0) return mergedModels
  return usingOfficialAnthropic ? FALLBACK_MODELS : []
}

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
      sandbox: false,
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
    width: 780,
    height: 220,
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
      sandbox: false,
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
  const width = 780
  const height = 220
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
    showMainWindow()
  })

  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildTrayMenu())
  })

  return tray
}

function parseJsonlFile(filePath: string): Array<Record<string, unknown>> {
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter((record): record is Record<string, unknown> => record !== null)
  } catch {
    return []
  }
}

function getRecordTimestamp(record: Record<string, unknown>): number {
  const value = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN
  return Number.isFinite(value) ? value : 0
}

function extractTextBlocks(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  return content
    .flatMap((block) => {
      if (typeof block === 'string') return [block]
      if (!block || typeof block !== 'object') return []
      if ((block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
        return [(block as { text: string }).text]
      }
      return []
    })
    .join('\n')
    .trim()
}

function buildCliHistoryEntry(filePath: string, source: 'project' | 'transcript'): CliHistoryEntry | null {
  const records = parseJsonlFile(filePath)
  if (records.length === 0) return null

  let cwd = ''
  let claudeSessionId: string | null = null
  let preview = ''
  let updatedAt = 0

  for (const record of records) {
    if (!cwd && typeof record.cwd === 'string') {
      cwd = record.cwd
    }
    if (!claudeSessionId && typeof record.sessionId === 'string') {
      claudeSessionId = record.sessionId
    }
    if (!preview && record.type === 'user') {
      const message = record.message as { content?: unknown } | undefined
      preview = extractTextBlocks(message?.content ?? record.content)
    }
    updatedAt = Math.max(updatedAt, getRecordTimestamp(record))
  }

  if (!updatedAt) {
    try {
      updatedAt = statSync(filePath).mtimeMs
    } catch {
      updatedAt = Date.now()
    }
  }

  const title = cwd ? getProjectNameFromPath(cwd) : (claudeSessionId ?? filePath.split('/').pop() ?? '세션')
  return {
    id: `${source}:${filePath}`,
    filePath,
    claudeSessionId,
    cwd,
    title,
    preview,
    updatedAt,
    source,
  }
}

function listCliHistoryFiles(): Array<{ filePath: string; source: 'project' | 'transcript' }> {
  const files: Array<{ filePath: string; source: 'project' | 'transcript' }> = []
  const home = process.env.HOME ?? app.getPath('home')
  const projectsDir = join(home, '.claude', 'projects')
  const transcriptsDir = join(home, '.claude', 'transcripts')

  try {
    if (existsSync(projectsDir)) {
      for (const projectDir of readdirSync(projectsDir, { withFileTypes: true })) {
        if (!projectDir.isDirectory()) continue
        const fullProjectDir = join(projectsDir, projectDir.name)
        for (const entry of readdirSync(fullProjectDir, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
          files.push({
            filePath: join(fullProjectDir, entry.name),
            source: 'project',
          })
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    if (existsSync(transcriptsDir)) {
      for (const entry of readdirSync(transcriptsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
        files.push({
          filePath: join(transcriptsDir, entry.name),
          source: 'transcript',
        })
      }
    }
  } catch {
    // ignore
  }

  return files
}

function listCliSessions(query = ''): CliHistoryEntry[] {
  const entries = listCliHistoryFiles()
    .map(({ filePath, source }) => buildCliHistoryEntry(filePath, source))
    .filter((entry): entry is CliHistoryEntry => entry !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return entries.slice(0, 200)

  return entries
    .filter((entry) => {
      const haystack = `${entry.title}\n${entry.cwd}\n${entry.preview}\n${entry.claudeSessionId ?? ''}`.toLowerCase()
      return haystack.includes(trimmed)
    })
    .slice(0, 200)
}

function loadCliSession(filePath: string): ImportedCliSession | null {
  const records = parseJsonlFile(filePath)
  if (records.length === 0) return null

  let cwd = ''
  let sessionId: string | null = null
  let sidechainAgentId: string | null = null
  let isSidechain = false
  let model: string | null = null
  let lastCost: number | undefined
  const messages: ImportedCliMessage[] = []
  const toolCallsById = new Map<string, ImportedCliToolCall>()

  for (const record of records) {
    if (!cwd && typeof record.cwd === 'string') {
      cwd = record.cwd
    }
    if (!sessionId && typeof record.sessionId === 'string') {
      sessionId = record.sessionId
    }
    if (record.isSidechain === true) {
      isSidechain = true
      if (!sidechainAgentId && typeof record.agentId === 'string' && record.agentId.trim()) {
        sidechainAgentId = record.agentId.trim()
      }
    }

    if (record.type === 'assistant') {
      const message = record.message as { model?: unknown; content?: unknown } | undefined
      if (typeof message?.model === 'string') {
        model = message.model
      }

      const content = Array.isArray(message?.content) ? message.content : []
      const toolCalls: ImportedCliToolCall[] = []
      const textParts: string[] = []

      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        const blockRecord = block as Record<string, unknown>
        if (blockRecord.type === 'text' && typeof blockRecord.text === 'string') {
          textParts.push(blockRecord.text)
          continue
        }

        if (blockRecord.type === 'tool_use') {
          const toolCall: ImportedCliToolCall = {
            toolUseId: String(blockRecord.id ?? ''),
            toolName: String(blockRecord.name ?? ''),
            toolInput: blockRecord.input,
            fileSnapshotBefore: getToolFileSnapshotBefore(String(blockRecord.name ?? ''), blockRecord.input),
            status: 'running',
          }
          toolCalls.push(toolCall)
          if (toolCall.toolUseId) {
            toolCallsById.set(toolCall.toolUseId, toolCall)
          }
        }
      }

      if (textParts.length > 0 || toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          text: textParts.join('\n').trim(),
          toolCalls,
          createdAt: getRecordTimestamp(record),
        })
      }
      continue
    }

    if (record.type === 'user') {
      const message = record.message as { content?: unknown } | undefined
      const content = message?.content ?? record.content

      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== 'object') continue
          const blockRecord = block as Record<string, unknown>
          if (blockRecord.type !== 'tool_result') continue
          const toolUseId = String(blockRecord.tool_use_id ?? '')
          const toolCall = toolCallsById.get(toolUseId)
          if (!toolCall) continue
          toolCall.result = blockRecord.content
          toolCall.isError = Boolean(blockRecord.is_error)
          toolCall.status = toolCall.isError ? 'error' : 'done'
        }
      }

      const text = extractTextBlocks(content)
      if (text) {
        messages.push({
          role: 'user',
          text,
          toolCalls: [],
          createdAt: getRecordTimestamp(record),
        })
      }
      continue
    }

    if (record.type === 'result' && typeof record.total_cost_usd === 'number') {
      lastCost = record.total_cost_usd
    }
  }

  for (const message of messages) {
    for (const toolCall of message.toolCalls) {
      if (toolCall.status === 'running') {
        toolCall.status = 'done'
      }
    }
  }

  const importedSessionId = isSidechain
    ? `subagent:${sidechainAgentId ?? filePath}`
    : sessionId
  const importedName = isSidechain
    ? `${cwd ? getProjectNameFromPath(cwd) : '가져온 세션'} · ${sidechainAgentId ?? 'Subagent'}`
    : cwd ? getProjectNameFromPath(cwd) : (sessionId ?? '가져온 세션')

  return {
    sessionId: importedSessionId,
    name: importedName,
    cwd: cwd || DEFAULT_PROJECT_PATH,
    messages,
    lastCost,
    model,
  }
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

function isDirectoryPath(targetPath: string): boolean {
  try {
    return statSync(targetPath).isDirectory()
  } catch {
    return false
  }
}

function findSkillFile(dir: string): string | null {
  const skillMd = join(dir, 'SKILL.md')
  if (existsSync(skillMd)) return skillMd

  try {
    const markdown = readdirSync(dir).find((entry) => entry.endsWith('.md'))
    return markdown ? join(dir, markdown) : null
  } catch {
    return null
  }
}

function listPluginSkills(): PluginSkill[] {
  const pluginRoots: string[] = []
  const results: PluginSkill[] = []
  const seen = new Set<string>()
  const pluginsDir = join(getUserHomePath(), '.claude', 'plugins')

  try {
    const marketplacesDir = join(pluginsDir, 'marketplaces')
    if (existsSync(marketplacesDir)) {
      for (const marketplace of readdirSync(marketplacesDir, { withFileTypes: true })) {
        if (!marketplace.isDirectory()) continue
        const marketplacePath = join(marketplacesDir, marketplace.name)
        pluginRoots.push(join(marketplacePath, 'plugins'))
        pluginRoots.push(join(marketplacePath, 'external_plugins'))
      }
    }
  } catch {
    // ignore plugin discovery failures
  }

  pluginRoots.push(join(pluginsDir, 'repos'))

  for (const root of pluginRoots) {
    if (!existsSync(root)) continue

    try {
      for (const pluginEntry of readdirSync(root, { withFileTypes: true })) {
        const pluginPath = join(root, pluginEntry.name)
        if (!(pluginEntry.isDirectory() || (pluginEntry.isSymbolicLink() && isDirectoryPath(pluginPath)))) continue

        const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json')
        if (!existsSync(manifestPath)) continue

        const manifest = readJsonObject(manifestPath)
        const pluginName = typeof manifest.name === 'string' && manifest.name.trim()
          ? manifest.name.trim()
          : pluginEntry.name
        const skillsDir = join(pluginPath, 'skills')
        if (!existsSync(skillsDir)) continue

        for (const skillEntry of readdirSync(skillsDir, { withFileTypes: true })) {
          const skillDir = join(skillsDir, skillEntry.name)
          if (!(skillEntry.isDirectory() || (skillEntry.isSymbolicLink() && isDirectoryPath(skillDir)))) continue
          const skillFile = findSkillFile(skillDir)
          if (!skillFile || seen.has(skillFile)) continue
          seen.add(skillFile)
          results.push({
            name: skillEntry.name,
            path: skillFile,
            dir: skillDir,
            pluginName,
            pluginPath,
          })
        }
      }
    } catch {
      // ignore plugin discovery failures
    }
  }

  return results.sort((a, b) => {
    if (a.pluginName === b.pluginName) return a.name.localeCompare(b.name)
    return a.pluginName.localeCompare(b.pluginName)
  })
}

function normalizeScheduledTasks(tasks: ScheduledTaskSyncItem[]): ScheduledTaskSyncItem[] {
  const seen = new Set<string>()
  const normalized: ScheduledTaskSyncItem[] = []

  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue
    if (typeof task.id !== 'string' || !task.id.trim() || seen.has(task.id)) continue
    seen.add(task.id)
    normalized.push({
      id: task.id,
      name: typeof task.name === 'string' ? task.name.trim() : '',
      prompt: typeof task.prompt === 'string' ? task.prompt : '',
      projectPath: typeof task.projectPath === 'string' ? task.projectPath : '',
      permissionMode: task.permissionMode === 'acceptEdits' || task.permissionMode === 'bypassPermissions'
        ? task.permissionMode
        : 'default',
      frequency: ['manual', 'hourly', 'daily', 'weekdays', 'weekly'].includes(task.frequency)
        ? task.frequency
        : 'manual',
      enabled: Boolean(task.enabled),
      hour: Number.isFinite(task.hour) ? Math.max(0, Math.min(23, Math.floor(task.hour))) : 0,
      minute: Number.isFinite(task.minute) ? Math.max(0, Math.min(59, Math.floor(task.minute))) : 0,
      weeklyDay: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(task.weeklyDay)
        ? task.weeklyDay
        : 'mon',
      skipDays: Array.isArray(task.skipDays)
        ? task.skipDays.filter((value): value is ScheduledTaskDay => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(value))
        : [],
      quietHoursStart: typeof task.quietHoursStart === 'string' ? task.quietHoursStart : null,
      quietHoursEnd: typeof task.quietHoursEnd === 'string' ? task.quietHoursEnd : null,
      nextRunAt: typeof task.nextRunAt === 'number' && Number.isFinite(task.nextRunAt) ? task.nextRunAt : null,
    })
  }

  return normalized
}

function getScheduledTaskWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  return showMainWindow()
}

function clearScheduledTaskTimeout() {
  if (!nextScheduledTaskTimeout) return
  clearTimeout(nextScheduledTaskTimeout)
  nextScheduledTaskTimeout = null
}

function scheduleNextTaskCheck() {
  clearScheduledTaskTimeout()

  const now = Date.now()
  const nextTask = scheduledTasks
    .filter((task) => task.enabled && task.frequency !== 'manual' && typeof task.nextRunAt === 'number' && task.nextRunAt > now)
    .sort((a, b) => (a.nextRunAt ?? Number.POSITIVE_INFINITY) - (b.nextRunAt ?? Number.POSITIVE_INFINITY))[0]

  if (!nextTask?.nextRunAt) return

  const delay = Math.max(0, nextTask.nextRunAt - now)
  nextScheduledTaskTimeout = setTimeout(() => {
    nextScheduledTaskTimeout = null
    void checkMissedRuns()
  }, delay)
}

function emitScheduledTaskAdvance(payload: {
  taskId: string
  firedAt: number
  skipped?: boolean
  reason?: string
  catchUp?: boolean
  manual?: boolean
}) {
  const window = getScheduledTaskWindow()
  sendWhenRendererReady(window, 'scheduled-tasks:advance', payload)
}

function holdScheduledTaskUntilSync(taskId: string) {
  scheduledTasks = scheduledTasks.map((task) => (
    task.id === taskId ? { ...task, nextRunAt: null } : task
  ))
}

function fireScheduledTask(task: ScheduledTaskSyncItem, options?: { catchUp?: boolean; manual?: boolean }) {
  const firedAt = Date.now()
  const lateness = typeof task.nextRunAt === 'number' ? firedAt - task.nextRunAt : 0
  const catchUp = Boolean(options?.catchUp) || (!options?.manual && lateness > CATCHUP_THRESHOLD)
  const manual = Boolean(options?.manual)
  const window = getScheduledTaskWindow()

  sendWhenRendererReady(window, 'scheduled-tasks:fired', {
    taskId: task.id,
    name: task.name || getProjectNameFromPath(task.projectPath),
    prompt: task.prompt,
    cwd: task.projectPath,
    permissionMode: task.permissionMode,
    firedAt,
    catchUp,
    manual,
  })

  emitScheduledTaskAdvance({
    taskId: task.id,
    firedAt,
    catchUp,
    manual,
  })
  holdScheduledTaskUntilSync(task.id)
}

async function checkMissedRuns() {
  const now = Date.now()

  for (const task of scheduledTasks) {
    if (!task.enabled || task.frequency === 'manual' || task.nextRunAt == null || task.nextRunAt > now) continue

    const lateness = now - task.nextRunAt
    if (lateness > MISSED_RUN_LIMIT) {
      emitScheduledTaskAdvance({
        taskId: task.id,
        firedAt: now,
        skipped: true,
        reason: '7일을 초과해 놓친 실행은 건너뛰고 다음 예약으로 이동합니다.',
        catchUp: true,
      })
      holdScheduledTaskUntilSync(task.id)
      continue
    }

    fireScheduledTask(task, { catchUp: lateness > CATCHUP_THRESHOLD })
  }

  scheduleNextTaskCheck()
}

function startScheduledTaskScheduler() {
  if (!scheduledTaskInterval) {
    scheduledTaskInterval = setInterval(() => {
      void checkMissedRuns()
    }, SCHEDULE_POLL_INTERVAL)
  }
  scheduleNextTaskCheck()
}

app.whenReady().then(() => {
  importShellEnvironmentVars()
  installDevLogForwarding()

  const appIconPath = resolveAppIconPath()
  if (process.platform === 'darwin' && appIconPath) {
    const icon = nativeImage.createFromPath(appIconPath)
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }

  mainWindow = createWindow()
  createTray()
  registerQuickPanelShortcut()
  showMainWindow()
  startScheduledTaskScheduler()
  void checkMissedRuns()

  powerMonitor.on('resume', () => {
    void checkMissedRuns()
  })
  powerMonitor.on('unlock-screen', () => {
    void checkMissedRuns()
  })

  // ── 모델 목록 ────────────────────────────────────────────────
  ipcMain.handle('claude:get-models', async (_event, { envVars }: { envVars?: Record<string, string> } = {}) => {
    const now = Date.now()
    const cacheKey = JSON.stringify({
      anthropicApiKey: readEnvVar(envVars, 'ANTHROPIC_API_KEY'),
      anthropicAuthToken: readEnvVar(envVars, 'ANTHROPIC_AUTH_TOKEN'),
      anthropicBaseUrl: readEnvVar(envVars, 'ANTHROPIC_BASE_URL'),
      nodeExtraCaCerts: readEnvVar(envVars, 'NODE_EXTRA_CA_CERTS'),
      processApiKey: process.env.ANTHROPIC_API_KEY ?? '',
      processAuthToken: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
      processBaseUrl: process.env.ANTHROPIC_BASE_URL ?? '',
      processNodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS ?? '',
    })

    if (modelsCache && modelsCache.cacheKey === cacheKey && now - modelsCache.fetchedAt < CACHE_TTL) {
      return modelsCache.list
    }
    const list = await fetchModelsFromApi(envVars)
    modelsCache = { list, fetchedAt: now, cacheKey }
    return list
  })

  // ── 폴더 선택 ─────────────────────────────────────────────────
  ipcMain.handle('claude:select-folder', async (_event, options?: { defaultPath?: string; title?: string }) => {
    const result = await dialog.showOpenDialog(mainWindow ?? showMainWindow(), {
      properties: ['openDirectory'],
      title: options?.title ?? '프로젝트 폴더 선택',
      defaultPath: options?.defaultPath ? resolveTargetPath(options.defaultPath) : undefined,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── 파일 선택 + 읽기 ─────────────────────────────────────────
  ipcMain.handle('claude:select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? showMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      title: '첨부할 파일 선택',
      filters: [
        {
          name: '이미지 파일',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'heic', 'heif'],
        },
        {
          name: '텍스트/코드 파일',
          extensions: [
            'txt', 'md', 'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs',
            'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml',
            'toml', 'sh', 'bash', 'zsh', 'env', 'xml', 'sql', 'graphql',
            'prisma', 'proto', 'swift', 'kt', 'rb', 'php',
          ],
        },
        { name: '모든 파일', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return []

    const files = await Promise.all(result.filePaths.map((filePath) => readSelectedFile(filePath)))
    return files.filter(Boolean)
  })

  // ── 파일 외부 에디터로 열기 ──────────────────────────────────
  ipcMain.handle('claude:open-file', async (_event, filePath: string) => {
    await shell.openPath(filePath)
  })

  ipcMain.handle('claude:list-open-with-apps', () => {
    return listOpenWithApps()
  })

  ipcMain.handle('claude:open-path-with-app', (_event, { targetPath, appId }: { targetPath: string; appId: string }) => {
    return openPathWithApp(targetPath, appId)
  })

  // ── @ 파일 참조: 파일 목록 조회 ──────────────────────────────
  ipcMain.handle('claude:list-files', (_event, { cwd, query }: { cwd: string; query: string }) => {
    const resolvedCwd = resolveTargetPath(cwd)
    if (!resolvedCwd) return []

    const results: { name: string; path: string; relativePath: string }[] = []
    const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__', '.venv', 'venv', '.DS_Store'])

    // 쿼리에 경로 구분자가 있으면 해당 디렉토리 안에서만 탐색
    // 예) "docs/" → docs 디렉토리 안 전체, "docs/api" → docs 안에서 "api" 필터
    const lastSlash = query.lastIndexOf('/')
    const dirQuery = lastSlash >= 0 ? query.slice(0, lastSlash) : ''
    const fileQuery = lastSlash >= 0 ? query.slice(lastSlash + 1) : query
    const startDir = dirQuery ? join(resolvedCwd, dirQuery) : resolvedCwd

    // 지정한 디렉토리가 존재하지 않으면 빈 결과 반환
    if (dirQuery && !existsSync(startDir)) return []

    function walk(dir: string, depth: number) {
      if (depth > 3 || results.length >= 20) return
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (results.length >= 20) break
          if (entry.name.startsWith('.')) continue
          const fullPath = join(dir, entry.name)
          const relativePath = fullPath.slice(resolvedCwd.length + 1)
          if (entry.isDirectory()) {
            if (!IGNORE.has(entry.name)) walk(fullPath, depth + 1)
          } else {
            const lowerFileQuery = fileQuery.toLowerCase()
            if (!fileQuery || entry.name.toLowerCase().includes(lowerFileQuery) || relativePath.toLowerCase().includes(lowerFileQuery)) {
              results.push({ name: entry.name, path: fullPath, relativePath })
            }
          }
        }
      } catch { /* ignore permission errors */ }
    }

    walk(startDir, 0)
    return results
  })

  // ── 현재 디렉토리 항목 조회 ──────────────────────────────────
  ipcMain.handle('claude:list-current-dir', (_event, { path }: { path: string }) => {
    const resolvedPath = resolveTargetPath(path)
    if (!resolvedPath || !existsSync(resolvedPath)) return []

    try {
      return readdirSync(resolvedPath, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => {
          const fullPath = join(resolvedPath, entry.name)
          const isDir = entry.isDirectory() || (entry.isSymbolicLink() && (() => {
            try { return statSync(fullPath).isDirectory() } catch { return false }
          })())
          return {
            name: entry.name,
            path: fullPath,
            type: isDir ? 'directory' : 'file',
          }
        })
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    } catch {
      return []
    }
  })

  // ── @ 파일 참조: 단일 파일 읽기 ──────────────────────────────
  ipcMain.handle('claude:read-file', (_event, { filePath }: { filePath: string }) => {
    return readSelectedFile(filePath)
  })

  ipcMain.handle('claude:read-file-data-url', (_event, { filePath }: { filePath: string }) => {
    return new Promise<string | null>((resolve) => {
      fsReadFile(filePath, (err, data) => {
        if (err) { resolve(null); return }
        const mimeType = MIME_TYPES_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
        resolve(`data:${mimeType};base64,${data.toString('base64')}`)
      })
    })
  })

  ipcMain.handle('claude:get-git-status', (_event, { cwd }: { cwd: string }) => {
    return getGitStatus(cwd)
  })

  ipcMain.handle('claude:get-git-diff', (_event, { cwd, filePath }: { cwd: string; filePath: string }) => {
    return getGitDiff(cwd, filePath)
  })

  ipcMain.handle('claude:get-git-log', (_event, { cwd, limit }: { cwd: string; limit?: number }) => {
    return getGitLog(cwd, limit)
  })

  ipcMain.handle('claude:get-git-commit-diff', (_event, { cwd, commitHash }: { cwd: string; commitHash: string }) => {
    return getGitCommitDiff(cwd, commitHash)
  })

  ipcMain.handle('claude:get-git-file-content', (_event, {
    cwd,
    commitHash,
    filePath,
  }: {
    cwd: string
    commitHash: string
    filePath: string
  }) => {
    return getGitFileContent(cwd, commitHash, filePath)
  })

  ipcMain.handle('claude:get-git-commit-file-content', (_event, {
    cwd,
    commitHash,
    filePath,
  }: {
    cwd: string
    commitHash: string
    filePath: string
  }) => {
    return getGitCommitFileContent(cwd, commitHash, filePath)
  })

  ipcMain.handle('claude:get-git-branches', (_event, { cwd }: { cwd: string }) => {
    return getGitBranches(cwd)
  })

  ipcMain.handle('claude:set-git-staged', (_event, { cwd, filePath, staged }: { cwd: string; filePath: string; staged: boolean }) => {
    return setGitStaged(cwd, filePath, staged)
  })

  ipcMain.handle('claude:restore-git-file', (_event, { cwd, filePath }: { cwd: string; filePath: string }) => {
    return restoreGitFile(cwd, filePath)
  })

  ipcMain.handle('claude:commit-git', (_event, { cwd, message }: { cwd: string; message: string }) => {
    return commitGit(cwd, message)
  })

  ipcMain.handle('claude:create-git-branch', (_event, { cwd, name }: { cwd: string; name: string }) => {
    return createGitBranch(cwd, name)
  })

  ipcMain.handle('claude:switch-git-branch', (_event, { cwd, name }: { cwd: string; name: string }) => {
    return switchGitBranch(cwd, name)
  })

  ipcMain.handle('claude:pull-git', (_event, { cwd }: { cwd: string }) => {
    return pullGit(cwd)
  })

  ipcMain.handle('claude:push-git', (_event, { cwd }: { cwd: string }) => {
    return pushGit(cwd)
  })

  ipcMain.handle('claude:delete-git-branch', (_event, { cwd, name }: { cwd: string; name: string }) => {
    return deleteGitBranch(cwd, name)
  })

  ipcMain.handle('claude:init-git-repo', (_event, { cwd }: { cwd: string }) => {
    return initGitRepo(cwd)
  })

  // ── Claude 설정 파일 읽기 ─────────────────────────────────────
  ipcMain.handle('claude:read-settings', async () => {
    try {
      const settingsPath = join(process.env.HOME ?? '', '.claude', 'settings.json')
      return JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch { return {} }
  })

  // ── ~/.claude 하위 디렉토리 파일 목록 ─────────────────────────
  ipcMain.handle('claude:list-claude-dir', (_event, { subdir }: { subdir: string }) => {
    try {
      const dir = join(process.env.HOME ?? '', '.claude', subdir)
      if (!existsSync(dir)) return []
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => ({ name: e.name, path: join(dir, e.name) }))
    } catch { return [] }
  })

  // ── Skills 목록 (new dir-based + legacy commands) ─────────────
  ipcMain.handle('claude:list-skills', () => {
    const results: Array<{ name: string; path: string; dir?: string; legacy: boolean }> = []

    // 헬퍼: 심볼릭 링크를 포함해 디렉토리인지 확인
    function isDir(p: string): boolean {
      try { return statSync(p).isDirectory() } catch { return false }
    }

    // 헬퍼: 디렉토리에서 SKILL.md 또는 첫 번째 .md 파일 경로 반환
    function findSkillFile(dir: string): string | null {
      const skillMd = join(dir, 'SKILL.md')
      if (existsSync(skillMd)) return skillMd
      try {
        const md = readdirSync(dir).find((f) => f.endsWith('.md'))
        return md ? join(dir, md) : null
      } catch { return null }
    }

    // 새 형식: ~/.claude/skills/<name>/ (심볼릭 링크 포함)
    try {
      const skillsDir = join(process.env.HOME ?? '', '.claude', 'skills')
      if (existsSync(skillsDir)) {
        for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
          const entryPath = join(skillsDir, entry.name)
          if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(entryPath))) {
            const skillFile = findSkillFile(entryPath)
            if (skillFile) results.push({ name: entry.name, path: skillFile, dir: entryPath, legacy: false })
          }
        }
      }
    } catch { /* ignore */ }

    // 레거시: ~/.claude/commands/ — 파일(.md) 및 디렉토리/심볼릭링크 모두 처리
    try {
      const commandsDir = join(process.env.HOME ?? '', '.claude', 'commands')
      if (existsSync(commandsDir)) {
        for (const entry of readdirSync(commandsDir, { withFileTypes: true })) {
          const entryPath = join(commandsDir, entry.name)
          if (entry.isFile() && entry.name.endsWith('.md')) {
            // 일반 파일
            results.push({ name: entry.name.replace(/\.md$/, ''), path: entryPath, legacy: true })
          } else if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(entryPath))) {
            // 디렉토리/심볼릭링크 → SKILL.md 또는 첫 .md 파일
            const skillFile = findSkillFile(entryPath)
            if (skillFile) results.push({ name: entry.name, path: skillFile, dir: entryPath, legacy: true })
          }
        }
      }
    } catch { /* ignore */ }

    return results
  })

  ipcMain.handle('claude:list-plugin-skills', () => {
    return listPluginSkills()
  })

  // ── 스킬 디렉토리 파일 목록 (절대경로) ───────────────────────────
  ipcMain.handle('claude:list-dir-abs', (_event, { dirPath }: { dirPath: string }) => {
    try {
      if (!existsSync(dirPath)) return []
      const results: { name: string; path: string }[] = []
      for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(dirPath, entry.name)
        const entryIsDir = entry.isDirectory() || (entry.isSymbolicLink() && (() => { try { return statSync(fullPath).isDirectory() } catch { return false } })())
        if (!entryIsDir) {
          results.push({ name: entry.name, path: fullPath })
        } else {
          try {
            for (const sub of readdirSync(fullPath, { withFileTypes: true })) {
              if (!sub.name.startsWith('.') && !sub.isDirectory()) {
                results.push({ name: `${entry.name}/${sub.name}`, path: join(fullPath, sub.name) })
              }
            }
          } catch { /* ignore */ }
        }
      }
      return results
    } catch { return [] }
  })

  // ── 절대경로로 파일 쓰기 ──────────────────────────────────────
  ipcMain.handle('claude:write-file-abs', (_event, { filePath, content }: { filePath: string; content: string }) => {
    try {
      const dir = dirname(filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // ── 파일/디렉토리 삭제 ────────────────────────────────────────
  ipcMain.handle('claude:delete-path', (_event, { targetPath, recursive }: { targetPath: string; recursive?: boolean }) => {
    try {
      if (!existsSync(targetPath)) return { ok: true }
      const stat = statSync(targetPath)
      if (stat.isDirectory()) {
        rmSync(targetPath, { recursive: true, force: true })
      } else {
        unlinkSync(targetPath)
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // ── MCP 서버 읽기/쓰기 ───────────────────────────────────────
  ipcMain.handle('claude:read-mcp-servers', (_event, payload?: { scope?: McpConfigScope; cwd?: string | null }) => {
    try {
      return readMcpServersForScope(payload?.scope ?? 'user', payload?.cwd)
    } catch {
      return {
        scope: payload?.scope ?? 'user',
        available: false,
        targetPath: getClaudeJsonPath(),
        projectPath: normalizeMcpProjectPath(payload?.cwd),
        mcpServers: {},
        message: 'MCP 설정을 읽는 중 오류가 발생했습니다.',
      } satisfies McpReadResult
    }
  })

  ipcMain.handle(
    'claude:write-mcp-servers',
    (_event, payload: { scope?: McpConfigScope; cwd?: string | null; mcpServers: unknown }) => {
      try {
        return writeMcpServersForScope(payload?.scope ?? 'user', payload?.cwd, payload?.mcpServers)
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle('claude:list-project-paths', () => {
    try {
      return listProjectPaths()
    } catch {
      return []
    }
  })

  ipcMain.handle('claude:read-project-mcp-servers', (_event, payload: { projectPath: string }) => {
    try {
      return readProjectMcpServers(payload.projectPath)
    } catch {
      return {
        scope: 'local',
        available: false,
        targetPath: getClaudeJsonPath(),
        projectPath: normalizeMcpProjectPath(payload.projectPath),
        mcpServers: {},
        message: '프로젝트별 MCP 설정을 읽는 중 오류가 발생했습니다.',
      } satisfies McpReadResult
    }
  })

  ipcMain.handle('claude:write-project-mcp-server', (_event, payload: { projectPath: string; name: string; config: unknown }) => {
    try {
      return writeProjectMcpServer(payload.projectPath, payload.name, payload.config)
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('claude:delete-project-mcp-server', (_event, payload: { projectPath: string; name: string }) => {
    try {
      return deleteProjectMcpServer(payload.projectPath, payload.name)
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('claude:read-dotmcp-servers', (_event, payload: { projectPath: string }) => {
    try {
      return readDotMcpServers(payload.projectPath)
    } catch {
      return {
        scope: 'project',
        available: false,
        targetPath: '.mcp.json',
        projectPath: normalizeMcpProjectPath(payload.projectPath),
        mcpServers: {},
        message: '공유 MCP 설정을 읽는 중 오류가 발생했습니다.',
      } satisfies McpReadResult
    }
  })

  ipcMain.handle('claude:write-dotmcp-server', (_event, payload: { projectPath: string; name: string; config: unknown }) => {
    try {
      return writeDotMcpServer(payload.projectPath, payload.name, payload.config)
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('claude:delete-dotmcp-server', (_event, payload: { projectPath: string; name: string }) => {
    try {
      return deleteDotMcpServer(payload.projectPath, payload.name)
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // ── Claude 설정 파일 쓰기 ─────────────────────────────────────
  ipcMain.handle('claude:write-settings', (_event, { settings }: { settings: unknown }) => {
    try {
      const claudeDir = join(process.env.HOME ?? '', '.claude')
      if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true })
      const settingsPath = join(claudeDir, 'settings.json')
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // ── ~/.claude 하위 파일 생성 ──────────────────────────────────
  ipcMain.handle('claude:write-claude-file', (_event, { subdir, name, content }: { subdir: string; name: string; content: string }) => {
    try {
      const dir = join(process.env.HOME ?? '', '.claude', subdir)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const filePath = join(dir, name)
      writeFileSync(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('claude:list-cli-sessions', (_event, { query }: { query?: string }) => {
    return listCliSessions(query)
  })

  ipcMain.handle('claude:load-cli-session', (_event, { filePath }: { filePath: string }) => {
    return loadCliSession(filePath)
  })

  ipcMain.handle('quick-panel:get-recent-projects', () => {
    return quickPanelProjects
  })

  ipcMain.handle('quick-panel:set-projects', (_event, { projects }: { projects: RecentProject[] }) => {
    quickPanelProjects = normalizeQuickPanelProjects(Array.isArray(projects) ? projects : [])
    return { ok: true }
  })

  ipcMain.handle('quick-panel:select-folder', (_event, options?: { defaultPath?: string; title?: string }) => {
    return selectFolderFromQuickPanel(options)
  })

  ipcMain.handle('quick-panel:update-shortcut', (_event, { accelerator, enabled }: { accelerator: string; enabled: boolean }) => {
    quickPanelAccelerator = accelerator
    quickPanelEnabled = enabled
    registerQuickPanelShortcut()
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

  ipcMain.handle('scheduled-tasks:sync', (_event, { tasks }: { tasks: ScheduledTaskSyncItem[] }) => {
    scheduledTasks = normalizeScheduledTasks(Array.isArray(tasks) ? tasks : [])
    scheduleNextTaskCheck()
    void checkMissedRuns()
    return { ok: true }
  })

  ipcMain.handle('scheduled-tasks:run-now', (_event, { taskId }: { taskId: string }) => {
    const task = scheduledTasks.find((item) => item.id === taskId)
    if (!task) {
      return { ok: false, error: '작업을 찾을 수 없습니다.' }
    }

    fireScheduledTask(task, { manual: true })
    scheduleNextTaskCheck()
    return { ok: true }
  })

  ipcMain.handle('claude:check-installation', (_event, { claudePath }: { claudePath?: string }) => {
    return detectClaudeInstallation(claudePath)
  })

  // ── Claude CLI 실행 ──────────────────────────────────────────
  ipcMain.handle(
    'claude:send-message',
    async (
      event,
      {
        sessionId, prompt, cwd, claudePath, permissionMode, planMode, model, envVars,
      }: {
        sessionId: string | null
        prompt: string
        cwd: string
        claudePath?: string
        permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
        planMode?: boolean
        model?: string
        envVars?: Record<string, string>
      }
    ) => {
      if (sessionId && activeProcesses.has(sessionId)) {
        activeProcesses.get(sessionId)!.kill()
        activeProcesses.delete(sessionId)
      }

      const expandedPath = claudePath?.replace(/^~/, getUserHomePath())
      const claudeBin = expandedPath && existsSync(expandedPath)
        ? expandedPath
        : resolveClaude()
      const args: string[] = ['--output-format', 'stream-json', '--include-partial-messages', '--verbose']

      if (sessionId) args.unshift('--resume', sessionId)
      if (model) args.push('--model', model)
      if (planMode) {
        args.push('--permission-mode', 'plan')
      } else if (permissionMode && permissionMode !== 'default') {
        args.push('--permission-mode', permissionMode)
      }
      args.push('-p')

      const { CLAUDECODE: _, ...cleanEnv } = process.env
      const homePath = getUserHomePath(cleanEnv)
      const resolvedCwd = cwd ? resolveTargetPath(cwd) : homePath
      const procEnv = {
        ...cleanEnv,
        HOME: cleanEnv.HOME ?? homePath,
        USERPROFILE: cleanEnv.USERPROFILE ?? homePath,
        ...(envVars ?? {}),
      }
      const userShell = procEnv.SHELL || '/bin/bash'

      const proc = process.platform === 'win32'
        ? spawn(claudeBin, args, {
            cwd: resolvedCwd,
            env: procEnv,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
          })
        : spawn(userShell, ['-l', '-c', '"$0" "$@"', claudeBin, ...args], {
            cwd: resolvedCwd,
            env: procEnv,
            stdio: ['pipe', 'pipe', 'pipe'],
          })

      // Write the prompt through stdin so large attachments do not hit OS ARG_MAX limits.
      proc.stdin?.write(prompt)
      proc.stdin?.end()
      const tempKey = `pending-${Date.now()}`

      let resolvedSessionId: string | null = sessionId
      let buffer = ''

      const processOutputLines = (flush = false) => {
        const lines = buffer.split('\n')
        buffer = flush ? '' : (lines.pop() ?? '')
        const readyLines = flush ? lines.filter(Boolean) : lines
        for (const line of readyLines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const eventData = JSON.parse(trimmed)
            appendClaudeResponseLog({
              source: 'stdout',
              sessionId: resolvedSessionId,
              eventType: typeof eventData.type === 'string' ? eventData.type : null,
              payload: eventData,
            })
            handleClaudeEvent(event.sender, eventData, resolvedSessionId, (sid) => {
              resolvedSessionId = sid
              if (sid && !sessionId) {
                activeProcesses.set(sid, proc)
                if (activeProcesses.get(tempKey) === proc) {
                  activeProcesses.delete(tempKey)
                }
              }
            })
          } catch (err) {
            appendClaudeResponseLog({
              source: 'stdout',
              sessionId: resolvedSessionId,
              eventType: 'parse-error',
              error: String(err),
              raw: trimmed,
            })
          }
        }
      }

      proc.stdout!.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        processOutputLines(false)
      })

      proc.stderr!.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        appendClaudeResponseLog({
          source: 'stderr',
          sessionId: resolvedSessionId,
          text,
        })
        if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fatal')) {
          event.sender.send('claude:error', { sessionId: resolvedSessionId, error: text })
        }
      })

      proc.on('close', (code) => {
        if (buffer.trim()) {
          processOutputLines(true)
        }
        if (activeProcesses.get(tempKey) === proc) {
          activeProcesses.delete(tempKey)
        }
        if (resolvedSessionId && activeProcesses.get(resolvedSessionId) === proc) {
          activeProcesses.delete(resolvedSessionId)
        }
        appendClaudeResponseLog({
          source: 'lifecycle',
          sessionId: resolvedSessionId,
          eventType: 'stream-end',
          exitCode: code,
        })
        event.sender.send('claude:stream-end', { sessionId: resolvedSessionId, exitCode: code })
      })

      proc.on('error', (err) => {
        if (activeProcesses.get(tempKey) === proc) {
          activeProcesses.delete(tempKey)
        }
        if (resolvedSessionId && activeProcesses.get(resolvedSessionId) === proc) {
          activeProcesses.delete(resolvedSessionId)
        }
        appendClaudeResponseLog({
          source: 'lifecycle',
          sessionId: resolvedSessionId,
          eventType: 'process-error',
          error: err.message,
        })
        event.sender.send('claude:error', { sessionId: resolvedSessionId, error: err.message })
      })

      activeProcesses.set(tempKey, proc)
      return { tempKey }
    }
  )

  // ── 스트리밍 중단 ────────────────────────────────────────────
  ipcMain.handle('claude:abort', (_event, { sessionId }: { sessionId: string }) => {
    const proc = activeProcesses.get(sessionId)
    if (proc) {
      proc.kill('SIGINT')
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill('SIGKILL')
        } catch { /* ignore */ }
      }, 250)
      activeProcesses.delete(sessionId)
    }
  })

  ipcMain.handle('claude:has-active-process', (_event, { sessionId }: { sessionId: string }) => {
    return activeProcesses.has(sessionId)
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
  for (const proc of activeProcesses.values()) proc.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (scheduledTaskInterval) {
    clearInterval(scheduledTaskInterval)
    scheduledTaskInterval = null
  }
  clearScheduledTaskTimeout()
  globalShortcut.unregisterAll()
})

function detectClaudeInstallation(overridePath?: string): { installed: boolean; path: string | null; version: string | null } {
  const homePath = getUserHomePath()
  const userShell = process.env.SHELL || '/bin/bash'
  const expandedOverride = overridePath?.replace(/^~/, homePath)
  if (expandedOverride && !existsSync(expandedOverride)) {
    return { installed: false, path: null, version: null }
  }
  const commandPath = expandedOverride ?? resolveClaude()
  const result = process.platform === 'win32'
    ? spawnSync(commandPath, ['--version'], {
        encoding: 'utf-8',
        timeout: 3000,
        env: {
          ...process.env,
          HOME: process.env.HOME ?? homePath,
          USERPROFILE: process.env.USERPROFILE ?? homePath,
        },
        shell: true,
      })
    : spawnSync(userShell, ['-l', '-c', '"$0" --version', commandPath], {
        encoding: 'utf-8',
        timeout: 3000,
        env: process.env,
      })

  if (result.error || result.status !== 0) {
    return {
      installed: false,
      path: null,
      version: null,
    }
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean)
  const path = commandPath
  const version = lines.find((line) => /\bClaude Code\b/i.test(line) || /^\d+\.\d+\.\d+/.test(line)) ?? null
  return {
    installed: true,
    path,
    version,
  }
}

function resolveClaude(): string {
  if (process.platform === 'win32') {
    const homePath = getUserHomePath()
    const appDataPath = process.env.APPDATA ?? join(homePath, 'AppData', 'Roaming')
    const candidates = [
      join(appDataPath, 'npm', 'claude.cmd'),
      join(appDataPath, 'npm', 'claude.exe'),
      join(appDataPath, 'npm', 'claude.bat'),
    ]
    const pathDirs = (process.env.PATH ?? '').split(';').filter(Boolean)
    for (const dir of pathDirs) {
      candidates.push(join(dir, 'claude.cmd'))
      candidates.push(join(dir, 'claude.exe'))
      candidates.push(join(dir, 'claude.bat'))
      candidates.push(join(dir, 'claude'))
    }
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
    return 'claude'
  }

  const candidates = [
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    join(getUserHomePath(), '.local/bin/claude'),
    join(getUserHomePath(), '.npm-global/bin/claude'),
    '/opt/homebrew/bin/claude',
    join(getUserHomePath(), '.volta/bin/claude'),
  ]
  const pathDirs = (process.env.PATH ?? '').split(':')
  for (const dir of pathDirs) candidates.push(join(dir, 'claude'))
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return 'claude'
}

type Sender = Electron.WebContents

function getToolFileSnapshotBefore(toolName: string, toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== 'object') return null

  if (!['Edit', 'MultiEdit', 'Write'].includes(toolName)) return null

  const filePath = (toolInput as { file_path?: unknown }).file_path
  if (typeof filePath !== 'string' || !filePath.trim() || !existsSync(filePath)) return null

  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function resetStreamedAssistantState(sessionId: string) {
  streamedAssistantStateBySession.set(sessionId, {
    sawTextDelta: false,
    sawThinkingDelta: false,
  })
}

function getStreamedAssistantState(sessionId: string): { sawTextDelta: boolean; sawThinkingDelta: boolean } {
  const current = streamedAssistantStateBySession.get(sessionId)
  if (current) return current

  const next = { sawTextDelta: false, sawThinkingDelta: false }
  streamedAssistantStateBySession.set(sessionId, next)
  return next
}

function handleClaudeEvent(
  sender: Sender,
  data: Record<string, unknown>,
  sessionId: string | null,
  onSessionId: (sid: string) => void
) {
  const type = data.type as string

  if (type === 'system') {
    const sid = data.session_id as string | undefined
    if (sid) { onSessionId(sid); sender.send('claude:stream-start', { sessionId: sid, cwd: data.cwd }) }
    return
  }

  if (type === 'stream_event') {
    const sid = (data.session_id as string) || sessionId
    if (sid) onSessionId(sid)
    const event = isRecord(data.event) ? data.event : null
    if (!sid || !event) return

    const eventType = typeof event.type === 'string' ? event.type : ''
    if (eventType === 'message_start') {
      resetStreamedAssistantState(sid)
      return
    }

    if (eventType === 'message_stop') {
      streamedAssistantStateBySession.delete(sid)
      return
    }

    if (eventType !== 'content_block_delta') return

    const delta = isRecord(event.delta) ? event.delta : null
    if (!delta || typeof delta.type !== 'string') return

    if (delta.type === 'thinking_delta') {
      const text = typeof delta.thinking === 'string' ? delta.thinking : ''
      if (!text) return
      getStreamedAssistantState(sid).sawThinkingDelta = true
      sender.send('claude:thinking-chunk', { sessionId: sid, text })
      return
    }

    if (delta.type === 'text_delta') {
      const text = typeof delta.text === 'string' ? delta.text : ''
      if (!text) return
      getStreamedAssistantState(sid).sawTextDelta = true
      sender.send('claude:text-chunk', { sessionId: sid, text })
    }
    return
  }

  if (type === 'assistant') {
    const message = data.message as Record<string, unknown>
    const sid = (data.session_id as string) || sessionId
    if (sid) onSessionId(sid)
    const content = message.content as Array<Record<string, unknown>>
    if (!Array.isArray(content)) return
    const streamedState = sid ? streamedAssistantStateBySession.get(sid) : null
    const textBlocks: string[] = []
    for (const block of content) {
      if ((block.type as string) === 'thinking') {
        if (streamedState?.sawThinkingDelta) continue
        const text = String(block.thinking ?? block.text ?? '')
        sender.send('claude:thinking-chunk', { sessionId: sid, text })
      } else if ((block.type as string) === 'text') {
        if (streamedState?.sawTextDelta) continue
        const text = String(block.text ?? '')
        textBlocks.push(text)
        sender.send('claude:text-chunk', { sessionId: sid, text })
      } else if ((block.type as string) === 'tool_use') {
        sender.send('claude:tool-start', {
          sessionId: sid, toolUseId: block.id as string,
          toolName: block.name as string,
          toolInput: block.input,
          fileSnapshotBefore: getToolFileSnapshotBefore(block.name as string, block.input),
        })
      }
    }

    if (typeof data.error === 'string' && textBlocks.join('').trim()) {
      sender.send('claude:error', { sessionId: sid, error: textBlocks.join('').trim() })
    }
    return
  }

  if (type === 'user') {
    const message = data.message as Record<string, unknown> | undefined
    const sid = (data.session_id as string) || sessionId
    if (sid) onSessionId(sid)
    const content = (message?.content ?? data.content) as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(content)) return
    for (const block of content) {
      if ((block.type as string) === 'tool_result') {
        sender.send('claude:tool-result', {
          sessionId: sid, toolUseId: block.tool_use_id,
          content: block.content, isError: block.is_error ?? false,
        })
      }
    }
    return
  }

  if (type === 'result') {
    const sid = (data.session_id as string) || sessionId
    if (sid) streamedAssistantStateBySession.delete(sid)
    sender.send('claude:result', {
      sessionId: sid, costUsd: data.cost_usd,
      totalCostUsd: data.total_cost_usd,
      isError: data.is_error,
      durationMs: data.duration_ms,
      resultText: typeof data.result === 'string' ? data.result : undefined,
      permissionDenials: Array.isArray(data.permission_denials)
        ? data.permission_denials
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .map((item) => ({
              toolName: String(item.tool_name ?? ''),
              toolUseId: String(item.tool_use_id ?? ''),
              toolInput: item.tool_input,
            }))
        : undefined,
    })

    if (data.is_error) {
      const resultText = typeof data.result === 'string' && data.result.trim()
        ? data.result.trim()
        : typeof data.result !== 'undefined'
          ? JSON.stringify(data.result)
          : ''

      if (!resultText) {
        const message = typeof data.error === 'string' && data.error.trim()
          ? data.error.trim()
          : 'Claude Code 요청이 실패했습니다.'
        sender.send('claude:error', { sessionId: sid, error: message })
      }
    }
  }
}
