import { useState } from 'react'

import type { GitRepoStatus, GitStatusEntry } from '../../../../electron/preload'
import { useI18n } from '../../../hooks/useI18n'
import {
  formatGitChangeCount,
  formatGitDeletionCount,
  getGitEntryCounts,
  getGitEntryStatusDotClass,
  getGitStageActionLabelForFilter,
  shouldStageGitEntryForFilter,
} from '../../../lib/gitUtils'
import { IconTooltipButton } from './GitShared'

type GitStatusFilter = 'unstaged' | 'staged' | 'all'

export function GitStatusPanel({
  status,
  loading,
  selectedPath,
  actionLoading,
  onSelectEntry,
  onToggleStage,
  onRestoreEntry,
  onRestoreEntries,
  onStageEntries,
  onUnstageEntries,
}: {
  status: GitRepoStatus | null
  loading: boolean
  selectedPath: string | null
  actionLoading: boolean
  onSelectEntry: (entry: GitStatusEntry) => void
  onToggleStage: (entry: GitStatusEntry, staged?: boolean) => void
  onRestoreEntry: (entry: GitStatusEntry) => void
  onRestoreEntries: (entries: GitStatusEntry[]) => void
  onStageEntries: (entries: GitStatusEntry[]) => void
  onUnstageEntries: (entries: GitStatusEntry[]) => void
}) {
  const { language, t } = useI18n()
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState<GitStatusFilter>('unstaged')

  if (loading && !status) {
    return (
      <div className="flex h-full items-center justify-center text-claude-muted">
        <p className="text-sm">{t('git.statusPanel.loading')}</p>
      </div>
    )
  }

  if (!status?.isRepo) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center">
        <div>
          <p className="text-sm font-medium text-claude-text">{t('git.statusPanel.notRepo')}</p>
          <p className="mt-2 text-xs leading-6 text-claude-muted">{t('git.statusPanel.notRepoDescription')}</p>
        </div>
      </div>
    )
  }

  const unstagedEntries = status.entries.filter((entry) => entry.unstaged || entry.untracked || !entry.staged)
  const stagedEntries = status.entries.filter((entry) => entry.staged)
  const allEntries = status.entries

  const filteredEntries = filter === 'staged'
    ? stagedEntries
    : filter === 'all'
      ? allEntries
      : unstagedEntries

  const currentFilterLabel = filter === 'staged'
    ? t('git.statusPanel.filter.staged')
    : filter === 'all'
      ? t('git.statusPanel.filter.all')
      : t('git.statusPanel.filter.unstaged')
  const currentFilterCount = filteredEntries.length
  const showRestoreAll = filter === 'unstaged' || filter === 'staged' || filter === 'all'
  const showStageAll = filter === 'unstaged'
  const showUnstageAll = filter === 'staged'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-claude-text transition-colors ${
              filterOpen ? 'bg-claude-surface hover:bg-claude-surface-2' : 'bg-transparent hover:bg-claude-surface/60'
            }`}
          >
            <span>{currentFilterLabel}</span>
            <span className="inline-flex h-[17px] min-w-[20px] items-center justify-center rounded-full border border-claude-border/70 bg-claude-panel px-1.5 text-[11px] font-semibold leading-none text-claude-text">
              {currentFilterCount}
            </span>
            <svg className={`h-3.5 w-3.5 text-claude-muted transition-transform ${filterOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {filterOpen && (
            <div className="absolute left-0 top-full z-10 mt-2 w-[238px] rounded-md border border-claude-border bg-claude-panel p-1.5 shadow-none">
              {[
                { key: 'unstaged' as const, label: t('git.statusPanel.filter.unstaged'), count: unstagedEntries.length },
                { key: 'staged' as const, label: t('git.statusPanel.filter.staged'), count: stagedEntries.length },
                { key: 'all' as const, label: t('git.statusPanel.filter.all'), count: allEntries.length },
              ].map((option) => {
                const active = filter === option.key

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setFilter(option.key)
                      setFilterOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                      active ? 'bg-claude-surface text-claude-text' : 'text-claude-text hover:bg-claude-surface'
                    }`}
                  >
                    <span className="text-[12px] font-medium">{option.label}</span>
                    <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full border border-claude-border/70 bg-claude-panel px-1.5 text-[10px] leading-none text-claude-muted">
                      {option.count}
                    </span>
                    {active && (
                      <svg className="ml-auto h-3.5 w-3.5 text-claude-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4 10-10" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {(showRestoreAll || showStageAll || showUnstageAll) && (
          <div className="flex shrink-0 items-center gap-1">
            {showRestoreAll && (
              <IconTooltipButton
                type="button"
                onClick={() => void onRestoreEntries(filteredEntries)}
                disabled={actionLoading || filteredEntries.length === 0}
                tooltip={t('git.statusPanel.restoreAll')}
                tooltipAlign="right"
                tooltipSide="bottom"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-transparent text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 10H5V6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10a7 7 0 1 1 2.05 4.95" />
                </svg>
              </IconTooltipButton>
            )}
            {showStageAll && (
              <IconTooltipButton
                type="button"
                onClick={() => void onStageEntries(filteredEntries)}
                disabled={actionLoading || filteredEntries.length === 0}
                tooltip={t('git.statusPanel.stageAll')}
                tooltipAlign="right"
                tooltipSide="bottom"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-transparent text-[14px] font-semibold text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                +
              </IconTooltipButton>
            )}
            {showUnstageAll && (
              <IconTooltipButton
                type="button"
                onClick={() => void onUnstageEntries(filteredEntries)}
                disabled={actionLoading || filteredEntries.length === 0}
                tooltip={t('git.statusPanel.unstageAll')}
                tooltipAlign="right"
                tooltipSide="bottom"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-transparent text-[14px] font-semibold text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                -
              </IconTooltipButton>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4 text-claude-muted">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
        </div>
      )}

      {!loading && status.clean && (
        <div className="rounded-md border border-claude-border bg-claude-panel/65 px-3 py-5 text-center text-[13px] text-claude-muted">
          {t('git.statusPanel.clean')}
        </div>
      )}

      {!loading && !status.clean && (
        <div className="space-y-1">
          {filteredEntries.length === 0 && (
            <div className="rounded-md border border-claude-border bg-claude-panel/65 px-3 py-4 text-center text-[12px] text-claude-muted">
              {t('git.statusPanel.noFiles')}
            </div>
          )}
          {filteredEntries.map((entry) => {
            const isSelected = selectedPath === entry.path
            const counts = getGitEntryCounts(entry, filter)
            const statusDotClass = getGitEntryStatusDotClass(entry)
            const stageActionLabel = getGitStageActionLabelForFilter(entry, filter, language)
            const shouldStageAction = shouldStageGitEntryForFilter(entry, filter)

            return (
              <div
                key={`${entry.path}:${entry.statusCode}`}
                className="group relative"
              >
                <button
                  type="button"
                  onClick={() => void onSelectEntry(entry)}
                  className={`w-full rounded-md border px-2.5 py-1.5 pr-[142px] text-left transition-colors ${
                    isSelected
                      ? 'border-claude-border bg-claude-surface-2 text-claude-text'
                      : 'border-transparent bg-claude-panel text-claude-text hover:border-claude-border hover:bg-claude-surface'
                  }`}
                  title={entry.path}
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex flex-1 items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-claude-text">{entry.relativePath}</p>
                      <span className="flex-shrink-0 font-mono text-[11px] font-semibold text-emerald-400">{formatGitChangeCount(counts.additions)}</span>
                      <span className="flex-shrink-0 font-mono text-[11px] font-semibold text-red-400">{formatGitDeletionCount(counts.deletions)}</span>
                      {statusDotClass && <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDotClass}`} />}
                    </div>
                  </div>
                  {entry.originalPath && (
                    <p className="mt-1 truncate text-[11px] text-[rgb(var(--claude-text)/0.72)]">{t('git.diff.previous')} {entry.originalPath}</p>
                  )}
                </button>

                <div className="pointer-events-none absolute inset-y-0 right-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <IconTooltipButton
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void onRestoreEntry(entry)
                    }}
                    disabled={actionLoading}
                    tooltip={t('git.statusPanel.restoreFile')}
                    tooltipAlign="right"
                    className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md bg-transparent text-claude-text transition-colors hover:bg-claude-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10H5V6" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10a7 7 0 1 1 2.05 4.95" />
                    </svg>
                  </IconTooltipButton>
                  <IconTooltipButton
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void onToggleStage(entry, shouldStageAction)
                    }}
                    disabled={actionLoading}
                    tooltip={stageActionLabel}
                    tooltipAlign="right"
                    className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md bg-transparent text-[14px] font-semibold text-claude-text transition-colors hover:bg-claude-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {shouldStageAction ? '+' : '-'}
                  </IconTooltipButton>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
