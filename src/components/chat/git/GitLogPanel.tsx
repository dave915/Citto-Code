import type { GitLogEntry, GitRepoStatus } from '../../../../electron/preload'

import { useI18n } from '../../../hooks/useI18n'
import {
  getGitDecorationBadgeClass,
  getGitDecorationBadgeStyle,
  getGitDecorationColor,
  getGitGraphLaneColor,
  GIT_GRAPH_ACTIVE_MARKER_SIZE,
  GIT_GRAPH_DEFAULT_MARKER_SIZE,
  GIT_GRAPH_MARKER_CENTER_Y,
  GIT_GRAPH_ROW_HEIGHT,
  isGitGraphActiveCommit,
  parseGitDecorations,
  type GitDecorationRef,
} from '../../../lib/gitUtils'
import { IconTooltipButton } from './GitShared'

const GIT_GRAPH_COLUMN_OFFSET = 12
const GIT_GRAPH_LANE_GAP = 24
const GIT_GRAPH_DIAGONAL_SPAN = GIT_GRAPH_ROW_HEIGHT

function getGitGraphLaneCenter(lane: number) {
  return GIT_GRAPH_COLUMN_OFFSET + lane * GIT_GRAPH_LANE_GAP
}

function getGitGraphLaneFromColumn(column: number) {
  return Math.max(0, Math.floor(column / 2))
}

