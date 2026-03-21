import { parseDiff } from 'react-diff-view'
import type { CSSProperties } from 'react'
import type { GitStatusEntry, GitDiffResult, GitLogEntry } from '../../electron/preload'
import { translate, type AppLanguage } from './i18n'

export type GitDraftAction = 'review' | 'summary' | 'commitMessage'

export type GitDecorationRef = {
  label: string
  kind: 'current' | 'local' | 'remote' | 'tag' | 'other'
}

const GIT_REMOTE_REF_PREFIXES = ['origin/', 'upstream/']
const GIT_CURRENT_BRANCH_COLOR = 'rgba(96, 165, 250, 0.95)'
const GIT_LOCAL_REF_PALETTE = [
  'rgba(59, 130, 246, 0.95)',
  'rgba(14, 165, 233, 0.95)',
  'rgba(99, 102, 241, 0.95)',
  'rgba(16, 185, 129, 0.95)',
  'rgba(34, 211, 238, 0.95)',
]
const GIT_REMOTE_REF_PALETTE = [
  'rgba(45, 212, 191, 0.95)',
  'rgba(245, 158, 11, 0.95)',
  'rgba(244, 114, 182, 0.95)',
  'rgba(168, 85, 247, 0.95)',
  'rgba(250, 204, 21, 0.95)',
  'rgba(251, 113, 133, 0.95)',
]
const GIT_TAG_COLOR = 'rgba(245, 158, 11, 0.95)'

function hashGitDecorationLabel(label: string) {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) {
    hash = ((hash << 5) - hash + label.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function getGitPaletteColor(palette: string[], label: string, fallback: string) {
  return palette[hashGitDecorationLabel(label) % palette.length] ?? fallback
}

function withGitColorAlpha(color: string, alpha: number) {
  const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/)
  if (!match) return color
  const [, r, g, b] = match
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function areGitStatusEntriesEqual(a: GitStatusEntry | null, b: GitStatusEntry | null) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.path === b.path &&
    a.relativePath === b.relativePath &&
    (a.originalPath ?? null) === (b.originalPath ?? null) &&
    a.statusCode === b.statusCode &&
    a.stagedAdditions === b.stagedAdditions &&
    a.stagedDeletions === b.stagedDeletions &&
    a.unstagedAdditions === b.unstagedAdditions &&
    a.unstagedDeletions === b.unstagedDeletions &&
    a.totalAdditions === b.totalAdditions &&
    a.totalDeletions === b.totalDeletions &&
    a.staged === b.staged &&
    a.unstaged === b.unstaged &&
    a.untracked === b.untracked &&
    a.deleted === b.deleted &&
    a.renamed === b.renamed
  )
}

export function areGitDiffResultsEqual(a: GitDiffResult | null, b: GitDiffResult | null) {
  if (a === b) return true
  if (!a || !b) return false
  return a.ok === b.ok && a.diff === b.diff && (a.error ?? null) === (b.error ?? null)
}

export function areGitLogEntriesEqual(a: GitLogEntry | null, b: GitLogEntry | null) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.hash === b.hash &&
    a.parents.join(' ') === b.parents.join(' ') &&
    a.shortHash === b.shortHash &&
    a.subject === b.subject &&
    a.author === b.author &&
    a.relativeDate === b.relativeDate &&
    a.decorations === b.decorations &&
    a.graph === b.graph &&
    a.bridgeToNext.join('\n') === b.bridgeToNext.join('\n')
  )
}

export function trimGitDraftDiff(diff: string, maxLength = 12000): { content: string; truncated: boolean } {
  const trimmed = diff.trim()
  if (trimmed.length <= maxLength) {
    return { content: trimmed, truncated: false }
  }
  return {
    content: `${trimmed.slice(0, maxLength)}\n...\n[diff truncated]`,
    truncated: true,
  }
}

export function buildGitDraft(
  action: GitDraftAction,
  payload: {
    entry: GitStatusEntry | null
    commit: GitLogEntry | null
    gitDiff: GitDiffResult | null
  },
  language: AppLanguage = 'ko',
): string | null {
  const diff = payload.gitDiff?.diff ?? ''
  if (!diff.trim()) return null

  const scopeLabel = payload.commit
    ? translate(language, 'git.draft.scope.commit', {
      shortHash: payload.commit.shortHash,
      subject: payload.commit.subject,
    })
    : payload.entry
      ? translate(language, 'git.draft.scope.file', { path: payload.entry.relativePath })
      : translate(language, 'git.draft.scope.selected')
  const { content, truncated } = trimGitDraftDiff(diff)
  const truncationNote = truncated
    ? `\n${translate(language, 'git.draft.truncatedNote')}\n`
    : '\n'

  if (action === 'review') {
    return [
      translate(language, 'git.draft.reviewIntro', { scopeLabel }),
      translate(language, 'git.draft.reviewInstruction'),
      truncationNote.trim(),
      '```diff',
      content,
      '```',
    ].filter(Boolean).join('\n\n')
  }

  if (action === 'summary') {
    return [
      translate(language, 'git.draft.summaryIntro', { scopeLabel }),
      translate(language, 'git.draft.summaryPoint.changed'),
      translate(language, 'git.draft.summaryPoint.impact'),
      translate(language, 'git.draft.summaryPoint.tests'),
      translate(language, 'git.draft.summaryPoint.release'),
      truncationNote.trim(),
      '```diff',
      content,
      '```',
    ].filter(Boolean).join('\n\n')
  }

  return [
    translate(language, 'git.draft.commitIntro', { scopeLabel }),
    translate(language, 'git.draft.commitPoint.candidates'),
    translate(language, 'git.draft.commitPoint.recommended'),
    translate(language, 'git.draft.commitPoint.body'),
    translate(language, 'git.draft.commitPoint.language'),
    truncationNote.trim(),
    '```diff',
    content,
    '```',
  ].filter(Boolean).join('\n\n')
}

