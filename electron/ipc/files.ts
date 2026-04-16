import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'child_process'
import { dirname, extname, join } from 'path'
import { existsSync, mkdirSync, readFile as fsReadFile, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import type { OpenWithApp, SelectedFile } from '../preload'

type ReadFileOutcome =
  | { ok: true; file: SelectedFile }
  | { ok: false; name: string; reason: string }

type RegisterFileIpcHandlersOptions = {
  getMainWindow: () => BrowserWindow | null
  showMainWindow: () => BrowserWindow
  readSelectedFile: (filePath: string) => Promise<ReadFileOutcome>
  resolveTargetPath: (targetPath: string) => string
  listOpenWithApps: () => Promise<OpenWithApp[]>
  openPathWithApp: (targetPath: string, appId: string) => Promise<{ ok: boolean; error?: string }>
  mimeTypesByExtension: Record<string, string>
}

function isLocalPreviewHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1' || hostname === '[::1]') {
    return true
  }

  return /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

function isAllowedPreviewUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return isLocalPreviewHost(parsed.hostname)
  } catch {
    return false
  }
}

function getPathBaseName(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? 'project'
}

function sanitizeArchiveName(name: string): string {
  const trimmed = name.trim().replace(/\.zip$/i, '')
  const sanitized = trimmed.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim()
  return sanitized || 'project'
}

function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'ignore',
      windowsHide: true,
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`))
    })
  })
}

async function createZipArchive(sourcePath: string, targetPath: string): Promise<void> {
  if (process.platform === 'darwin') {
    await runCommand('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', sourcePath, targetPath])
    return
  }

  if (process.platform === 'win32') {
    const escapedSourcePath = sourcePath.replace(/'/g, "''")
    const escapedTargetPath = targetPath.replace(/'/g, "''")
    await runCommand('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -LiteralPath '${escapedSourcePath}' -DestinationPath '${escapedTargetPath}' -Force`,
    ])
    return
  }

  const parentDir = dirname(sourcePath)
  const directoryName = getPathBaseName(sourcePath)
  const excludedEntries = [
    `${directoryName}/node_modules/*`,
    `${directoryName}/.git/*`,
    `${directoryName}/dist/*`,
    `${directoryName}/build/*`,
    `${directoryName}/out/*`,
    `${directoryName}/coverage/*`,
    `${directoryName}/.next/*`,
    `${directoryName}/.turbo/*`,
    `${directoryName}/.cache/*`,
    `${directoryName}/.DS_Store`,
  ]

  await runCommand(
    'zip',
    ['-rq', targetPath, directoryName, ...excludedEntries.flatMap((entry) => ['-x', entry])],
    parentDir,
  )
}

