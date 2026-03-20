import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

type GetUserHomePath = (env?: NodeJS.ProcessEnv) => string

export function isPowerShellScriptPath(commandPath: string): boolean {
  return commandPath.trim().toLowerCase().endsWith('.ps1')
}

export function readEnvVar(envVars: Record<string, string> | undefined, key: string): string {
  const value = envVars?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveClaude(getUserHomePath: GetUserHomePath): string {
  if (process.platform === 'win32') {
    const homePath = getUserHomePath()
    const appDataPath = process.env.APPDATA ?? join(homePath, 'AppData', 'Roaming')
    const candidates = [
      join(appDataPath, 'npm', 'claude.cmd'),
      join(appDataPath, 'npm', 'claude.exe'),
      join(appDataPath, 'npm', 'claude.bat'),
      join(appDataPath, 'npm', 'claude.ps1'),
    ]
    const pathDirs = (process.env.PATH ?? '').split(';').filter(Boolean)
    for (const dir of pathDirs) {
      candidates.push(join(dir, 'claude.cmd'))
      candidates.push(join(dir, 'claude.exe'))
      candidates.push(join(dir, 'claude.bat'))
      candidates.push(join(dir, 'claude.ps1'))
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

export function detectClaudeInstallation(
  overridePath: string | undefined,
  getUserHomePath: GetUserHomePath,
): { installed: boolean; path: string | null; version: string | null } {
  const homePath = getUserHomePath()
  const userShell = process.env.SHELL || '/bin/bash'
  const expandedOverride = overridePath?.replace(/^~/, homePath)
  if (expandedOverride && !existsSync(expandedOverride)) {
    return { installed: false, path: null, version: null }
  }
  const commandPath = expandedOverride ?? resolveClaude(getUserHomePath)
  const sharedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: process.env.HOME ?? homePath,
    USERPROFILE: process.env.USERPROFILE ?? homePath,
  }
  const result = process.platform === 'win32'
    ? isPowerShellScriptPath(commandPath)
      ? spawnSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', commandPath, '--version'], {
          encoding: 'utf-8',
          timeout: 3000,
          env: sharedEnv,
        })
      : spawnSync(commandPath, ['--version'], {
          encoding: 'utf-8',
          timeout: 3000,
          env: sharedEnv,
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
  const version = lines.find((line) => /\bClaude Code\b/i.test(line) || /^\d+\.\d+\.\d+/.test(line)) ?? null
  return {
    installed: true,
    path: commandPath,
    version,
  }
}
