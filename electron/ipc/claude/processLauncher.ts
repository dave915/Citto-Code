import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { isPowerShellScriptPath, resolveClaude, shouldUseLoginShellForClaude } from '../../services/claude/installation'
import { normalizeConfiguredModelSelection, resolveLaunchEnvForModel } from '../../services/claude-models'

type LaunchClaudeProcessOptions = {
  sessionId: string | null
  cwd: string
  requestId?: string
  claudePath?: string
  bare?: boolean
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
  planMode?: boolean
  model?: string
  envVars?: Record<string, string>
  getUserHomePath: (env?: NodeJS.ProcessEnv) => string
  resolveTargetPath: (targetPath: string) => string
}

function buildClaudeArgs({
  sessionId,
  bare,
  model,
  permissionMode,
  planMode,
}: Pick<LaunchClaudeProcessOptions, 'sessionId' | 'bare' | 'model' | 'permissionMode' | 'planMode'>) {
  const args: string[] = [
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
  ]

  if (sessionId) args.unshift('--resume', sessionId)
  if (model) args.push('--model', model)
  if (bare) args.push('--bare')
  if (planMode) {
    args.push('--permission-mode', 'plan')
  } else if (permissionMode && permissionMode !== 'default') {
    args.push('--permission-mode', permissionMode)
  }
  args.push('-p')

  return args
}

export function launchClaudeProcess({
  sessionId,
  cwd,
  requestId,
  claudePath,
  bare,
  permissionMode,
  planMode,
  model,
  envVars,
  getUserHomePath,
  resolveTargetPath,
}: LaunchClaudeProcessOptions): { proc: ChildProcess; tempKey: string } {
  const expandedPath = claudePath?.replace(/^~/, getUserHomePath())
  const claudeBin = expandedPath && existsSync(expandedPath)
    ? expandedPath
    : resolveClaude(getUserHomePath)
  const cliModel = normalizeConfiguredModelSelection(model)
  const args = buildClaudeArgs({ sessionId, bare, model: cliModel, permissionMode, planMode })

  const { CLAUDECODE: _ignoredClaudeCode, ...cleanEnv } = process.env
  const homePath = getUserHomePath(cleanEnv)
  const rawCwd = cwd ? resolveTargetPath(cwd) : homePath
  const resolvedCwd = existsSync(rawCwd) ? rawCwd : (existsSync(homePath) ? homePath : undefined)
  const procEnv: NodeJS.ProcessEnv = {
    ...cleanEnv,
    HOME: cleanEnv.HOME ?? homePath,
    USERPROFILE: cleanEnv.USERPROFILE ?? homePath,
  }

  for (const [key, value] of Object.entries(resolveLaunchEnvForModel(cliModel, envVars) ?? {})) {
    if (value === '') {
      delete procEnv[key]
      continue
    }
    procEnv[key] = value
  }
  const userShell = procEnv.SHELL ?? '/bin/bash'

  const proc = process.platform === 'win32'
    ? isPowerShellScriptPath(claudeBin)
      ? spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', claudeBin, ...args], {
          cwd: resolvedCwd,
          env: procEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      : spawn(claudeBin, args, {
          cwd: resolvedCwd,
          env: procEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
        })
    : shouldUseLoginShellForClaude(claudeBin)
      ? spawn(userShell, ['-l', '-c', '"$0" "$@"', claudeBin, ...args], {
          cwd: resolvedCwd,
          env: procEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      : spawn(claudeBin, args, {
          cwd: resolvedCwd,
          env: procEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        })

  return {
    proc,
    tempKey: requestId ? `request-${requestId}` : `pending-${Date.now()}`,
  }
}
