import { useI18n } from '../../hooks/useI18n'
import { HtmlPreview } from '../ToolCallBlock'
import type { HtmlPreviewCandidate, HtmlPreviewElementCapture } from '../../lib/toolcalls/types'
import type { HtmlPreviewSource, PreviewElementSelectionPayload } from './chatViewUtils'
import { useMessageHtmlPreview } from '../message/useMessageHtmlPreview'
import { getFileName } from '../toolcalls/htmlPreviewDocument'

function normalizePath(path: string | null | undefined): string | null {
  const trimmed = path?.trim() ?? ''
  if (!trimmed || trimmed === '~') return null
  return trimmed
}

function getParentDirectory(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return null
  if (lastSlash === 0) return '/'
  return normalized.slice(0, lastSlash)
}

function resolveUrlPreviewDownloadRoot(candidate: HtmlPreviewCandidate | null, sessionCwd: string | null): string | null {
  if (!candidate || candidate.kind !== 'url') return null

  const rootedProjectPath = normalizePath(candidate.rootPath)
  if (rootedProjectPath) {
    return rootedProjectPath
  }

  const linkedPreviewPath = normalizePath(candidate.path)
  if (linkedPreviewPath) {
    return getParentDirectory(linkedPreviewPath) ?? linkedPreviewPath
  }

  return normalizePath(sessionCwd)
}

type Props = {
  activeSource: HtmlPreviewSource | null
  sources: HtmlPreviewSource[]
  selectedSourceId: string | null
  sessionCwd: string | null
  hideHtmlPreview: boolean
  isStreaming: boolean
  onPreviewElementSelection: (payload: HtmlPreviewElementCapture) => void
  onSelectSource: (sourceId: string) => void
  onClearSelectedElements: () => void
  selectedElements: PreviewElementSelectionPayload[]
  hoveredSelectionKey: string | null
}

export function HtmlPreviewPanel({
  activeSource,
  sources,
  selectedSourceId,
  sessionCwd,
  hideHtmlPreview,
  isStreaming,
  onPreviewElementSelection,
  onSelectSource,
  onClearSelectedElements,
  selectedElements,
  hoveredSelectionKey,
}: Props) {
  const { t } = useI18n()
  const sourceOptions = sources.map((source) => {
    if (source.kind === 'url' && source.candidate.kind === 'url') {
      const label = (() => {
        try {
          return new URL(source.candidate.url).host
        } catch {
          return source.candidate.url
        }
      })()
      return {
        id: source.id,
        label: t('toolcall.htmlPreview.liveSource', { target: label }),
      }
    }

    return {
      id: source.id,
      label: t('toolcall.htmlPreview.fileSource', { target: getFileName(source.candidate.path) }),
    }
  })
  const {
    htmlPreviewCandidate,
    htmlPreviewContent,
    htmlPreviewLoading,
    shouldShowHtmlPreview,
  } = useMessageHtmlPreview({
    candidate: activeSource?.candidate ?? null,
    hideHtmlPreview,
    showStreamingUi: isStreaming,
  })
  const urlPreviewDownloadRoot = resolveUrlPreviewDownloadRoot(htmlPreviewCandidate, sessionCwd)

  if (!activeSource || !shouldShowHtmlPreview || !htmlPreviewCandidate) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-claude-border bg-claude-bg px-5 text-center text-claude-muted">
        <p className="text-[13px]">{t('chat.preview.selectHtmlPreview')}</p>
      </div>
    )
  }

  if (htmlPreviewCandidate.kind === 'url') {
    return (
      <div className="h-full min-h-0">
        <HtmlPreview
          path={htmlPreviewCandidate.path}
          url={htmlPreviewCandidate.url}
          downloadRootPath={urlPreviewDownloadRoot}
          sourceOptions={sourceOptions}
          activeSourceId={selectedSourceId}
          onSourceChange={onSelectSource}
          onElementSelect={onPreviewElementSelection}
          onClearSelectedElements={onClearSelectedElements}
          selectedElements={selectedElements}
          hoveredSelectionKey={hoveredSelectionKey}
        />
      </div>
    )
  }

  if (htmlPreviewContent) {
    return (
      <div className="h-full min-h-0">
        <HtmlPreview
          html={htmlPreviewContent}
          path={htmlPreviewCandidate.path}
          sourceOptions={sourceOptions}
          activeSourceId={selectedSourceId}
          onSourceChange={onSelectSource}
          onElementSelect={onPreviewElementSelection}
          onClearSelectedElements={onClearSelectedElements}
          selectedElements={selectedElements}
          hoveredSelectionKey={hoveredSelectionKey}
        />
      </div>
    )
  }

  if (htmlPreviewLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-claude-border bg-claude-bg text-claude-muted">
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
        </svg>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center rounded-md border border-claude-border bg-claude-bg px-5 text-center text-claude-muted">
      <p className="text-[13px]">{t('chat.preview.selectHtmlPreview')}</p>
    </div>
  )
}
