import { createPortal } from 'react-dom'
import { useI18n } from '../../hooks/useI18n'
import { useHtmlPreviewController } from './useHtmlPreviewController'

export function HtmlPreview({
  html,
  path,
}: {
  html: string
  path?: string | null
}) {
  const { t } = useI18n()
  const isMacOs = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const {
    frameHeight,
    iframeRef,
    isFullscreen,
    srcDoc,
    handleDownload,
    toggleFullscreen,
  } = useHtmlPreviewController({ html, path })

  const previewTitle = t('toolcall.htmlPreview.title')
  const downloadLabel = t('toolcall.htmlPreview.download')
  const openLabel = t('toolcall.htmlPreview.openInBrowser')
  const maximizeLabel = isFullscreen
    ? t('toolcall.htmlPreview.exitFullscreen')
    : t('toolcall.htmlPreview.maximize')

  const renderHeaderActions = () => (
    <div className="no-drag flex flex-shrink-0 items-center gap-2" data-no-drag="true">
      <button
        type="button"
        onClick={() => { void handleDownload() }}
        className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
      >
        {downloadLabel}
      </button>
      {path ? (
        <button
          type="button"
          onClick={() => { void window.claude.openInBrowser(path) }}
          className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
        >
          {openLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
      >
        {maximizeLabel}
      </button>
    </div>
  )

  const renderHeader = (fullscreen: boolean) => {
    if (fullscreen) {
      return (
        <div className="draggable-region flex h-12 items-center gap-2 border-b border-claude-border/70 bg-claude-panel px-4">
          {isMacOs ? <div className="w-[52px] flex-shrink-0" aria-hidden="true" /> : null}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-claude-text/90">{previewTitle}</div>
          </div>
          {renderHeaderActions()}
        </div>
      )
    }

    return (
      <div className="draggable-region flex items-center justify-between gap-3 border-b border-claude-border/70 bg-claude-panel px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-claude-text/90">{previewTitle}</div>
        </div>
        {renderHeaderActions()}
      </div>
    )
  }

  const renderIframe = (fullscreen: boolean) => (
    <iframe
      ref={iframeRef}
      title={path ? `${path} preview` : 'html-preview'}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-modals"
      style={fullscreen ? undefined : { height: `${frameHeight}px` }}
      className={fullscreen ? 'block h-full w-full bg-white' : 'block w-full bg-white'}
    />
  )

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-claude-border/70 bg-claude-bg">
        {renderHeader(false)}
        {!isFullscreen ? renderIframe(false) : null}
      </div>

      {isFullscreen && typeof document !== 'undefined'
        ? createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col bg-claude-bg">
            {renderHeader(true)}
            <div className="min-h-0 flex-1 bg-white">
              {renderIframe(true)}
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}
