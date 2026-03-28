import { ipcMain } from 'electron'
import { handleClaudeEvent, clearStreamedAssistantState } from '../services/claude/eventParser'
import { detectClaudeInstallation } from '../services/claude/installation'
import type { SelectedFile } from '../preload'
import { buildStreamJsonUserMessage } from './claude/attachmentPayload'
import { getCachedClaudeModels } from './claude/modelCache'
import { launchClaudeProcess } from './claude/processLauncher'
import {
  bindResolvedSessionProcess,
  getActiveProcess,
  hasActiveProcess,
  killAllActiveProcesses,
  removeActiveProcessReferences,
  stopTrackedProcess,
  trackActiveProcess,
} from './claude/processRegistry'
import { createSubagentEventRouter, isClaudeEventRecord } from './claude/subagentRouter'

type ModelInfo = {
  id: string
  displayName: string
  family: string
  provider: 'anthropic' | 'ollama' | 'custom'
  isLocal: boolean
}

type RegisterClaudeIpcHandlersOptions = {
  fetchModelsFromApi: (envVars?: Record<string, string>) => Promise<ModelInfo[]>
  appendClaudeResponseLog: (entry: Record<string, unknown>) => void
  getUserHomePath: (env?: NodeJS.ProcessEnv) => string
  resolveTargetPath: (targetPath: string) => string
}

type SendMessageParams = {
  sessionId: string | null
  tabId?: string
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

export function registerClaudeIpcHandlers({
  fetchModelsFromApi,
  appendClaudeResponseLog,
  getUserHomePath,
  resolveTargetPath,
}: RegisterClaudeIpcHandlersOptions) {
  ipcMain.handle('claude:get-models', async (_event, { envVars }: { envVars?: Record<string, string> } = {}) => {
    return getCachedClaudeModels(fetchModelsFromApi, envVars)
  })

  ipcMain.handle('claude:check-installation', async (_event, { claudePath }: { claudePath?: string }) => {
    return await detectClaudeInstallation(claudePath, getUserHomePath)
  })

  ipcMain.handle('claude:send-message', async (event, params: SendMessageParams) => {
    const {
      sessionId,
      tabId,
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

    if (!allowConcurrent && sessionId && hasActiveProcess(sessionId)) {
      stopTrackedProcess(sessionId)
    }

    const { proc, tempKey } = launchClaudeProcess({
      sessionId,
      cwd,
      requestId,
      claudePath,
      permissionMode,
      planMode,
      model,
      envVars,
      getUserHomePath,
      resolveTargetPath,
    })

    trackActiveProcess(tempKey, proc)
    if (sessionId && !allowConcurrent) {
      trackActiveProcess(sessionId, proc)
    }

    proc.stdin?.write(`${buildStreamJsonUserMessage(prompt, attachments)}\n`)
    proc.stdin?.end()

    let resolvedSessionId: string | null = sessionId
    let buffer = ''
    let fullResultText = ''
    const { routeEvent } = createSubagentEventRouter((payload) => {
      if (!tabId) return
      event.sender.send('subagent:text-chunk', {
        tabId,
        ...payload,
      })
    })

    const processOutputLines = (flush = false) => {
      const lines = buffer.split('\n')
      buffer = flush ? '' : (lines.pop() ?? '')
      const readyLines = flush ? lines.filter(Boolean) : lines
      for (const line of readyLines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const eventData = JSON.parse(trimmed)
          if (isClaudeEventRecord(eventData) && routeEvent(eventData, resolvedSessionId)) {
            appendClaudeResponseLog({
              source: 'stdout',
              sessionId: resolvedSessionId,
              eventType: typeof eventData.type === 'string' ? `subagent:${eventData.type}` : 'subagent:unknown',
              payload: eventData,
            })
            continue
          }
          if (requestId && eventData?.type === 'result' && typeof eventData.result === 'string') {
            fullResultText = eventData.result
          }
          appendClaudeResponseLog({
            source: 'stdout',
            sessionId: resolvedSessionId,
            eventType: typeof eventData.type === 'string' ? eventData.type : null,
            payload: eventData,
          })
          handleClaudeEvent(event.sender, eventData, resolvedSessionId, (sid) => {
            resolvedSessionId = sid
            if (sid && !allowConcurrent) {
              bindResolvedSessionProcess(tempKey, sid, proc)
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
      if (requestId && fullResultText.trim()) {
        event.sender.send('btw:fallback-result', { requestId, text: fullResultText })
      }
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
    const proc = getActiveProcess(sessionId)
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
    return hasActiveProcess(sessionId)
  })
}

export function killAllClaudeProcesses() {
  killAllActiveProcesses()
  clearStreamedAssistantState()
}
