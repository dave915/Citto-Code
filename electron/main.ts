import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Notification } from 'electron'
import { join, dirname, extname } from 'path'
import { tmpdir } from 'os'
import { spawn, spawnSync, ChildProcess, execSync } from 'child_process'
import { existsSync, readFile as fsReadFile, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync, unlinkSync, rmSync } from 'fs'
import { request as httpsRequest } from 'https'
import { request as httpRequest } from 'http'

const activeProcesses = new Map<string, ChildProcess>()

// 모델 캐시 (5분)
let modelsCache: { list: ModelInfo[]; fetchedAt: number } | null = null
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

function modelDisplayName(id: string): string {
  // claude-{family}-{major}-{minor}[-YYYYMMDD]
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/)
  if (!m) return id
  const [, fam, major, minor] = m
  const name = fam.charAt(0).toUpperCase() + fam.slice(1)
  return minor ? `${name} ${major}.${minor}` : `${name} ${major}`
}

function resolveTargetPath(targetPath: string): string {
  return targetPath === '~' ? (process.env.HOME ?? '') : targetPath
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
    MAC_OPEN_WITH_APPS.map(async (app) => {
      const appPath = app.bundleIds.map(findBundlePath).find(Boolean)
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

  return apps.filter((entry): entry is OpenWithApp => Boolean(entry))
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

function openPathWithApp(targetPath: string, appId: string): { ok: boolean; error?: string } {
  const resolvedPath = resolveTargetPath(targetPath)
  if (!resolvedPath) return { ok: false, error: '열 경로를 찾지 못했습니다.' }

  if (appId === 'default' || process.platform !== 'darwin') {
    const error = shell.openPath(resolvedPath)
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

async function getApiConfig(): Promise<{ apiKey: string; baseUrl: string }> {
  let apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  let baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'

  try {
    const settingsPath = join(process.env.HOME ?? '', '.claude', 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    if (settings.baseURL) baseUrl = settings.baseURL
    if (!apiKey && settings.apiKeyHelper) {
      apiKey = execSync(settings.apiKeyHelper, { encoding: 'utf-8', timeout: 5000 }).trim()
    }
  } catch { /* ignore */ }

  return { apiKey, baseUrl }
}

async function fetchModelsFromApi(): Promise<ModelInfo[]> {
  const { apiKey, baseUrl } = await getApiConfig()
  if (!apiKey) return FALLBACK_MODELS

  return new Promise((resolve) => {
    const url = new URL('/v1/models', baseUrl)
    const isHttps = url.protocol === 'https:'
    const requester = isHttps ? httpsRequest : httpRequest

    const req = requester(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const apiModels: ModelInfo[] = (json.data ?? [])
              .filter((m: { id: string }) => /^claude-/i.test(m.id))
              .map((m: { id: string; display_name?: string }) => ({
                id: m.id,
                displayName: m.display_name || modelDisplayName(m.id),
                family: m.id.includes('opus') ? 'opus'
                  : m.id.includes('haiku') ? 'haiku'
                  : 'sonnet',
              }))

            // API 결과 + fallback 병합 (중복 제거, id 역순 정렬)
            const merged = [...apiModels]
            for (const fb of FALLBACK_MODELS) {
              if (!merged.find((m) => m.id === fb.id)) merged.push(fb)
            }
            const models = merged.sort((a, b) => b.id.localeCompare(a.id))

            resolve(models.length > 0 ? models : FALLBACK_MODELS)
          } catch {
            resolve(FALLBACK_MODELS)
          }
        })
      }
    )

    req.on('error', () => resolve(FALLBACK_MODELS))
    req.setTimeout(5000, () => { req.destroy(); resolve(FALLBACK_MODELS) })
    req.end()
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#F5F0EB',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  const win = createWindow()

  // ── 모델 목록 ────────────────────────────────────────────────
  ipcMain.handle('claude:get-models', async () => {
    const now = Date.now()
    if (modelsCache && now - modelsCache.fetchedAt < CACHE_TTL) {
      return modelsCache.list
    }
    const list = await fetchModelsFromApi()
    modelsCache = { list, fetchedAt: now }
    return list
  })

  // ── 폴더 선택 ─────────────────────────────────────────────────
  ipcMain.handle('claude:select-folder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '프로젝트 폴더 선택',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── 파일 선택 + 읽기 ─────────────────────────────────────────
  ipcMain.handle('claude:select-files', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      title: '첨부할 파일 선택',
      filters: [
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

    const files = await Promise.all(
      result.filePaths.map(
        (filePath) =>
          new Promise<{ name: string; path: string; content: string; size: number } | null>(
            (resolve) => {
              fsReadFile(filePath, 'utf-8', (err, data) => {
                if (err) { resolve(null); return }
                resolve({ name: filePath.split('/').pop() ?? filePath, path: filePath, content: data, size: data.length })
              })
            }
          )
      )
    )
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
    const resolvedCwd = (cwd === '~') ? (process.env.HOME ?? '') : cwd
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
    const resolvedPath = path === '~' ? (process.env.HOME ?? '') : path
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
    return new Promise<{ name: string; path: string; content: string; size: number } | null>((resolve) => {
      fsReadFile(filePath, 'utf-8', (err, data) => {
        if (err) { resolve(null); return }
        resolve({ name: filePath.split('/').pop() ?? filePath, path: filePath, content: data, size: data.length })
      })
    })
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
    const results: { name: string; path: string; legacy: boolean }[] = []

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

  // ── ~/.claude.json MCP 서버 읽기 ─────────────────────────────
  ipcMain.handle('claude:read-mcp-servers', () => {
    try {
      const jsonPath = join(process.env.HOME ?? '', '.claude.json')
      if (!existsSync(jsonPath)) return {}
      const raw = readFileSync(jsonPath, 'utf-8')
      const parsed = JSON.parse(raw)
      return (parsed?.mcpServers ?? {}) as Record<string, unknown>
    } catch { return {} }
  })

  // ── ~/.claude.json MCP 서버 쓰기 ─────────────────────────────
  ipcMain.handle('claude:write-mcp-servers', (_event, { mcpServers }: { mcpServers: unknown }) => {
    try {
      const jsonPath = join(process.env.HOME ?? '', '.claude.json')
      let existing: Record<string, unknown> = {}
      if (existsSync(jsonPath)) {
        try { existing = JSON.parse(readFileSync(jsonPath, 'utf-8')) } catch { /* ignore */ }
      }
      const updated = { ...existing, mcpServers }
      writeFileSync(jsonPath, JSON.stringify(updated, null, 2), 'utf-8')
      return { ok: true }
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

      const claudeBin = resolveClaude()
      const args: string[] = ['--output-format', 'stream-json', '--verbose', '-p', prompt]

      if (sessionId) args.unshift('--resume', sessionId)
      if (model) args.push('--model', model)
      if (planMode) {
        args.push('--permission-mode', 'plan')
      } else if (permissionMode && permissionMode !== 'default') {
        args.push('--permission-mode', permissionMode)
      }

      const { CLAUDECODE: _, ...cleanEnv } = process.env
      const resolvedCwd = (cwd && cwd !== '~') ? cwd : (cleanEnv.HOME ?? '/tmp')
      const userShell = cleanEnv.SHELL || '/bin/bash'

      const proc = spawn(userShell, ['-l', '-c', '"$0" "$@"', claudeBin, ...args], {
        cwd: resolvedCwd,
        env: { ...cleanEnv, ...(envVars ?? {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
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
            handleClaudeEvent(event.sender, eventData, resolvedSessionId, (sid) => {
              resolvedSessionId = sid
              if (sid && !sessionId) {
                activeProcesses.set(sid, proc)
                activeProcesses.delete(tempKey)
              }
            })
          } catch { /* not JSON */ }
        }
      }

      proc.stdout!.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        processOutputLines(false)
      })

      proc.stderr!.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fatal')) {
          event.sender.send('claude:error', { sessionId: resolvedSessionId, error: text })
        }
      })

      proc.on('close', (code) => {
        if (buffer.trim()) {
          processOutputLines(true)
        }
        activeProcesses.delete(tempKey)
        if (resolvedSessionId) activeProcesses.delete(resolvedSessionId)
        event.sender.send('claude:stream-end', { sessionId: resolvedSessionId, exitCode: code })
      })

      proc.on('error', (err) => {
        activeProcesses.delete(tempKey)
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
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const proc of activeProcesses.values()) proc.kill()
  if (process.platform !== 'darwin') app.quit()
})

function detectClaudeInstallation(overridePath?: string): { installed: boolean; path: string | null; version: string | null } {
  const userShell = process.env.SHELL || '/bin/bash'
  const commandPath = overridePath && existsSync(overridePath)
    ? overridePath
    : resolveClaude()
  const result = spawnSync(userShell, ['-l', '-c', '"$0" --version', commandPath], {
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
  const candidates = [
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    join(process.env.HOME ?? '', '.local/bin/claude'),
    join(process.env.HOME ?? '', '.npm-global/bin/claude'),
    '/opt/homebrew/bin/claude',
    join(process.env.HOME ?? '', '.volta/bin/claude'),
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

  if (type === 'assistant') {
    const message = data.message as Record<string, unknown>
    const sid = (data.session_id as string) || sessionId
    if (sid) onSessionId(sid)
    const content = message.content as Array<Record<string, unknown>>
    if (!Array.isArray(content)) return
    const textBlocks: string[] = []
    for (const block of content) {
      if ((block.type as string) === 'text') {
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
