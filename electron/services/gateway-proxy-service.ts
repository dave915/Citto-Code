import { randomUUID } from 'crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import {
  getGatewayChatCompletionsUrl,
  GATEWAY_DEFAULT_MODEL_ID,
  GATEWAY_PROXY_PORT,
} from '../gateway-constants'
import {
  isAgentToolName,
  normalizeAgentToolName,
  sanitizeAgentToolInput,
} from '../agent-tool-names'

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source?: unknown }
  | { type: 'tool_use'; id: string; name: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id: string; content?: unknown; is_error?: boolean }
  | { type: 'thinking'; thinking?: string; text?: string }
  | { type: 'redacted_thinking'; text?: string }

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

type OpenAIStreamDelta = {
  content?: string | Array<{ type?: string; text?: string }>
  tool_calls?: Array<{
    index?: number
    id?: string
    type?: 'function'
    function?: {
      name?: string
      arguments?: string
    }
  }>
}

type OpenAIStreamChoice = {
  delta?: OpenAIStreamDelta
  finish_reason?: string | null
}

type OpenAIStreamChunk = {
  choices?: OpenAIStreamChoice[]
  usage?: {
    prompt_tokens?: number | null
    completion_tokens?: number | null
  }
}

type ToolBlockState = {
  anthropicIndex: number
  id: string
  name: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readGatewayToken(): string {
  return (
    process.env.CITTO_GATEWAY_API_KEY
    ?? process.env.GATEWAY_API_KEY
    ?? process.env.CITTO_GATEWAY_AUTH_TOKEN
    ?? process.env.GATEWAY_AUTH_TOKEN
    ?? process.env.OPENAI_API_KEY
    ?? ''
  ).trim()
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return null
  return JSON.parse(raw)
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .flatMap((block) => {
      if (!isRecord(block)) return []
      if (block.type === 'text' && typeof block.text === 'string') return [block.text]
      return []
    })
    .join('\n')
}

function normalizeSystemMessages(system: unknown): OpenAIChatMessage[] {
  if (typeof system === 'string' && system.trim()) {
    return [{ role: 'system', content: system.trim() }]
  }

  if (!Array.isArray(system)) return []

  const text = system
    .flatMap((block) => {
      if (!isRecord(block)) return []
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        return [block.text.trim()]
      }
      return []
    })
    .join('\n\n')
    .trim()

  return text ? [{ role: 'system', content: text }] : []
}

function convertMessages(messages: AnthropicMessage[]): OpenAIChatMessage[] {
  const converted: OpenAIChatMessage[] = []

  for (const message of messages) {
    const blocks = Array.isArray(message.content)
      ? message.content
      : [{ type: 'text', text: typeof message.content === 'string' ? message.content : '' }] satisfies AnthropicContentBlock[]

    if (message.role === 'user') {
      const userText = blocks
        .flatMap((block) => {
          if (block.type === 'text') return [block.text]
          if (block.type === 'image') return ['[image attached]']
          return []
        })
        .join('\n')
        .trim()

      if (userText) {
        converted.push({
          role: 'user',
          content: userText,
        })
      }

      for (const block of blocks) {
        if (block.type !== 'tool_result') continue
        converted.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: extractTextFromContent(block.content) || (block.is_error ? '[tool error]' : '[tool result]'),
        })
      }
      continue
    }

    const text = blocks
      .flatMap((block) => {
        if (block.type === 'text') return [block.text]
        return []
      })
      .join('\n')
      .trim()

    const toolCalls = blocks
      .flatMap((block) => {
        if (block.type !== 'tool_use') return []
        const toolName = normalizeAgentToolName(block.name)
        const toolInput = isAgentToolName(toolName) ? sanitizeAgentToolInput(block.input) : block.input
        return [{
          id: block.id,
          type: 'function' as const,
          function: {
            name: toolName,
            arguments: JSON.stringify(toolInput ?? {}),
          },
        }]
      })

    if (text || toolCalls.length > 0) {
      converted.push({
        role: 'assistant',
        content: text || undefined,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      })
    }
  }

  return converted
}