export function getGitEntryLabel(entry: GitStatusEntry, language: AppLanguage = 'ko'): string {
  if (entry.untracked) return translate(language, 'git.status.newFile')
  if (entry.deleted) return translate(language, 'git.status.deleted')
  if (entry.renamed) return translate(language, 'git.status.renamed')
  if (entry.staged && entry.unstaged) return translate(language, 'git.status.modified')
  if (entry.staged) return translate(language, 'git.status.staged')
  if (entry.unstaged) return translate(language, 'git.status.modified')
  return translate(language, 'git.status.changed')
}

export function getGitEntryBadgeClass(entry: GitStatusEntry): string {
  if (entry.untracked) return 'border-emerald-500/30 bg-emerald-500/10 text-claude-text'
  if (entry.deleted) return 'border-red-500/30 bg-red-500/10 text-claude-text'
  if (entry.renamed) return 'border-sky-500/30 bg-sky-500/10 text-claude-text'
  if (entry.staged && entry.unstaged) return 'border-amber-500/30 bg-amber-500/10 text-claude-text'
  return 'border-claude-border bg-claude-surface text-claude-text'
}

export function getGitEntryStatusDotClass(entry: GitStatusEntry): string | null {
  if (entry.deleted) return 'bg-red-400'
  if (entry.untracked || entry.renamed) return 'bg-sky-400'
  return null
}

export function formatGitChangeCount(value: number | null): string {
  return value && value > 0 ? `+${value}` : '+0'
}

export function formatGitDeletionCount(value: number | null): string {
  return value && value > 0 ? `-${value}` : '-0'
}

export function shouldStageGitEntry(entry: GitStatusEntry) {
  return !entry.staged || entry.unstaged || entry.untracked
}

export function getGitStageActionLabel(entry: GitStatusEntry, language: AppLanguage = 'ko') {
  return shouldStageGitEntry(entry)
    ? translate(language, 'git.action.stage')
    : translate(language, 'git.action.unstage')
}

export function shouldStageGitEntryForFilter(entry: GitStatusEntry, filter: 'unstaged' | 'staged' | 'all') {
  if (filter === 'staged') return false
  if (filter === 'unstaged') return true
  return shouldStageGitEntry(entry)
}

export function getGitStageActionLabelForFilter(
  entry: GitStatusEntry,
  filter: 'unstaged' | 'staged' | 'all',
  language: AppLanguage = 'ko',
) {
  return shouldStageGitEntryForFilter(entry, filter)
    ? translate(language, 'git.action.stage')
    : translate(language, 'git.action.unstage')
}

export function getGitEntryCounts(entry: GitStatusEntry, filter: 'unstaged' | 'staged' | 'all') {
  if (filter === 'staged') {
    return {
      additions: entry.stagedAdditions,
      deletions: entry.stagedDeletions,
    }
  }

  if (filter === 'unstaged') {
    return {
      additions: entry.unstagedAdditions,
      deletions: entry.unstagedDeletions,
    }
  }

  return {
    additions: entry.totalAdditions,
    deletions: entry.totalDeletions,
  }
}

export function safeParseGitDiff(diffText: string) {
  try {
    return parseDiff(diffText)
  } catch {
    return []
  }
}

export function parseGitDecorations(decorations: string): GitDecorationRef[] {
  if (!decorations.trim()) return []

  return decorations
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap<GitDecorationRef>((value) => {
      if (value.startsWith('HEAD -> ')) {
        return [{
          label: value.slice('HEAD -> '.length).trim(),
          kind: 'current' as const,
        }]
      }

      if (value === 'HEAD') {
        return [{ label: 'HEAD', kind: 'current' as const }]
      }

      if (value.startsWith('tag: ')) {
        return [{
          label: value.slice('tag: '.length).trim(),
          kind: 'tag' as const,
        }]
      }

      if (GIT_REMOTE_REF_PREFIXES.some((prefix) => value.startsWith(prefix))) {
        return [{ label: value, kind: 'remote' as const }]
      }

      if (value.includes('/')) {
        return [{ label: value, kind: 'local' as const }]
      }

      return [{ label: value, kind: 'local' as const }]
    })
}

