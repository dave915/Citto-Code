import { ipcMain } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { extname, join } from 'path'
import { handleClaudeEvent, clearStreamedAssistantState } from '../services/claude/eventParser'
import { detectClaudeInstallation, isPowerShellScriptPath, readEnvVar, resolveClaude } from '../services/claude/installation'
import type { SelectedFile } from '../preload'
import { MIME_TYPES_BY_EXTENSION } from '../services/fileService'

type ModelInfo = {
  id: string
  displayName: string
  family: string
}

type RegisterClaudeIpcHandlersOptions = {
  fetchModelsFromApi: (envVars?: Record<string, string>) => Promise<ModelInfo[]>
  appendClaudeResponseLog: (entry: Record<string, unknown>) => void
  getUserHomePath: (env?: NodeJS.ProcessEnv) => string
  resolveTargetPath: (targetPath: string) => string
}

type SendMessageParams = {
  sessionId: string | null
  prompt: string
  attachments?: SelectedFile[]
  cwd: string
  requestId?: string
  allowConcurrent?: boolean
  claudePath?: string
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
  planMode?: boolean
  model?: string
  envVars?: Record<string, string>
}

type ClaudeInputContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: {
        type: 'base64'
        media_type: string
        data: string
      }
    }

function imageBlockFromDataUrl(dataUrl: string): ClaudeInputContentBlock | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  const [, mediaType, data] = match
  if (!mediaType || !data) return null

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data,
    },
  }
}

function imageBlockFromFile(file: SelectedFile): ClaudeInputContentBlock | null {
  if (file.fileType !== 'image') return null

  if (typeof file.dataUrl === 'string' && file.dataUrl.trim()) {
    return imageBlockFromDataUrl(file.dataUrl.trim())
  }

  const trimmedPath = file.path.trim()
  if (!trimmedPath || !existsSync(trimmedPath)) return null

  try {
    const mediaType = MIME_TYPES_BY_EXTENSION[extname(trimmedPath).toLowerCase()] ?? 'application/octet-stream'
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: readFileSync(trimmedPath).toString('base64'),
      },
    }
  } catch {
    return null
  }
}

function buildStreamJsonUserMessage(prompt: string, attachments: SelectedFile[] = []) {
  const contentBlocks: ClaudeInputContentBlock[] = []
  if (prompt.trim().length > 0) {
    contentBlocks.push({ type: 'text', text: prompt })
  }

  for (const file of attachments) {
    const imageBlock = imageBlockFromFile(file)
    if (imageBlock) {
      contentBlocks.push(imageBlock)
    }
  }

  return JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: contentBlocks.length === 1 && contentBlocks[0]?.type === 'text'
        ? contentBlocks[0].text
        : contentBlocks,
    },
  })
}

const activeProcesses = new Map<string, ChildProcess>()
let modelsCache: { list: ModelInfo[]; fetchedAt: number; cacheKey: string } | null = null
const CACHE_TTL = 5 * 60 * 1000

function removeActiveProcessReferences(proc: ChildProcess) {
  for (const [key, value] of activeProcesses.entries()) {
    if (value === proc) {
      activeProcesses.delete(key)
    }
  }
}