function convertTools(tools: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(tools)) return undefined

  const converted = tools.flatMap((tool) => {
    if (!isRecord(tool) || typeof tool.name !== 'string' || !tool.name.trim()) return []
    const description = typeof tool.description === 'string' ? tool.description : ''
    const parameters = isRecord(tool.input_schema) ? tool.input_schema : { type: 'object', properties: {} }
    return [{
      type: 'function',
      function: {
        name: tool.name,
        description,
        parameters,
      },
    }]
  })

  return converted.length > 0 ? converted : undefined
}

function buildGatewayPayload(body: Record<string, unknown>) {
  const messages = Array.isArray(body.messages) ? body.messages as AnthropicMessage[] : []
  const convertedMessages = [
    ...normalizeSystemMessages(body.system),
    ...convertMessages(messages),
  ]

  return {
    model: GATEWAY_DEFAULT_MODEL_ID,
    stream: true,
    messages: convertedMessages,
    tools: convertTools(body.tools),
    tool_choice: body.tools ? 'auto' : undefined,
    max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
    metadata: undefined,
    thinking: undefined,
  }
}

function writeSse(response: ServerResponse, payload: Record<string, unknown>) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function sendSseHeaders(response: ServerResponse) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })
}

function createMessageStartPayload(messageId: string, model: string, inputTokens = 0) {
  return {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: inputTokens,
        output_tokens: 0,
      },
    },
  }
}

function createTextBlockStart(index: number) {
  return {
    type: 'content_block_start',
    index,
    content_block: {
      type: 'text',
      text: '',
    },
  }
}

function createToolBlockStart(index: number, toolUseId: string, toolName: string) {
  return {
    type: 'content_block_start',
    index,
    content_block: {
      type: 'tool_use',
      id: toolUseId,
      name: normalizeAgentToolName(toolName),
      input: {},
    },
  }
}

function createTextDelta(index: number, text: string) {
  return {
    type: 'content_block_delta',
    index,
    delta: {
      type: 'text_delta',
      text,
    },
  }
}

function createToolDelta(index: number, partialJson: string) {
  return {
    type: 'content_block_delta',
    index,
    delta: {
      type: 'input_json_delta',
      partial_json: partialJson,
    },
  }
}

function createBlockStop(index: number) {
  return {
    type: 'content_block_stop',
    index,
  }
}

function createMessageDelta(stopReason: string, outputTokens: number) {
  return {
    type: 'message_delta',
    delta: {
      stop_reason: stopReason,
      stop_sequence: null,
    },
    usage: {
      output_tokens: outputTokens,
    },
  }
}

function mapFinishReason(reason: string | null | undefined): string {
  if (reason === 'tool_calls') return 'tool_use'
  if (reason === 'length') return 'max_tokens'
  return 'end_turn'
}

function getTextDelta(delta: OpenAIStreamDelta | undefined): string {
  if (!delta) return ''
  if (typeof delta.content === 'string') return delta.content
  if (Array.isArray(delta.content)) {
    return delta.content
      .flatMap((item) => (item?.type === 'text' && typeof item.text === 'string' ? [item.text] : []))
      .join('')
  }
  return ''
}

function stripEmbeddedToolUseJson(text: string): string {
  return text.replace(/\{[\s\S]*?"type"\s*:\s*"tool_use"[\s\S]*?\}/g, '').trim()
}

function extractHallucinatedToolUse(text: string): {
  raw: string
  start: number
  end: number
  toolUseId: string
  toolName: string
  input: unknown
} | null {
  const match = text.match(/\{[\s\S]*?"type"\s*:\s*"tool_use"[\s\S]*?\}/)
  if (!match || typeof match.index !== 'number') return null

  try {
    const parsed = JSON.parse(match[0]) as {
      type?: unknown
      id?: unknown
      name?: unknown
      input?: unknown
    }

    if (parsed.type !== 'tool_use' || typeof parsed.name !== 'string') return null

    return {
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
      toolUseId: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : `toolu_${randomUUID()}`,
      toolName: normalizeAgentToolName(parsed.name),
      input: isAgentToolName(parsed.name) ? sanitizeAgentToolInput(parsed.input) : parsed.input,
    }
  } catch {
    return null
  }
}

