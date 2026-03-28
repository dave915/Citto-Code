import { Children, isValidElement, type ClipboardEventHandler } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

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

export function normalizeCopiedMarkdownText(text: string): string {
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

type MessageMarkdownProps = {
  text: string
  role: 'assistant' | 'user'
  className: string
  onCopy?: ClipboardEventHandler<HTMLDivElement>
}

export function MessageMarkdown({
  text,
  role,
  className,
  onCopy,
}: MessageMarkdownProps) {
  return (
    <div className={className} onCopy={onCopy}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={role === 'user' ? userMarkdownComponents : assistantMarkdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
