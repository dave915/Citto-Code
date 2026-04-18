import type { ToolCallBlock as ToolCallBlockType } from '../../store/sessions'
import type { SelectedFile } from '../../../electron/preload'

export type DiffHunk = {
  before: string
  after: string
}

export type DiffSegment = {
  before: string
  after: string
  oldContent: string | null
  newContent: string | null
}

export type DiffRow = {
  kind: 'removed' | 'added'
  text: string
  lineNumber: number
}

export type AskAboutSelectionPayload = {
  kind: 'diff' | 'code'
  path: string
  startLine: number
  endLine: number
  code: string
  prompt?: string
}

export type HtmlPreviewCandidate = {
  kind: 'file'
  path: string
  fallbackContent: string | null
} | {
  kind: 'url'
  url: string
  path: string | null
  rootPath: string | null
  fallbackContent: null
}

export type HtmlPreviewElementSelection = {
  previewPath: string | null
  selector: string
  pathHint: string | null
  tagName: string
  id: string | null
  className: string | null
  text: string | null
  href: string | null
  ariaLabel: string | null
}

export type HtmlPreviewElementCapture = {
  selection: HtmlPreviewElementSelection
  captureFile?: SelectedFile | null
}

export type TimelineEntry = {
  id: string
  kind: 'file' | 'todo' | 'generic'
  label: string
  badge: string | null
  detail: string | null
  toolCalls: ToolCallBlockType[]
  added: number
  removed: number
  readLines: number
  status: 'running' | 'done' | 'error'
}

export type SubagentSessionInfo = {
  lookupId: string
  outputFile: string
  agent: string | null
  agentId: string | null
  description: string | null
  sessionId: string | null
}