async function forwardGatewayRequest(
  response: ServerResponse,
  requestBody: Record<string, unknown>,
) {
  const gatewayUrl = getGatewayChatCompletionsUrl()
  const gatewayToken = readGatewayToken()
  const messageId = `msg_${randomUUID()}`
  const fallbackModel = typeof requestBody.model === 'string' && requestBody.model.trim()
    ? requestBody.model.trim()
    : 'claude-sonnet-4-6'

  sendSseHeaders(response)
  writeSse(response, createMessageStartPayload(messageId, fallbackModel, 0))

  let nextContentIndex = 0
  let textBlockIndex: number | null = null
  let streamedText = ''
  let emittedMessageDelta = false
  let outputTokenCount = 0
  const toolBlocksByIndex = new Map<number, ToolBlockState>()

  const ensureTextBlock = () => {
    if (textBlockIndex !== null) return textBlockIndex
    textBlockIndex = nextContentIndex
    nextContentIndex += 1
    writeSse(response, createTextBlockStart(textBlockIndex))
    return textBlockIndex
  }

  const ensureToolBlock = (toolIndex: number, toolUseId: string, toolName: string) => {
    const existing = toolBlocksByIndex.get(toolIndex)
    if (existing) return existing

    const nextState: ToolBlockState = {
      anthropicIndex: nextContentIndex,
      id: toolUseId,
      name: normalizeAgentToolName(toolName),
    }
    nextContentIndex += 1
    toolBlocksByIndex.set(toolIndex, nextState)
    writeSse(response, createToolBlockStart(nextState.anthropicIndex, nextState.id, nextState.name))
    return nextState
  }

  const emitText = (rawText: string) => {
    if (!rawText) return

    const hallucinated = extractHallucinatedToolUse(rawText)
    if (hallucinated) {
      const prefix = stripEmbeddedToolUseJson(rawText.slice(0, hallucinated.start))
      if (prefix) {
        const index = ensureTextBlock()
        streamedText += prefix
        writeSse(response, createTextDelta(index, prefix))
      }

      const toolState = ensureToolBlock(nextContentIndex, hallucinated.toolUseId, hallucinated.toolName)
      writeSse(
        response,
        createToolDelta(toolState.anthropicIndex, JSON.stringify(hallucinated.input ?? {})),
      )

      const suffix = stripEmbeddedToolUseJson(rawText.slice(hallucinated.end))
      if (suffix) {
        const index = ensureTextBlock()
        streamedText += suffix
        writeSse(response, createTextDelta(index, suffix))
      }
      return
    }

    const normalized = stripEmbeddedToolUseJson(rawText)
    if (!normalized) return

    let nextText = normalized
    if (streamedText && normalized.startsWith(streamedText)) {
      nextText = normalized.slice(streamedText.length)
      streamedText = normalized
    } else {
      streamedText += normalized
    }

    if (!nextText) return
    const index = ensureTextBlock()
    writeSse(response, createTextDelta(index, nextText))
  }

  const finalize = (finishReason?: string | null, usage?: { completion_tokens?: number | null }) => {
    if (!emittedMessageDelta) {
      emittedMessageDelta = true
      outputTokenCount = typeof usage?.completion_tokens === 'number' && Number.isFinite(usage.completion_tokens)
        ? usage.completion_tokens
        : outputTokenCount
      writeSse(response, createMessageDelta(mapFinishReason(finishReason), outputTokenCount))
    }

    if (textBlockIndex !== null) {
      writeSse(response, createBlockStop(textBlockIndex))
    }

    for (const toolState of [...toolBlocksByIndex.values()].sort((left, right) => left.anthropicIndex - right.anthropicIndex)) {
      writeSse(response, createBlockStop(toolState.anthropicIndex))
    }

    writeSse(response, { type: 'message_stop' })
    response.end()
  }

  const gatewayPayload = buildGatewayPayload(requestBody)

  if (!gatewayUrl) {
    emitText('LLM Gateway URL이 설정되지 않았습니다.')
    finalize('end_turn')
    return
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (gatewayToken) {
    headers.Authorization = `Bearer ${gatewayToken}`
  }

  const upstream = await fetch(gatewayUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(gatewayPayload),
  }).catch((error) => {
    emitText(`Gateway 요청에 실패했습니다: ${String(error)}`)
    finalize('end_turn')
    return null
  })

  if (!upstream) return

  if (!upstream.ok || !upstream.body) {
    const errorText = (await upstream.text().catch(() => '')).trim()
    emitText(errorText || `Gateway 응답 실패 (${upstream.status})`)
    finalize('end_turn')
    return
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const processEventChunk = (chunkText: string) => {
    const dataLines = chunkText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, ''))

    for (const dataLine of dataLines) {
      if (!dataLine) continue
      if (dataLine === '[DONE]') {
        finalize('end_turn')
        return
      }

      let parsed: OpenAIStreamChunk
      try {
        parsed = JSON.parse(dataLine) as OpenAIStreamChunk
      } catch {
        continue
      }

      if (parsed.usage?.completion_tokens != null && Number.isFinite(parsed.usage.completion_tokens)) {
        outputTokenCount = parsed.usage.completion_tokens ?? outputTokenCount
      }

      const choice = parsed.choices?.[0]
      const delta = choice?.delta
      const textDelta = getTextDelta(delta)
      if (textDelta) {
        emitText(textDelta)
      }

      for (const toolCall of delta?.tool_calls ?? []) {
        const toolIndex = typeof toolCall.index === 'number' ? toolCall.index : 0
        const toolName = normalizeAgentToolName(toolCall.function?.name ?? 'Tool')
        const toolState = ensureToolBlock(
          toolIndex,
          toolCall.id ?? `toolu_${randomUUID()}`,
          toolName,
        )
        const partialArguments = toolCall.function?.arguments ?? ''
        if (partialArguments) {
          writeSse(response, createToolDelta(toolState.anthropicIndex, partialArguments))
        }
      }

      if (choice?.finish_reason) {
        finalize(choice.finish_reason, parsed.usage)
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    const parts = buffer.split('\n\n')
    buffer = done ? '' : (parts.pop() ?? '')

    for (const part of parts) {
      processEventChunk(part)
      if (response.writableEnded) return
    }

    if (done) break
  }

  if (!response.writableEnded) {
    if (buffer.trim()) {
      processEventChunk(buffer)
    }
    if (!response.writableEnded) {
      finalize('end_turn')
    }
  }
}

function handleHealthCheck(response: ServerResponse) {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ ok: true, port: GATEWAY_PROXY_PORT }))
}

