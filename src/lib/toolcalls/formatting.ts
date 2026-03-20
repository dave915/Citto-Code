import type { ToolCallBlock as ToolCallBlockType } from '../../store/sessions'
import { extractSubagentRuntimeInfo, isSubagentToolName } from '../agent-subcalls'
import type { SubagentSessionInfo } from './types'

const ACTION_LABELS: Record<string, string> = {
  Read: 'Read',
  Edit: 'Edit',
  Write: 'Write',
  MultiEdit: 'Edit',
  TodoWrite: 'Update Todos',
  Bash: 'Run',
  Glob: 'Glob',
  Grep: 'Grep',
  ToolSearch: 'Search',
  WebFetch: 'Fetch',
  WebSearch: 'Search',
  Agent: 'Task',
  Task: 'Task',
  agent: 'Task',
  task: 'Task',
  call_omo_agent: 'Task',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractOutputFileFromText(text: string): string | null {
  const normalized = text.trim()
  if (!normalized) return null

  const taggedMatch = normalized.match(/<output-file>\s*([^<\n]+?)\s*<\/output-file>/i)
  if (taggedMatch?.[1]?.trim()) return taggedMatch[1].trim()

  const lineMatch = normalized.match(/(?:^|\n)\s*output[_-]?file\s*:\s*([^\n]+)$/im)
  if (lineMatch?.[1]?.trim()) return lineMatch[1].trim()

  return null
}

function inferSubagentLookupId(
  outputFile: string,
  result: Record<string, unknown> | null,
  input: Record<string, unknown> | null,
): string {
  const explicitAgentId = typeof result?.agentId === 'string'
    ? result.agentId.trim()
    : typeof result?.agent_id === 'string'
      ? result.agent_id.trim()
      : ''
  if (explicitAgentId) return `subagent:${explicitAgentId}`

  const taskOutputMatch = outputFile.match(/\/tasks\/([^/]+)\.output$/i)
  if (taskOutputMatch?.[1]) return `subagent:${taskOutputMatch[1]}`

  const transcriptMatch = outputFile.match(/\/subagents\/agent-([^/]+)\.jsonl$/i)
  if (transcriptMatch?.[1]) return `subagent:${transcriptMatch[1]}`

  const inputAgent = typeof input?.subagent_type === 'string' ? input.subagent_type.trim() : ''
  if (inputAgent) return `subagent:${inputAgent}:${outputFile}`

  return `subagent:${outputFile}`
}

function stripSystemTags(value: string): string {
  return value
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

function extractPreferredResultContent(result: unknown): unknown {
  if (!isRecord(result)) return result
  if (typeof result.content !== 'undefined') return result.content
  if (typeof result.result !== 'undefined') return result.result
  if (typeof result.toolOutput !== 'undefined') return result.toolOutput
  if (typeof result.tool_output !== 'undefined') return result.tool_output
  return result
}

export function formatToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return String(input ?? '')
  const obj = input as Record<string, unknown>

  if (name === 'Bash') return String(obj.command ?? '')
  if (name === 'Read') return String(obj.file_path ?? '')
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') return String(obj.file_path ?? '')
  if (name === 'Glob') return String(obj.pattern ?? '')
  if (name === 'Grep') return String(obj.pattern ?? '') + (obj.path ? ` in ${obj.path}` : '')
  if (name === 'WebFetch') return String(obj.url ?? '')
  if (name === 'WebSearch') return String(obj.query ?? '')
  if (isSubagentToolName(name)) {
    const description = typeof obj.description === 'string' ? obj.description.trim() : ''
    if (description) return description
    const subagentType = typeof obj.subagent_type === 'string' ? obj.subagent_type.trim() : ''
    if (subagentType) return subagentType
  }
  return JSON.stringify(input, null, 2)
}

export function formatToolResult(result: unknown): string {
  const preferred = extractPreferredResultContent(result)
  if (typeof preferred === 'string') return stripSystemTags(preferred)
  if (Array.isArray(preferred)) {
    return stripSystemTags(
      preferred
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => (item.type === 'text' ? String(item.text) : JSON.stringify(item)))
        .join('\n'),
    )
  }
  return stripSystemTags(JSON.stringify(preferred ?? '', null, 2))
}

export function countDisplayLines(content: string): number {
  if (!content) return 0
  return content.split('\n').length
}

export function stripLineNumberPrefixes(content: string): { code: string; startLine: number } {
  if (!content) return { code: '', startLine: 1 }
  const lines = content.split('\n')
  const lineNumberPattern = /^\s*(\d+)(?:→|:\s)/

  const firstMatch = lines.find((line) => lineNumberPattern.test(line))
  if (!firstMatch) return { code: content, startLine: 1 }

  const matchedCount = lines.filter((line) => lineNumberPattern.test(line)).length
  if (matchedCount < lines.length * 0.5) return { code: content, startLine: 1 }

  const startLine = Number(firstMatch.match(lineNumberPattern)?.[1] ?? 1)
  const stripped = lines.map((line) => {
    const match = line.match(lineNumberPattern)
    return match ? line.slice(match[0].length) : line
  })
  return { code: stripped.join('\n'), startLine }
}

export function inferLanguageFromPath(path: string | null | undefined): string {
  const lower = path?.toLowerCase() ?? ''
  if (lower.endsWith('.tsx')) return 'tsx'
  if (lower.endsWith('.ts')) return 'ts'
  if (lower.endsWith('.jsx')) return 'jsx'
  if (lower.endsWith('.js')) return 'js'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.html')) return 'html'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml'
  if (lower.endsWith('.sh')) return 'bash'
  return 'text'
}

export function getEditableToolPath(name: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit' || name === 'Read') {
    const filePath = obj.file_path
    return typeof filePath === 'string' && filePath.trim() ? filePath : null
  }
  return null
}

export function getSubagentSessionInfo(toolCall: ToolCallBlockType): SubagentSessionInfo | null {
  if (!isSubagentToolName(toolCall.toolName)) return null

  const runtimeInfo = extractSubagentRuntimeInfo(toolCall.result, toolCall.toolInput)
  const resultText = formatToolResult(toolCall.result)
  const input = isRecord(toolCall.toolInput) ? toolCall.toolInput : null
  const outputFile = toolCall.subagentTranscriptPath
    ?? runtimeInfo?.transcriptPath
    ?? extractOutputFileFromText(resultText)
  if (!outputFile) return null

  const sessionId = toolCall.subagentSessionId ?? runtimeInfo?.sessionId ?? null
  const agentId = toolCall.subagentAgentId ?? runtimeInfo?.agentId ?? null
  const lookupId = agentId
    ? `subagent:${agentId}`
    : sessionId?.startsWith('ses_')
      ? sessionId
      : inferSubagentLookupId(outputFile, null, input)

  return {
    lookupId,
    outputFile,
    agent: runtimeInfo?.agent ?? null,
    agentId,
    description: runtimeInfo?.description ?? null,
    sessionId,
  }
}

export function getActionLabel(toolName: string): string {
  return ACTION_LABELS[toolName] ?? toolName
}

export function isHtmlPath(path: string | null | undefined): boolean {
  const lower = path?.toLowerCase() ?? ''
  return lower.endsWith('.html') || lower.endsWith('.htm')
}
