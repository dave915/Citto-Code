import { existsSync, readFileSync } from 'fs'
import type { WebContents } from 'electron'
import { normalizeAgentToolName, sanitizeAgentToolInput } from '../../agent-tool-names'

const streamedAssistantStateBySession = new Map<string, { sawTextDelta: boolean; sawThinkingDelta: boolean }>()

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

function normalizeToolPayload(toolName: string, toolInput: unknown) {
  const normalizedToolName = normalizeAgentToolName(toolName)
  return {
    toolName: normalizedToolName,
    toolInput: normalizedToolName === 'Agent'
      ? sanitizeAgentToolInput(toolInput)
      : toolInput,
  }
}

function resetStreamedAssistantState(sessionId: string) {
  streamedAssistantStateBySession.set(sessionId, {
    sawTextDelta: false,
    sawThinkingDelta: false,
  })
}

function getStreamedAssistantState(sessionId: string): { sawTextDelta: boolean; sawThinkingDelta: boolean } {
  const current = streamedAssistantStateBySession.get(sessionId)
  if (current) return current

  const next = { sawTextDelta: false, sawThinkingDelta: false }
  streamedAssistantStateBySession.set(sessionId, next)
  return next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sendClaudeEvent(
  sender: WebContents,
  channel: string,
  payload: Record<string, unknown>,
  requestId?: string,
) {
  sender.send(channel, requestId ? { ...payload, requestId } : payload)
}

function readUsageTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function extractInputTokens(event: Record<string, unknown>): number | null {
  const usage = isRecord(event.message) && isRecord(event.message.usage)
    ? event.message.usage
    : isRecord(event.usage)
      ? event.usage
      : null

  if (!usage) return null

  let sawUsageField = false
  let total = 0
  for (const key of ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) {
    const value = readUsageTokenCount(usage[key])
    if (value === null) continue
    sawUsageField = true
    total += value
  }

  return sawUsageField ? total : null
}

function buildToolResultPayload(record: Record<string, unknown>): unknown {
  const content = typeof record.content !== 'undefined' ? record.content : undefined
  const toolOutput = typeof record.tool_output !== 'undefined'
    ? record.tool_output
    : typeof record.toolOutput !== 'undefined'
      ? record.toolOutput
      : undefined

  if (typeof toolOutput === 'undefined') return content
  if (typeof content === 'undefined') return toolOutput

  return {
    content,
    toolOutput,
  }
}

export function handleClaudeEvent(
  sender: WebContents,
  data: Record<string, unknown>,
  sessionId: string | null,
  onSessionId: (sid: string) => void,
  requestId?: string,
) {
  const type = data.type as string

  if (type === 'system') {
    const sid = data.session_id as string | undefined
    if (sid) {
      onSessionId(sid)
      sendClaudeEvent(sender, 'claude:stream-start', { sessionId: sid, cwd: data.cwd }, requestId)
    }
    return
  }

  if (type === 'stream_event') {
    const sid = (data.session_id as string) || sessionId
    if (sid) onSessionId(sid)
    const event = isRecord(data.event) ? data.event : null
    if (!sid || !event) return

    const eventType = typeof event.type === 'string' ? event.type : ''
    if (eventType === 'message_start') {
      resetStreamedAssistantState(sid)
      const inputTokens = extractInputTokens(event)
      if (inputTokens !== null) {
        sendClaudeEvent(sender, 'claude:token-usage', { sessionId: sid, inputTokens }, requestId)
      }
      return
    }

    if (eventType === 'message_stop') {
      streamedAssistantStateBySession.delete(sid)
      return
    }

    if (eventType !== 'content_block_delta') return

    const delta = isRecord(event.delta) ? event.delta : null
    if (!delta || typeof delta.type !== 'string') return

    if (delta.type === 'thinking_delta') {
      const text = typeof delta.thinking === 'string' ? delta.thinking : ''
      if (!text) return
      getStreamedAssistantState(sid).sawThinkingDelta = true
      sendClaudeEvent(sender, 'claude:thinking-chunk', { sessionId: sid, text }, requestId)
      return
    }

    if (delta.type === 'text_delta') {
      const text = typeof delta.text === 'string' ? delta.text : ''
      if (!text) return
      getStreamedAssistantState(sid).sawTextDelta = true
      sendClaudeEvent(sender, 'claude:text-chunk', { sessionId: sid, text }, requestId)
    }
    return
  }

  if (type === 'assistant') {
    const message = data.message as Record<string, unknown>
    const sid = (data.session_id as string) || sessionId
    if (sid) onSessionId(sid)
    const content = message.content as Array<Record<string, unknown>>
    if (!Array.isArray(content)) return
    const streamedState = sid ? streamedAssistantStateBySession.get(sid) : null
    const textBlocks: string[] = []
    for (const block of content) {
      if ((block.type as string) === 'thinking') {
        if (streamedState?.sawThinkingDelta) continue
        const text = String(block.thinking ?? block.text ?? '')
        sendClaudeEvent(sender, 'claude:thinking-chunk', { sessionId: sid, text }, requestId)
      } else if ((block.type as string) === 'text') {
        if (streamedState?.sawTextDelta) continue
        const text = String(block.text ?? '')
        textBlocks.push(text)
        sendClaudeEvent(sender, 'claude:text-chunk', { sessionId: sid, text }, requestId)
      } else if ((block.type as string) === 'tool_use') {
        const normalized = normalizeToolPayload(block.name as string, block.input)
        sendClaudeEvent(sender, 'claude:tool-start', {
          sessionId: sid,
          toolUseId: block.id as string,
          toolName: normalized.toolName,
          toolInput: normalized.toolInput,
          fileSnapshotBefore: getToolFileSnapshotBefore(normalized.toolName, normalized.toolInput),
        }, requestId)
      }
    }

    if (typeof data.error === 'string' && textBlocks.join('').trim()) {
      sendClaudeEvent(sender, 'claude:error', { sessionId: sid, error: textBlocks.join('').trim() }, requestId)
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
        sendClaudeEvent(sender, 'claude:tool-result', {
          sessionId: sid,
          toolUseId: block.tool_use_id,
          content: block.content,
          isError: block.is_error ?? false,
        }, requestId)
      }
    }
    return
  }

  if (type === 'tool_result') {
    const sid = (data.session_id as string) || sessionId
    if (sid) onSessionId(sid)
    sendClaudeEvent(sender, 'claude:tool-result', {
      sessionId: sid,
      toolUseId: data.tool_use_id,
      content: buildToolResultPayload(data),
      isError: data.is_error ?? false,
    }, requestId)
    return
  }

  if (type === 'result') {
    const sid = (data.session_id as string) || sessionId
    if (sid) streamedAssistantStateBySession.delete(sid)
    sendClaudeEvent(sender, 'claude:result', {
      sessionId: sid,
      costUsd: data.cost_usd,
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
    }, requestId)

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
        sendClaudeEvent(sender, 'claude:error', { sessionId: sid, error: message }, requestId)
      }
    }
  }
}

export function clearStreamedAssistantState() {
  streamedAssistantStateBySession.clear()
}
