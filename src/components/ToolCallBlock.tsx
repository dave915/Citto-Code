import { useState } from 'react'
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

function getToolIcon(name: string): string {
  const icons: Record<string, string> = {
    Bash: '⚡',
    Read: '📖',
    Write: '✍️',
    Edit: '✏️',
    Glob: '🔍',
    Grep: '🔎',
    TodoWrite: '✅',
    WebFetch: '🌐',
    WebSearch: '🔍',
    Task: '🤖',
    MultiEdit: '✏️',
  }
  return icons[name] || '🔧'
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

type Props = {
  toolCall: ToolCallBlockType
}

export function ToolCallBlock({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(false)
  const inputStr = formatToolInput(toolCall.toolName, toolCall.toolInput)
  const resultStr = toolCall.result ? formatToolResult(toolCall.result) : null

  const isRunning = toolCall.status === 'running'
  const isError = toolCall.status === 'error'

  return (
    <div className={`tool-call rounded-lg border overflow-hidden text-sm ${
      isError ? 'border-red-200 bg-red-50' : 'border-claude-border bg-white'
    }`}>
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-claude-bg/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-base">{getToolIcon(toolCall.toolName)}</span>
        <span className="font-medium text-claude-text flex-1">
          {getToolLabel(toolCall.toolName)}
        </span>
        {isRunning && (
          <span className="flex items-center gap-1 text-xs text-claude-muted">
            <span className="inline-block w-2 h-2 rounded-full bg-claude-orange animate-pulse" />
            실행 중
          </span>
        )}
        {!isRunning && (
          <svg
            className={`w-4 h-4 text-claude-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Input preview (always visible, truncated) */}
      {inputStr && (
        <div className="px-3 pb-2 font-mono text-xs text-claude-muted truncate border-t border-claude-border/50 pt-1.5">
          {inputStr}
        </div>
      )}

      {/* Expanded result */}
      {expanded && resultStr && (
        <div className={`px-3 py-2 font-mono text-xs border-t whitespace-pre-wrap break-all ${
          isError ? 'text-red-700 border-red-200 bg-red-50' : 'text-gray-700 border-claude-border bg-gray-50'
        }`}>
          {resultStr}
        </div>
      )}
    </div>
  )
}
