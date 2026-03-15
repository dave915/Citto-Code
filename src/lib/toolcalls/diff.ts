import type { ToolCallBlock as ToolCallBlockType } from '../../store/sessions'
import type { DiffHunk, DiffRow, DiffSegment } from './types'

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function splitDiffLines(content: string): string[] {
  if (!content) return []
  return normalizeNewlines(content).split('\n')
}

function replaceFirstOccurrence(content: string, before: string, after: string): string {
  const normalizedContent = normalizeNewlines(content)
  const normalizedBefore = normalizeNewlines(before)
  const normalizedAfter = normalizeNewlines(after)

  if (!normalizedBefore) {
    return normalizedAfter ? `${normalizedAfter}${normalizedContent}` : normalizedContent
  }

  const index = normalizedContent.indexOf(normalizedBefore)
  if (index < 0) return normalizedContent
  return `${normalizedContent.slice(0, index)}${normalizedAfter}${normalizedContent.slice(index + normalizedBefore.length)}`
}

export function getEditDiffHunks(name: string, input: unknown): DiffHunk[] {
  if (!input || typeof input !== 'object') return []
  const obj = input as Record<string, unknown>

  if (name === 'Edit') {
    const before = typeof obj.old_string === 'string' ? obj.old_string : ''
    const after = typeof obj.new_string === 'string' ? obj.new_string : ''
    return before || after ? [{ before, after }] : []
  }

  if (name === 'MultiEdit' && Array.isArray(obj.edits)) {
    return obj.edits
      .filter((edit): edit is Record<string, unknown> => typeof edit === 'object' && edit !== null)
      .map((edit) => ({
        before: typeof edit.old_string === 'string' ? edit.old_string : '',
        after: typeof edit.new_string === 'string' ? edit.new_string : '',
      }))
      .filter((edit) => edit.before || edit.after)
  }

  if (name === 'Write') {
    const content = typeof obj.content === 'string' ? obj.content : ''
    return content ? [{ before: '', after: content }] : []
  }

  return []
}

export function buildDiffSegments(toolCalls: ToolCallBlockType[], fallbackFileContent: string | null = null): DiffSegment[] {
  const segments: DiffSegment[] = []

  for (const toolCall of toolCalls) {
    const input = toolCall.toolInput && typeof toolCall.toolInput === 'object'
      ? toolCall.toolInput as Record<string, unknown>
      : {}
    const snapshotBefore = typeof toolCall.fileSnapshotBefore === 'string'
      ? normalizeNewlines(toolCall.fileSnapshotBefore)
      : typeof fallbackFileContent === 'string'
        ? normalizeNewlines(fallbackFileContent)
        : toolCall.fileSnapshotBefore ?? null

    if (toolCall.toolName === 'Edit') {
      const before = typeof input.old_string === 'string' ? input.old_string : ''
      const after = typeof input.new_string === 'string' ? input.new_string : ''
      const oldContent = snapshotBefore
      const newContent = oldContent !== null ? replaceFirstOccurrence(oldContent, before, after) : null
      if (before || after) {
        segments.push({ before, after, oldContent, newContent })
      }
      continue
    }

    if (toolCall.toolName === 'MultiEdit' && Array.isArray(input.edits)) {
      let workingContent = snapshotBefore
      for (const edit of input.edits) {
        if (!edit || typeof edit !== 'object') continue
        const before = typeof (edit as Record<string, unknown>).old_string === 'string'
          ? (edit as Record<string, unknown>).old_string as string
          : ''
        const after = typeof (edit as Record<string, unknown>).new_string === 'string'
          ? (edit as Record<string, unknown>).new_string as string
          : ''
        const oldContent = workingContent
        const newContent = oldContent !== null ? replaceFirstOccurrence(oldContent, before, after) : null
        if (before || after) {
          segments.push({ before, after, oldContent, newContent })
        }
        workingContent = newContent
      }
      continue
    }

    if (toolCall.toolName === 'Write') {
      const after = typeof input.content === 'string' ? input.content : ''
      if (after || snapshotBefore) {
        segments.push({
          before: snapshotBefore ?? '',
          after,
          oldContent: snapshotBefore,
          newContent: after ? normalizeNewlines(after) : '',
        })
      }
    }
  }

  return segments
}

export function getDiffStats(hunks: DiffHunk[]) {
  let added = 0
  let removed = 0

  for (const hunk of hunks) {
    added += hunk.after ? hunk.after.split('\n').filter(Boolean).length : 0
    removed += hunk.before ? hunk.before.split('\n').filter(Boolean).length : 0
  }

  return { added, removed }
}

