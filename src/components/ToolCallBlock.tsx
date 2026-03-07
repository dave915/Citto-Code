import { useEffect, useMemo, useState } from 'react'
import type { ToolCallBlock as ToolCallBlockType } from '../store/sessions'

const TOOL_LABELS: Record<string, string> = {
  Bash: '터미널 실행',
  Read: '파일 읽기',
  Write: '파일 쓰기',
  Edit: '파일 편집',
  Glob: '파일 검색',
  Grep: '내용 검색',
  TodoWrite: '할 일 목록',
  WebFetch: '웹 페이지 조회',
  WebSearch: '웹 검색',
  Task: '서브 작업',
  MultiEdit: '다중 파일 편집',
}

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name
}

function getToolIcon(name: string) {
  const baseClass = 'h-4 w-4'

  switch (name) {
    case 'Bash':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8l4 4-4 4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h4" />
        </svg>
      )
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4.5h7l3 3V19a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 016 19V6A1.5 1.5 0 017.5 4.5z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 4.5V8h3.5" />
        </svg>
      )
    case 'Glob':
    case 'Grep':
    case 'WebSearch':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 20l-4.2-4.2" />
        </svg>
      )
    case 'TodoWrite':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l2 2 4-4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 5.5h11A1.5 1.5 0 0119 7v10a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 17V7a1.5 1.5 0 011.5-1.5z" />
        </svg>
      )
    case 'WebFetch':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M12 4a13 13 0 010 16M12 4a13 13 0 000 16" />
        </svg>
      )
    case 'Task':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h6M9 14h4" />
        </svg>
      )
    default:
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6h4l1 2h3v4l-2 1 1 3-3 2-2-1-2 1-3-2 1-3-2-1V8h3l1-2z" />
        </svg>
      )
  }
}

function formatToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return String(input ?? '')
  const obj = input as Record<string, unknown>

  if (name === 'Bash') return String(obj.command ?? '')
  if (name === 'Read') return String(obj.file_path ?? '')
  if (name === 'Write' || name === 'Edit') return String(obj.file_path ?? '')
  if (name === 'Glob') return String(obj.pattern ?? '')
  if (name === 'Grep') return String(obj.pattern ?? '') + (obj.path ? ` in ${obj.path}` : '')
  if (name === 'WebFetch') return String(obj.url ?? '')
  if (name === 'WebSearch') return String(obj.query ?? '')

  return JSON.stringify(input, null, 2)
}

function getEditableToolPath(name: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>

  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') {
    const filePath = obj.file_path
    return typeof filePath === 'string' && filePath.trim() ? filePath : null
  }

  return null
}

type DiffHunk = {
  before: string
  after: string
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

  return []
}

function formatToolResult(result: unknown): string {
  if (typeof result === 'string') {
    return result.length > 500 ? result.slice(0, 500) + '...' : result
  }
  if (Array.isArray(result)) {
    const texts = result
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .map((r) => (r.type === 'text' ? String(r.text) : JSON.stringify(r)))
    const joined = texts.join('\n')
    return joined.length > 500 ? joined.slice(0, 500) + '...' : joined
  }
  return JSON.stringify(result, null, 2)
}