function buildGitGraphEdgePath(fromX: number, fromY: number, toX: number, toY: number) {
  if (fromX === toX || toY <= fromY) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`
  }

  const bend = Math.min(GIT_GRAPH_DIAGONAL_SPAN, Math.max(GIT_GRAPH_ROW_HEIGHT / 2, (toY - fromY) / 2))

  if (toX > fromX) {
    return `M ${fromX} ${fromY} L ${toX} ${fromY + bend} L ${toX} ${toY}`
  }

  return `M ${fromX} ${fromY} L ${fromX} ${toY - bend} L ${toX} ${toY}`
}

function getGitGraphEdgeColor(
  row: { lane: number; graphColor: string },
  parentRow: { lane: number; graphColor: string },
) {
  if (row.lane === parentRow.lane) {
    return row.graphColor
  }

  return row.lane > parentRow.lane ? row.graphColor : parentRow.graphColor
}

function getGitGraphLanesInRow(graph: string) {
  const lanes = new Set<number>()

  for (let column = 0; column < graph.length; column += 1) {
    const char = graph[column]
    if (char && char !== ' ') {
      lanes.add(getGitGraphLaneFromColumn(column))
    }
  }

  return lanes
}

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
  const { t } = useI18n()
  const historyEntries = gitLog
  const primaryLane = getGitGraphLaneFromColumn(Math.max(0, historyEntries[0]?.graph.indexOf('*') ?? 0))
  const currentBranchName = status?.branch?.trim() || null
  const currentBranchRef: GitDecorationRef | null = currentBranchName ? { label: currentBranchName, kind: 'current' } : null
  const graphCommits = historyEntries.map((entry, index) => {
    const markerColumn = Math.max(0, entry.graph.indexOf('*'))
    const lane = getGitGraphLaneFromColumn(markerColumn)
    return {
      entry,
      index,
      lane,
      y: index * GIT_GRAPH_ROW_HEIGHT + GIT_GRAPH_MARKER_CENTER_Y,
    }
  })
  const currentBranchRemoteRef = currentBranchName
    ? graphCommits
      .flatMap((row) => parseGitDecorations(row.entry.decorations))
      .find((ref) => ref.kind === 'remote' && ref.label.endsWith(`/${currentBranchName}`))
      ?.label ?? null
    : null
  const trackingRemoteIndex = currentBranchRemoteRef
    ? graphCommits.findIndex((row) => (
      parseGitDecorations(row.entry.decorations).some((ref) => ref.kind === 'remote' && ref.label === currentBranchRemoteRef)
    ))
    : -1
  const laneColorByLane = new Map<number, string>()
  const graphCommitRows = graphCommits.map((row) => {
    const visibleLanes = getGitGraphLanesInRow(row.entry.graph)
    for (const lane of Array.from(laneColorByLane.keys())) {
      if (!visibleLanes.has(lane)) {
        laneColorByLane.delete(lane)
      }
    }

    const refs = parseGitDecorations(row.entry.decorations)
    const inheritedColor = laneColorByLane.get(row.lane)

    let graphColor = inheritedColor ?? getGitGraphLaneColor(row.lane)
    if (row.lane === primaryLane && currentBranchName) {
      if (trackingRemoteIndex >= 0) {
        graphColor = row.index < trackingRemoteIndex
          ? (getGitDecorationColor({ label: currentBranchName, kind: 'current' }, { currentBranchName }) ?? graphColor)
          : (getGitDecorationColor({ label: currentBranchRemoteRef ?? `origin/${currentBranchName}`, kind: 'remote' }, { currentBranchName }) ?? graphColor)
      } else {
        graphColor = getGitDecorationColor({ label: currentBranchName, kind: 'current' }, { currentBranchName }) ?? graphColor
      }
    } else if (refs.some((ref) => ref.kind === 'remote')) {
      graphColor = getGitDecorationColor(
        refs.find((ref) => ref.kind === 'remote') ?? { label: `remote-${row.lane}`, kind: 'remote' },
        { currentBranchName },
      ) ?? graphColor
    } else if (refs.some((ref) => ref.kind === 'local')) {
      graphColor = getGitDecorationColor(
        refs.find((ref) => ref.kind === 'local') ?? { label: `local-${row.lane}`, kind: 'local' },
        { currentBranchName },
      ) ?? graphColor
    }

    laneColorByLane.set(row.lane, graphColor)

    return {
      ...row,
      refs,
      graphColor,
    }
  })
  const maxGraphLane = graphCommitRows.reduce((maxLane, row) => Math.max(maxLane, row.lane), 0)
  const graphWidth = Math.max(36, getGitGraphLaneCenter(maxGraphLane) + GIT_GRAPH_COLUMN_OFFSET)
  const graphHeight = historyEntries.length * GIT_GRAPH_ROW_HEIGHT
  const rowIndexByHash = new Map(graphCommitRows.map((row) => [row.entry.hash, row.index]))
  const graphCommitByHash = new Map(graphCommitRows.map((row) => [row.entry.hash, row]))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-semibold text-claude-text">{t('git.log.recentCommits')}</p>
          {status?.branch && (
            <span
              className="rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium"
              style={currentBranchRef ? getGitDecorationBadgeStyle(currentBranchRef, { currentBranchName }) : undefined}
            >
              {status.branch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconTooltipButton
            type="button"
            onClick={() => void onPull()}
            disabled={actionLoading}
            tooltip={status && status.behind > 0 ? t('git.log.pullWithCount', { count: status.behind }) : t('git.log.pull')}
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
            tooltip={status && status.ahead > 0 ? t('git.log.pushWithCount', { count: status.ahead }) : t('git.log.push')}
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
              ? t('git.log.loadingHistory')
              : t('git.log.noHistory')}
          </div>
        ) : (
          <div className="relative flex flex-col pr-1">
            <div
              className="pointer-events-none absolute left-2 top-0 z-10"
              style={{ width: `${graphWidth}px`, height: `${graphHeight}px` }}
            >
              <svg width={graphWidth} height={graphHeight} viewBox={`0 0 ${graphWidth} ${graphHeight}`} aria-hidden="true">
                {graphCommitRows.flatMap((row) => {
                  return row.entry.parents.flatMap((parentHash) => {
                    const parentRowIndex = rowIndexByHash.get(parentHash)
                    const parentRow = graphCommitByHash.get(parentHash)

                    if (parentRowIndex === undefined || !parentRow || parentRowIndex <= row.index) {
                      return []
                    }

                    const fromX = getGitGraphLaneCenter(row.lane)
                    const fromY = row.y
                    const toX = getGitGraphLaneCenter(parentRow.lane)
                    const toY = parentRow.y
                    const stroke = getGitGraphEdgeColor(row, parentRow)

                    return (
                      <path
                        key={`${row.entry.hash}-${parentHash}`}
                        d={buildGitGraphEdgePath(fromX, fromY, toX, toY)}
                        stroke={stroke}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    )
                  })
                })}
                {graphCommitRows.map((row) => {
                  const isHeadCommit = isGitGraphActiveCommit(row.refs)
                  const lane = row.lane
                  const laneColor = row.graphColor
                  const markerSize = isHeadCommit ? GIT_GRAPH_ACTIVE_MARKER_SIZE : GIT_GRAPH_DEFAULT_MARKER_SIZE
                  const markerRadius = markerSize / 2
                  const centerX = getGitGraphLaneCenter(lane)
                  const centerY = row.y

                  return (
                    <circle
                      key={`${row.entry.hash}-node`}
                      cx={centerX}
                      cy={centerY}
                      r={markerRadius}
                      fill={isHeadCommit ? 'rgb(31 34 46)' : laneColor}
                      stroke={laneColor}
                      strokeWidth={isHeadCommit ? 2 : 0}
                    />
                  )
                })}
              </svg>
            </div>
            {historyEntries.map((entry, index) => {
              const refs: GitDecorationRef[] = parseGitDecorations(entry.decorations)
              const isSelected = selectedCommitHash === entry.hash

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
                    <div className="shrink-0" style={{ width: `${graphWidth}px`, minWidth: `${graphWidth}px`, height: `${GIT_GRAPH_ROW_HEIGHT}px` }} />
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
                            style={getGitDecorationBadgeStyle(ref, { currentBranchName })}
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