function findLineStart(content: string, needle: string): number | null {
  const normalizedContent = normalizeNewlines(content)
  const normalizedNeedle = normalizeNewlines(needle)

  if (!normalizedContent || !normalizedNeedle.trim()) return null
  const index = normalizedContent.indexOf(normalizedNeedle)
  if (index >= 0) return normalizedContent.slice(0, index).split('\n').length

  const firstMeaningfulLine = normalizedNeedle
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstMeaningfulLine) return null
  const fallbackIndex = normalizedContent.indexOf(firstMeaningfulLine)
  if (fallbackIndex >= 0) return normalizedContent.slice(0, fallbackIndex).split('\n').length
  return null
}

function resolveAnchorLine(editedFileContent: string | null, before: string, after: string): number | null {
  if (!editedFileContent) return null
  return findLineStart(editedFileContent, after) ?? findLineStart(editedFileContent, before)
}

export function buildDiffRows(hunk: DiffHunk, editedFileContent: string | null): DiffRow[] {
  const beforeLines = splitDiffLines(hunk.before)
  const afterLines = splitDiffLines(hunk.after)
  const anchorLine = resolveAnchorLine(editedFileContent, hunk.before, hunk.after) ?? 0

  const rows = [
    ...beforeLines.map((line, index) => ({
      kind: 'removed' as const,
      text: line,
      lineNumber: anchorLine + index,
    })),
    ...afterLines.map((line, index) => ({
      kind: 'added' as const,
      text: line,
      lineNumber: anchorLine + index,
    })),
  ]

  return rows.length > 0 ? rows : [{ kind: 'added', text: '', lineNumber: anchorLine }]
}

export function buildUnifiedDiffText(path: string, diffHunks: DiffHunk[], editedFileContent: string | null) {
  const lines = [`--- a/${path}`, `+++ b/${path}`]
  const hunkHasReliableLineNumbers: boolean[] = []

  for (const hunk of diffHunks) {
    const beforeLines = splitDiffLines(hunk.before)
    const afterLines = splitDiffLines(hunk.after)
    const resolvedAnchorLine = resolveAnchorLine(editedFileContent, hunk.before, hunk.after)
    const anchorLine = resolvedAnchorLine ?? 0
    hunkHasReliableLineNumbers.push(resolvedAnchorLine !== null)

    const oldCount = beforeLines.length
    const newCount = afterLines.length
    lines.push(`@@ -${anchorLine},${oldCount} +${anchorLine},${newCount} @@`)
    beforeLines.forEach((line) => lines.push(`-${line}`))
    afterLines.forEach((line) => lines.push(`+${line}`))
  }

  return {
    text: lines.join('\n'),
    hunkHasReliableLineNumbers,
  }
}

export function buildUnifiedDiffTextFromSegments(path: string, segments: DiffSegment[], fallbackEditedContent: string | null) {
  const lines = [`--- a/${path}`, `+++ b/${path}`]
  const hunkHasReliableLineNumbers: boolean[] = []

  for (const segment of segments) {
    const beforeLines = splitDiffLines(segment.before)
    const afterLines = splitDiffLines(segment.after)

    const resolvedOldStart =
      beforeLines.length === 0
        ? null
        : (segment.oldContent ? findLineStart(segment.oldContent, segment.before) : null)

    const oldStart = beforeLines.length === 0 ? 0 : resolvedOldStart ?? 0

    const resolvedNewStart =
      afterLines.length === 0
        ? null
        : (segment.newContent && segment.after ? findLineStart(segment.newContent, segment.after) : null) ??
          (segment.after ? (fallbackEditedContent ? findLineStart(fallbackEditedContent, segment.after) : null) : null)

    const newStart = afterLines.length === 0 ? 0 : resolvedNewStart ?? 0

    hunkHasReliableLineNumbers.push(
      (beforeLines.length === 0 || resolvedOldStart !== null) &&
      (afterLines.length === 0 || resolvedNewStart !== null),
    )

    lines.push(`@@ -${oldStart},${beforeLines.length} +${newStart},${afterLines.length} @@`)
    beforeLines.forEach((line) => lines.push(`-${line}`))
    afterLines.forEach((line) => lines.push(`+${line}`))
  }

  return {
    text: lines.join('\n'),
    hunkHasReliableLineNumbers,
  }
}
