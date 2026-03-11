import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Diff, Hunk, getChangeKey, parseDiff } from 'react-diff-view'
import { codeToTokens } from 'shiki'
import { useSessionsStore, type ToolCallBlock as ToolCallBlockType } from '../store/sessions'

type DiffHunk = {
  before: string
  after: string
}

type DiffSegment = {
  before: string
  after: string
  oldContent: string | null
  newContent: string | null
}

type DiffRow = {
  kind: 'removed' | 'added'
  text: string
  lineNumber: number
}

type ParsedDiffFile = ReturnType<typeof parseDiff>[number]
type ParsedChange = ParsedDiffFile['hunks'][number]['changes'][number]

type AskAboutSelectionPayload = {
  kind: 'diff' | 'code'
  path: string
  startLine: number
  endLine: number
  code: string
  prompt?: string
}

type SelectableLine = {
  key: string
  lineNumber: number
  text: string
  sign: '+' | '-'
}

type TimelineEntry = {
  id: string
  kind: 'file' | 'todo' | 'generic'
  label: string
  badge: string | null
  detail: string | null
  toolCalls: ToolCallBlockType[]
  added: number
  removed: number
  readLines: number
  status: 'running' | 'done' | 'error'
}

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
}

type SubagentSessionInfo = {
  lookupId: string
  outputFile: string
  agent: string | null
  description: string | null
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

function inferSubagentLookupId(outputFile: string, result: Record<string, unknown> | null, input: Record<string, unknown> | null): string {
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

function formatToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return String(input ?? '')
  const obj = input as Record<string, unknown>

  if (name === 'Bash') return String(obj.command ?? '')
  if (name === 'Read') return String(obj.file_path ?? '')
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') return String(obj.file_path ?? '')
  if (name === 'Glob') return String(obj.pattern ?? '')
  if (name === 'Grep') return String(obj.pattern ?? '') + (obj.path ? ` in ${obj.path}` : '')
  if (name === 'WebFetch') return String(obj.url ?? '')
  if (name === 'WebSearch') return String(obj.query ?? '')
  if (name === 'Task' || name === 'Agent') {
    const description = typeof obj.description === 'string' ? obj.description.trim() : ''
    if (description) return description
    const subagentType = typeof obj.subagent_type === 'string' ? obj.subagent_type.trim() : ''
    if (subagentType) return subagentType
  }
  return JSON.stringify(input, null, 2)
}

function getSubagentSessionInfo(toolCall: ToolCallBlockType): SubagentSessionInfo | null {
  if (toolCall.toolName !== 'Task' && toolCall.toolName !== 'Agent') return null

  const resultText = formatToolResult(toolCall.result)
  const result = isRecord(toolCall.result) ? toolCall.result : null
  const input = isRecord(toolCall.toolInput) ? toolCall.toolInput : null
  const outputFile = typeof result?.outputFile === 'string'
    ? result.outputFile.trim()
    : typeof result?.output_file === 'string'
      ? result.output_file.trim()
      : extractOutputFileFromText(resultText)
  if (!outputFile) return null

  return {
    lookupId: inferSubagentLookupId(outputFile, result, input),
    outputFile,
    agent: typeof result.agent === 'string'
      ? result.agent
      : typeof input?.subagent_type === 'string'
        ? input.subagent_type
        : null,
    description: typeof result.description === 'string'
      ? result.description
      : typeof input?.description === 'string'
        ? input.description
        : null,
  }
}

function getEditableToolPath(name: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit' || name === 'Read') {
    const filePath = obj.file_path
    return typeof filePath === 'string' && filePath.trim() ? filePath : null
  }
  return null
}

