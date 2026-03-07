import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../store/sessions'
import { ToolCallBlock } from './ToolCallBlock'

type Props = {
  message: Message
  isStreaming?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function MessageBubble({ message, isStreaming }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[78%] flex flex-col gap-2.5 items-end">
          {message.attachedFiles && message.attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {message.attachedFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => window.claude.openFile(file.path)}
                  className="flex items-center gap-1.5 rounded-xl border border-claude-border bg-claude-surface px-3 py-1.5 text-xs text-claude-muted hover:bg-claude-surface-2 transition-colors group"
                  title={file.path}
                >
                  <svg className="w-3.5 h-3.5 text-claude-orange flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-claude-text font-medium max-w-[120px] truncate">{file.name}</span>
                  <span className="text-claude-muted">{formatBytes(file.size)}</span>
                </button>
              ))}
            </div>
          )}

          {message.text && (
            <div className="rounded-[22px] rounded-tr-md border border-[#c69772]/20 bg-gradient-to-br from-[#2d231e] to-[#211b18] px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
              <p className="text-[14px] leading-7 whitespace-pre-wrap text-[#f5ede6]">{message.text}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-4">
      <div className="flex gap-3.5 max-w-[88%]">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-claude-border bg-claude-surface text-[11px] font-semibold text-claude-text shadow-[0_8px_20px_rgba(0,0,0,0.16)]">
          C
        </div>

        <div className="flex-1 min-w-0">
          {message.toolCalls.length > 0 && (
            <div className="mb-3 space-y-2">
              {message.toolCalls.map((tc) => (
                <ToolCallBlock key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {(message.text || isStreaming) && (
            <div className="rounded-[22px] rounded-tl-md border border-claude-border bg-claude-surface px-4 py-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
              {message.text ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const isInline = !className
                        if (isInline) {
                          return (
                            <code
                              className="rounded-md border border-claude-border bg-claude-surface-2 px-1.5 py-0.5 text-xs font-mono text-[#f0c49d]"
                              {...props}
                            >
                              {children}
                            </code>
                          )
                        }
                        return (
                          <code className={`hljs ${className ?? ''}`} {...props}>
                            {children}
                          </code>
                        )
                      },
                      pre({ children }) {
                        return (
                          <pre className="!bg-transparent !p-0 overflow-x-auto">
                            {children}
                          </pre>
                        )
                      }
                    }}
                  >
                    {message.text}
                  </ReactMarkdown>
                </div>
              ) : null}

              {isStreaming && !message.text && (
                <div className="flex items-center gap-1 py-1">
                  <span className="w-2 h-2 rounded-full bg-claude-orange animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-claude-orange animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-claude-orange animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}

              {isStreaming && message.text && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle bg-claude-orange" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
