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
        <div className="max-w-[80%] flex flex-col gap-2 items-end">
          {/* 첨부파일 목록 */}
          {message.attachedFiles && message.attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {message.attachedFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => window.claude.openFile(file.path)}
                  className="flex items-center gap-1.5 bg-white border border-claude-border rounded-lg px-2.5 py-1 text-xs hover:bg-claude-bg transition-colors group"
                  title={file.path}
                >
                  <svg className="w-3.5 h-3.5 text-claude-orange flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-claude-text font-medium max-w-[120px] truncate">{file.name}</span>
                  <span className="text-claude-muted">{formatBytes(file.size)}</span>
                </button>
              ))}
            </div>
          )}

          {/* 텍스트 버블 */}
          {message.text && (
            <div className="bg-claude-orange text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-4">
      <div className="flex gap-3 max-w-[85%]">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-claude-orange to-amber-400 flex items-center justify-center shadow-sm mt-0.5">
          <span className="text-white text-xs font-bold">C</span>
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
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-claude-border">
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
                              className="bg-claude-bg text-claude-orange px-1 py-0.5 rounded text-xs font-mono"
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
                  <span className="w-2 h-2 rounded-full bg-claude-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-claude-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-claude-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}

              {isStreaming && message.text && (
                <span className="inline-block w-0.5 h-4 bg-claude-orange ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