export function createGatewayProxyService() {
  let server: Server | null = null
  let startPromise: Promise<void> | null = null

  const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'GET' && request.url === '/health') {
      handleHealthCheck(response)
      return
    }

    if (request.method !== 'POST' || request.url !== '/v1/messages') {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    try {
      const body = await readJsonBody(request)
      if (!isRecord(body)) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }

      await forwardGatewayRequest(response, body)
    } catch (error) {
      sendSseHeaders(response)
      writeSse(response, createMessageStartPayload(`msg_${randomUUID()}`, 'claude-sonnet-4-6', 0))
      writeSse(response, createTextBlockStart(0))
      writeSse(response, createTextDelta(0, `Gateway proxy error: ${String(error)}`))
      writeSse(response, createMessageDelta('end_turn', 0))
      writeSse(response, createBlockStop(0))
      writeSse(response, { type: 'message_stop' })
      response.end()
    }
  }

  return {
    async start() {
      if (server) return
      if (startPromise) return startPromise

      startPromise = new Promise<void>((resolve, reject) => {
        const nextServer = createServer((request, response) => {
          void handleRequest(request, response)
        })

        nextServer.once('error', (error) => {
          startPromise = null
          reject(error)
        })

        nextServer.listen(GATEWAY_PROXY_PORT, '127.0.0.1', () => {
          server = nextServer
          startPromise = null
          resolve()
        })
      })

      return startPromise
    },

    async stop() {
      const currentServer = server
      server = null
      startPromise = null
      if (!currentServer) return

      await new Promise<void>((resolve, reject) => {
        currentServer.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}
