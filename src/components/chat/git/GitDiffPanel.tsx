import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Diff, Hunk } from 'react-diff-view'

import type { GitDiffResult, GitLogEntry, GitStatusEntry } from '../../../../electron/preload'
import { useI18n } from '../../../hooks/useI18n'
import {
  areGitDiffResultsEqual,
  areGitLogEntriesEqual,
  areGitStatusEntriesEqual,
  getGitDecorationBadgeClass,
  getGitDecorationBadgeStyle,
  getGitEntryBadgeClass,
  getGitEntryLabel,
  parseGitDecorations,
  safeParseGitDiff,
  type GitDecorationRef,
  type GitDraftAction,
} from '../../../lib/gitUtils'
import { isMarkdownFile, joinPreviewPath } from '../../../lib/markdownPreview'
import { MarkdownPreviewBody } from '../PreviewPane'
import { GitDraftActions } from './GitShared'

export const GitDiffPanel = memo(function GitDiffPanel({
  cwd,
  entry,
  commit,
  gitDiff,
  loading,
  onCreateDraft,
}: {
  cwd: string
  entry: GitStatusEntry | null
  commit: GitLogEntry | null
  gitDiff: GitDiffResult | null
  loading: boolean
  onCreateDraft: (action: GitDraftAction, payload: {
    entry: GitStatusEntry | null
    commit: GitLogEntry | null
    gitDiff: GitDiffResult | null
  }) => void
}) {
  const { language, t } = useI18n()
  const parsedFiles = useMemo(() => {
    if (!gitDiff?.diff.trim()) return []
    return safeParseGitDiff(gitDiff.diff)
  }, [gitDiff?.diff])
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({})
  const [markdownPreviewEnabled, setMarkdownPreviewEnabled] = useState(false)
  const [markdownPreviewState, setMarkdownPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [markdownPreviewContent, setMarkdownPreviewContent] = useState('')
  const [markdownPreviewError, setMarkdownPreviewError] = useState('')
  const commitHashRef = useRef<string | null>(commit?.hash ?? null)
  const [commitMarkdownPreviewOpen, setCommitMarkdownPreviewOpen] = useState<Record<string, boolean>>({})
  const [commitMarkdownPreviewCache, setCommitMarkdownPreviewCache] = useState<Record<string, {
    state: 'loading' | 'ready' | 'error'
    content: string
    error: string
  }>>({})
  const markdownPreviewAvailable = Boolean(entry && !entry.deleted && isMarkdownFile(entry.relativePath))
  const commitRefs: GitDecorationRef[] = useMemo(() => parseGitDecorations(commit?.decorations ?? ''), [commit?.decorations])
  const currentBranchName = useMemo(
    () => commitRefs.find((ref) => ref.kind === 'current')?.label ?? null,
    [commitRefs],
  )

  useEffect(() => {
    commitHashRef.current = commit?.hash ?? null
  }, [commit?.hash])

  useEffect(() => {
    setCollapsedFiles({})
    setCommitMarkdownPreviewOpen({})
    setCommitMarkdownPreviewCache({})
  }, [gitDiff?.diff, entry?.path, commit?.hash])

  useEffect(() => {
    setMarkdownPreviewEnabled(false)
    setMarkdownPreviewState('idle')
    setMarkdownPreviewContent('')
    setMarkdownPreviewError('')
  }, [entry?.path, commit?.hash])

  useEffect(() => {
    if (!markdownPreviewEnabled || !entry || !markdownPreviewAvailable) return

    let cancelled = false
    setMarkdownPreviewState('loading')
    setMarkdownPreviewError('')

    void (async () => {
      const result = await window.claude.readFile(entry.path)
      if (cancelled) return

      if (!result || result.fileType !== 'text') {
        setMarkdownPreviewState('error')
        setMarkdownPreviewContent('')
        setMarkdownPreviewError(t('git.error.loadMarkdownPreview'))
        return
      }

      setMarkdownPreviewState('ready')
      setMarkdownPreviewContent(result.content)
    })()

    return () => {
      cancelled = true
    }
  }, [entry?.path, markdownPreviewAvailable, markdownPreviewEnabled])

  const handleToggleCommitMarkdownPreview = async (fileKey: string, filePath: string) => {
    const nextOpen = !(commitMarkdownPreviewOpen[fileKey] ?? false)
    setCommitMarkdownPreviewOpen((current) => ({ ...current, [fileKey]: nextOpen }))

    if (!nextOpen || !commit?.hash) return

    const cached = commitMarkdownPreviewCache[fileKey]
    if (cached?.state === 'ready' || cached?.state === 'loading') return

    const requestCommitHash = commit.hash
    setCommitMarkdownPreviewCache((current) => ({
      ...current,
      [fileKey]: {
        state: 'loading',
        content: '',
        error: '',
      },
    }))

    try {
      const result = await window.claude.getGitFileContent({
        cwd,
        commitHash: requestCommitHash,
        filePath,
      })

      if (commitHashRef.current !== requestCommitHash) return

      setCommitMarkdownPreviewCache((current) => ({
        ...current,
        [fileKey]: result.ok
          ? {
              state: 'ready',
              content: result.content,
              error: '',
            }
          : {
              state: 'error',
              content: '',
              error: result.error || t('git.error.loadMarkdownPreview'),
            },
      }))
    } catch (error) {
      if (commitHashRef.current !== requestCommitHash) return

      const message = error instanceof Error ? error.message : String(error)
      setCommitMarkdownPreviewCache((current) => ({
        ...current,
        [fileKey]: {
          state: 'error',
          content: '',
          error: message.includes('getGitFileContent') || message.includes('getGitCommitFileContent')
            ? t('git.error.restartForPreview')
            : t('git.error.loadMarkdownPreview'),
        },
      }))
    }
  }

  if (!entry && !commit) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center">
        <div>
          <p className="text-[13px] font-medium text-claude-text">{t('git.diff.selectTitle')}</p>
          <p className="mt-2 text-xs leading-6 text-claude-muted">{t('git.diff.selectDescription')}</p>
        </div>
      </div>
    )
  }

  const canCreateDraft = Boolean(gitDiff?.diff.trim())

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-claude-border bg-claude-surface px-3 py-2.5">
        {commit ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-100">
                  {t('git.diff.commitBadge')}
                </span>
                <p className="min-w-0 truncate text-sm font-medium text-claude-text">{commit.subject}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="shrink-0 whitespace-nowrap rounded-md border border-claude-border bg-claude-panel px-1.5 py-0.5 font-mono text-[10px] text-claude-muted">
                  {commit.shortHash}
                </span>
                <span className="text-[11px] text-claude-muted">{commit.author}</span>
                <span className="text-[11px] text-claude-muted">{commit.relativeDate}</span>
                {commitRefs.map((ref) => (
                  <span
                    key={`${commit.hash}-${ref.kind}-${ref.label}`}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${getGitDecorationBadgeClass(ref.kind)}`}
                    style={getGitDecorationBadgeStyle(ref, { currentBranchName })}
                  >
                    {ref.label}
                  </span>
                ))}
              </div>
            </div>
            <GitDraftActions
              disabled={!canCreateDraft}
              showSummary={false}
              showCommitMessage={false}
              onCreateDraft={(action) => onCreateDraft(action, { entry, commit, gitDiff })}
            />
          </div>
        ) : entry ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${getGitEntryBadgeClass(entry)}`}>
                  {getGitEntryLabel(entry, language)}
                </span>
                <p className="min-w-0 truncate text-sm font-medium text-claude-text">{entry.relativePath}</p>
              </div>
              {entry.originalPath && (
                <p className="mt-1 truncate text-[11px] text-[rgb(var(--claude-text)/0.72)]">{t('git.diff.previous')} {entry.originalPath}</p>
              )}
              {markdownPreviewAvailable && (
                <button
                  type="button"
                  onClick={() => setMarkdownPreviewEnabled((value) => !value)}
                  className="mt-2 inline-flex rounded-md border border-claude-border px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
                >
                  {markdownPreviewEnabled ? 'Diff' : 'MD'}
                </button>
              )}
            </div>
            <GitDraftActions
              disabled={!canCreateDraft}
              onCreateDraft={(action) => onCreateDraft(action, { entry, commit, gitDiff })}
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-claude-bg p-3">
        {markdownPreviewEnabled && markdownPreviewAvailable ? (
          markdownPreviewState === 'ready' ? (
            <div className="rounded-md border border-claude-border bg-claude-panel/65 px-4 py-3">
              <MarkdownPreviewBody filePath={entry!.path} content={markdownPreviewContent} />
            </div>
          ) : markdownPreviewState === 'error' ? (
            <div className="rounded-md border border-red-900/40 bg-red-950/20 px-4 py-5 text-center text-[13px] text-red-100">
              {markdownPreviewError}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-claude-muted">
              <p className="text-sm">{t('git.diff.loadingPreview')}</p>
            </div>
          )
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-claude-muted">
            <p className="text-sm">{t('git.diff.loadingDiff')}</p>
          </div>
        ) : !gitDiff ? (
          <div className="rounded-md border border-claude-border bg-claude-panel/65 px-4 py-5 text-center text-[13px] text-claude-muted">
            {t('git.diff.loadingDiff')}
          </div>
        ) : gitDiff.error && !gitDiff.diff.trim() ? (
          <div className="rounded-md border border-red-900/40 bg-red-950/20 px-4 py-5 text-center text-[13px] text-red-100">
            {gitDiff.error}
          </div>
        ) : !gitDiff.diff.trim() ? (
          <div className="rounded-md border border-claude-border bg-claude-panel/65 px-4 py-5 text-center text-[13px] text-claude-muted">
            {t('git.diff.noDiff')}
          </div>
        ) : parsedFiles.length > 0 ? (
          <div className="space-y-4">
            {parsedFiles.map((file, index) => {
              const fileKey = `${file.oldPath}-${file.newPath}-${index}`
              const isCollapsed = collapsedFiles[fileKey] ?? false
              const label = file.oldPath === file.newPath ? file.newPath : `${file.oldPath} → ${file.newPath}`
              const markdownFilePath = commit && file.newPath !== '/dev/null' ? file.newPath : null
              const markdownPreviewAvailableForFile = Boolean(markdownFilePath && isMarkdownFile(markdownFilePath))
              const markdownPreviewOpenForFile = commitMarkdownPreviewOpen[fileKey] ?? false
              const markdownPreviewDataForFile = commitMarkdownPreviewCache[fileKey]

              return (
                <div key={fileKey} className="overflow-hidden rounded-md border border-claude-border/70 bg-claude-panel/65">
                  <div className={`flex items-center gap-2 bg-claude-panel px-3 py-2 text-[11px] font-mono text-claude-muted ${isCollapsed ? '' : 'border-b border-claude-border/70'}`}>
                    <button
                      type="button"
                      onClick={() => setCollapsedFiles((current) => ({ ...current, [fileKey]: !isCollapsed }))}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-claude-text"
                    >
                      <svg
                        className={`h-3.5 w-3.5 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5 10 12.5 15 7.5" />
                      </svg>
                      <span className="truncate">{label}</span>
                    </button>
                    {markdownPreviewAvailableForFile && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleToggleCommitMarkdownPreview(fileKey, markdownFilePath!)
                        }}
                        className="inline-flex shrink-0 rounded-md border border-claude-border px-2 py-0.5 text-[10px] font-medium text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
                      >
                        {markdownPreviewOpenForFile ? 'Diff' : 'MD'}
                      </button>
                    )}
                  </div>
                  {!isCollapsed && (
                    markdownPreviewOpenForFile && markdownPreviewAvailableForFile ? (
                      markdownPreviewDataForFile?.state === 'ready' ? (
                        <div className="px-5 py-4">
                          <MarkdownPreviewBody
                            filePath={joinPreviewPath(cwd, markdownFilePath!)}
                            content={markdownPreviewDataForFile.content}
                          />
                        </div>
                      ) : markdownPreviewDataForFile?.state === 'error' ? (
                        <div className="px-4 py-8 text-center text-sm text-red-100">
                          {markdownPreviewDataForFile.error}
                        </div>
                      ) : (
                        <div className="px-4 py-8 text-center text-sm text-claude-muted">
                          {t('git.diff.loadingPreview')}
                        </div>
                      )
                    ) : (
                      <div className="tool-diff-shell">
                        <Diff viewType="unified" diffType={file.type} hunks={file.hunks} className="tool-diff-view">
                          {(hunks) => hunks.map((hunk, hunkIndex) => (
                            <Hunk key={`${file.newPath}-${hunkIndex}-${hunk.content}`} hunk={hunk} />
                          ))}
                        </Diff>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-md border border-claude-border bg-claude-panel/65 p-3 text-xs font-mono text-claude-text">
            {gitDiff.diff}
          </pre>
        )}
      </div>
    </div>
  )
}, (prevProps, nextProps) => (
  prevProps.cwd === nextProps.cwd &&
  prevProps.loading === nextProps.loading &&
  areGitStatusEntriesEqual(prevProps.entry, nextProps.entry) &&
  areGitLogEntriesEqual(prevProps.commit, nextProps.commit) &&
  areGitDiffResultsEqual(prevProps.gitDiff, nextProps.gitDiff)
))
