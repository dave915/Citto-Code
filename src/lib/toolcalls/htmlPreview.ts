import type { ToolCallBlock as ToolCallBlockType } from '../../store/sessions'
import { buildDiffSegments } from './diff'
import {
  formatToolResult,
  getEditableToolPath,
  isHtmlPath,
  stripLineNumberPrefixes,
} from './formatting'
import type { HtmlPreviewCandidate } from './types'

export function extractHtmlPreviewCandidate(toolCalls: ToolCallBlockType[]): HtmlPreviewCandidate | null {
  const targetPath = [...toolCalls]
    .reverse()
    .map((toolCall) => getEditableToolPath(toolCall.toolName, toolCall.toolInput))
    .find((path): path is string => Boolean(path) && isHtmlPath(path))

  if (!targetPath) return null

  const relatedToolCalls = toolCalls.filter(
    (toolCall) => getEditableToolPath(toolCall.toolName, toolCall.toolInput) === targetPath,
  )
  const latestReadCall = [...relatedToolCalls]
    .reverse()
    .find((toolCall) => toolCall.toolName === 'Read' && formatToolResult(toolCall.result).trim().length > 0)

  if (latestReadCall) {
    return {
      path: targetPath,
      fallbackContent: stripLineNumberPrefixes(formatToolResult(latestReadCall.result)).code,
    }
  }

  const diffSegments = buildDiffSegments(relatedToolCalls)
  const latestRenderedContent = [...diffSegments]
    .reverse()
    .find((segment) => typeof segment.newContent === 'string' && segment.newContent.trim().length > 0)?.newContent ?? null

  return {
    path: targetPath,
    fallbackContent: latestRenderedContent,
  }
}
