import type { ToolCallBlock as ToolCallBlockType } from '../../store/sessions'
import { translate, type AppLanguage } from '../i18n'
import {
  countDisplayLines,
  formatToolInput,
  formatToolResult,
  getActionLabel,
  getEditableToolPath,
} from './formatting'
import { getDiffStats, getEditDiffHunks } from './diff'
import type { TimelineEntry } from './types'

export function buildSummary(entries: TimelineEntry[], language: AppLanguage = 'ko') {
  const parts: string[] = []
  const fileEdits = entries.filter((entry) => entry.kind === 'file' && (entry.added > 0 || entry.removed > 0)).length
  const todos = entries.filter((entry) => entry.kind === 'todo').length
  const reads = entries.filter((entry) => entry.readLines > 0).length

  if (fileEdits > 0) parts.push(translate(language, 'toolTimeline.summary.filesEdited', { count: fileEdits }))
  if (todos > 0) parts.push(translate(language, 'toolTimeline.summary.todoUpdated'))
  if (reads > 0) parts.push(translate(language, 'toolTimeline.summary.filesRead'))

  return parts.length > 0
    ? parts.join(', ')
    : translate(language, 'toolTimeline.summary.tasks', { count: entries.length })
}

export function buildTimelineEntries(toolCalls: ToolCallBlockType[], language: AppLanguage = 'ko'): TimelineEntry[] {
  const grouped = new Map<string, TimelineEntry>()

  for (const toolCall of toolCalls) {
    const badge = formatToolInput(toolCall.toolName, toolCall.toolInput)
    const path = getEditableToolPath(toolCall.toolName, toolCall.toolInput)
    const diffStats = getDiffStats(getEditDiffHunks(toolCall.toolName, toolCall.toolInput))
    const resultText = formatToolResult(toolCall.result)
    const actionLabel = getActionLabel(toolCall.toolName, language)
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
        detail: toolCall.toolName === 'Read'
          ? translate(language, 'toolTimeline.readLines', { count: countDisplayLines(resultText) })
          : null,
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
      existing.label = getActionLabel('Read', language)
      existing.detail = translate(language, 'toolTimeline.readLines', { count: existing.readLines })
    }
    if (toolCall.toolName === 'TodoWrite') {
      existing.label = getActionLabel('TodoWrite', language)
    }
  }

  return Array.from(grouped.values())
}