function renderCodeLines(content: string) {
  const lines = content.split('\n')
  const normalizedLines = lines.map((line) => line.replace(/^\s*\d+→\s?/, ''))
  return (
    <div className="overflow-x-auto rounded-xl border border-claude-border/70 bg-[#23252a]">
      <div className="border-b border-claude-border/70 bg-[#1d1f23] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-claude-muted/80">
        code
      </div>
      <div className="py-2 font-mono text-[13px] leading-7 text-[#ddd6cf]">
        {normalizedLines.map((line, index) => (
          <div key={`${index}-${line}`} className="grid grid-cols-[56px_minmax(0,1fr)]">
            <div className="select-none px-3 text-right text-[#7f817f]">
              {index + 1}
            </div>
            <div className="whitespace-pre-wrap break-all pr-4">
              {line || ' '}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderDiffBlock(hunk: DiffHunk, index: number) {
  const beforeLines = hunk.before.split('\n')
  const afterLines = hunk.after.split('\n')
  const maxLines = Math.max(beforeLines.length, afterLines.length, 1)

  return (
    <div key={`${index}-${hunk.before.length}-${hunk.after.length}`} className="overflow-x-auto rounded-xl border border-claude-border/70 bg-[#23252a]">
      <div className="border-b border-claude-border/70 bg-[#1d1f23] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-claude-muted/80">
        diff {index + 1}
      </div>
      <div className="py-2 font-mono text-[13px] leading-7">
        {Array.from({ length: maxLines }).map((_, lineIndex) => {
          const before = beforeLines[lineIndex] ?? ''
          const after = afterLines[lineIndex] ?? ''
          return (
            <div key={lineIndex} className="grid grid-cols-[56px_1fr_1fr]">
              <div className="select-none px-3 text-right text-[#7f817f]">
                {lineIndex + 1}
              </div>
              <div className="whitespace-pre-wrap break-all border-r border-claude-border/40 bg-[#402b2b] px-4 text-[#f0c8c8]">
                {before ? `- ${before}` : ' '}
              </div>
              <div className="whitespace-pre-wrap break-all px-4 text-[#cde7cf] bg-[#23382a]">
                {after ? `+ ${after}` : ' '}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Props = {
  toolCall: ToolCallBlockType
}

export function ToolCallBlock({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editedFileContent, setEditedFileContent] = useState<string | null>(null)
  const [loadingEditedFile, setLoadingEditedFile] = useState(false)
  const inputStr = formatToolInput(toolCall.toolName, toolCall.toolInput)
  const resultStr = toolCall.result ? formatToolResult(toolCall.result) : null
  const editableFilePath = useMemo(
    () => getEditableToolPath(toolCall.toolName, toolCall.toolInput),
    [toolCall.toolInput, toolCall.toolName]
  )
  const diffHunks = useMemo(
    () => getEditDiffHunks(toolCall.toolName, toolCall.toolInput),
    [toolCall.toolInput, toolCall.toolName]
  )

  const isRunning = toolCall.status === 'running'
  const isError = toolCall.status === 'error'
  const shouldShowEditedFile = Boolean(editableFilePath) && !isRunning && !isError

  useEffect(() => {
    if (!expanded || !shouldShowEditedFile || !editableFilePath) return
    let cancelled = false
    setLoadingEditedFile(true)

    window.claude.readFile(editableFilePath)
      .then((file) => {
        if (cancelled) return
        setEditedFileContent(file?.content ?? null)
      })
      .catch(() => {
        if (cancelled) return
        setEditedFileContent(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingEditedFile(false)
      })

    return () => {
      cancelled = true
    }
  }, [editableFilePath, expanded, shouldShowEditedFile])

  return (
    <div className={`tool-call overflow-hidden rounded-[20px] border text-sm ${
      isError ? 'border-red-900/60 bg-red-950/20' : 'border-claude-border bg-[#303034]'
    }`}>
      <button
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
          isError ? 'hover:bg-red-950/30' : 'hover:bg-[#36363a]'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border ${
          isError
            ? 'border-red-900/60 bg-red-950/25 text-red-200'
            : 'border-claude-border bg-[#38383d] text-claude-muted'
        }`}>
          {getToolIcon(toolCall.toolName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-claude-text">
            {getToolLabel(toolCall.toolName)}
          </div>
          {inputStr && (
            <div className="mt-0.5 truncate font-mono text-xs text-claude-muted">
              {inputStr}
            </div>
          )}
        </div>
        {isRunning && (
          <span className="flex items-center gap-1 text-xs text-claude-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-claude-muted animate-pulse" />
            실행 중
          </span>
        )}
        {!isRunning && (
          <svg
            className={`h-4 w-4 flex-shrink-0 text-claude-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {expanded && (
        <div className="border-t border-claude-border/70">
          <div className="px-4 py-3">
            {inputStr && (
              <div className="mb-3">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-claude-muted/80">입력</div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-claude-border/70 bg-[#2a2a2d] px-3 py-2 font-mono text-xs text-[#d7d1ca]">
                  {inputStr}
                </pre>
              </div>
            )}
            {diffHunks.length > 0 && (
              <div className="mb-3 space-y-2">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-claude-muted/80">변경 diff</div>
                {diffHunks.map((hunk, index) => renderDiffBlock(hunk, index))}
              </div>
            )}
            {(resultStr || shouldShowEditedFile) && diffHunks.length === 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-claude-muted/80">
                  {shouldShowEditedFile ? '변경 후 내용' : '결과'}
                </div>
                {isError ? (
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-red-900/60 bg-red-950/25 px-3 py-2 font-mono text-xs text-red-100">
                    {resultStr}
                  </pre>
                ) : loadingEditedFile ? (
                  <div className="flex items-center gap-2 rounded-xl border border-claude-border/70 bg-[#23252a] px-3 py-3 text-xs text-claude-muted">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    변경된 파일 내용을 불러오는 중...
                  </div>
                ) : shouldShowEditedFile && editedFileContent !== null ? (
                  renderCodeLines(editedFileContent)
                ) : (
                  renderCodeLines(resultStr ?? '')
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
