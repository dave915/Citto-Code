import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { Session } from '../../store/sessions'
import type { useFileExplorer } from '../../hooks/useFileExplorer'
import type { useGitPanel } from '../../hooks/useGitPanel'
import type { GitDraftAction } from '../../lib/gitUtils'
import type { HtmlPreviewElementSelection } from '../../lib/toolcalls/types'
import type { ChatViewRightPanel } from '../../hooks/useChatViewLayout'
import type { HtmlPreviewSource, PreviewElementSelectionPayload } from './chatViewUtils'
import { FilePanel } from './FilePanel'
import { GitPanel } from './GitPanel'
import { HtmlPreviewPanel } from './HtmlPreviewPanel'
import { SessionInfoPanel } from './SessionInfoPanel'

const SECTION_RESIZE_HANDLE_HEIGHT = 6
const SECTION_HEADER_HEIGHT = 40
const GIT_INTERNAL_RESIZE_HANDLE_TOTAL = 12
const GIT_MIN_LOG_PANEL_HEIGHT = 72
const GIT_MIN_STATUS_PANEL_HEIGHT = 64
const GIT_MIN_COMMIT_PANEL_HEIGHT = 84
const SECTION_DEFAULT_HEIGHTS: Record<ChatViewRightPanel, number> = {
  preview: 240,
  git: 320,
  files: 220,
  session: 220,
}
const SECTION_MIN_HEIGHTS: Record<ChatViewRightPanel, number> = {
  preview: 180,
  git: 280,
  files: 180,
  session: 180,
}

type Props = {
  visible: boolean
  openPanels: ChatViewRightPanel[]
  showPreviewPane: boolean
  showGitPreviewPane: boolean
  explorerWidth: number
  panelWidth: number
  session: Session
  userMessageCount: number
  assistantMessageCount: number
  promptHistoryCount: number
  contextUsagePercent: number
  exportingFormat: 'markdown' | 'json' | null
  copyingFormat: 'markdown' | 'json' | null
  exportStatus: string | null
  exportError: string | null
  stagedGitEntryCount: number
  fileExplorer: ReturnType<typeof useFileExplorer>
  gitPanel: ReturnType<typeof useGitPanel>
  activeHtmlPreviewSource: HtmlPreviewSource | null
  htmlPreviewSources: HtmlPreviewSource[]
  selectedHtmlPreviewSourceId: string | null
  hideHtmlPreview: boolean
  htmlPreviewIsStreaming: boolean
  onPreviewElementSelection: (payload: HtmlPreviewElementSelection) => void
  onSelectHtmlPreviewSource: (sourceId: string) => void
  onClearSelectedPreviewElements: () => void
  selectedPreviewElements: PreviewElementSelectionPayload[]
  hoveredPreviewSelectionKey: string | null
  onCreateDraft: (
    action: GitDraftAction,
    payload: {
      entry: ReturnType<typeof useGitPanel>['selectedGitEntry']
      commit: ReturnType<typeof useGitPanel>['selectedGitCommit']
      gitDiff: ReturnType<typeof useGitPanel>['gitDiff']
    },
  ) => void
  onExplorerResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onGitLogResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onGitCommitResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  gitLogPanelHeight: number
  gitCommitPanelHeight: number
  onCompact: () => void
  onExportSession: (format: 'markdown' | 'json') => void | Promise<void>
  onCopySessionExport: (format: 'markdown' | 'json') => void | Promise<void>
}

function SectionChrome({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-claude-border bg-claude-panel">
      <div className="flex h-10 items-center justify-between border-b border-claude-border px-3">
        <p className="truncate text-[12px] font-medium text-claude-text">{title}</p>
        {action ? <div className="flex items-center gap-1">{action}</div> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  )
}

function SectionActionButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-claude-border bg-claude-surface text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
      title={title}
    >
      {children}
    </button>
  )
}

