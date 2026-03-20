import type { Message, SubagentState, ToolCallBlock } from '../store/sessions'

export type SubagentRuntimeInfo = {
  sessionId: string | null
  agentId: string | null
  transcriptPath: string | null
  agent: string | null
  description: string | null
  prompt: string | null
}

export type SubagentCallSummary = {
  key: string
  messageId: string
  toolUseId: string
  createdAt: number
  toolCall: ToolCallBlock
  agent: string | null
  description: string | null
  prompt: string | null
  transcriptPath: string | null
  sessionId: string | null
  agentId: string | null
  streamingText: string
  status: SubagentState
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function extractToolOutput(result: unknown): Record<string, unknown> | null {
  if (!isRecord(result)) return null

  if (isRecord(result.toolOutput)) return result.toolOutput
  if (isRecord(result.tool_output)) return result.tool_output
  return null
}

function extractTextContent(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!Array.isArray(value)) return null

  const text = value
    .flatMap((item) => {
      if (typeof item === 'string') return [item]
      if (!isRecord(item)) return []
      if (item.type === 'text' && typeof item.text === 'string') return [item.text]
      return []
    })
    .join('\n')
    .trim()

  return text || null
}

function extractTranscriptPathFromText(text: string | null): string | null {
  if (!text) return null

  const taggedMatch = text.match(/<output-file>\s*([^<\n]+?)\s*<\/output-file>/i)
  if (taggedMatch?.[1]?.trim()) return taggedMatch[1].trim()

  const transcriptMatch = text.match(/Full transcript available at:\s*([^\n]+)/i)
  if (transcriptMatch?.[1]?.trim()) return transcriptMatch[1].trim()

  const outputMatch = text.match(/(?:^|\n)\s*output[_-]?file\s*:\s*([^\n]+)$/im)
  if (outputMatch?.[1]?.trim()) return outputMatch[1].trim()

  return null
}

export function isSubagentToolName(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return normalized === 'task' || normalized === 'agent' || normalized === 'call_omo_agent'
}

export function extractSubagentRuntimeInfo(result: unknown, toolInput?: unknown): SubagentRuntimeInfo | null {
  const toolOutput = extractToolOutput(result)
  const input = isRecord(toolInput) ? toolInput : null
  const resultRecord = isRecord(result) ? result : null
  const textContent = extractTextContent(resultRecord?.content)
    ?? extractTextContent(resultRecord?.result)
    ?? extractTextContent(result)
    ?? extractTextContent(toolOutput?.content)

  const transcriptPath =
    getString(resultRecord?.subagentTranscriptPath)
    ?? getString(resultRecord?.subagent_transcript_path)
    ?? getString(toolOutput?.subagentTranscriptPath)
    ?? getString(toolOutput?.subagent_transcript_path)
    ?? getString(resultRecord?.outputFile)
    ?? getString(resultRecord?.output_file)
    ?? getString(toolOutput?.outputFile)
    ?? getString(toolOutput?.output_file)
    ?? extractTranscriptPathFromText(textContent)

  const sessionId =
    getString(resultRecord?.subagentSessionId)
    ?? getString(resultRecord?.subagent_session_id)
    ?? getString(resultRecord?.sessionId)
    ?? getString(resultRecord?.session_id)
    ?? getString(toolOutput?.subagentSessionId)
    ?? getString(toolOutput?.subagent_session_id)
    ?? getString(toolOutput?.sessionId)
    ?? getString(toolOutput?.session_id)

  const agentId =
    getString(resultRecord?.subagentAgentId)
    ?? getString(resultRecord?.subagent_agent_id)
    ?? getString(resultRecord?.agentId)
    ?? getString(resultRecord?.agent_id)
    ?? getString(toolOutput?.subagentAgentId)
    ?? getString(toolOutput?.subagent_agent_id)
    ?? getString(toolOutput?.agentId)
    ?? getString(toolOutput?.agent_id)

  const agent =
    getString(toolOutput?.agent)
    ?? getString(resultRecord?.agent)
    ?? getString(input?.subagent_type)

  const description =
    getString(toolOutput?.description)
    ?? getString(resultRecord?.description)
    ?? getString(input?.description)

  const prompt =
    getString(toolOutput?.prompt)
    ?? getString(resultRecord?.prompt)
    ?? getString(input?.prompt)

  if (!transcriptPath && !sessionId && !agentId && !agent && !description && !prompt) {
    return null
  }

  return {
    sessionId,
    agentId,
    transcriptPath,
    agent,
    description,
    prompt,
  }
}

function deriveSubagentState(toolCall: ToolCallBlock): SubagentState {
  if (toolCall.subagentState) return toolCall.subagentState
  if (toolCall.isError) return 'error'
  if (toolCall.status === 'running') return 'pending'
  if (toolCall.streamingText?.trim()) return 'done'
  return 'done'
}

export function collectSubagentCalls(messages: Message[]): SubagentCallSummary[] {
  return messages
    .flatMap((message) => (
      message.toolCalls
        .filter((toolCall) => isSubagentToolName(toolCall.toolName))
        .map((toolCall) => {
          const runtimeInfo = extractSubagentRuntimeInfo(toolCall.result, toolCall.toolInput)
          return {
            key: `${message.id}:${toolCall.toolUseId}`,
            messageId: message.id,
            toolUseId: toolCall.toolUseId,
            createdAt: message.createdAt,
            toolCall,
            agent: runtimeInfo?.agent ?? null,
            description: runtimeInfo?.description ?? null,
            prompt: runtimeInfo?.prompt ?? null,
            transcriptPath: toolCall.subagentTranscriptPath ?? runtimeInfo?.transcriptPath ?? null,
            sessionId: toolCall.subagentSessionId ?? runtimeInfo?.sessionId ?? null,
            agentId: toolCall.subagentAgentId ?? runtimeInfo?.agentId ?? null,
            streamingText: toolCall.streamingText ?? '',
            status: deriveSubagentState(toolCall),
          }
        })
    ))
    .sort((left, right) => {
      const leftPriority = left.status === 'running' || left.status === 'pending' ? 1 : 0
      const rightPriority = right.status === 'running' || right.status === 'pending' ? 1 : 0
      if (leftPriority !== rightPriority) return rightPriority - leftPriority
      return right.createdAt - left.createdAt
    })
}
