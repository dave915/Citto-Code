import type { ToolCallBlock as ToolCallBlockType } from '../../store/sessions'
import { buildDiffSegments } from './diff'
import {
  formatToolResult,
  getEditableToolPath,
  isHtmlPath,
  stripLineNumberPrefixes,
} from './formatting'
import type { HtmlPreviewCandidate } from './types'

const ANSI_ESCAPE_PATTERN = /\u001B\[[0-9;]*m/g
const DIRECT_LOCAL_SERVER_URL_PATTERN = /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0):\d+(?:\/[^\s"'<>)]*)?/i
const LOCAL_SERVER_OUTPUT_PATTERNS = [
  /Server running at\s+(https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0):\d+(?:\/[^\s"'<>)]*)?)/i,
  /Local:\s+(https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0):\d+(?:\/[^\s"'<>)]*)?)/i,
  /started server on [^:\n]+:(\d+)/i,
  /listening on(?: port)?\s*:?\s*(\d+)/i,
  /ready in .*?\n.*?(https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0):\d+(?:\/[^\s"'<>)]*)?)/i,
]

function normalizeServerUrl(url: string): string {
  return url
    .replace(ANSI_ESCAPE_PATTERN, '')
    .trim()
    .replace(/[*_`]+$/g, '')
    .replace(/[.,;:!?]+$/g, '')
    .replace('0.0.0.0', 'localhost')
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').trim()
}

function stripShellQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function extractAbsolutePathField(toolInput: unknown, keys: string[]): string | null {
  if (!toolInput || typeof toolInput !== 'object') return null

  for (const key of keys) {
    const rawValue = (toolInput as Record<string, unknown>)[key]
    if (typeof rawValue !== 'string') continue
    const value = stripShellQuotes(rawValue)
    if (!value.startsWith('/')) continue
    return normalizePath(value)
  }

  return null
}

function extractCommandRootPath(toolInput: unknown): string | null {
  const explicitRootPath = extractAbsolutePathField(toolInput, ['cwd', 'workdir'])
  if (explicitRootPath) return explicitRootPath

  if (!toolInput || typeof toolInput !== 'object') return null
  const command = String((toolInput as { command?: unknown }).command ?? '').trim()
  if (!command) return null

  const normalizedCommand = command.replace(/\r\n?/g, '\n')
  const match = normalizedCommand.match(/(?:^|\n)\s*cd\s+((?:"[^"]+"|'[^']+'|[^&;\n])+)\s*(?:(?:&&|;|\n)|$)/)
  if (!match?.[1]) return null

  const targetPath = stripShellQuotes(match[1])
  if (!targetPath.startsWith('/')) return null
  return normalizePath(targetPath)
}

function isLikelyServerCommand(toolInput: unknown): boolean {
  if (!toolInput || typeof toolInput !== 'object') return false
  const command = String((toolInput as { command?: unknown }).command ?? '').toLowerCase()
  if (!command) return false

  return /\b(vite|next|serve|preview|dev|start|http-server|live-server|python\s+-m\s+http\.server)\b/.test(command)
}

function extractLocalServerUrl(toolCall: ToolCallBlockType): string | null {
  if (toolCall.toolName !== 'Bash') return null

  const output = formatToolResult(toolCall.result).replace(ANSI_ESCAPE_PATTERN, '').trim()
  if (!output) return null

  for (const pattern of LOCAL_SERVER_OUTPUT_PATTERNS) {
    const match = output.match(pattern)
    if (!match) continue
    if (match[1]?.startsWith('http')) return normalizeServerUrl(match[1])
    if (match[1]) return `http://localhost:${match[1]}`
  }

  const directUrlMatch = output.match(DIRECT_LOCAL_SERVER_URL_PATTERN)
  if (directUrlMatch?.[0]) {
    return normalizeServerUrl(directUrlMatch[0])
  }

  if (!isLikelyServerCommand(toolCall.toolInput)) return null
  return null
}

function extractLocalServerUrlFromText(text: string): string | null {
  const directUrlMatch = text.replace(ANSI_ESCAPE_PATTERN, '').match(DIRECT_LOCAL_SERVER_URL_PATTERN)
  return directUrlMatch?.[0] ? normalizeServerUrl(directUrlMatch[0]) : null
}

function buildFilePreviewCandidate(toolCalls: ToolCallBlockType[], targetPath: string): HtmlPreviewCandidate {
  const relatedToolCalls = toolCalls.filter(
    (toolCall) => getEditableToolPath(toolCall.toolName, toolCall.toolInput) === targetPath,
  )
  const latestReadCall = [...relatedToolCalls]
    .reverse()
    .find((toolCall) => toolCall.toolName === 'Read' && formatToolResult(toolCall.result).trim().length > 0)

  if (latestReadCall) {
    return {
      kind: 'file',
      path: targetPath,
      fallbackContent: stripLineNumberPrefixes(formatToolResult(latestReadCall.result)).code,
    }
  }

  const diffSegments = buildDiffSegments(relatedToolCalls)
  const latestRenderedContent = [...diffSegments]
    .reverse()
    .find((segment) => typeof segment.newContent === 'string' && segment.newContent.trim().length > 0)?.newContent ?? null

  return {
    kind: 'file',
    path: targetPath,
    fallbackContent: latestRenderedContent,
  }
}

export function extractHtmlPreviewCandidates(
  toolCalls: ToolCallBlockType[],
  assistantText = '',
): {
  file: HtmlPreviewCandidate | null
  url: HtmlPreviewCandidate | null
} {
  let latestFileCandidate: HtmlPreviewCandidate | null = null
  let latestUrlCandidate: HtmlPreviewCandidate | null = null

  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index]
    const targetPath = getEditableToolPath(toolCall.toolName, toolCall.toolInput)

    if (!latestFileCandidate && targetPath && isHtmlPath(targetPath)) {
      latestFileCandidate = buildFilePreviewCandidate(toolCalls, targetPath)
    }

    if (!latestUrlCandidate) {
      const localServerUrl = extractLocalServerUrl(toolCall)
      if (localServerUrl) {
        latestUrlCandidate = {
          kind: 'url',
          url: localServerUrl,
          path: null,
          rootPath: extractCommandRootPath(toolCall.toolInput),
          fallbackContent: null,
        }
      }
    }
  }

  const linkedPreviewPath = latestFileCandidate?.kind === 'file'
    ? latestFileCandidate.path
    : null
  const assistantTextUrl = assistantText.trim()
    ? extractLocalServerUrlFromText(assistantText)
    : null
  if (assistantTextUrl) {
    latestUrlCandidate = {
      kind: 'url',
      url: assistantTextUrl,
      path: linkedPreviewPath,
      rootPath: latestUrlCandidate?.kind === 'url' ? latestUrlCandidate.rootPath : null,
      fallbackContent: null,
    }
  } else if (latestUrlCandidate?.kind === 'url') {
    latestUrlCandidate = {
      ...latestUrlCandidate,
      path: latestUrlCandidate.path ?? linkedPreviewPath,
    }
  }

  return {
    file: latestFileCandidate,
    url: latestUrlCandidate,
  }
}

export function extractHtmlPreviewCandidate(
  toolCalls: ToolCallBlockType[],
  assistantText = '',
): HtmlPreviewCandidate | null {
  const { file, url } = extractHtmlPreviewCandidates(toolCalls, assistantText)
  return url ?? file
}