export function getGitDecorationBadgeClass(kind: 'current' | 'local' | 'remote' | 'tag' | 'other') {
  switch (kind) {
    case 'current':
    case 'local':
    case 'remote':
    case 'tag':
      return ''
    default:
      return 'border-claude-border bg-claude-surface text-claude-text'
  }
}

export function getGitDecorationColor(
  ref: GitDecorationRef,
  options?: {
    currentBranchName?: string | null
  },
) {
  const currentBranchName = options?.currentBranchName?.trim() || null

  switch (ref.kind) {
    case 'current':
      return GIT_CURRENT_BRANCH_COLOR
    case 'local':
      if (currentBranchName && ref.label === currentBranchName) {
        return GIT_CURRENT_BRANCH_COLOR
      }
      return getGitPaletteColor(GIT_LOCAL_REF_PALETTE, ref.label, GIT_CURRENT_BRANCH_COLOR)
    case 'remote':
      return getGitPaletteColor(GIT_REMOTE_REF_PALETTE, ref.label, GIT_REMOTE_REF_PALETTE[0] ?? GIT_TAG_COLOR)
    case 'tag':
      return GIT_TAG_COLOR
    default:
      return null
  }
}

export function getGitDecorationBadgeStyle(
  ref: GitDecorationRef,
  options?: {
    currentBranchName?: string | null
  },
): CSSProperties | undefined {
  const color = getGitDecorationColor(ref, options)
  if (!color) return undefined

  return {
    borderColor: withGitColorAlpha(color, 0.38),
    backgroundColor: withGitColorAlpha(color, 0.14),
    color: withGitColorAlpha(color, 0.98),
  }
}

export function isGitGraphActiveCommit(refs: GitDecorationRef[]) {
  const currentBranchNames = refs
    .filter((ref) => ref.kind === 'current')
    .map((ref) => ref.label)
    .filter((label) => label !== 'HEAD')

  if (currentBranchNames.length === 0) {
    return refs.some((ref) => ref.kind === 'current')
  }

  const hasMatchingRemote = currentBranchNames.some((branchName) => (
    refs.some((ref) => ref.kind === 'remote' && ref.label.endsWith(`/${branchName}`))
  ))

  return !hasMatchingRemote
}

export const GIT_GRAPH_ROW_HEIGHT = 24
export const GIT_GRAPH_MARKER_CENTER_Y = 12
export const GIT_GRAPH_ACTIVE_MARKER_SIZE = 10
export const GIT_GRAPH_DEFAULT_MARKER_SIZE = 8
export const GIT_GRAPH_LANE_GAP = 24
const GIT_GRAPH_MAIN_LANE_COLOR = 'rgba(201, 156, 73, 0.92)'
const GIT_GRAPH_BRANCH_LANE_COLOR = 'rgba(177, 92, 231, 0.92)'

export type GitGraphLayoutRow = {
  hash: string
  lane: number
  parentHashes: string[]
  parentLanes: number[]
}

export function getGitGraphLaneColor(lane: number) {
  return lane <= 0 ? GIT_GRAPH_MAIN_LANE_COLOR : GIT_GRAPH_BRANCH_LANE_COLOR
}

export function getGitGraphLaneCenter(lane: number) {
  return lane * GIT_GRAPH_LANE_GAP + 12
}

export function buildGitGraphLayout(entries: GitLogEntry[]): {
  rows: GitGraphLayoutRow[]
  maxLane: number
} {
  const activeLanes: string[] = []
  const rows: GitGraphLayoutRow[] = []
  let maxLane = 0

  for (const entry of entries) {
    let lane = activeLanes.indexOf(entry.hash)
    if (lane === -1) {
      lane = activeLanes.length
    }

    const nextActiveLanes = [...activeLanes]
    if (lane < nextActiveLanes.length) {
      nextActiveLanes.splice(lane, 1)
    }

    const parentLanes: number[] = []
    let insertOffset = 0

    for (const parentHash of entry.parents) {
      let parentLane = nextActiveLanes.indexOf(parentHash)
      if (parentLane === -1) {
        parentLane = lane + insertOffset
        nextActiveLanes.splice(parentLane, 0, parentHash)
        insertOffset += 1
      }
      parentLanes.push(parentLane)
    }

    activeLanes.splice(0, activeLanes.length, ...nextActiveLanes)
    maxLane = Math.max(maxLane, lane, ...parentLanes)
    rows.push({
      hash: entry.hash,
      lane,
      parentHashes: entry.parents,
      parentLanes,
    })
  }

  return { rows, maxLane }
}