export function registerFileIpcHandlers({
  getMainWindow,
  showMainWindow,
  readSelectedFile,
  resolveTargetPath,
  listOpenWithApps,
  openPathWithApp,
  mimeTypesByExtension,
}: RegisterFileIpcHandlersOptions) {
  ipcMain.handle('claude:select-folder', async (_event, options?: { defaultPath?: string; title?: string }) => {
    const result = await dialog.showOpenDialog(getMainWindow() ?? showMainWindow(), {
      properties: ['openDirectory'],
      title: options?.title ?? '프로젝트 폴더 선택',
      defaultPath: options?.defaultPath ? resolveTargetPath(options.defaultPath) : undefined,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('claude:select-files', async () => {
    const result = await dialog.showOpenDialog(getMainWindow() ?? showMainWindow(), {
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
    if (result.canceled || result.filePaths.length === 0) return { files: [], skipped: [] }

    const outcomes = await Promise.all(result.filePaths.map((filePath) => readSelectedFile(filePath)))
    const files = outcomes
      .filter((outcome): outcome is Extract<ReadFileOutcome, { ok: true }> => outcome.ok)
      .map((outcome) => outcome.file)
    const skipped = outcomes
      .filter((outcome): outcome is Extract<ReadFileOutcome, { ok: false }> => !outcome.ok)
      .map((outcome) => ({ name: outcome.name, reason: outcome.reason }))
    return { files, skipped }
  })

  ipcMain.handle('claude:open-file', async (_event, filePath: string) => {
    await shell.openPath(filePath)
  })

  ipcMain.handle('claude:open-in-browser', async (_event, { filePath }: { filePath: string }) => {
    try {
      const target = /^https?:\/\//i.test(filePath)
        ? filePath
        : pathToFileURL(filePath).toString()
      await shell.openExternal(target)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:list-open-with-apps', () => {
    return listOpenWithApps()
  })

  ipcMain.handle('claude:open-path-with-app', (_event, { targetPath, appId }: { targetPath: string; appId: string }) => {
    return openPathWithApp(targetPath, appId)
  })

  ipcMain.handle('claude:list-files', (_event, { cwd, query }: { cwd: string; query: string }) => {
    const resolvedCwd = resolveTargetPath(cwd)
    if (!resolvedCwd) return []

    const results: { name: string; path: string; relativePath: string }[] = []
    const ignore = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__', '.venv', 'venv', '.DS_Store'])
    const lastSlash = query.lastIndexOf('/')
    const dirQuery = lastSlash >= 0 ? query.slice(0, lastSlash) : ''
    const fileQuery = lastSlash >= 0 ? query.slice(lastSlash + 1) : query
    const startDir = dirQuery ? join(resolvedCwd, dirQuery) : resolvedCwd

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
            if (!ignore.has(entry.name)) walk(fullPath, depth + 1)
          } else {
            const lowerFileQuery = fileQuery.toLowerCase()
            if (!fileQuery || entry.name.toLowerCase().includes(lowerFileQuery) || relativePath.toLowerCase().includes(lowerFileQuery)) {
              results.push({ name: entry.name, path: fullPath, relativePath })
            }
          }
        }
      } catch {
        // Ignore permission errors while searching.
      }
    }

    walk(startDir, 0)
    return results
  })

  ipcMain.handle('claude:list-current-dir', (_event, { path }: { path: string }) => {
    const resolvedPath = resolveTargetPath(path)
    if (!resolvedPath || !existsSync(resolvedPath)) return []

    try {
      return readdirSync(resolvedPath, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => {
          const fullPath = join(resolvedPath, entry.name)
          const isDir = entry.isDirectory() || (entry.isSymbolicLink() && (() => {
            try {
              return statSync(fullPath).isDirectory()
            } catch {
              return false
            }
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

  ipcMain.handle('claude:read-file', (_event, { filePath }: { filePath: string }) => {
    return readSelectedFile(filePath)
  })

  ipcMain.handle('claude:read-file-data-url', (_event, { filePath }: { filePath: string }) => {
    return new Promise<string | null>((resolve) => {
      fsReadFile(filePath, (error, data) => {
        if (error) {
          resolve(null)
          return
        }
        const mimeType = mimeTypesByExtension[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
        resolve(`data:${mimeType};base64,${data.toString('base64')}`)
      })
    })
  })

  ipcMain.handle('claude:read-preview-url', async (_event, { url }: { url: string }) => {
    if (!isAllowedPreviewUrl(url)) return null

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
        },
      })
      if (!response.ok) return null

      const finalUrl = response.url || url
      if (!isAllowedPreviewUrl(finalUrl)) return null

      const html = await response.text()
      if (!html.trim()) return null

      return { url: finalUrl, html }
    } catch {
      return null
    }
  })

  ipcMain.handle('claude:write-file-abs', (_event, { filePath, content }: { filePath: string; content: string }) => {
    try {
      const dir = dirname(filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle(
    'claude:save-text-file',
    async (
      event,
      {
        suggestedName,
        defaultPath,
        content,
        filters,
      }: {
        suggestedName: string
        defaultPath?: string
        content: string
        filters?: Array<{ name: string; extensions: string[] }>
      },
    ) => {
      try {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow() ?? showMainWindow()
        const fallbackDir = app.getPath('documents')
        const resolvedDefaultPath = defaultPath?.trim()
          ? defaultPath
          : join(fallbackDir, suggestedName)

        const result = await dialog.showSaveDialog(parentWindow, {
          defaultPath: resolvedDefaultPath,
          filters,
        })

        if (result.canceled || !result.filePath) {
          return { ok: false, canceled: true }
        }

        writeFileSync(result.filePath, content, 'utf-8')
        return { ok: true, path: result.filePath }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    },
  )

  ipcMain.handle(
    'claude:save-zip-archive',
    async (
      event,
      {
        sourcePath,
        suggestedName,
      }: {
        sourcePath: string
        suggestedName?: string
      },
    ) => {
      let targetPath: string | null = null

      try {
        const resolvedSourcePath = resolveTargetPath(sourcePath)
        if (!resolvedSourcePath || !existsSync(resolvedSourcePath)) {
          return { ok: false, error: 'Source path does not exist.' }
        }

        const sourceStat = statSync(resolvedSourcePath)
        if (!sourceStat.isDirectory()) {
          return { ok: false, error: 'Source path must be a directory.' }
        }

        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow() ?? showMainWindow()
        const archiveName = sanitizeArchiveName(suggestedName ?? getPathBaseName(resolvedSourcePath))
        const result = await dialog.showSaveDialog(parentWindow, {
          defaultPath: join(app.getPath('documents'), `${archiveName}.zip`),
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
        })

        if (result.canceled || !result.filePath) {
          return { ok: false, canceled: true }
        }

        targetPath = result.filePath.toLowerCase().endsWith('.zip')
          ? result.filePath
          : `${result.filePath}.zip`

        await createZipArchive(resolvedSourcePath, targetPath)
        return { ok: true, path: targetPath }
      } catch (error) {
        if (targetPath && existsSync(targetPath)) {
          try {
            unlinkSync(targetPath)
          } catch {
            // Ignore cleanup failures and surface the original error.
          }
        }
        return { ok: false, error: String(error) }
      }
    },
  )

  ipcMain.handle('claude:delete-path', (_event, { targetPath }: { targetPath: string; recursive?: boolean }) => {
    try {
      if (!existsSync(targetPath)) return { ok: true }
      const stat = statSync(targetPath)
      if (stat.isDirectory()) {
        rmSync(targetPath, { recursive: true, force: true })
      } else {
        unlinkSync(targetPath)
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })
}
