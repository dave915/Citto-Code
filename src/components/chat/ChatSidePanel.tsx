import type { MouseEvent as ReactMouseEvent } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { Session } from '../../store/sessions'
import type { useFileExplorer } from '../../hooks/useFileExplorer'
import type { useGitPanel } from '../../hooks/useGitPanel'
import type { GitDraftAction } from '../../lib/gitUtils'
import { FilePanel } from './FilePanel'
import { GitPanel } from './GitPanel'
import { SessionInfoPanel } from './SessionInfoPanel'

type Props = {
  visible: boolean
  title: string
  filePanelOpen: boolean
  gitPanelOpen: boolean
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
  onCreateDraft: (
    action: GitDraftAction,
    payload: {
      entry: ReturnType<typeof useGitPanel>['selectedGitEntry']
      commit: ReturnType<typeof useGitPanel>['selectedGitCommit']
      gitDiff: ReturnType<typeof useGitPanel>['gitDiff']
    },
  ) => void
  onExplorerResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void
  onGitLogResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void
  onGitCommitResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void
  gitLogPanelHeight: number
  gitCommitPanelHeight: number
  onCompact: () => void
  onExportSession: (format: 'markdown' | 'json') => void | Promise<void>
  onCopySessionExport: (format: 'markdown' | 'json') => void | Promise<void>
}

export function ChatSidePanel({
  visible,
  title,
  filePanelOpen,
  gitPanelOpen,
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
  if (!visible) return null

  return (
    <aside
      onMouseDown={gitPanel.handleGitPanelPointerDown}
      className="flex min-w-0 flex-shrink-0 flex-col border-l border-claude-border bg-claude-panel"
      style={{ width: `${panelWidth}px`, maxWidth: '85vw' }}
    >
      <div className="flex h-12 items-center justify-between border-b border-claude-border px-4">
        <p className="text-sm font-semibold text-claude-text">{title}</p>
        {(filePanelOpen || gitPanelOpen) && (
          <button
            onClick={() => void (filePanelOpen ? fileExplorer.refreshExplorer(false) : gitPanel.refreshGitPanel())}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title={filePanelOpen ? t('sidePanel.refreshFileExplorer') : t('sidePanel.refreshGit')}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 3v6h-6" />
            </svg>
          </button>
        )}
      </div>

      {filePanelOpen ? (
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
      ) : gitPanelOpen ? (
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
          gitLogPanelHeight={gitLogPanelHeight}
          gitCommitPanelHeight={gitCommitPanelHeight}
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
      ) : (
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
      )}
    </aside>
  )
}
