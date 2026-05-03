import { Children, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

function normalizeInlineCodeChildren(children: React.ReactNode): React.ReactNode {
  const normalizeText = (value: string): string => {
    const match = value.match(/^(\s*)(`+)([\s\S]*?)(\2)(\s*)$/)
    if (!match) return value
    return `${match[1]}${match[3]}${match[5]}`
  }

  if (typeof children === 'string') return normalizeText(children)
  if (Array.isArray(children)) {
    return children.map((child) => (typeof child === 'string' ? normalizeText(child) : child))
  }
  return children
}

const markdownComponents = {
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
        <code className="secretary-markdown-inline-code" {...props}>
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
      <div className="code-block-shell secretary-markdown-code-shell">
        <div className="code-block-header">
          <span className="code-block-title">{language || 'code'}</span>
        </div>
        <pre className="code-block-pre">
          {children}
        </pre>
      </div>
    )
  },
}

type Props = {
  text: string
  className?: string
}

export function SecretaryMarkdown({ text, className = '' }: Props) {
  return (
    <div className={`secretary-markdown ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
