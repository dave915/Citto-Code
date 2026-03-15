import { formatToolResult } from '../../lib/toolCallUtils'
import { type ToolCallBlock as ToolCallBlockType } from '../../store/sessions'

export function TodoPreview({ toolCalls }: { toolCalls: ToolCallBlockType[] }) {
  const resultText = formatToolResult(toolCalls[toolCalls.length - 1]?.result)
  const lines = resultText
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
            <span className={`truncate ${done ? 'line-through opacity-55' : ''}`}>{normalized}</span>
          </div>
        )
      })}
    </div>
  )
}