function getEditDiffHunks(name: string, input: unknown): DiffHunk[] {
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

function buildDiffSegments(toolCalls: ToolCallBlockType[], fallbackFileContent: string | null = null): DiffSegment[] {
  const segments: DiffSegment[] = []

  for (const toolCall of toolCalls) {
    const input = (toolCall.toolInput && typeof toolCall.toolInput === 'object')
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

function stripSystemTags(str: string): string {
  return str.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function formatToolResult(result: unknown): string {
  if (typeof result === 'string') return stripSystemTags(result)
  if (Array.isArray(result)) {
    return stripSystemTags(
      result
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r) => (r.type === 'text' ? String(r.text) : JSON.stringify(r)))
        .join('\n')
    )
  }
  return stripSystemTags(JSON.stringify(result ?? '', null, 2))
}

function countDisplayLines(content: string): number {
  if (!content) return 0
  return content.split('\n').length
}

function stripLineNumberPrefixes(content: string): { code: string; startLine: number } {
  if (!content) return { code: '', startLine: 1 }
  const lines = content.split('\n')
  const lineNumberPattern = /^\s*(\d+)(?:→|:\s)/

  const firstMatch = lines.find((line) => lineNumberPattern.test(line))
  if (!firstMatch) return { code: content, startLine: 1 }

  const matchedCount = lines.filter((line) => lineNumberPattern.test(line)).length
  if (matchedCount < lines.length * 0.5) return { code: content, startLine: 1 }

  const startLine = Number(firstMatch.match(lineNumberPattern)![1])
  const stripped = lines.map((line) => {
    const match = line.match(lineNumberPattern)
    return match ? line.slice(match[0].length) : line
  })
  return { code: stripped.join('\n'), startLine }
}

function getDiffStats(hunks: DiffHunk[]) {
  let added = 0
  let removed = 0

  for (const hunk of hunks) {
    added += hunk.after ? hunk.after.split('\n').filter(Boolean).length : 0
    removed += hunk.before ? hunk.before.split('\n').filter(Boolean).length : 0
  }

  return { added, removed }
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function splitDiffLines(content: string): string[] {
  if (!content) return []
  return normalizeNewlines(content).split('\n')
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

function buildDiffRows(hunk: DiffHunk, editedFileContent: string | null): DiffRow[] {
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

function renderCodeLines(content: string) {
  return <CodePreview code={content} />
}

function inferLanguageFromPath(path: string | null | undefined): string {
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

function getShikiTheme(): string {
  if (typeof document === 'undefined') return 'github-dark'
  const themeId = document.documentElement.dataset.theme ?? 'current'
  return ['paper', 'mist', 'stone'].includes(themeId) ? 'github-light' : 'github-dark'
}

function buildUnifiedDiffText(path: string, diffHunks: DiffHunk[], editedFileContent: string | null) {
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

function buildUnifiedDiffTextFromSegments(path: string, segments: DiffSegment[], fallbackEditedContent: string | null) {
  const lines = [`--- a/${path}`, `+++ b/${path}`]
  const hunkHasReliableLineNumbers: boolean[] = []

  for (const segment of segments) {
    const beforeLines = splitDiffLines(segment.before)
    const afterLines = splitDiffLines(segment.after)

    const resolvedOldStart =
      beforeLines.length === 0
        ? null
        : (segment.oldContent ? findLineStart(segment.oldContent, segment.before) : null)

    const oldStart =
      beforeLines.length === 0
        ? 0
        : resolvedOldStart ?? 0

    const resolvedNewStart =
      afterLines.length === 0
        ? null
        : (segment.newContent && segment.after ? findLineStart(segment.newContent, segment.after) : null) ??
          (segment.after ? (fallbackEditedContent ? findLineStart(fallbackEditedContent, segment.after) : null) : null)
    const newStart =
      afterLines.length === 0
        ? 0
        : resolvedNewStart ?? 0

    hunkHasReliableLineNumbers.push(
      (beforeLines.length === 0 || resolvedOldStart !== null) &&
      (afterLines.length === 0 || resolvedNewStart !== null)
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

function trimParsedDiffFile(file: ParsedDiffFile, limit: number): ParsedDiffFile {
  let remaining = limit
  const hunks = []

  for (const hunk of file.hunks) {
    if (remaining <= 0) break
    const changes = hunk.changes.slice(0, remaining)
    if (changes.length === 0) continue

    let oldLines = 0
    let newLines = 0
    for (const change of changes) {
      if (change.type === 'delete') oldLines += 1
      else if (change.type === 'insert') newLines += 1
      else {
        oldLines += 1
        newLines += 1
      }
    }

    hunks.push({
      ...hunk,
      changes,
      oldLines,
      newLines,
    })
    remaining -= changes.length
  }

  return { ...file, hunks }
}

function buildSelectedRange<T extends { key: string }>(all: T[], anchorKey: string, activeKey: string): string[] {
  const anchorIndex = all.findIndex((item) => item.key === anchorKey)
  const activeIndex = all.findIndex((item) => item.key === activeKey)
  if (anchorIndex < 0 || activeIndex < 0) return activeKey ? [activeKey] : []
  const start = Math.min(anchorIndex, activeIndex)
  const end = Math.max(anchorIndex, activeIndex)
  return all.slice(start, end + 1).map((item) => item.key)
}

function summarizeLineRange(startLine: number, endLine: number) {
  return startLine === endLine ? `줄 ${startLine}` : `줄 ${startLine}-${endLine}`
}

function buildDiffSelectionLines(file: ParsedDiffFile | null): SelectableLine[] {
  if (!file) return []

  return file.hunks.flatMap((hunk) =>
    hunk.changes
      .filter((change) => change.type === 'insert' || change.type === 'delete')
      .map((change) => ({
        key: getChangeKey(change),
        lineNumber: change.lineNumber,
        text: change.content,
        sign: change.type === 'insert' ? '+' : '-',
      }))
  )
}

function buildSelectionPayload(kind: 'diff' | 'code', path: string, lines: Array<{ lineNumber: number; text: string; sign?: '+' | '-' }>): AskAboutSelectionPayload | null {
  if (lines.length === 0) return null
  const startLine = Math.min(...lines.map((line) => line.lineNumber))
  const endLine = Math.max(...lines.map((line) => line.lineNumber))
  const code = lines.map((line) => (kind === 'diff' ? `${line.sign ?? ' '} ${line.text}` : line.text)).join('\n')
  return { kind, path, startLine, endLine, code }
}

function SelectionActionBar({
  label,
  onAskAgain,
  onOpenComment,
  commentOpen,
  commentValue,
  onCommentChange,
  onSubmitComment,
  onCancelComment,
}: {
  label: string
  onAskAgain: () => void
  onOpenComment: () => void
  commentOpen: boolean
  commentValue: string
  onCommentChange: (value: string) => void
  onSubmitComment: () => void
  onCancelComment: () => void
}) {
  return (
    <div className="mt-2 rounded-lg border border-claude-border/70 bg-claude-panel px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-claude-muted">{label}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenComment}
            className="inline-flex items-center gap-1 rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
          >
            코멘트 입력
          </button>
          <button
            type="button"
            onClick={onAskAgain}
            className="inline-flex items-center gap-1 rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
          >
            이 줄들로 다시 질문
          </button>
        </div>
      </div>

      {commentOpen && (
        <div className="mt-2 flex items-end gap-2">
          <textarea
            value={commentValue}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="선택한 줄에 대해 질문이나 코멘트를 입력하세요"
            rows={2}
            autoFocus
            className="min-h-[56px] flex-1 resize-none rounded-md border border-claude-border bg-claude-surface px-3 py-2 text-[12px] leading-5 text-claude-text outline-none placeholder:text-claude-muted focus-visible:ring-1 focus-visible:ring-white/10"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onCancelComment}
              className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onSubmitComment}
              disabled={!commentValue.trim()}
              className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 disabled:opacity-40"
            >
              입력창에 추가
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DiffPreview({
  path,
  diffSegments,
  diffHunks,
  editedFileContent,
  showFullDiff,
  onShowFullDiff,
  onAskAboutSelection,
}: {
  path: string
  diffSegments: DiffSegment[]
  diffHunks: DiffHunk[]
  editedFileContent: string | null
  showFullDiff: boolean
  onShowFullDiff?: () => void
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  const [anchorKey, setAnchorKey] = useState<string | null>(null)
  const [selectedChangeKeys, setSelectedChangeKeys] = useState<string[]>([])
  const [hoveredChangeKey, setHoveredChangeKey] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentValue, setCommentValue] = useState('')
  const parsed = useMemo(() => {
    const diffBuild = diffSegments.length > 0
      ? buildUnifiedDiffTextFromSegments(path, diffSegments, editedFileContent)
      : buildUnifiedDiffText(path, diffHunks, editedFileContent)
    const file = parseDiff(diffBuild.text)[0] ?? null
    return {
      file,
      hunkHasReliableLineNumbers: diffBuild.hunkHasReliableLineNumbers,
    }
  }, [path, diffSegments, diffHunks, editedFileContent])

  const parsedFile = parsed.file
  const selectableLines = useMemo(() => buildDiffSelectionLines(parsedFile), [parsedFile])
  const selectedLines = useMemo(() => {
    const selected = new Set(selectedChangeKeys)
    return selectableLines.filter((line) => selected.has(line.key))
  }, [selectableLines, selectedChangeKeys])
  const allRows = useMemo(() => diffHunks.flatMap((hunk) => buildDiffRows(hunk, editedFileContent)), [diffHunks, editedFileContent])
  const previewLimit = 24
  const hiddenCount = Math.max(0, allRows.length - previewLimit)
  const visibleFile = useMemo(() => {
    if (!parsedFile) return null
    return showFullDiff ? parsedFile : trimParsedDiffFile(parsedFile, previewLimit)
  }, [parsedFile, showFullDiff])
  const visibleHunkReliability = useMemo(() => {
    if (!visibleFile) return []
    return parsed.hunkHasReliableLineNumbers.slice(0, visibleFile.hunks.length)
  }, [parsed.hunkHasReliableLineNumbers, visibleFile])
  const reliableChangeKeys = useMemo(() => {
    const keys = new Set<string>()
    if (!visibleFile) return keys
    visibleFile.hunks.forEach((hunk, index) => {
      if (!visibleHunkReliability[index]) return
      hunk.changes.forEach((change) => {
        if (change.type === 'insert' || change.type === 'delete') {
          keys.add(getChangeKey(change))
        }
      })
    })
    return keys
  }, [visibleFile, visibleHunkReliability])
  const visibleSelectableLines = useMemo(() => buildDiffSelectionLines(visibleFile), [visibleFile])

  useEffect(() => {
    if (!isDragging) return
    const stopDragging = () => setIsDragging(false)
    window.addEventListener('mouseup', stopDragging)
    window.addEventListener('blur', stopDragging)
    return () => {
      window.removeEventListener('mouseup', stopDragging)
      window.removeEventListener('blur', stopDragging)
    }
  }, [isDragging])

  useEffect(() => {
    if (selectedChangeKeys.length === 0) {
      setCommentOpen(false)
      setCommentValue('')
    }
  }, [selectedChangeKeys])

  if (!visibleFile) return null

  const selectSingleChange = (changeKey: string) => {
    setAnchorKey(changeKey)
    setSelectedChangeKeys([changeKey])
  }

  const handleChangeMouseDown = ({ change }: { change: ParsedChange | null }, event: ReactMouseEvent<HTMLElement>) => {
    if (!change || (change.type !== 'insert' && change.type !== 'delete')) return

    event.preventDefault()
    const nextKey = getChangeKey(change)
    if (!event.shiftKey || !anchorKey) {
      if (selectedChangeKeys.length === 1 && selectedChangeKeys[0] === nextKey) {
        setSelectedChangeKeys([])
        setAnchorKey(null)
        return
      }
      selectSingleChange(nextKey)
      setCommentOpen(false)
      setIsDragging(true)
      return
    }

    setSelectedChangeKeys(buildSelectedRange(visibleSelectableLines, anchorKey, nextKey))
    setCommentOpen(false)
    setIsDragging(true)
  }

  const handleChangeMouseEnter = ({ change }: { change: ParsedChange | null }) => {
    if (!change || (change.type !== 'insert' && change.type !== 'delete')) return
    const nextKey = getChangeKey(change)
    setHoveredChangeKey(nextKey)
    if (!isDragging || !anchorKey) return
    setSelectedChangeKeys(buildSelectedRange(visibleSelectableLines, anchorKey, nextKey))
  }

  const handleChangeMouseLeave = () => {
    if (!isDragging) setHoveredChangeKey(null)
  }

  const openCommentForChange = (change: ParsedChange) => {
    const nextKey = getChangeKey(change)
    selectSingleChange(nextKey)
    setCommentOpen(true)
  }

  const handleSubmitComment = () => {
    if (!selectedPayload || !onAskAboutSelection || !commentValue.trim()) return
    onAskAboutSelection({ ...selectedPayload, prompt: commentValue.trim() })
    setCommentOpen(false)
    setCommentValue('')
  }

  const selectedPayload = buildSelectionPayload('diff', path, selectedLines)

  return (
    <div className="overflow-hidden rounded-lg border border-claude-border/70 bg-claude-bg">
      <div className="tool-diff-shell">
        <Diff
          viewType="unified"
          diffType={visibleFile.type}
          hunks={visibleFile.hunks}
          className="tool-diff-view"
          selectedChanges={selectedChangeKeys}
          generateLineClassName={({ changes, defaultGenerate }) => {
            const classNames = [defaultGenerate()]
            if (changes.some((change) => selectedChangeKeys.includes(getChangeKey(change)))) {
              classNames.push('tool-diff-line-selected')
            }
            return classNames.join(' ')
          }}
          renderGutter={({ change, renderDefault, side }) => {
            if (!change || (change.type !== 'insert' && change.type !== 'delete')) return renderDefault()
            const changeKey = getChangeKey(change)
            const shouldRenderAction =
              (change.type === 'insert' && side === 'new') || (change.type === 'delete' && side === 'old')
            const shouldRenderLineNumber =
              (change.type === 'insert' && side === 'new') || (change.type === 'delete' && side === 'old')
            const lineNumber =
              shouldRenderLineNumber &&
              reliableChangeKeys.has(changeKey) &&
              typeof change.lineNumber === 'number' &&
              change.lineNumber > 0
                ? change.lineNumber
                : null
            return (
              <div className="tool-diff-gutter-wrap">
                {lineNumber ? (
                  <span className="tool-diff-gutter-number">{lineNumber}</span>
                ) : (
                  <span className="tool-diff-gutter-number-hidden" />
                )}
                {shouldRenderAction && onAskAboutSelection ? (
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      openCommentForChange(change)
                    }}
                    className={`tool-line-action-button ${change.type === 'delete' ? 'tool-line-action-button-old' : ''} ${
                      hoveredChangeKey === changeKey && !selectedChangeKeys.includes(changeKey)
                        ? 'tool-line-action-button-visible'
                        : ''
                    }`}
                  >
                    +
                  </button>
                ) : null}
              </div>
            )
          }}
          gutterEvents={{ onMouseDown: handleChangeMouseDown, onMouseEnter: handleChangeMouseEnter, onMouseLeave: handleChangeMouseLeave }}
        >
          {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
        </Diff>
      </div>
      {hiddenCount > 0 && !showFullDiff && (
        <button
          type="button"
          onClick={onShowFullDiff}
          className="block w-full border-t border-claude-border/70 px-3 py-2 text-center text-[11px] text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
        >
          Show full diff ({hiddenCount} more lines)
        </button>
      )}
      {selectedPayload && onAskAboutSelection && (
        <SelectionActionBar
          label={summarizeLineRange(selectedPayload.startLine, selectedPayload.endLine)}
          onAskAgain={() => onAskAboutSelection(selectedPayload)}
          onOpenComment={() => setCommentOpen(true)}
          commentOpen={commentOpen}
          commentValue={commentValue}
          onCommentChange={setCommentValue}
          onSubmitComment={handleSubmitComment}
          onCancelComment={() => {
            setCommentOpen(false)
            setCommentValue('')
          }}
        />
      )}
    </div>
  )
}

function CodePreview({
  code,
  path,
  startLine = 1,
  onAskAboutSelection,
}: {
  code: string
  path?: string | null
  startLine?: number
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  const [highlightReady, setHighlightReady] = useState(false)
  const [tokenLines, setTokenLines] = useState<Array<Array<{ content: string; color?: string; fontStyle?: number }>>>([])
  const [anchorLine, setAnchorLine] = useState<number | null>(null)
  const [selectedLines, setSelectedLines] = useState<number[]>([])
  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentValue, setCommentValue] = useState('')

  useEffect(() => {
    let cancelled = false
    const language = inferLanguageFromPath(path) as Parameters<typeof codeToTokens>[1]['lang']
    const theme = getShikiTheme()

    codeToTokens(code, {
      lang: language,
      theme,
    })
      .then((result) => {
        if (!cancelled) {
          setTokenLines(result.tokens as Array<Array<{ content: string; color?: string; fontStyle?: number }>>)
          setHighlightReady(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTokenLines([])
          setHighlightReady(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [code, path])

  useEffect(() => {
    if (!isDragging) return
    const stopDragging = () => setIsDragging(false)
    window.addEventListener('mouseup', stopDragging)
    window.addEventListener('blur', stopDragging)
    return () => {
      window.removeEventListener('mouseup', stopDragging)
      window.removeEventListener('blur', stopDragging)
    }
  }, [isDragging])

  useEffect(() => {
    if (selectedLines.length === 0) {
      setCommentOpen(false)
      setCommentValue('')
    }
  }, [selectedLines])

  const selectSingleLine = (lineNumber: number) => {
    setAnchorLine(lineNumber)
    setSelectedLines([lineNumber])
  }

  const handleLineMouseDown = (lineNumber: number, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    if (!event.shiftKey || anchorLine === null) {
      if (selectedLines.length === 1 && selectedLines[0] === lineNumber) {
        setSelectedLines([])
        setAnchorLine(null)
        return
      }

      selectSingleLine(lineNumber)
      setCommentOpen(false)
      setIsDragging(true)
      return
    }

    const start = Math.min(anchorLine, lineNumber)
    const end = Math.max(anchorLine, lineNumber)
    setSelectedLines(Array.from({ length: end - start + 1 }, (_, index) => start + index))
    setCommentOpen(false)
    setIsDragging(true)
  }

  const handleLineMouseEnter = (lineNumber: number) => {
    setHoveredLine(lineNumber)
    if (!isDragging || anchorLine === null) return
    const start = Math.min(anchorLine, lineNumber)
    const end = Math.max(anchorLine, lineNumber)
    setSelectedLines(Array.from({ length: end - start + 1 }, (_, index) => start + index))
  }

  const handleLineMouseLeave = () => {
    if (!isDragging) setHoveredLine(null)
  }

  const openCommentForLine = (lineNumber: number) => {
    selectSingleLine(lineNumber)
    setCommentOpen(true)
  }

  const handleSubmitComment = () => {
    if (!selectedPayload || !onAskAboutSelection || !commentValue.trim()) return
    onAskAboutSelection({ ...selectedPayload, prompt: commentValue.trim() })
    setCommentOpen(false)
    setCommentValue('')
  }

  const codeLines = useMemo(() => code.split('\n'), [code])
  const selectedCodeLines = [...selectedLines]
    .sort((a, b) => a - b)
    .map((lineNumber) => ({
      lineNumber,
      text: codeLines[lineNumber - startLine] ?? '',
    }))
  const selectedPayload = path ? buildSelectionPayload('code', path, selectedCodeLines) : null

  if (!highlightReady) {
    return (
      <div className="overflow-x-auto rounded-lg border border-claude-border/70 bg-claude-bg px-3 py-2 font-mono text-[11px] leading-5 text-claude-text">
        <pre className="whitespace-pre-wrap break-all">{code}</pre>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-claude-border/70 bg-claude-bg">
      <div className="tool-code-review overflow-x-auto">
        <div className="tool-code-review-table">
          {tokenLines.map((line, index) => {
            const lineNumber = index + startLine
            const isSelected = selectedLines.includes(lineNumber)
            return (
              <div
                key={lineNumber}
                className={`tool-code-review-row ${isSelected ? 'tool-code-review-row-selected' : ''}`}
              >
                <span
                  className="tool-code-review-gutter"
                  onMouseDown={(event) => handleLineMouseDown(lineNumber, event)}
                  onMouseEnter={() => handleLineMouseEnter(lineNumber)}
                  onMouseLeave={handleLineMouseLeave}
                >
                  <span>{lineNumber}</span>
                  {onAskAboutSelection ? (
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        openCommentForLine(lineNumber)
                      }}
                      className={`tool-line-action-button ${
                        hoveredLine === lineNumber && !isSelected ? 'tool-line-action-button-visible' : ''
                      }`}
                    >
                      +
                    </button>
                  ) : null}
                </span>
                <span className="tool-code-review-content">
                  {line.length > 0 ? line.map((token, tokenIndex) => (
                    <span
                      key={`${lineNumber}-${tokenIndex}`}
                      style={{
                        color: token.color,
                        fontStyle: token.fontStyle === 1 ? 'italic' : 'normal',
                        fontWeight: token.fontStyle === 2 ? 600 : undefined,
                      }}
                    >
                      {token.content}
                    </span>
                  )) : ' '}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {selectedPayload && onAskAboutSelection && (
        <SelectionActionBar
          label={summarizeLineRange(selectedPayload.startLine, selectedPayload.endLine)}
          onAskAgain={() => onAskAboutSelection(selectedPayload)}
          onOpenComment={() => setCommentOpen(true)}
          commentOpen={commentOpen}
          commentValue={commentValue}
          onCommentChange={setCommentValue}
          onSubmitComment={handleSubmitComment}
          onCancelComment={() => {
            setCommentOpen(false)
            setCommentValue('')
          }}
        />
      )}
    </div>
  )
}

function buildSummary(entries: TimelineEntry[]) {
  const parts: string[] = []
  const fileEdits = entries.filter((entry) => entry.kind === 'file' && (entry.added > 0 || entry.removed > 0)).length
  const todos = entries.filter((entry) => entry.kind === 'todo').length
  const reads = entries.filter((entry) => entry.label === 'Read').length

  if (fileEdits > 0) parts.push(`${fileEdits}개 파일 수정됨`)
  if (todos > 0) parts.push('할 일 목록 업데이트됨')
  if (reads > 0) parts.push('파일 읽음')

  return parts.length > 0 ? parts.join(', ') : `${entries.length}개 작업`
}

function buildTimelineEntries(toolCalls: ToolCallBlockType[]): TimelineEntry[] {
  const grouped = new Map<string, TimelineEntry>()

  for (const toolCall of toolCalls) {
    const badge = formatToolInput(toolCall.toolName, toolCall.toolInput)
    const path = getEditableToolPath(toolCall.toolName, toolCall.toolInput)
    const diffStats = getDiffStats(getEditDiffHunks(toolCall.toolName, toolCall.toolInput))
    const resultStr = formatToolResult(toolCall.result)
    const actionLabel = ACTION_LABELS[toolCall.toolName] ?? toolCall.toolName
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
        detail: toolCall.toolName === 'Read' ? `${countDisplayLines(resultStr)}줄 읽음` : null,
        toolCalls: [toolCall],
        added: diffStats.added,
        removed: diffStats.removed,
        readLines: toolCall.toolName === 'Read' ? countDisplayLines(resultStr) : 0,
        status: toolCall.status,
      })
      continue
    }

    const existing = grouped.get(key)!
    existing.toolCalls.push(toolCall)
    existing.added += diffStats.added
    existing.removed += diffStats.removed
    existing.readLines += toolCall.toolName === 'Read' ? countDisplayLines(resultStr) : 0
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

function TodoPreview({ toolCalls }: { toolCalls: ToolCallBlockType[] }) {
  const resultStr = formatToolResult(toolCalls[toolCalls.length - 1]?.result)
  const lines = resultStr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="space-y-1 text-[14px] leading-5 text-claude-muted">
      {lines.map((line, index) => {
        const done = /^[-*]?\s*\[[xX]\]/.test(line)
        const normalized = line.replace(/^[-*]?\s*\[[ xX]\]\s*/, '')
        return (
          <div key={`${index}-${line}`} className="flex items-start gap-2">
            <span className="mt-[2px] text-[10px] text-claude-muted/80">{done ? '☑' : '☐'}</span>
            <span className={`truncate ${done ? 'opacity-55 line-through' : ''}`}>{normalized}</span>
          </div>
        )
      })}
    </div>
  )
}

function TimelineEntryRow({
  entry,
  onAskAboutSelection,
}: {
  entry: TimelineEntry
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showFullDiff, setShowFullDiff] = useState(false)
  const [editedFileContent, setEditedFileContent] = useState<string | null>(null)
  const [loadingEditedFile, setLoadingEditedFile] = useState(false)
  const [openingSubagentSession, setOpeningSubagentSession] = useState(false)
  const [subagentSessionError, setSubagentSessionError] = useState<string | null>(null)
  const importSession = useSessionsStore((state) => state.importSession)
  const setActiveSession = useSessionsStore((state) => state.setActiveSession)

  const primaryTool = entry.toolCalls[entry.toolCalls.length - 1]
  const primaryPath = getEditableToolPath(primaryTool.toolName, primaryTool.toolInput)
  const subagentSessionInfo = useMemo(() => getSubagentSessionInfo(primaryTool), [primaryTool])
  const diffHunks = useMemo(
    () => entry.toolCalls.flatMap((toolCall) => getEditDiffHunks(toolCall.toolName, toolCall.toolInput)),
    [entry.toolCalls]
  )
  const resultStr = useMemo(() => formatToolResult(primaryTool.result), [primaryTool.result])
  const showCodePreview = entry.label === 'Read' && resultStr.trim().length > 0
  const diffSegments = useMemo(
    () => buildDiffSegments(entry.toolCalls, editedFileContent),
    [entry.toolCalls, editedFileContent]
  )
  const diffRows = useMemo(
    () => diffHunks.flatMap((hunk) => buildDiffRows(hunk, editedFileContent)),
    [diffHunks, editedFileContent]
  )

  useEffect(() => {
    if (!expanded || !primaryPath) return
    let cancelled = false
    setLoadingEditedFile(true)

    window.claude.readFile(primaryPath)
      .then((file) => {
        if (!cancelled) setEditedFileContent(file?.content ?? null)
      })
      .catch(() => {
        if (!cancelled) setEditedFileContent(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingEditedFile(false)
      })

    return () => {
      cancelled = true
    }
  }, [expanded, primaryPath])

  const handleOpenSubagentSession = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (!subagentSessionInfo || openingSubagentSession) return

    const existingSession = useSessionsStore.getState().sessions.find(
      (session) => session.sessionId === subagentSessionInfo.lookupId
    )
    if (existingSession) {
      setActiveSession(existingSession.id)
      return
    }

    setOpeningSubagentSession(true)
    setSubagentSessionError(null)

    try {
      const session = await window.claude.loadCliSession({ filePath: subagentSessionInfo.outputFile })
      if (!session) {
        setSubagentSessionError('서브에이전트 transcript를 아직 불러올 수 없습니다.')
        return
      }

      importSession({
        ...session,
        sessionId: session.sessionId ?? subagentSessionInfo.lookupId,
        name: subagentSessionInfo.description?.trim()
          ? `${session.name} · ${subagentSessionInfo.description.trim()}`
          : session.name,
      })
    } catch {
      setSubagentSessionError('서브에이전트 세션을 여는 중 오류가 발생했습니다.')
    } finally {
      setOpeningSubagentSession(false)
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-1.5 text-[14px] leading-5 text-claude-muted">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-[1px] flex h-4 w-4 items-center justify-center text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
        >
          <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : 'rotate-0'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[14px] text-claude-muted/95">{entry.label}</span>
            {entry.badge && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="inline-flex max-w-[min(38rem,62vw)] items-center gap-1 truncate rounded-md bg-black/20 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-claude-text/90 outline-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
              >
                <span className="truncate">{entry.badge}</span>
              </button>
            )}
            {(entry.added > 0 || entry.removed > 0) && (
              <span className="shrink-0 font-mono text-[10px]">
                {entry.added > 0 && <span className="text-emerald-400">+{entry.added}</span>}
                {entry.removed > 0 && <span className="ml-1 text-red-400">-{entry.removed}</span>}
              </span>
            )}
          </div>

          {entry.detail && (
            <div className="mt-0.5 text-[10px] text-claude-muted/80">{entry.detail}</div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="ml-[10px] border-l border-claude-border/70 pl-3">
          {entry.kind === 'todo' ? (
            <TodoPreview toolCalls={entry.toolCalls} />
          ) : subagentSessionInfo ? (
            <div className="space-y-1 rounded-lg border border-claude-border/70 bg-claude-bg px-3 py-2">
              <div className="text-[11px] font-medium text-claude-text/80">서브에이전트 세션</div>
              {subagentSessionInfo.description && (
                <div className="text-[11px] text-claude-muted/80">{subagentSessionInfo.description}</div>
              )}
              <div className="font-mono text-[10px] text-claude-muted/80 break-all">{subagentSessionInfo.outputFile}</div>
              {subagentSessionError ? (
                <div className="text-[11px] text-amber-200">{subagentSessionError}</div>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenSubagentSession}
                  disabled={openingSubagentSession}
                  className="mt-1 rounded bg-claude-border/50 px-2 py-0.5 text-[11px] text-claude-text/80 transition-colors hover:bg-claude-border disabled:opacity-50"
                >
                  세션 열기
                </button>
              )}
            </div>
          ) : entry.status === 'error' ? (
            <pre className="tool-error-block overflow-x-auto whitespace-pre-wrap break-all rounded-lg px-3 py-2 font-mono text-[11px] leading-5">
              {resultStr}
            </pre>
          ) : diffHunks.length > 0 ? (
            <div className="space-y-1">
              <DiffPreview
                path={primaryPath ?? entry.badge ?? 'diff.txt'}
                diffSegments={diffSegments}
                diffHunks={diffHunks}
                editedFileContent={editedFileContent}
                showFullDiff={showFullDiff}
                onShowFullDiff={() => setShowFullDiff(true)}
                onAskAboutSelection={onAskAboutSelection}
              />
            </div>
          ) : loadingEditedFile ? (
            <div className="text-[11px] text-claude-muted">파일 내용을 불러오는 중...</div>
          ) : showCodePreview ? (
            <div className="space-y-1">
              {(() => {
                const parsed = stripLineNumberPrefixes(resultStr)
                return (
                  <CodePreview
                    code={parsed.code}
                    path={primaryPath}
                    startLine={parsed.startLine}
                    onAskAboutSelection={onAskAboutSelection}
                  />
                )
              })()}
            </div>
          ) : editedFileContent ? (
            <CodePreview code={editedFileContent} path={primaryPath} onAskAboutSelection={onAskAboutSelection} />
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-claude-border/70 bg-claude-bg px-3 py-2 font-mono text-[11px] leading-5 text-claude-text">
              {resultStr}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function ToolTimeline({
  toolCalls,
  onAskAboutSelection,
}: {
  toolCalls: ToolCallBlockType[]
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const entries = useMemo(() => buildTimelineEntries(toolCalls), [toolCalls])
  const visibleEntries = showAll ? entries : entries.slice(0, 3)
  const hiddenCount = Math.max(0, entries.length - visibleEntries.length)

  if (entries.length === 0) return null

  return (
    <div className="mb-0.5 space-y-0.5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-1.5 text-left text-[12px] leading-5 text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
      >
        <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : 'rotate-0'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
        <span>{buildSummary(entries)}</span>
      </button>

      {expanded && (
        <div className="space-y-1">
          {visibleEntries.map((entry) => (
            <TimelineEntryRow key={entry.id} entry={entry} onAskAboutSelection={onAskAboutSelection} />
          ))}
          {hiddenCount > 0 && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="ml-5 text-[14px] text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
            >
              {hiddenCount}개 더 보기
            </button>
          )}
          {showAll && entries.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="ml-5 text-[14px] text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
            >
              간단히 보기
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function ToolCallBlock({
  toolCall,
  onAskAboutSelection,
}: {
  toolCall: ToolCallBlockType
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  return <ToolTimeline toolCalls={[toolCall]} onAskAboutSelection={onAskAboutSelection} />
}
