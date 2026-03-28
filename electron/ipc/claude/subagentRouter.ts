type ClaudeEventRecord = Record<string, unknown>

type StreamState = {
  sawTextDelta: boolean
}

type SubagentChunkPayload = {
  toolUseId: string
  transcriptPath: null
  subagentSessionId?: string | null
  chunk: string
  done?: boolean
  error?: string
}

const SUBAGENT_TOOL_NAMES = new Set(['task', 'agent', 'call_omo_agent'])

export function isClaudeEventRecord(value: unknown): value is ClaudeEventRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSubagentToolName(name: unknown): boolean {
  return typeof name === 'string' && SUBAGENT_TOOL_NAMES.has(name.trim().toLowerCase())
}

function extractAssistantText(eventData: ClaudeEventRecord): string {
  const message = isClaudeEventRecord(eventData.message) ? eventData.message : null
  const content = Array.isArray(message?.content) ? message.content : []

  return content
    .flatMap((block) => {
      if (!isClaudeEventRecord(block) || block.type !== 'text' || typeof block.text !== 'string') return []
      return [block.text]
    })
    .join('')
}

export function createSubagentEventRouter(
  sendSubagentChunk: (payload: SubagentChunkPayload) => void,
) {
  let lastSubagentToolUseId: string | null = null
  const subSessionToToolUse = new Map<string, string>()
  const streamedSubagentTextBySession = new Map<string, StreamState>()

  const captureParentSubagentToolUse = (
    eventData: ClaudeEventRecord,
    resolvedSessionId: string | null,
  ) => {
    const sid = typeof eventData.session_id === 'string' ? eventData.session_id : null
    if (!resolvedSessionId || sid !== resolvedSessionId) return

    const message = isClaudeEventRecord(eventData.message) ? eventData.message : null
    const content = Array.isArray(message?.content) ? message.content : []
    for (const block of content) {
      if (!isClaudeEventRecord(block) || block.type !== 'tool_use' || !isSubagentToolName(block.name)) continue
      lastSubagentToolUseId = typeof block.id === 'string' ? block.id : null
    }
  }

  const emitSubagentChunk = (
    toolUseId: string,
    payload: {
      chunk?: string
      done?: boolean
      error?: string
      subagentSessionId?: string | null
    } = {},
  ) => {
    sendSubagentChunk({
      toolUseId,
      transcriptPath: null,
      subagentSessionId: payload.subagentSessionId,
      chunk: payload.chunk ?? '',
      done: payload.done,
      error: payload.error,
    })
  }

  const routeEvent = (
    eventData: ClaudeEventRecord,
    resolvedSessionId: string | null,
  ): boolean => {
    const type = typeof eventData.type === 'string' ? eventData.type : ''
    const sid = typeof eventData.session_id === 'string' ? eventData.session_id : null
    const parentToolUseId = typeof eventData.parent_tool_use_id === 'string' && eventData.parent_tool_use_id.trim()
      ? eventData.parent_tool_use_id.trim()
      : null
    const eventToolUseId = typeof eventData.tool_use_id === 'string' && eventData.tool_use_id.trim()
      ? eventData.tool_use_id.trim()
      : null

    if (type === 'system') {
      if (!sid || sid === resolvedSessionId) return false

      const mappedToolUseId = parentToolUseId ?? eventToolUseId ?? lastSubagentToolUseId
      if (!mappedToolUseId) {
        if (!resolvedSessionId) return false
        return true
      }

      subSessionToToolUse.set(sid, mappedToolUseId)
      streamedSubagentTextBySession.delete(sid)
      emitSubagentChunk(mappedToolUseId, {
        subagentSessionId: sid,
      })
      lastSubagentToolUseId = null
      return true
    }

    if (!sid || sid === resolvedSessionId) {
      if (type === 'assistant') {
        captureParentSubagentToolUse(eventData, resolvedSessionId)
      }
      return false
    }

    const toolUseId = subSessionToToolUse.get(sid) ?? parentToolUseId ?? null
    if (toolUseId && !subSessionToToolUse.has(sid)) {
      subSessionToToolUse.set(sid, toolUseId)
    }
    if (!toolUseId) return true

    if (type === 'stream_event') {
      const streamEvent = isClaudeEventRecord(eventData.event) ? eventData.event : null
      const streamType = typeof streamEvent?.type === 'string' ? streamEvent.type : ''

      if (streamType === 'message_start') {
        streamedSubagentTextBySession.set(sid, { sawTextDelta: false })
        return true
      }

      if (streamType === 'message_stop') {
        streamedSubagentTextBySession.delete(sid)
        return true
      }

      if (streamType !== 'content_block_delta') return true

      const delta = isClaudeEventRecord(streamEvent?.delta) ? streamEvent.delta : null
      if (!delta || delta.type !== 'text_delta' || typeof delta.text !== 'string' || !delta.text) {
        return true
      }

      const currentStreamState = streamedSubagentTextBySession.get(sid) ?? { sawTextDelta: false }
      currentStreamState.sawTextDelta = true
      streamedSubagentTextBySession.set(sid, currentStreamState)
      emitSubagentChunk(toolUseId, { chunk: delta.text })
      return true
    }

    if (type === 'assistant') {
      const currentStreamState = streamedSubagentTextBySession.get(sid)
      if (currentStreamState?.sawTextDelta) return true

      const text = extractAssistantText(eventData)
      if (text) {
        emitSubagentChunk(toolUseId, { chunk: text })
      }
      return true
    }

    if (type === 'result') {
      streamedSubagentTextBySession.delete(sid)
      emitSubagentChunk(toolUseId, {
        done: !Boolean(eventData.is_error),
        error: eventData.is_error ? 'Subagent run failed.' : undefined,
      })
      subSessionToToolUse.delete(sid)
      return true
    }

    if (type === 'error') {
      streamedSubagentTextBySession.delete(sid)
      emitSubagentChunk(toolUseId, {
        error: typeof eventData.error === 'string' && eventData.error.trim()
          ? eventData.error.trim()
          : 'Subagent run failed.',
      })
      subSessionToToolUse.delete(sid)
      return true
    }

    return true
  }

  return {
    routeEvent,
  }
}
