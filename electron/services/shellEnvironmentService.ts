import { spawnSync } from 'child_process'
import { app } from 'electron'
import { existsSync } from 'fs'
import { userInfo } from 'os'
import { join } from 'path'

const SHELL_IMPORTED_ENV_KEYS = new Set([
  'CLAUDE_CODE_USE_BEDROCK',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
  'ANTHROPIC_AUTH_TOKEN',
  'NODE_EXTRA_CA_CERTS',
])

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

export function importShellEnvironmentVars() {
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

export function getUserHomePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME ?? env.USERPROFILE ?? app.getPath('home')
}

export function resolveTargetPath(targetPath: string): string {
  const homePath = getUserHomePath()
  if (targetPath === '~') return homePath
  if (targetPath.startsWith('~/') || targetPath.startsWith('~\\')) {
    return join(homePath, targetPath.slice(2))
  }
  return targetPath
}

export function getProjectNameFromPath(path: string): string {
  if (!path || path === '~') return '~'
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}
