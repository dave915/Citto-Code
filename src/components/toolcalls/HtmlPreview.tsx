import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../hooks/useI18n'
import type { HtmlPreviewElementCapture, HtmlPreviewElementSelection } from '../../lib/toolcalls/types'
import { getFileName } from './htmlPreviewDocument'
import { type HtmlPreviewNavigationMode, useHtmlPreviewController } from './useHtmlPreviewController'

type NavigationHistoryState = {
  entries: string[]
  index: number
}

function normalizeComparableUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null

  try {
    return new URL(trimmed).toString()
  } catch {
    return trimmed
  }
}

function buildInitialHistoryState(url: string | null): NavigationHistoryState {
  const normalizedUrl = normalizeComparableUrl(url)
  if (!normalizedUrl) {
    return { entries: [], index: -1 }
  }

  return {
    entries: [normalizedUrl],
    index: 0,
  }
}

function PreviewIconButton({
  active = false,
  activeTone = 'default',
  ariaDisabled = false,
  onClick,
  title,
  children,
}: {
  active?: boolean
  activeTone?: 'default' | 'selection'
  ariaDisabled?: boolean
  onClick?: () => void
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={ariaDisabled ? undefined : onClick}
      aria-disabled={ariaDisabled}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border outline-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 ${
        ariaDisabled
          ? 'cursor-not-allowed border-claude-border/60 bg-claude-surface/50 text-claude-muted/55'
          : active
          ? activeTone === 'selection'
            ? 'border-[#12d64f]/70 bg-[rgba(18,214,79,0.14)] text-[#8df0af] shadow-[inset_0_0_0_1px_rgba(18,214,79,0.18),0_0_0_1px_rgba(18,214,79,0.08)]'
            : 'border-claude-border bg-claude-surface-2 text-claude-text'
          : 'border-claude-border bg-claude-surface text-claude-muted hover:bg-claude-surface-2 hover:text-claude-text'
      }`}
    >
      {children}
    </button>
  )
}

export function HtmlPreview({
  html,
  path,
  url,
  downloadRootPath = null,
  onElementSelect,
  onClearSelectedElements,
  selectedElements = [],
  hoveredSelectionKey = null,
  sourceOptions = [],
  activeSourceId = null,
  onSourceChange,
}: {
  html?: string | null
  path?: string | null
  url?: string | null
  downloadRootPath?: string | null
  onElementSelect?: (payload: HtmlPreviewElementCapture) => void
  onClearSelectedElements?: () => void
  selectedElements?: HtmlPreviewElementSelection[]
  hoveredSelectionKey?: string | null
  sourceOptions?: Array<{ id: string; label: string }>
  activeSourceId?: string | null
  onSourceChange?: (sourceId: string) => void
}) {
  const { t } = useI18n()
  const pendingHistoryActionRef = useRef<'back' | 'forward' | null>(null)
  const normalizeUrlInput = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
    return `http://${trimmed}`
  }
  const [committedUrl, setCommittedUrl] = useState<string | null>(url?.trim() || null)
  const [addressInput, setAddressInput] = useState(url?.trim() || '')
  const [currentUrl, setCurrentUrl] = useState<string | null>(normalizeComparableUrl(url?.trim() || null))
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistoryState>(() => buildInitialHistoryState(url?.trim() || null))
  const handlePreviewLocationChange = useCallback((payload: {
    url: string
    proxyUrl: string
    navigationMode: HtmlPreviewNavigationMode
  }) => {
    const normalizedUrl = normalizeComparableUrl(payload.url)
    if (!normalizedUrl) return

    setCurrentUrl(normalizedUrl)
    setAddressInput(normalizedUrl)
    setNavigationHistory((current) => {
      const pendingAction = pendingHistoryActionRef.current
      pendingHistoryActionRef.current = null

      if (current.entries.length === 0 || current.index < 0) {
        return {
          entries: [normalizedUrl],
          index: 0,
        }
      }

      const currentEntry = current.entries[current.index] ?? null
      if (currentEntry === normalizedUrl) {
        return current
      }

      if (payload.navigationMode === 'replace') {
        const nextEntries = [...current.entries]
        nextEntries[current.index] = normalizedUrl
        return {
          entries: nextEntries,
          index: current.index,
        }
      }

      if (pendingAction || payload.navigationMode === 'pop') {
        const existingIndex = current.entries.findIndex((entry) => entry === normalizedUrl)
        if (existingIndex >= 0) {
          return {
            entries: current.entries,
            index: existingIndex,
          }
        }
      }

      const nextEntries = current.entries.slice(0, current.index + 1)
      nextEntries.push(normalizedUrl)
      return {
        entries: nextEntries,
        index: nextEntries.length - 1,
      }
    })
  }, [])
  const {
    canSelectElements,
    frameHeight,
    handleIframeLoad,
    iframeRenderKey,
    iframeRef,
    iframeUrl,
    isFrameLoading,
    isFullscreen,
    isSelectMode,
    isUrlPreview,
    previewUrl,
    refreshPreview,
    srcDoc,
    clearSelectMode,
    handleDownload,
    toggleSelectMode,
    toggleFullscreen,
  } = useHtmlPreviewController({
    html,
    path,
    url: committedUrl,
    downloadRootPath,
    onElementSelect,
    onLocationChange: handlePreviewLocationChange,
    selectedElements,
    hoveredSelectionKey,
  })

  useEffect(() => {
    const nextUrl = url?.trim() || null
    pendingHistoryActionRef.current = null
    setCommittedUrl(nextUrl)
    setAddressInput(nextUrl ?? '')
    setCurrentUrl(normalizeComparableUrl(nextUrl))
    setNavigationHistory(buildInitialHistoryState(nextUrl))
  }, [url])

  const activeUrl = currentUrl ?? normalizeComparableUrl(previewUrl)
  const openTarget = isUrlPreview
    ? (iframeUrl ?? activeUrl)
    : (path ?? null)
  const previewTargetLabel = (() => {
    if (!activeUrl) return null
    try {
      return new URL(activeUrl).host
    } catch {
      return activeUrl
    }
  })()
  const previewTitle = isUrlPreview && previewTargetLabel
    ? t('toolcall.htmlPreview.urlTitle', { target: previewTargetLabel })
    : getFileName(path)
  const addressLabel = openTarget ?? t('toolcall.htmlPreview.localAddress')
  const showSourceSelector = sourceOptions.length > 1
  const canDownloadPreview = Boolean(path || isUrlPreview)
  const showSelectAction = Boolean(onElementSelect && (path || isUrlPreview))
  const selectActionDisabled = !canSelectElements || (!path && !isUrlPreview)
  const hasSelectedElements = selectedElements.length > 0
  const selectActionActive = isSelectMode || hasSelectedElements
  const handleSelectAction = () => {
    if (selectActionDisabled) return
    if (selectActionActive) {
      clearSelectMode()
      onClearSelectedElements?.()
      return
    }
    toggleSelectMode()
  }
  const addressPlaceholder = t('toolcall.htmlPreview.urlPlaceholder')
  const handleAddressSubmit = () => {
    if (!isUrlPreview) return
    const nextUrl = normalizeUrlInput(addressInput)
    if (!nextUrl) return
    const normalizedNextUrl = normalizeComparableUrl(nextUrl)
    if (!normalizedNextUrl) return
    if (normalizedNextUrl === activeUrl) {
      setAddressInput(normalizedNextUrl)
      return
    }
    pendingHistoryActionRef.current = null
    setCommittedUrl(normalizedNextUrl)
    setAddressInput(normalizedNextUrl)
  }
  const handleAddressKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    handleAddressSubmit()
  }
  const canGoBack = navigationHistory.index > 0
  const canGoForward = navigationHistory.index >= 0 && navigationHistory.index < navigationHistory.entries.length - 1
  const handleNavigateBack = () => {
    if (!canGoBack) return
    const nextUrl = navigationHistory.entries[navigationHistory.index - 1] ?? null
    if (!nextUrl) return
    pendingHistoryActionRef.current = 'back'
    setCommittedUrl(nextUrl)
    setAddressInput(nextUrl)
  }
  const handleNavigateForward = () => {
    if (!canGoForward) return
    const nextUrl = navigationHistory.entries[navigationHistory.index + 1] ?? null
    if (!nextUrl) return
    pendingHistoryActionRef.current = 'forward'
    setCommittedUrl(nextUrl)
    setAddressInput(nextUrl)
  }
  const utilityActionButtons = (
    <>
      {canDownloadPreview ? (
        <PreviewIconButton title={t('toolcall.htmlPreview.download')} onClick={() => { void handleDownload() }}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="m8 10 4 4 4-4" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 18h14" />
          </svg>
        </PreviewIconButton>
      ) : null}

      {openTarget ? (
        <PreviewIconButton title={t('toolcall.htmlPreview.openInBrowser')} onClick={() => { void window.claude.openInBrowser(openTarget) }}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14 19 5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14v5h-5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10V5h5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 19l5-5" />
          </svg>
        </PreviewIconButton>
      ) : null}

      <PreviewIconButton title={isFullscreen ? t('toolcall.htmlPreview.exitFullscreen') : t('toolcall.htmlPreview.maximize')} onClick={toggleFullscreen}>
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          {isFullscreen ? (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15H5v4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h4V5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 19 5-5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 5-5 5" />
            </>
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H5v4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19h4v-4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 5 5 5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 19-5-5" />
            </>
          )}
        </svg>
      </PreviewIconButton>
    </>
  )

  const renderFrame = (fullscreen: boolean) => (
    <div className={`flex h-full min-h-0 min-w-0 flex-1 flex-col ${fullscreen ? 'bg-claude-panel' : 'overflow-hidden rounded-2xl border border-claude-border bg-claude-panel'}`}>
      {!isUrlPreview ? (
        <div className="flex h-10 items-center gap-2.5 border-b border-claude-border px-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-claude-text">{previewTitle}</div>
          </div>
          {utilityActionButtons}
        </div>
      ) : null}

      <div className="flex h-10 items-center gap-1.5 border-b border-claude-border bg-claude-panel px-3">
        <PreviewIconButton
          title={canGoBack ? t('toolcall.htmlPreview.back') : t('toolcall.htmlPreview.backUnavailable')}
          ariaDisabled={!canGoBack}
          onClick={handleNavigateBack}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
          </svg>
        </PreviewIconButton>

        <PreviewIconButton
          title={canGoForward ? t('toolcall.htmlPreview.forward') : t('toolcall.htmlPreview.forwardUnavailable')}
          ariaDisabled={!canGoForward}
          onClick={handleNavigateForward}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
          </svg>
        </PreviewIconButton>

        <PreviewIconButton title={t('toolcall.htmlPreview.refresh')} onClick={() => { void refreshPreview() }}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 3v6h-6" />
          </svg>
        </PreviewIconButton>

        {showSourceSelector ? (
          <div className="relative w-[170px] flex-shrink-0">
            <select
              aria-label={t('toolcall.htmlPreview.sourceSelector')}
              value={activeSourceId ?? sourceOptions[0]?.id ?? ''}
              onChange={(event) => onSourceChange?.(event.target.value)}
              className="h-8 w-full appearance-none rounded-xl border border-claude-border bg-claude-bg pl-3 pr-8 text-[11px] text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
            >
              {sourceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m7 10 5 5 5-5" />
            </svg>
          </div>
        ) : null}

        {isUrlPreview ? (
          <input
            value={addressInput}
            onChange={(event) => setAddressInput(event.target.value)}
            onKeyDown={handleAddressKeyDown}
            onBlur={handleAddressSubmit}
            placeholder={addressPlaceholder}
            title={t('toolcall.htmlPreview.urlInputHint')}
            className="min-w-0 flex-1 rounded-xl border border-claude-border bg-claude-bg px-3 py-1.5 text-[11px] text-claude-text outline-none transition-colors placeholder:text-claude-muted/70 focus:border-claude-border focus:ring-1 focus:ring-white/10"
          />
        ) : (
          <div className="min-w-0 flex-1 rounded-xl border border-claude-border bg-claude-bg px-3 py-1.5">
            <div className="truncate text-[11px] text-claude-muted">{addressLabel}</div>
          </div>
        )}

        {showSelectAction ? (
          <PreviewIconButton
            active={selectActionActive}
            activeTone="selection"
            ariaDisabled={selectActionDisabled}
            title={selectActionDisabled
              ? t('toolcall.htmlPreview.selectElementUnavailableHint')
              : selectActionActive
                ? t('toolcall.htmlPreview.clearSelectedElements')
                : t('toolcall.htmlPreview.selectElement')}
            onClick={handleSelectAction}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 4 12 8-5 1 2 5-2.5 1-2-5-3.5 3z" />
            </svg>
          </PreviewIconButton>
        ) : null}

        {isUrlPreview ? utilityActionButtons : null}
      </div>

      <div className="relative min-h-0 flex-1 bg-claude-bg">
        <iframe
          key={iframeRenderKey}
          ref={iframeRef}
          title={openTarget ? `${openTarget} preview` : 'html-preview'}
          {...(srcDoc ? { srcDoc } : iframeUrl ? { src: iframeUrl } : {})}
          sandbox={isUrlPreview ? 'allow-scripts allow-forms allow-modals allow-same-origin' : 'allow-scripts allow-forms allow-modals'}
          onLoad={handleIframeLoad}
          style={fullscreen ? undefined : { height: isUrlPreview ? '100%' : `${frameHeight}px` }}
          className={fullscreen ? 'block h-full w-full bg-white' : 'block w-full bg-white'}
        />

        {isUrlPreview && isFrameLoading ? (
          <div
            className="absolute inset-0 flex items-center justify-center px-6"
            style={{
              backgroundColor: 'rgb(var(--claude-bg))',
              backgroundImage: 'radial-gradient(circle, rgb(var(--claude-border) / 0.28) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-claude-border bg-claude-surface text-claude-muted">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="3.5" y="5" width="17" height="11" rx="2.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19h6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v3" />
                </svg>
              </div>
              <div className="text-sm font-medium text-claude-muted">{t('toolcall.htmlPreview.awaitingServer')}</div>
            </div>
          </div>
        ) : null}
      </div>

    </div>
  )

  return (
    <>
      {renderFrame(false)}

      {isFullscreen && typeof document !== 'undefined'
        ? createPortal(
          <div className="fixed inset-0 z-[200] bg-claude-bg/95 p-4 backdrop-blur-sm">
            {renderFrame(true)}
          </div>,
          document.body,
        )
        : null}
    </>
  )
}
