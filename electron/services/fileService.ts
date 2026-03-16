import { execSync, spawnSync } from 'child_process'
import { nativeImage, shell } from 'electron'
import { existsSync, readFile as fsReadFile, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { extname, join } from 'path'
import type { OpenWithApp, SelectedFile } from '../preload'
import { resolveTargetPath } from './shellEnvironmentService'

type MacOpenWithApp = OpenWithApp & {
  bundleIds: string[]
}

export const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
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

const FILE_SIZE_LIMIT = 100 * 1024 * 1024

export type ReadFileOutcome =
  | { ok: true; file: SelectedFile }
  | { ok: false; name: string; reason: string }

function isImageFilePath(filePath: string): boolean {
  return extname(filePath).toLowerCase() in MIME_TYPES_BY_EXTENSION
}

export function readSelectedFile(filePath: string): Promise<ReadFileOutcome> {
  const name = filePath.split('/').pop() ?? filePath
  return new Promise((resolve) => {
    if (isImageFilePath(filePath)) {
      fsReadFile(filePath, (err, data) => {
        if (err) {
          resolve({ ok: false, name, reason: '읽기 실패' })
          return
        }
        if (data.length > FILE_SIZE_LIMIT) {
          resolve({ ok: false, name, reason: `파일 크기 초과 (${(data.length / 1024 / 1024).toFixed(1)}MB > 100MB)` })
          return
        }
        resolve({ ok: true, file: { name, path: filePath, content: '', size: data.length, fileType: 'image' } })
      })
      return
    }

    fsReadFile(filePath, (err, data) => {
      if (err) {
        resolve({ ok: false, name, reason: '읽기 실패' })
        return
      }
      if (data.length > FILE_SIZE_LIMIT) {
        resolve({ ok: false, name, reason: `파일 크기 초과 (${(data.length / 1024 / 1024).toFixed(1)}MB > 100MB)` })
        return
      }
      const sample = data.slice(0, 8192)
      if (sample.indexOf(0) !== -1) {
        resolve({ ok: false, name, reason: '바이너리 파일은 첨부할 수 없습니다' })
        return
      }
      const text = data.toString('utf-8')
      resolve({ ok: true, file: { name, path: filePath, content: text, size: data.length, fileType: 'text' } })
    })
  })
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
    try {
      if (existsSync(outputPath)) unlinkSync(outputPath)
    } catch {
      // Ignore temp icon cleanup failures.
    }
    return undefined
  }
}

export async function listOpenWithApps(): Promise<OpenWithApp[]> {
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
    }),
  )

  return apps.filter((entry): entry is OpenWithApp => entry !== null)
}

export async function openPathWithApp(targetPath: string, appId: string): Promise<{ ok: boolean; error?: string }> {
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
