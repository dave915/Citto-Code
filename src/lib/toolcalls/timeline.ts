import type { ToolCallBlock as ToolCallBlockType } from '../../store/sessions'
import {
  countDisplayLines,
  formatToolInput,
  formatToolResult,
  getActionLabel,
  getEditableToolPath,
} from './formatting'
import { getDiffStats, getEditDiffHunks } from './diff'
import type { TimelineEntry } from './types'

export function buildSummary(entries: TimelineEntry[]) {
  const parts: string[] = []
  const fileEdits = entries.filter((entry) => entry.kind === 'file' && (entry.added > 0 || entry.removed > 0)).length
  const todos = entries.filter((entry) => entry.kind === 'todo').length
  const reads = entries.filter((entry) => entry.label === 'Read').length

  if (fileEdits > 0) parts.push(`${fileEdits}개 파일 수정됨`)
  if (todos > 0) parts.push('할 일 목록 업데이트됨')
  if (reads > 0) parts.push('파일 읽음')

  return parts.length > 0 ? parts.join(', ') : `${entries.length}개 작업`
}

export function buildTimelineEntries(toolCalls: ToolCallBlockType[]): TimelineEntry[] {
  const grouped = new Map<string, TimelineEntry>()

  for (const toolCall of toolCalls) {
    const badge = formatToolInput(toolCall.toolName, toolCall.toolInput)
    const path = getEditableToolPath(toolCall.toolName, toolCall.toolInput)
    const diffStats = getDiffStats(getEditDiffHunks(toolCall.toolName, toolCall.toolInput))
    const resultText = formatToolResult(toolCall.result)
    const actionLabel = getActionLabel(toolCall.toolName)
    const key =
      toolCall.toolName === 'TodoWrite'
        ? `todo:${toolCall.id}`
        : path
          ? `file:${path}`
          : `${toolCall.toolName}:${badge || toolCall.id}`

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        kind: toolCall.toolName === 'TodoWrite' ? 'todo' : path ? 'file' : 'generic',
        label: actionLabel,
        badge: badge || null,
        detail: toolCall.toolName === 'Read' ? `${countDisplayLines(resultText)}줄 읽음` : null,
        toolCalls: [toolCall],
        added: diffStats.added,
        removed: diffStats.removed,
        readLines: toolCall.toolName === 'Read' ? countDisplayLines(resultText) : 0,
        status: toolCall.status,
      })
      continue
    }

    const existing = grouped.get(key)!
    existing.toolCalls.push(toolCall)
    existing.added += diffStats.added
    existing.removed += diffStats.removed
    existing.readLines += toolCall.toolName === 'Read' ? countDisplayLines(resultText) : 0
    existing.status =
      existing.status === 'error' || toolCall.status === 'error'
        ? 'error'
        : existing.status === 'running' || toolCall.status === 'running'
          ? 'running'
          : 'done'

    if (toolCall.toolName === 'Read') {
      existing.label = 'Read'
      existing.detail = `${existing.readLines}줄 읽음`
    }
    if (toolCall.toolName === 'TodoWrite') {
      existing.label = 'Update Todos'
    }
  }

  return Array.from(grouped.values())
}
