import { Children, isValidElement, useState } from 'react'
import type { ClipboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import type { Message } from '../store/sessions'
import { ToolTimeline } from './ToolCallBlock'

type Props = {
  message: Message
  isStreaming?: boolean
  onAbort?: () => void
  onAskAboutSelection?: (payload: {
    kind: 'diff' | 'code'
    path: string
    startLine: number
    endLine: number
    code: string
    prompt?: string
  }) => void
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

function normalizeCopiedMarkdownText(text: string): string {
  return text.trimEnd()
}

function createMarkdownComponents(options?: { showCodeHeader?: boolean }) {
  const showCodeHeader = options?.showCodeHeader ?? true

  return {
    code({
      inline,
      className,
      children,
      ...props
    }: React.HTMLAttributes<HTMLElement> & {
      children?: React.ReactNode
      inline?: boolean
    }) {
      if (inline) {
        return (
          <code
            className="rounded-md border border-claude-border/70 bg-claude-surface-2 px-1.5 py-0.5 text-[0.85em] font-mono text-claude-text"
            {...props}
          >
            {normalizeInlineCodeChildren(children)}
          </code>
        )
      }

      return (
        <code className={`hljs ${className ?? ''}`.trim()} {...props}>
          {children}
        </code>
      )
    },
    pre({ children }: { children?: React.ReactNode }) {
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
          {showCodeHeader ? (
            <div className="code-block-header">
              <span className="code-block-title">{language || 'code'}</span>
            </div>
          ) : null}
          <pre className="code-block-pre">
            {children}
          </pre>
        </div>
      )
    },
  }
}

const assistantMarkdownComponents = createMarkdownComponents({ showCodeHeader: true })
const userMarkdownComponents = createMarkdownComponents({ showCodeHeader: false })

export function MessageBubble({ message, isStreaming, onAbort, onAskAboutSelection }: Props) {
  const [copied, setCopied] = useState(false)
  const showStreamingUi = Boolean(isStreaming)

  const handleMarkdownCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    const selectedText = window.getSelection()?.toString()
    if (!selectedText) return

    const normalizedText = normalizeCopiedMarkdownText(selectedText)
    if (normalizedText === selectedText) return

    event.preventDefault()
    event.clipboardData.setData('text/plain', normalizedText)
  }

  const handleCopyMessage = async () => {
    if (!message.text) return

    const normalizedText = normalizeCopiedMarkdownText(message.text)
    try {
      await navigator.clipboard.writeText(normalizedText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // noop
    }
  }

  const copyButton = message.text ? (
    <button
      type="button"
      onClick={handleCopyMessage}
      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-panel/90 text-claude-muted opacity-0 transition-all hover:bg-claude-surface-2 hover:text-claude-text group-hover/message:opacity-100 focus:outline-none focus-visible:opacity-100"
      title={copied ? '복사됨' : '복사'}
      aria-label={copied ? '복사됨' : '복사'}
    >
      {copied ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="9" y="9" width="10" height="10" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 9V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2h2" />
        </svg>
      )}
    </button>
  ) : null

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="group/message max-w-[78%] flex flex-col gap-2.5 items-end">
          {message.attachedFiles && message.attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {message.attachedFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => window.claude.openFile(file.path)}
                  className="flex items-center gap-1.5 rounded-xl border border-claude-border bg-claude-surface px-3 py-1.5 text-xs text-claude-muted hover:bg-claude-surface-2 transition-colors group"
                  title={file.path}
                >
                  <svg className="w-3.5 h-3.5 text-claude-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-claude-text font-medium max-w-[120px] truncate">{file.name}</span>
                  <span className="text-claude-muted">{formatBytes(file.size)}</span>
                </button>
              ))}
            </div>
          )}

          {message.text && (
            <div className="relative">
              <div className="rounded-[18px] rounded-tr-md border border-claude-border bg-claude-surface px-3 py-1.5">
                <div className="prose max-w-none text-left text-[14px] leading-6" onCopy={handleMarkdownCopy}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={userMarkdownComponents}>
                    {message.text}
                  </ReactMarkdown>
                </div>
              </div>
              <div className="absolute -bottom-9 right-1 z-10">
                {copyButton}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-2.5">
      <div className="group/message max-w-[88%]">
        {message.toolCalls.length > 0 && (
          <ToolTimeline toolCalls={message.toolCalls} onAskAboutSelection={onAskAboutSelection} />
        )}

        {(message.text || showStreamingUi) && (
          <div className="relative px-0.5 py-1">
            {message.text ? (
              <div className="prose max-w-none text-[14px] leading-6" onCopy={handleMarkdownCopy}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={assistantMarkdownComponents}>
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
            <div className="absolute -bottom-7 left-0 z-10">
              {copyButton}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
