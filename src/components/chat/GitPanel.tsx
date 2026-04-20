import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react'

import type { GitDiffResult, GitLogEntry, GitRepoStatus, GitStatusEntry } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import type { GitDraftAction } from '../../lib/gitUtils'
import { AppButton, appFieldClassName } from '../ui/appDesignSystem'
import { GitDiffPanel, GitLogPanel, GitStatusPanel } from './GitPanels'

export function GitPanel({
  sessionCwd,
  gitStatus,
  showGitPreviewPane,
  selectedGitEntry,
  selectedGitCommit,
  gitDiff,
  gitDiffLoading,
  onCreateDraft,
  onExplorerResizeStart,
  explorerWidth,
  gitSidebarRef,
  gitLogPanelHeight,
  gitCommitPanelHeight,
  gitLog,
  gitLogLoading,
  gitActionLoading,
  gitLoading,
  onSelectGitCommit,
  onPullGit,
  onPushGit,
  onGitLogResizeStart,
  onSelectGitEntry,
  onToggleGitStage,
  onRestoreGitEntry,
  onRestoreGitEntries,
  onStageGitEntries,
  onUnstageGitEntries,
  onGitCommitResizeStart,
  stagedGitEntryCount,
  gitCommitMessage,
  onGitCommitMessageChange,
  gitCommitTextareaRef,
  onCommitGit,
}: {
  sessionCwd: string
  gitStatus: GitRepoStatus | null
  showGitPreviewPane: boolean
  selectedGitEntry: GitStatusEntry | null
  selectedGitCommit: GitLogEntry | null
  gitDiff: GitDiffResult | null
  gitDiffLoading: boolean
  onCreateDraft: (
    action: GitDraftAction,
    payload: {
      entry: GitStatusEntry | null
      commit: GitLogEntry | null
      gitDiff: GitDiffResult | null
    },
  ) => void
  onExplorerResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  explorerWidth: number
  gitSidebarRef: MutableRefObject<HTMLDivElement | null>
  gitLogPanelHeight: number
  gitCommitPanelHeight: number
  gitLog: GitLogEntry[]
  gitLogLoading: boolean
  gitActionLoading: boolean
  gitLoading: boolean
  onSelectGitCommit: (entry: GitLogEntry) => void | Promise<void>
  onPullGit: () => void | Promise<void>
  onPushGit: () => void | Promise<void>
  onGitLogResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onSelectGitEntry: (entry: GitStatusEntry) => void | Promise<void>
  onToggleGitStage: (entry: GitStatusEntry, staged?: boolean) => void | Promise<void>
  onRestoreGitEntry: (entry: GitStatusEntry) => void | Promise<void>
  onRestoreGitEntries: (entries: GitStatusEntry[]) => void | Promise<void>
  onStageGitEntries: (entries: GitStatusEntry[]) => void | Promise<void>
  onUnstageGitEntries: (entries: GitStatusEntry[]) => void | Promise<void>
  onGitCommitResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  stagedGitEntryCount: number
  gitCommitMessage: string
  onGitCommitMessageChange: (value: string) => void
  gitCommitTextareaRef: MutableRefObject<HTMLTextAreaElement | null>
  onCommitGit: () => void | Promise<void>
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {showGitPreviewPane && (
          <>
            <div className="min-w-0 flex-1 overflow-y-auto bg-claude-bg">
              <GitDiffPanel
                cwd={gitStatus?.rootPath ?? sessionCwd}
                entry={selectedGitEntry}
                commit={selectedGitCommit}
                gitDiff={gitDiff}
                loading={gitDiffLoading}
                onCreateDraft={onCreateDraft}
              />
            </div>

            <div
              onPointerDown={onExplorerResizeStart}
              className="w-1.5 cursor-col-resize bg-transparent hover:bg-claude-border/80 transition-colors flex-shrink-0"
            />
          </>
        )}

        <div
          ref={gitSidebarRef}
          className={`min-w-0 flex h-full min-h-0 flex-col ${showGitPreviewPane ? 'border-l border-claude-border bg-claude-panel' : 'flex-1 bg-claude-panel'}`}
          style={showGitPreviewPane ? { width: `${explorerWidth}px` } : undefined}
        >
          {gitStatus?.isRepo ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 shrink-0 px-3 pt-3" style={{ height: `${gitLogPanelHeight}px` }}>
                <GitLogPanel
                  status={gitStatus}
                  gitLog={gitLog}
                  loading={gitLogLoading}
                  actionLoading={gitActionLoading || gitLoading}
                  selectedCommitHash={selectedGitCommit?.hash ?? null}
                  onSelectCommit={onSelectGitCommit}
                  onPull={onPullGit}
                  onPush={onPushGit}
                />
              </div>

              <div
                onPointerDown={onGitLogResizeStart}
                data-git-resize="true"
                className="h-1.5 shrink-0 cursor-row-resize bg-transparent hover:bg-claude-border/80 transition-colors"
              />

              <div className="min-h-0 flex-1 overflow-y-auto border-t border-claude-border px-2 py-3">
                <GitStatusPanel
                  status={gitStatus}
                  loading={gitLoading}
                  selectedPath={selectedGitEntry?.path ?? null}
                  actionLoading={gitActionLoading}
                  onSelectEntry={onSelectGitEntry}
                  onToggleStage={onToggleGitStage}
                  onRestoreEntry={onRestoreGitEntry}
                  onRestoreEntries={onRestoreGitEntries}
                  onStageEntries={onStageGitEntries}
                  onUnstageEntries={onUnstageGitEntries}
                />
              </div>

              <div
                onPointerDown={onGitCommitResizeStart}
                data-git-resize="true"
                className="h-1.5 shrink-0 cursor-row-resize bg-transparent hover:bg-claude-border/80 transition-colors"
              />

              <div
                className="shrink-0 border-t border-claude-border bg-claude-panel px-3 py-3"
                style={{ height: `${gitCommitPanelHeight}px` }}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-claude-muted">
                      <span>{t('git.panel.staged')}</span>
                      <span className="inline-flex h-[17px] min-w-[20px] items-center justify-center rounded-full border border-claude-border/70 bg-claude-surface px-1.5 text-[10px] font-semibold leading-none text-claude-text">
                        {stagedGitEntryCount}
                      </span>
                    </div>
                    {stagedGitEntryCount === 0 && (
                      <span className="text-[11px] text-claude-muted">
                        {t('git.panel.stageBeforeCommit')}
                      </span>
                    )}
                  </div>

                  <div className="flex min-h-0 flex-1 items-end gap-2">
                    <textarea
                      ref={gitCommitTextareaRef}
                      value={gitCommitMessage}
                      onChange={(event) => onGitCommitMessageChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          void onCommitGit()
                        }
                      }}
                      rows={1}
                      disabled={gitActionLoading || stagedGitEntryCount === 0}
                      placeholder={
                        stagedGitEntryCount > 0
                          ? t('git.panel.enterCommitMessage')
                          : t('git.panel.noStagedFiles')
                      }
                      className={`${appFieldClassName} max-h-40 min-h-[36px] flex-1 resize-none overflow-hidden bg-claude-surface text-[12px] disabled:cursor-not-allowed disabled:opacity-60`}
                    />
                    <AppButton
                      onClick={() => void onCommitGit()}
                      disabled={gitActionLoading || stagedGitEntryCount === 0 || gitCommitMessage.trim().length === 0}
                      title={t('git.panel.commit')}
                      size="icon"
                      className="h-9 w-9 bg-claude-surface"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M1.75 8h3.1m6.3 0h3.1" />
                        <circle cx="8" cy="8" r="3.15" />
                      </svg>
                    </AppButton>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
              <GitStatusPanel
                status={gitStatus}
                loading={gitLoading}
                selectedPath={selectedGitEntry?.path ?? null}
                actionLoading={gitActionLoading}
                onSelectEntry={onSelectGitEntry}
                onToggleStage={onToggleGitStage}
                onRestoreEntry={onRestoreGitEntry}
                onRestoreEntries={onRestoreGitEntries}
                onStageEntries={onStageGitEntries}
                onUnstageEntries={onUnstageGitEntries}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
