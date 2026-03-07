import { Children, isValidElement, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../store/sessions'
import { ToolCallBlock } from './ToolCallBlock'

type Props = {
  message: Message
  isStreaming?: boolean
  onAbort?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function normalizeInlineCodeChildren(children: React.ReactNode): React.ReactNode {
  const normalizeText = (value: string): string => {
    const match = value.match(/^(\s*)(`+)([\s\S]*?)(\2)(\s*)$/)
    if (!match) return value
    return `${match[1]}${match[3]}${match[5]}`
  }

  if (typeof children === 'string') {
    return normalizeText(children)
  }

  if (Array.isArray(children)) {
    return children.map((child) => (typeof child === 'string' ? normalizeText(child) : child))
  }

  return children
}

export function MessageBubble({ message, isStreaming, onAbort }: Props) {
  const [showStreamingUi, setShowStreamingUi] = useState(Boolean(isStreaming))

  useEffect(() => {
    if (isStreaming) {
      setShowStreamingUi(true)
      return
    }

    const timeout = window.setTimeout(() => {
      setShowStreamingUi(false)
    }, 1200)

    return () => window.clearTimeout(timeout)
  }, [isStreaming])

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
            <div className="rounded-[22px] rounded-tr-md border border-claude-border bg-[#303034] px-4 py-3.5">
              <p className="text-[14px] leading-7 whitespace-pre-wrap text-claude-text">{message.text}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[88%]">
        {message.toolCalls.length > 0 && (
          <div className="mb-3 space-y-2">
            {message.toolCalls.map((tc) => (
              <ToolCallBlock key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {(message.text || showStreamingUi) && (
          <div className="px-0.5 py-1">
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
                            className="rounded-md border border-claude-border/70 bg-[#36383d] px-1.5 py-0.5 text-[0.85em] font-mono text-[#ddd6cf]"
                            {...props}
                          >
                            {normalizeInlineCodeChildren(children)}
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
                      const onlyChild = Children.toArray(children)[0]
                      const className = isValidElement<{ className?: string }>(onlyChild)
                        ? onlyChild.props.className ?? ''
                        : ''
                      const language = className
                        .replace('hljs', '')
                        .trim()
                        .replace(/^language-/, '')
                        .trim()

                      return (
                        <div className="code-block-shell">
                          <div className="code-block-header">
                            <span className="code-block-title">{language || 'code'}</span>
                          </div>
                          <pre className="code-block-pre">
                            {children}
                          </pre>
                        </div>
                      )
                    }
                  }}
                >
                  {message.text}
                </ReactMarkdown>
              </div>
            ) : null}

            {showStreamingUi && (
              <div className="flex items-center gap-1 py-1">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-claude-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-claude-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-claude-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