export function registerClaudeIpcHandlers({
  fetchModelsFromApi,
  appendClaudeResponseLog,
  getUserHomePath,
  resolveTargetPath,
}: RegisterClaudeIpcHandlersOptions) {
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

  ipcMain.handle('claude:check-installation', (_event, { claudePath }: { claudePath?: string }) => {
    return detectClaudeInstallation(claudePath, getUserHomePath)
  })

  ipcMain.handle('claude:send-message', async (event, params: SendMessageParams) => {
    const {
      sessionId,
      prompt,
      attachments = [],
      cwd,
      requestId,
      allowConcurrent = false,
      claudePath,
      permissionMode,
      planMode,
      model,
      envVars,
    } = params

    if (!allowConcurrent && sessionId && activeProcesses.has(sessionId)) {
      const existingProc = activeProcesses.get(sessionId)
      if (existingProc) {
        existingProc.kill()
        removeActiveProcessReferences(existingProc)
      }
    }

    const expandedPath = claudePath?.replace(/^~/, getUserHomePath())
    const claudeBin = expandedPath && existsSync(expandedPath)
      ? expandedPath
      : resolveClaude(getUserHomePath)
    const args: string[] = [
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
    ]

    if (sessionId) args.unshift('--resume', sessionId)
    if (model) args.push('--model', model)
    if (planMode) {
      args.push('--permission-mode', 'plan')
    } else if (permissionMode && permissionMode !== 'default') {
      args.push('--permission-mode', permissionMode)
    }
    args.push('-p')

    const { CLAUDECODE: _ignoredClaudeCode, ...cleanEnv } = process.env
    const homePath = getUserHomePath(cleanEnv)
    const rawCwd = cwd ? resolveTargetPath(cwd) : homePath
    const resolvedCwd = existsSync(rawCwd) ? rawCwd : (existsSync(homePath) ? homePath : undefined)
    const procEnv: NodeJS.ProcessEnv = {
      ...cleanEnv,
      HOME: cleanEnv.HOME ?? homePath,
      USERPROFILE: cleanEnv.USERPROFILE ?? homePath,
      ...(envVars ?? {}),
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
      : spawn(userShell, ['-l', '-c', '"$0" "$@"', claudeBin, ...args], {
          cwd: resolvedCwd,
          env: procEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        })

    const tempKey = requestId ? `request-${requestId}` : `pending-${Date.now()}`
    activeProcesses.set(tempKey, proc)
    if (sessionId && !allowConcurrent) {
      activeProcesses.set(sessionId, proc)
    }

    proc.stdin?.write(`${buildStreamJsonUserMessage(prompt, attachments)}\n`)
    proc.stdin?.end()

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
            if (sid && !allowConcurrent) {
              activeProcesses.set(sid, proc)
              if (activeProcesses.get(tempKey) === proc) {
                activeProcesses.delete(tempKey)
              }
            }
          }, requestId)
        } catch (error) {
          appendClaudeResponseLog({
            source: 'stdout',
            sessionId: resolvedSessionId,
            eventType: 'parse-error',
            error: String(error),
            raw: trimmed,
          })
        }
      }
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      processOutputLines(false)
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      appendClaudeResponseLog({
        source: 'stderr',
        sessionId: resolvedSessionId,
        text: chunk.toString(),
      })
    })

    proc.on('close', (code) => {
      if (buffer.trim()) {
        processOutputLines(true)
      }
      removeActiveProcessReferences(proc)
      appendClaudeResponseLog({
        source: 'lifecycle',
        sessionId: resolvedSessionId,
        eventType: 'stream-end',
        exitCode: code,
      })
      event.sender.send('claude:stream-end', { sessionId: resolvedSessionId, exitCode: code, requestId })
    })

    proc.on('error', (error) => {
      removeActiveProcessReferences(proc)
      appendClaudeResponseLog({
        source: 'lifecycle',
        sessionId: resolvedSessionId,
        eventType: 'process-error',
        error: error.message,
      })
      event.sender.send('claude:error', { sessionId: resolvedSessionId, error: error.message, requestId })
    })

    return { tempKey }
  })

  ipcMain.handle('claude:abort', (_event, { sessionId }: { sessionId: string }) => {
    const proc = activeProcesses.get(sessionId)
    if (!proc) return

    proc.kill('SIGINT')
    const forceKillTimer = setTimeout(() => {
      try {
        if (proc.exitCode === null) proc.kill('SIGKILL')
      } catch {
        // Ignore force-kill failures.
      }
    }, 250)
    proc.once('close', () => {
      clearTimeout(forceKillTimer)
    })
    removeActiveProcessReferences(proc)
  })

  ipcMain.handle('claude:has-active-process', (_event, { sessionId }: { sessionId: string }) => {
    return activeProcesses.has(sessionId)
  })
}

export function killAllClaudeProcesses() {
  const uniqueProcesses = new Set(activeProcesses.values())
  for (const proc of uniqueProcesses) {
    try {
      proc.kill()
    } catch {
      // Ignore process cleanup failures during shutdown.
    }
  }
  activeProcesses.clear()
  clearStreamedAssistantState()
}
