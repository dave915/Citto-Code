import type { GitLogEntry, GitRepoStatus } from '../../../../electron/preload'

import { useI18n } from '../../../hooks/useI18n'
import {
  getGitDecorationBadgeClass,
  isGitGraphActiveCommit,
  parseGitDecorations,
  renderGitGraph,
  type GitDecorationRef,
} from '../../../lib/gitUtils'
import { IconTooltipButton } from './GitShared'

export function GitLogPanel({
  status,
  gitLog,
  loading,
  actionLoading,
  selectedCommitHash,
  onSelectCommit,
  onPull,
  onPush,
}: {
  status: GitRepoStatus | null
  gitLog: GitLogEntry[]
  loading: boolean
  actionLoading: boolean
  selectedCommitHash: string | null
  onSelectCommit: (entry: GitLogEntry) => void
  onPull: () => Promise<void>
  onPush: () => Promise<void>
}) {
  const { language } = useI18n()
  const historyEntries = gitLog

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-semibold text-claude-text">{language === 'en' ? 'Recent commits' : '최근 커밋'}</p>
          {status?.branch && (
            <span className="rounded-full border border-sky-500/35 bg-sky-500/12 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-200">
              {status.branch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconTooltipButton
            type="button"
            onClick={() => void onPull()}
            disabled={actionLoading}
            tooltip={status && status.behind > 0 ? `Pull(${status.behind})` : 'Pull'}
            tooltipAlign="right"
            className="flex h-6.5 w-6.5 items-center justify-center rounded-lg transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${status && status.behind > 0 ? 'text-amber-400' : 'text-claude-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m7 11 5 5 5-5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 20h14" />
            </svg>
          </IconTooltipButton>
          <IconTooltipButton
            type="button"
            onClick={() => void onPush()}
            disabled={actionLoading}
            tooltip={status && status.ahead > 0 ? `Push(${status.ahead})` : 'Push'}
            tooltipAlign="right"
            className="flex h-6.5 w-6.5 items-center justify-center rounded-lg transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${status && status.ahead > 0 ? 'text-blue-400' : 'text-claude-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m7 13 5-5 5 5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h14" />
            </svg>
          </IconTooltipButton>
          {loading && (
            <svg className="ml-1 h-3.5 w-3.5 animate-spin text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {historyEntries.length === 0 ? (
          <div className="px-2 py-6 text-center text-[12px] text-claude-muted">
            {loading
              ? (language === 'en' ? 'Loading commit history...' : '로그를 불러오는 중입니다.')
              : (language === 'en' ? 'No commit history to display.' : '표시할 커밋 로그가 없습니다.')}
          </div>
        ) : (
          <div className="flex flex-col pr-1">
            {historyEntries.map((entry, index) => {
              const refs: GitDecorationRef[] = parseGitDecorations(entry.decorations)
              const isSelected = selectedCommitHash === entry.hash
              const isHeadCommit = isGitGraphActiveCommit(refs)
              const previousGraph = index > 0 ? historyEntries[index - 1]?.graph ?? '' : ''
              const nextGraph = index < historyEntries.length - 1 ? historyEntries[index + 1]?.graph ?? '' : ''
              const previousRefs: GitDecorationRef[] = index > 0
                ? parseGitDecorations(historyEntries[index - 1]?.decorations ?? '')
                : []
              const previousIsHeadCommit = isGitGraphActiveCommit(previousRefs)

              return (
                <button
                  key={entry.hash}
                  type="button"
                  onClick={() => void onSelectCommit(entry)}
                  className={`block w-full rounded-md px-2 text-left transition-colors ${
                    isSelected ? 'bg-claude-surface-2' : 'hover:bg-claude-panel'
                  }`}
                  title={`${entry.shortHash} ${entry.subject}`}
                >
                  <div className="flex items-stretch gap-1">
                    <div className="flex min-h-[24px] shrink-0 self-stretch items-stretch justify-center">
                      {renderGitGraph(entry.graph, previousGraph, nextGraph, isHeadCommit, previousIsHeadCommit)}
                    </div>
                    <div className="min-w-0 flex-1 py-0">
                      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                        <p className={`min-w-0 truncate text-[13px] leading-[15px] ${isSelected ? 'font-semibold text-claude-text' : 'font-medium text-claude-text'}`}>
                          {entry.subject}
                        </p>
                        <span className="shrink-0 text-[11px] text-claude-muted">{entry.author}</span>
                        {refs.map((ref) => (
                          <span
                            key={`${entry.hash}-${ref.kind}-${ref.label}`}
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${getGitDecorationBadgeClass(ref.kind)}`}
                          >
                            {ref.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