export function ChatSidePanel({
  visible,
  openPanels,
  showPreviewPane,
  showGitPreviewPane,
  explorerWidth,
  panelWidth,
  session,
  userMessageCount,
  assistantMessageCount,
  promptHistoryCount,
  contextUsagePercent,
  exportingFormat,
  copyingFormat,
  exportStatus,
  exportError,
  stagedGitEntryCount,
  fileExplorer,
  gitPanel,
  activeHtmlPreviewSource,
  htmlPreviewSources,
  selectedHtmlPreviewSourceId,
  hideHtmlPreview,
  htmlPreviewIsStreaming,
  onPreviewElementSelection,
  onSelectHtmlPreviewSource,
  onClearSelectedPreviewElements,
  selectedPreviewElements,
  hoveredPreviewSelectionKey,
  onCreateDraft,
  onExplorerResizeStart,
  onGitLogResizeStart,
  onGitCommitResizeStart,
  gitLogPanelHeight,
  gitCommitPanelHeight,
  onCompact,
  onExportSession,
  onCopySessionExport,
}: Props) {
  const { t } = useI18n()
  const asideRef = useRef<HTMLElement | null>(null)
  const sectionRefs = useRef<Partial<Record<ChatViewRightPanel, HTMLDivElement | null>>>({})
  const [sectionHeights, setSectionHeights] = useState<Partial<Record<ChatViewRightPanel, number>>>({})
  const [sectionViewportHeights, setSectionViewportHeights] = useState<Partial<Record<ChatViewRightPanel, number>>>({})

  useEffect(() => {
    setSectionHeights((current) => {
      let changed = false
      const next = { ...current }

      for (const panel of openPanels) {
        if (typeof next[panel] === 'number') continue
        next[panel] = SECTION_DEFAULT_HEIGHTS[panel]
        changed = true
      }

      const asideHeight = asideRef.current?.clientHeight ?? 0
      if (asideHeight > 0 && openPanels.length > 1) {
        const lastPanel = openPanels[openPanels.length - 1]
        const fixedPanels = openPanels.slice(0, -1)
        const reservedHandles = fixedPanels.length * SECTION_RESIZE_HANDLE_HEIGHT
        const maxFixedHeightBudget = Math.max(
          0,
          asideHeight - reservedHandles - SECTION_MIN_HEIGHTS[lastPanel],
        )
        const totalFixedHeight = fixedPanels.reduce(
          (sum, panel) => sum + (next[panel] ?? SECTION_DEFAULT_HEIGHTS[panel]),
          0,
        )

        if (totalFixedHeight > maxFixedHeightBudget) {
          const overflow = totalFixedHeight - maxFixedHeightBudget
          const totalReducibleHeight = fixedPanels.reduce(
            (sum, panel) => sum + Math.max(0, (next[panel] ?? SECTION_DEFAULT_HEIGHTS[panel]) - SECTION_MIN_HEIGHTS[panel]),
            0,
          )

          if (totalReducibleHeight > 0) {
            let remainingOverflow = overflow
            fixedPanels.forEach((panel, index) => {
              const currentHeight = next[panel] ?? SECTION_DEFAULT_HEIGHTS[panel]
              const reducibleHeight = Math.max(0, currentHeight - SECTION_MIN_HEIGHTS[panel])
              if (reducibleHeight === 0) return

              const ratio = reducibleHeight / totalReducibleHeight
              const reduction = index === fixedPanels.length - 1
                ? remainingOverflow
                : Math.min(reducibleHeight, Math.round(overflow * ratio))

              next[panel] = currentHeight - reduction
              remainingOverflow = Math.max(0, remainingOverflow - reduction)
            })
            changed = true
          }
        }
      }

      return changed ? next : current
    })
  }, [openPanels])

  useEffect(() => {
    const syncSectionViewportHeights = () => {
      setSectionViewportHeights((current) => {
        let changed = false
        const next: Partial<Record<ChatViewRightPanel, number>> = {}

        for (const panel of openPanels) {
          const node = sectionRefs.current[panel]
          const height = node?.clientHeight ?? 0
          next[panel] = height

          if (current[panel] !== height) {
            changed = true
          }
        }

        if (!changed && Object.keys(current).length === Object.keys(next).length) {
          return current
        }

        return next
      })
    }

    syncSectionViewportHeights()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncSectionViewportHeights)
      return () => window.removeEventListener('resize', syncSectionViewportHeights)
    }

    const observer = new ResizeObserver(() => {
      syncSectionViewportHeights()
    })

    openPanels.forEach((panel) => {
      const node = sectionRefs.current[panel]
      if (node) {
        observer.observe(node)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [openPanels])

  const handleSectionResizeStart = useCallback((
    panel: ChatViewRightPanel,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return
    const lastPanel = openPanels[openPanels.length - 1]
    if (!lastPanel || panel === lastPanel) return

    const startY = event.clientY
    const startHeight = sectionHeights[panel] ?? SECTION_DEFAULT_HEIGHTS[panel]
    const minimumHeight = SECTION_MIN_HEIGHTS[panel]
    const asideHeight = asideRef.current?.clientHeight ?? 0
    const reservedHandles = Math.max(0, openPanels.length - 1) * SECTION_RESIZE_HANDLE_HEIGHT
    const otherFixedHeights = openPanels
      .slice(0, -1)
      .filter((entry) => entry !== panel)
      .reduce((sum, entry) => sum + (sectionHeights[entry] ?? SECTION_DEFAULT_HEIGHTS[entry]), 0)
    const maximumHeight = Math.max(
      minimumHeight,
      asideHeight - reservedHandles - otherFixedHeights - SECTION_MIN_HEIGHTS[lastPanel],
    )

    const target = event.currentTarget
    const pointerId = event.pointerId
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    const cleanup = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
      window.removeEventListener('blur', cleanup)
      target.removeEventListener('lostpointercapture', cleanup)

      try {
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId)
        }
      } catch {
        // Ignore stale pointer capture cleanup.
      }
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const nextHeight = Math.min(
        maximumHeight,
        Math.max(minimumHeight, startHeight + (moveEvent.clientY - startY)),
      )
      setSectionHeights((current) => ({ ...current, [panel]: nextHeight }))
    }

    const handlePointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return
      cleanup()
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    try {
      target.setPointerCapture(pointerId)
    } catch {
      // Ignore pointer capture failures.
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    window.addEventListener('blur', cleanup)
    target.addEventListener('lostpointercapture', cleanup)
    event.preventDefault()
  }, [openPanels, sectionHeights])

  const getGitPanelHeights = useCallback((sectionHeight: number | undefined) => {
    if (!sectionHeight || Number.isNaN(sectionHeight)) {
      return {
        logHeight: gitLogPanelHeight,
        commitHeight: gitCommitPanelHeight,
      }
    }

    const availableContentHeight = Math.max(0, sectionHeight - SECTION_HEADER_HEIGHT)
    const maxResizableHeight = Math.max(
      0,
      availableContentHeight - GIT_INTERNAL_RESIZE_HANDLE_TOTAL - GIT_MIN_STATUS_PANEL_HEIGHT,
    )
    const minimumResizableHeight = GIT_MIN_LOG_PANEL_HEIGHT + GIT_MIN_COMMIT_PANEL_HEIGHT

    if (maxResizableHeight <= minimumResizableHeight) {
      return {
        logHeight: GIT_MIN_LOG_PANEL_HEIGHT,
        commitHeight: GIT_MIN_COMMIT_PANEL_HEIGHT,
      }
    }

    let nextLogHeight = Math.min(gitLogPanelHeight, maxResizableHeight - GIT_MIN_COMMIT_PANEL_HEIGHT)
    let nextCommitHeight = Math.min(gitCommitPanelHeight, maxResizableHeight - GIT_MIN_LOG_PANEL_HEIGHT)

    if (nextLogHeight + nextCommitHeight > maxResizableHeight) {
      const overflow = nextLogHeight + nextCommitHeight - maxResizableHeight
      const logReducible = Math.max(0, nextLogHeight - GIT_MIN_LOG_PANEL_HEIGHT)
      const commitReducible = Math.max(0, nextCommitHeight - GIT_MIN_COMMIT_PANEL_HEIGHT)
      const totalReducible = logReducible + commitReducible

      if (totalReducible > 0) {
        const logReduction = Math.min(
          logReducible,
          Math.round(overflow * (logReducible / totalReducible)),
        )
        nextLogHeight -= logReduction
        nextCommitHeight -= overflow - logReduction
      }
    }

    nextLogHeight = Math.max(GIT_MIN_LOG_PANEL_HEIGHT, nextLogHeight)
    nextCommitHeight = Math.max(GIT_MIN_COMMIT_PANEL_HEIGHT, nextCommitHeight)

    if (nextLogHeight + nextCommitHeight > maxResizableHeight) {
      nextCommitHeight = Math.max(
        GIT_MIN_COMMIT_PANEL_HEIGHT,
        maxResizableHeight - nextLogHeight,
      )
    }

    if (nextLogHeight + nextCommitHeight > maxResizableHeight) {
      nextLogHeight = Math.max(
        GIT_MIN_LOG_PANEL_HEIGHT,
        maxResizableHeight - nextCommitHeight,
      )
    }

    return {
      logHeight: nextLogHeight,
      commitHeight: nextCommitHeight,
    }
  }, [gitCommitPanelHeight, gitLogPanelHeight])

  const renderSection = (panel: ChatViewRightPanel, isLast: boolean) => {
    const refreshIcon = (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 3v6h-6" />
      </svg>
    )
    const title = panel === 'preview'
      ? t('common.preview')
      : panel === 'git'
        ? t('sidePanel.diff')
        : panel === 'files'
          ? t('sidePanel.fileExplorer')
          : t('sidePanel.sessionInfo')
    const wrapperHeight = sectionHeights[panel] ?? SECTION_DEFAULT_HEIGHTS[panel]
    const wrapperStyle = isLast
      ? { minHeight: `${SECTION_MIN_HEIGHTS[panel]}px` }
      : { height: `${wrapperHeight}px` }
    const action = panel === 'files'
      ? (
          <SectionActionButton
            title={t('sidePanel.refreshFileExplorer')}
            onClick={() => { void fileExplorer.refreshExplorer(false) }}
          >
            {refreshIcon}
          </SectionActionButton>
        )
      : panel === 'git'
        ? (
            <SectionActionButton
              title={t('sidePanel.refreshGit')}
              onClick={() => { void gitPanel.refreshGitPanel() }}
            >
              {refreshIcon}
            </SectionActionButton>
          )
        : undefined

    const content = panel === 'files'
      ? (
          <FilePanel
            showPreviewPane={showPreviewPane}
            selectedEntry={fileExplorer.selectedEntry}
            previewContent={fileExplorer.previewContent}
            previewState={fileExplorer.previewState}
            markdownPreviewEnabled={fileExplorer.markdownPreviewEnabled}
            onToggleMarkdownPreview={() => fileExplorer.setMarkdownPreviewEnabled((value) => !value)}
            onExplorerResizeStart={onExplorerResizeStart}
            explorerWidth={explorerWidth}
            loadingPaths={fileExplorer.loadingPaths}
            rootEntries={fileExplorer.rootEntries}
            expandedDirs={fileExplorer.expandedDirs}
            childEntries={fileExplorer.childEntries}
            selectedPath={fileExplorer.selectedEntry?.path ?? null}
            onToggleDirectory={fileExplorer.toggleDirectory}
            onSelectEntry={fileExplorer.handleSelectEntry}
          />
        )
      : panel === 'preview'
        ? (
            <div className="h-full min-h-0 bg-claude-panel p-3">
              <HtmlPreviewPanel
                activeSource={activeHtmlPreviewSource}
                sources={htmlPreviewSources}
                selectedSourceId={selectedHtmlPreviewSourceId}
                sessionCwd={session.cwd ?? null}
                hideHtmlPreview={hideHtmlPreview}
                isStreaming={htmlPreviewIsStreaming}
                onPreviewElementSelection={onPreviewElementSelection}
                onSelectSource={onSelectHtmlPreviewSource}
                onClearSelectedElements={onClearSelectedPreviewElements}
                selectedElements={selectedPreviewElements}
                hoveredSelectionKey={hoveredPreviewSelectionKey}
              />
            </div>
          )
      : panel === 'git'
        ? (
            (() => {
              const { logHeight, commitHeight } = getGitPanelHeights(
                sectionViewportHeights[panel] ?? wrapperHeight,
              )

              return (
              <GitPanel
                sessionCwd={session.cwd || '~'}
                gitStatus={gitPanel.gitStatus}
                showGitPreviewPane={showGitPreviewPane}
                selectedGitEntry={gitPanel.selectedGitEntry}
                selectedGitCommit={gitPanel.selectedGitCommit}
                gitDiff={gitPanel.gitDiff}
                gitDiffLoading={gitPanel.gitDiffLoading}
                onCreateDraft={onCreateDraft}
                onExplorerResizeStart={onExplorerResizeStart}
                explorerWidth={explorerWidth}
                gitSidebarRef={gitPanel.gitSidebarRef}
                gitLogPanelHeight={logHeight}
                gitCommitPanelHeight={commitHeight}
                gitLog={gitPanel.gitLog}
                gitLogLoading={gitPanel.gitLogLoading}
                gitActionLoading={gitPanel.gitActionLoading}
                gitLoading={gitPanel.gitLoading}
                onSelectGitCommit={gitPanel.handleSelectGitCommit}
                onPullGit={gitPanel.handlePullGit}
                onPushGit={gitPanel.handlePushGit}
                onGitLogResizeStart={onGitLogResizeStart}
                onSelectGitEntry={gitPanel.handleSelectGitEntry}
                onToggleGitStage={gitPanel.handleToggleGitStage}
                onRestoreGitEntry={gitPanel.handleRestoreGitEntry}
                onRestoreGitEntries={gitPanel.handleRestoreGitEntries}
                onStageGitEntries={gitPanel.handleStageGitEntries}
                onUnstageGitEntries={gitPanel.handleUnstageGitEntries}
                onGitCommitResizeStart={onGitCommitResizeStart}
                stagedGitEntryCount={stagedGitEntryCount}
                gitCommitMessage={gitPanel.gitCommitMessage}
                onGitCommitMessageChange={gitPanel.setGitCommitMessage}
                gitCommitTextareaRef={gitPanel.gitCommitTextareaRef}
                onCommitGit={gitPanel.handleCommitGit}
              />
              )
            })()
            )
          : (
              <SessionInfoPanel
                session={session}
                userMessageCount={userMessageCount}
                assistantMessageCount={assistantMessageCount}
                promptHistoryCount={promptHistoryCount}
                contextUsagePercent={contextUsagePercent}
                onCompact={onCompact}
                exportingFormat={exportingFormat}
                copyingFormat={copyingFormat}
                exportStatus={exportStatus}
                exportError={exportError}
                onExportSession={onExportSession}
                onCopySessionExport={onCopySessionExport}
              />
            )

    return (
      <div
        key={panel}
        ref={(node) => {
          sectionRefs.current[panel] = node
        }}
        className={`flex min-h-0 flex-col ${isLast ? 'flex-1' : 'shrink-0'}`}
        style={wrapperStyle}
      >
        <SectionChrome title={title} action={action}>
          {content}
        </SectionChrome>

        {!isLast ? (
          <div
            onPointerDown={(event) => handleSectionResizeStart(panel, event)}
            className="h-1.5 shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-claude-border/80"
          />
        ) : null}
      </div>
    )
  }

  if (!visible) return null

  return (
    <aside
      ref={asideRef}
      onMouseDown={gitPanel.handleGitPanelPointerDown}
      className="flex min-w-0 flex-shrink-0 flex-col border-l border-claude-border bg-claude-panel p-3"
      style={{ width: `${panelWidth}px`, maxWidth: '85vw' }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {openPanels.map((panel, index) => renderSection(panel, index === openPanels.length - 1))}
      </div>
    </aside>
  )
}
