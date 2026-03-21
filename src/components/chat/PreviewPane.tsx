import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import type { DirEntry } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import {
  extractMarkdownImageUrls,
  fileUrlToPath,
  isMarkdownFile,
  resolveMarkdownPreviewUrl,
} from '../../lib/markdownPreview'

type PreviewPaneProps = {
  entry: DirEntry | null
  previewContent: string
  previewState: 'idle' | 'loading' | 'ready' | 'unsupported'
  markdownPreviewEnabled: boolean
  onToggleMarkdownPreview: () => void
}

export function MarkdownPreviewBody({ filePath, content }: { filePath: string; content: string }) {
  const [markdownImageDataUrls, setMarkdownImageDataUrls] = useState<Record<string, string>>({})
  const markdownImageSources = useMemo(() => (
    extractMarkdownImageUrls(content)
      .map((url) => resolveMarkdownPreviewUrl(filePath, url))
      .filter((url, index, all) => url.startsWith('file://') && all.indexOf(url) === index)
  ), [content, filePath])

  useEffect(() => {
    let cancelled = false

    if (markdownImageSources.length === 0) {
      setMarkdownImageDataUrls({})
      return
    }

    void (async () => {
      const pairs = await Promise.all(
        markdownImageSources.map(async (sourceUrl) => {
          const resolvedPath = fileUrlToPath(sourceUrl)
          if (!resolvedPath) return null
          const dataUrl = await window.claude.readFileDataUrl(resolvedPath)
          return dataUrl ? [sourceUrl, dataUrl] as const : null
        }),
      )

      if (cancelled) return

      setMarkdownImageDataUrls(
        Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair !== null)),
      )
    })()

    return () => {
      cancelled = true
    }
  }, [markdownImageSources])

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => resolveMarkdownPreviewUrl(filePath, url)}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className
            if (isInline) {
              return (
                <code
                  className="rounded-md border border-claude-border bg-claude-surface-2 px-1.5 py-0.5 text-xs font-mono text-claude-text"
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
          img({ src = '', alt = '', ...props }) {
            const resolvedSrc = resolveMarkdownPreviewUrl(filePath, src)
            const imageSrc = resolvedSrc.startsWith('file://')
              ? markdownImageDataUrls[resolvedSrc] ?? undefined
              : resolvedSrc

            return (
              <img
                {...props}
                src={imageSrc}
                alt={alt}
              />
            )
          },
          pre({ children, ...props }) {
            return (
              <pre {...props} className="!bg-transparent !p-0 overflow-x-auto">
                {children}
              </pre>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function PreviewPane({
  entry,
  previewContent,
  previewState,
  markdownPreviewEnabled,
  onToggleMarkdownPreview,
}: PreviewPaneProps) {
  const { t } = useI18n()
  if (!entry) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center text-claude-muted">
        <p className="text-sm">{t('chat.preview.selectFile')}</p>
      </div>
    )
  }

  if (previewState === 'loading') {
    return (
      <div className="h-full flex items-center justify-center text-claude-muted">
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
        </svg>
      </div>
    )
  }

  if (previewState === 'unsupported') {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center text-claude-muted">
        <div>
          <p className="text-sm font-medium text-claude-text">{entry.name}</p>
          <p className="text-xs mt-2">{t('chat.preview.unsupported')}</p>
        </div>
      </div>
    )
  }

  if (previewState === 'ready' && isMarkdownFile(entry.name) && markdownPreviewEnabled) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-sm font-medium text-claude-text truncate">{entry.name}</p>
          <button
            onClick={onToggleMarkdownPreview}
            className="flex-shrink-0 rounded-xl border border-claude-border px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          >
            {t('chat.preview.source')}
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          <MarkdownPreviewBody filePath={entry.path} content={previewContent} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-claude-border bg-claude-surface px-4 py-3">
        <p className="text-sm font-medium text-claude-text truncate">{entry.name}</p>
        {isMarkdownFile(entry.name) && previewState === 'ready' && (
          <button
            onClick={onToggleMarkdownPreview}
            className="flex-shrink-0 rounded-xl border border-claude-border px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          >
            {t('chat.preview.preview')}
          </button>
        )}
      </div>
      <pre className="m-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-xs font-mono text-claude-text">
        {previewContent}
      </pre>
    </div>
  )
}
