export {
  buildDiffRows,
  buildDiffSegments,
  buildUnifiedDiffText,
  buildUnifiedDiffTextFromSegments,
  getDiffStats,
  getEditDiffHunks,
} from './toolcalls/diff'

export { extractHtmlPreviewCandidate } from './toolcalls/htmlPreview'

export {
  countDisplayLines,
  formatToolInput,
  formatToolResult,
  getEditableToolPath,
  getSubagentSessionInfo,
  inferLanguageFromPath,
  stripLineNumberPrefixes,
} from './toolcalls/formatting'

export { buildSummary, buildTimelineEntries } from './toolcalls/timeline'

export type {
  AskAboutSelectionPayload,
  DiffHunk,
  DiffRow,
  DiffSegment,
  HtmlPreviewCandidate,
  HtmlPreviewElementSelection,
  TimelineEntry,
} from './toolcalls/types'
