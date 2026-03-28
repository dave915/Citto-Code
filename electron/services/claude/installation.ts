import { spawn } from 'child_process'
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

type CommandResult = {
  error: Error | null
  status: number | null
  stdout: string
  stderr: string
}

function runCommand(
  command: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv
    shell?: boolean
    timeoutMs: number
  },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const child = spawn(command, args, {
      env: options.env,
      shell: options.shell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const finish = (result: CommandResult) => {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      resolve(result)
    }

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    child.once('error', (error) => {
      finish({
        error,
        status: null,
        stdout,
        stderr,
      })
    })

    child.once('close', (status) => {
      finish({
        error: null,
        status,
        stdout,
        stderr,
      })
    })

    timeoutId = setTimeout(() => {
      child.kill()
      finish({
        error: new Error('Command timed out'),
        status: null,
        stdout,
        stderr,
      })
    }, options.timeoutMs)
  })
}

export async function detectClaudeInstallation(
  overridePath: string | undefined,
  getUserHomePath: GetUserHomePath,
): Promise<{ installed: boolean; path: string | null; version: string | null }> {
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
      ? await runCommand('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', commandPath, '--version'], {
          env: sharedEnv,
          timeoutMs: 3000,
        })
      : await runCommand(commandPath, ['--version'], {
          env: sharedEnv,
          shell: true,
          timeoutMs: 3000,
        })
    : await runCommand(userShell, ['-l', '-c', '"$0" --version', commandPath], {
        env: process.env,
        timeoutMs: 3000,
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
