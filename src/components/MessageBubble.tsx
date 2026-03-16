import { Children, isValidElement, useEffect, useMemo, useState } from 'react'
import type { ClipboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { useI18n } from '../hooks/useI18n'
import type { Message } from '../store/sessions'
import { HtmlPreview, ToolTimeline, extractHtmlPreviewCandidate } from './ToolCallBlock'

type Props = {
  message: Message
  isActiveHtmlPreviewMessage?: boolean
  hideHtmlPreview?: boolean
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

function ThinkingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 18h6m-5 3h4m-6.25-6.5A7 7 0 1119 9c0 2.18-.98 3.47-2.08 4.49-.89.83-1.42 1.48-1.64 2.01a.75.75 0 01-.69.5h-4.18a.75.75 0 01-.69-.5c-.22-.53-.75-1.18-1.64-2.01C5.98 12.47 5 11.18 5 9a7 7 0 014.75 6.5z"
      />
    </svg>
  )
}

function ThinkingDots({ muted = false }: { muted?: boolean }) {
  const dotClassName = muted ? 'bg-claude-muted/70' : 'bg-claude-text/85'

  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClassName} animate-bounce`} style={{ animationDelay: '0ms' }} />
      <span className={`h-1.5 w-1.5 rounded-full ${dotClassName} animate-bounce`} style={{ animationDelay: '150ms' }} />
      <span className={`h-1.5 w-1.5 rounded-full ${dotClassName} animate-bounce`} style={{ animationDelay: '300ms' }} />
    </div>
  )
}

export function MessageBubble({
  message,
  isActiveHtmlPreviewMessage = false,
  hideHtmlPreview = false,
  isStreaming,
  onAbort,
  onAskAboutSelection,
}: Props) {
  const { language } = useI18n()
  const [copied, setCopied] = useState(false)
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const [htmlPreviewContent, setHtmlPreviewContent] = useState<string | null>(null)
  const [htmlPreviewLoading, setHtmlPreviewLoading] = useState(false)
  const showStreamingUi = Boolean(isStreaming)
  const hasThinking = Boolean(message.thinking?.trim())
  const hasFinalAssistantText = Boolean(message.text.trim())
  const showThinkingRow = hasThinking || showStreamingUi
  const showThinkingPanel = hasThinking && thinkingOpen
  const htmlPreviewCandidate = useMemo(
    () => (message.role === 'assistant' ? extractHtmlPreviewCandidate(message.toolCalls) : null),
    [message.role, message.toolCalls]
  )
  const shouldShowHtmlPreview = Boolean(
    isActiveHtmlPreviewMessage &&
    !hideHtmlPreview &&
    !showStreamingUi &&
    htmlPreviewCandidate
  )

  useEffect(() => {
    if (showStreamingUi) {
      setThinkingOpen(true)
      return
    }

    if (!showStreamingUi) {
      setThinkingOpen(false)
    }
  }, [showStreamingUi])

  useEffect(() => {
    if (!htmlPreviewCandidate) {
      setHtmlPreviewContent(null)
      setHtmlPreviewLoading(false)
      return
    }

    if (!htmlPreviewCandidate.path) {
      setHtmlPreviewContent(htmlPreviewCandidate.fallbackContent ?? null)
      setHtmlPreviewLoading(false)
      return
    }

    let cancelled = false
    setHtmlPreviewContent(null)
    setHtmlPreviewLoading(true)

    window.claude.readFile(htmlPreviewCandidate.path)
      .then((file) => {
        if (cancelled) return
        if (file?.content?.trim()) {
          setHtmlPreviewContent(file.content)
          return
        }

        setHtmlPreviewContent(htmlPreviewCandidate.fallbackContent ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          setHtmlPreviewContent(htmlPreviewCandidate.fallbackContent ?? null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHtmlPreviewLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [htmlPreviewCandidate])

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
      title={copied ? (language === 'en' ? 'Copied' : '복사됨') : (language === 'en' ? 'Copy' : '복사')}
      aria-label={copied ? (language === 'en' ? 'Copied' : '복사됨') : (language === 'en' ? 'Copy' : '복사')}
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
              <div className="rounded-[18px] rounded-tr-md border border-claude-user-bubble-border bg-claude-user-bubble px-3 py-1.5">
                <div className="prose max-w-none overflow-x-auto break-words text-left text-[14px] leading-6 [overflow-wrap:anywhere]" onCopy={handleMarkdownCopy}>
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
      <div className="group/message w-full">
        {message.toolCalls.length > 0 && (
          <div className="max-w-[88%]">
            <ToolTimeline toolCalls={message.toolCalls} onAskAboutSelection={onAskAboutSelection} />
          </div>
        )}

        {shouldShowHtmlPreview ? (
          <div className="py-1">
            {htmlPreviewContent ? (
              <HtmlPreview html={htmlPreviewContent} path={htmlPreviewCandidate!.path} />
            ) : htmlPreviewLoading ? (
              <div className="rounded-lg border border-claude-border/70 bg-claude-bg px-3 py-3 text-[11px] text-claude-muted">
                {language === 'en' ? 'Loading HTML preview...' : 'HTML 미리보기를 불러오는 중...'}
              </div>
            ) : null}
          </div>
        ) : null}

        {(message.text || hasThinking || showStreamingUi) && (
          <div className="relative max-w-[88%] px-0.5 py-1">
            {showThinkingRow ? (
              <div className="mb-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!hasThinking) return
                    setThinkingOpen((value) => !value)
                  }}
                  className={`flex items-center gap-1.5 text-left text-[12px] leading-5 text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 ${hasThinking ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <svg className={`h-3 w-3 transition-transform ${showThinkingPanel ? 'rotate-90' : 'rotate-0'} ${hasThinking ? 'opacity-100' : 'opacity-35'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                  </svg>
                  <ThinkingIcon className="h-3.5 w-3.5 text-claude-muted/90" />
                  <span>{showStreamingUi ? 'Thinking...' : 'Thinking'}</span>
                </button>

                {showThinkingPanel ? (
                  <div className="ml-[10px] border-l border-claude-border/70 pl-3">
                    <div
                      className="prose max-h-64 max-w-none overflow-x-auto overflow-y-auto break-words pr-2 text-[13px] leading-7 text-claude-muted/90 [overflow-wrap:anywhere] [&_*]:text-inherit [&_li::marker]:text-claude-muted/55 [&_ol]:my-0 [&_ol]:space-y-2.5 [&_ol]:pl-5 [&_p]:my-0 [&_ul]:my-0 [&_ul]:space-y-2.5 [&_ul]:pl-5"
                      onCopy={handleMarkdownCopy}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={assistantMarkdownComponents}>
                        {message.thinking ?? ''}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {message.text ? (
              <div className="prose max-w-none overflow-x-auto break-words text-[14px] leading-6 [overflow-wrap:anywhere]" onCopy={handleMarkdownCopy}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={assistantMarkdownComponents}>
                  {message.text}
                </ReactMarkdown>
              </div>
            ) : null}

            {showStreamingUi ? (
              <div className={`${showThinkingRow || message.text ? 'mt-2' : ''} flex items-center gap-1 py-1`}>
                <ThinkingDots muted />
              </div>
            ) : null}
            <div className="absolute -bottom-7 left-0 z-10">
              {copyButton}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
