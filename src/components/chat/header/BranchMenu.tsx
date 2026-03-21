import type { MutableRefObject } from 'react'
import type { GitBranchInfo, GitRepoStatus } from '../../../../electron/preload'
import { useI18n } from '../../../hooks/useI18n'
import { IconTooltipButton } from '../git/GitShared'

type Props = {
  gitStatus: GitRepoStatus | null
  branchMenuRef: MutableRefObject<HTMLDivElement | null>
  branchSearchInputRef: MutableRefObject<HTMLInputElement | null>
  branchMenuOpen: boolean
  branchQuery: string
  filteredGitBranches: GitBranchInfo[]
  gitBranchesLoading: boolean
  gitActionLoading: boolean
  gitLoading: boolean
  onToggleBranchMenu: () => void
  onBranchQueryChange: (value: string) => void
  onSelectBranch: (name: string) => void | Promise<void>
  onDeleteBranch: (name: string) => void | Promise<void>
  onOpenBranchCreateModal: () => void
  onInitGitRepo: () => void | Promise<void>
  onPullGit: () => void | Promise<void>
  onPushGit: () => void | Promise<void>
}

export function BranchMenu({
  gitStatus,
  branchMenuRef,
  branchSearchInputRef,
  branchMenuOpen,
  branchQuery,
  filteredGitBranches,
  gitBranchesLoading,
  gitActionLoading,
  gitLoading,
  onToggleBranchMenu,
  onBranchQueryChange,
  onSelectBranch,
  onDeleteBranch,
  onOpenBranchCreateModal,
  onInitGitRepo,
  onPullGit,
  onPushGit,
}: Props) {
  const { t } = useI18n()
  if (gitStatus?.isRepo && gitStatus.branch) {
    return (
      <div ref={branchMenuRef} className="relative z-40 no-drag" data-no-drag="true">
        <button
          type="button"
          onClick={onToggleBranchMenu}
          className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-claude-border bg-claude-surface px-2 py-1 font-mono text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2"
          title={t('branch.select')}
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12-5a2 2 0 1 1 0 4 2 2 0 0 1 0-4M8 7h4a4 4 0 0 1 4 4M8 17h4a4 4 0 0 0 4-4" />
          </svg>
          <span className="min-w-0 truncate">{gitStatus.branch}</span>
          {gitStatus.behind > 0 && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />}
          {gitStatus.ahead > 0 && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />}
          <svg className={`h-3.5 w-3.5 flex-shrink-0 text-claude-muted transition-transform ${branchMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {branchMenuOpen && (
          <div className="absolute left-0 top-full z-50 mt-2 w-[268px] rounded-[10px] border border-claude-border bg-claude-panel p-2 shadow-2xl">
            <div className="flex items-center gap-1.5">
              <div className="relative min-w-0 flex-1">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m20 20-3.5-3.5" />
                </svg>
                <input
                  ref={branchSearchInputRef}
                  value={branchQuery}
                  onChange={(event) => onBranchQueryChange(event.target.value)}
                  placeholder={t('branch.searchPlaceholder')}
                  className="w-full rounded-xl border border-claude-border bg-claude-surface py-1.5 pl-9 pr-3 text-[11px] text-claude-text outline-none placeholder:text-claude-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconTooltipButton
                  type="button"
                  onClick={() => void onPullGit()}
                  disabled={gitActionLoading || gitLoading}
                  tooltip={gitStatus.behind > 0 ? `Pull(${gitStatus.behind})` : 'Pull'}
                  tooltipAlign="right"
                  className="flex h-6.5 w-6.5 items-center justify-center rounded-lg transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
                >
                  <svg className={`h-3.5 w-3.5 ${gitStatus.behind > 0 ? 'text-amber-400' : 'text-claude-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m7 11 5 5 5-5" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 20h14" />
                  </svg>
                </IconTooltipButton>
                <IconTooltipButton
                  type="button"
                  onClick={() => void onPushGit()}
                  disabled={gitActionLoading || gitLoading}
                  tooltip={gitStatus.ahead > 0 ? `Push(${gitStatus.ahead})` : 'Push'}
                  tooltipAlign="right"
                  className="flex h-6.5 w-6.5 items-center justify-center rounded-lg transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
                >
                  <svg className={`h-3.5 w-3.5 ${gitStatus.ahead > 0 ? 'text-blue-400' : 'text-claude-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V8" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m7 13 5-5 5 5" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h14" />
                  </svg>
                </IconTooltipButton>
              </div>
            </div>

            <div className="mt-2.5">
              <p className="px-2 text-[11px] font-semibold tracking-wide text-claude-muted">{t('branch.sectionTitle')}</p>
              <div className="mt-1.5 h-[144px] overflow-y-auto">
                {gitBranchesLoading ? (
                  <div className="flex items-center justify-center px-3 py-10 text-claude-muted">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                  </div>
                ) : filteredGitBranches.length === 0 ? (
                  <div className="px-3 py-8 text-sm text-claude-muted">
                    {branchQuery.trim() ? t('branch.noResults') : t('branch.none')}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredGitBranches.map((branch) => (
                      <div
                        key={branch.name}
                        className="flex items-start gap-1 rounded-xl px-1 py-0.5 transition-colors hover:bg-claude-surface"
                      >
                        <button
                          type="button"
                          onClick={() => void onSelectBranch(branch.name)}
                          disabled={gitActionLoading}
                          className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-1.5 py-1 text-left disabled:opacity-50"
                        >
                          <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12-5a2 2 0 1 1 0 4 2 2 0 0 1 0-4M8 7h4a4 4 0 0 1 4 4M8 17h4a4 4 0 0 0 4-4" />
                          </svg>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-medium leading-none text-claude-text">{branch.name}</p>
                            <p className="mt-1 text-[10px] text-claude-muted">
                              {branch.current
                                ? gitStatus.clean
                                  ? t('branch.uncommittedNoChanges')
                                  : t('branch.uncommittedFiles', { count: gitStatus.entries.length })
                                : t('branch.localBranch')}
                            </p>
                          </div>
                          {branch.current && (
                            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-claude-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        {!branch.current && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void onDeleteBranch(branch.name)
                            }}
                            disabled={gitActionLoading}
                            className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-50"
                            title={t('branch.delete')}
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4.75A1.75 1.75 0 0 1 9.75 3h4.5A1.75 1.75 0 0 1 16 4.75V6" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6l.9 12.15A2 2 0 0 0 9.39 20h5.22a2 2 0 0 0 1.99-1.85L17.5 6" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 10.5v5M14 10.5v5" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 border-t border-claude-border pt-2">
              <button
                type="button"
                onClick={onOpenBranchCreateModal}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12px] font-medium text-claude-text transition-colors hover:bg-claude-surface"
              >
                <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                </svg>
                {t('branch.createAndCheckout')}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (gitStatus?.gitAvailable === false) {
    return (
      <div
        className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-claude-border bg-claude-surface px-2 py-1 font-mono text-[11px] text-claude-muted opacity-65"
        title={t('branch.installGit')}
      >
        <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12-5a2 2 0 1 1 0 4 2 2 0 0 1 0-4M8 7h4a4 4 0 0 1 4 4M8 17h4a4 4 0 0 0 4-4" />
        </svg>
        <span className="min-w-0 truncate">Git</span>
      </div>
    )
  }

  if (gitStatus && !gitStatus.isRepo) {
    return (
      <button
        type="button"
        onClick={() => void onInitGitRepo()}
        disabled={gitActionLoading}
        className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-claude-border bg-claude-surface px-2 py-1 font-mono text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
        title={t('branch.initGit')}
      >
        <span className="min-w-0 truncate">Git init</span>
      </button>
    )
  }

  return null
}
