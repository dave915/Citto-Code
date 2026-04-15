import { createPortal } from 'react-dom'
import { useI18n } from '../../hooks/useI18n'
import type { HtmlPreviewElementSelection } from '../../lib/toolcalls/types'
import { useHtmlPreviewController } from './useHtmlPreviewController'

export function HtmlPreview({
  html,
  path,
  url,
  onElementSelect,
}: {
  html?: string | null
  path?: string | null
  url?: string | null
  onElementSelect?: (payload: HtmlPreviewElementSelection) => void
}) {
  const { t } = useI18n()
  const isMacOs = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const {
    canSelectElements,
    frameHeight,
    handleIframeLoad,
    iframeRef,
    isFrameLoading,
    isFullscreen,
    isSelectMode,
    isUrlPreview,
    previewUrl,
    srcDoc,
    handleDownload,
    toggleSelectMode,
    toggleFullscreen,
  } = useHtmlPreviewController({ html, path, url, onElementSelect })

  const previewTargetLabel = (() => {
    if (!previewUrl) return null
    try {
      return new URL(previewUrl).host
    } catch {
      return previewUrl
    }
  })()
  const previewTitle = isUrlPreview && previewTargetLabel
    ? t('toolcall.htmlPreview.urlTitle', { target: previewTargetLabel })
    : t('toolcall.htmlPreview.title')
  const downloadLabel = t('toolcall.htmlPreview.download')
  const openLabel = t('toolcall.htmlPreview.openInBrowser')
  const loadingLabel = t('toolcall.htmlPreview.loadingUrl')
  const selectUnavailableLabel = t('toolcall.htmlPreview.selectElementUnavailable')
  const selectUnavailableHint = t('toolcall.htmlPreview.selectElementUnavailableHint')
  const selectLabel = isSelectMode
    ? t('toolcall.htmlPreview.selectingElement')
    : t('toolcall.htmlPreview.selectElement')
  const maximizeLabel = isFullscreen
    ? t('toolcall.htmlPreview.exitFullscreen')
    : t('toolcall.htmlPreview.maximize')
  const openTarget = previewUrl ?? path ?? null
  const showSelectAction = Boolean(onElementSelect && (path || isUrlPreview))
  const selectActionDisabled = !canSelectElements || (!path && !isUrlPreview)

  const renderHeaderActions = () => (
    <div className="no-drag flex flex-shrink-0 items-center gap-2" data-no-drag="true">
      {!isUrlPreview ? (
        <button
          type="button"
          onClick={() => { void handleDownload() }}
          className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
        >
          {downloadLabel}
        </button>
      ) : null}
      {showSelectAction ? (
        <button
          type="button"
          onClick={selectActionDisabled ? undefined : toggleSelectMode}
          aria-disabled={selectActionDisabled}
          title={selectActionDisabled ? selectUnavailableHint : undefined}
          className={`rounded-md border px-2 py-1 text-[11px] outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 ${
            selectActionDisabled
              ? 'cursor-not-allowed border-claude-border/60 bg-claude-surface/60 text-claude-muted'
              : isSelectMode
              ? 'border-[#ff6b35] bg-[#ff6b35]/12 text-[#ff6b35]'
              : 'border-claude-border bg-claude-surface text-claude-text'
          }`}
        >
          {selectActionDisabled ? selectUnavailableLabel : selectLabel}
        </button>
      ) : null}
      {openTarget ? (
        <button
          type="button"
          onClick={() => { void window.claude.openInBrowser(openTarget) }}
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
    <div className={fullscreen ? 'relative h-full w-full bg-white' : 'relative w-full bg-white'}>
      <iframe
        ref={iframeRef}
        title={openTarget ? `${openTarget} preview` : 'html-preview'}
        {...(srcDoc ? { srcDoc } : previewUrl ? { src: previewUrl } : {})}
        sandbox={previewUrl ? 'allow-scripts allow-forms allow-modals allow-same-origin' : 'allow-scripts allow-forms allow-modals'}
        onLoad={handleIframeLoad}
        style={fullscreen ? undefined : { height: `${frameHeight}px` }}
        className={fullscreen ? 'block h-full w-full bg-white' : 'block w-full bg-white'}
      />
      {isUrlPreview && isFrameLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#06070d] text-center">
          <div className="flex flex-col items-center gap-3 px-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-claude-border border-t-[#6c63ff]" />
            <div className="text-[12px] font-medium text-claude-text/90">{loadingLabel}</div>
          </div>
        </div>
      ) : null}
    </div>
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
