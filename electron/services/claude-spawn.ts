import { launchClaudeProcess } from '../ipc/claude/processLauncher'
import { buildStreamJsonUserMessage } from '../ipc/claude/attachmentPayload'
import {
  bindResolvedSessionProcess,
  removeActiveProcessReferences,
  trackActiveProcess,
} from '../ipc/claude/processRegistry'
import type { PermissionMode } from '../persistence-types'

type SpawnClaudeProcessOptions = {
  prompt: string
  cwd: string
  model: string | null
  permissionMode: PermissionMode
  systemPrompt?: string
  claudePath?: string
  envVars?: Record<string, string>
  bare?: boolean
  inputFormat?: 'stream-json' | 'text'
  outputFormat?: 'stream-json' | 'json' | 'text'
  abortSignal?: AbortSignal
  getUserHomePath: (env?: NodeJS.ProcessEnv) => string
  resolveTargetPath: (targetPath: string) => string
  onTextChunk?: (chunk: string) => void
  onSessionId?: (sessionId: string) => void
}

type SpawnClaudeProcessResult = {
  sessionId: string | null
  output: string
  isError: boolean
  error: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildPrompt(prompt: string, systemPrompt?: string) {
  const trimmedSystemPrompt = systemPrompt?.trim()
  if (!trimmedSystemPrompt) return prompt

  return [
    '<system-reminder>',
    trimmedSystemPrompt,
    '</system-reminder>',
    '',
    prompt,
  ].join('\n')
}

export async function spawnClaudeProcess({
  prompt,
  cwd,
  model,
  permissionMode,
  systemPrompt,
  claudePath,
  envVars,
  bare = false,
  inputFormat = 'stream-json',
  outputFormat = 'stream-json',
  abortSignal,
  getUserHomePath,
  resolveTargetPath,
  onTextChunk,
  onSessionId,
}: SpawnClaudeProcessOptions): Promise<SpawnClaudeProcessResult> {
  return await new Promise<SpawnClaudeProcessResult>((resolve, reject) => {
    const { proc, tempKey } = launchClaudeProcess({
      sessionId: null,
      cwd,
      claudePath,
      permissionMode,
      planMode: false,
      model: model ?? undefined,
      envVars,
      bare,
      inputFormat,
      outputFormat,
      includePartialMessages: outputFormat === 'stream-json',
      getUserHomePath,
      resolveTargetPath,
    })

    const fullPrompt = buildPrompt(prompt, systemPrompt)
    const usesStreamJson = outputFormat === 'stream-json'
    let settled = false
    let aborted = false
    let buffer = ''
    let sessionId: string | null = null
    let output = ''
    let sawTextDelta = false
    let resultText: string | null = null
    let errorText: string | null = null
    let isError = false
    let forceKillTimer: NodeJS.Timeout | null = null
    let abortSettleTimer: NodeJS.Timeout | null = null

    trackActiveProcess(tempKey, proc)

    const finish = (result: SpawnClaudeProcessResult) => {
      if (settled) return
      settled = true
      abortSignal?.removeEventListener('abort', handleAbort)
      if (forceKillTimer) {
        clearTimeout(forceKillTimer)
        forceKillTimer = null
      }
      if (abortSettleTimer) {
        clearTimeout(abortSettleTimer)
        abortSettleTimer = null
      }
      resolve(result)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      abortSignal?.removeEventListener('abort', handleAbort)
      if (forceKillTimer) {
        clearTimeout(forceKillTimer)
        forceKillTimer = null
      }
      if (abortSettleTimer) {
        clearTimeout(abortSettleTimer)
        abortSettleTimer = null
      }
      reject(error)
    }

    const handleAbort = () => {
      if (aborted) return
      aborted = true
      try {
        proc.kill('SIGINT')
      } catch {
        // Ignore abort failures.
      }
      forceKillTimer = setTimeout(() => {
        try {
          if (proc.exitCode === null) proc.kill('SIGKILL')
        } catch {
          // Ignore force-kill failures.
        }
      }, 250)
      abortSettleTimer = setTimeout(() => {
        removeActiveProcessReferences(proc)
        finish({
          sessionId,
          output: output.trim(),
          isError: true,
          error: errorText || 'Workflow execution aborted',
        })
      }, 1500)
    }

    const appendOutput = (chunk: string) => {
      if (!chunk || aborted) return
      output += chunk
      onTextChunk?.(chunk)
    }

    abortSignal?.addEventListener('abort', handleAbort, { once: true })
    if (abortSignal?.aborted) {
      handleAbort()
    }

    const processLine = (line: string) => {
      let record: Record<string, unknown>
      try {
        record = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }

      const type = typeof record.type === 'string' ? record.type : ''
      if (type === 'system') {
        if (typeof record.session_id === 'string' && record.session_id.trim()) {
          sessionId = record.session_id
          bindResolvedSessionProcess(tempKey, record.session_id, proc)
          onSessionId?.(record.session_id)
        }
        return
      }

      if (aborted) {
        return
      }

      if (type === 'stream_event') {
        const event = isRecord(record.event) ? record.event : null
        if (!event || event.type !== 'content_block_delta') return
        const delta = isRecord(event.delta) ? event.delta : null
        if (!delta || delta.type !== 'text_delta' || typeof delta.text !== 'string') return
        sawTextDelta = true
        appendOutput(delta.text)
        return
      }

      if (type === 'assistant') {
        const message = isRecord(record.message) ? record.message : null
        const content = Array.isArray(message?.content) ? message.content : []
        if (sawTextDelta) return
        for (const block of content) {
          if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') continue
          appendOutput(block.text)
        }
        return
      }

      if (type === 'result') {
        isError = Boolean(record.is_error)
        resultText = typeof record.result === 'string' ? record.result : resultText
        if (typeof record.error === 'string' && record.error.trim()) {
          errorText = record.error.trim()
        }
      }

      if (type === 'error' && typeof record.error === 'string' && record.error.trim()) {
        isError = true
        errorText = record.error.trim()
      }
    }

    if (!aborted) {
      proc.stdin?.write(inputFormat === 'stream-json'
        ? `${buildStreamJsonUserMessage(fullPrompt, [])}\n`
        : `${fullPrompt}\n`)
    }
    proc.stdin?.end()

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (!usesStreamJson) {
        appendOutput(chunk.toString())
        return
      }
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        processLine(trimmed)
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      if (aborted) return
      const text = chunk.toString().trim()
      if (!text) return
      errorText = errorText ? `${errorText}\n${text}` : text
    })

    proc.once('error', (error) => {
      removeActiveProcessReferences(proc)
      if (aborted) {
        finish({
          sessionId,
          output: output.trim(),
          isError: true,
          error: errorText || 'Workflow execution aborted',
        })
        return
      }
      fail(error)
    })

    proc.once('close', (code) => {
      removeActiveProcessReferences(proc)
      if (usesStreamJson && buffer.trim()) {
        processLine(buffer.trim())
      }

      if (aborted) {
        finish({
          sessionId,
          output: output.trim(),
          isError: true,
          error: errorText || 'Workflow execution aborted',
        })
        return
      }

      if (!usesStreamJson) {
        finish({
          sessionId,
          output: output.trim(),
          isError: code !== 0,
          error: code === 0 ? errorText : errorText || `Claude process exited with code ${code ?? 'unknown'}.`,
        })
        return
      }

      const finalOutput = resultText?.trim()
        ? resultText.trim()
        : output.trim()

      finish({
        sessionId,
        output: finalOutput,
        isError,
        error: errorText,
      })
    })
  })
}
