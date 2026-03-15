import type { AskAboutSelectionPayload } from '../../lib/toolCallUtils'

export function buildSelectedRange<T extends { key: string }>(all: T[], anchorKey: string, activeKey: string): string[] {
  const anchorIndex = all.findIndex((item) => item.key === anchorKey)
  const activeIndex = all.findIndex((item) => item.key === activeKey)
  if (anchorIndex < 0 || activeIndex < 0) return activeKey ? [activeKey] : []
  const start = Math.min(anchorIndex, activeIndex)
  const end = Math.max(anchorIndex, activeIndex)
  return all.slice(start, end + 1).map((item) => item.key)
}

export function summarizeLineRange(startLine: number, endLine: number) {
  return startLine === endLine ? `줄 ${startLine}` : `줄 ${startLine}-${endLine}`
}

export function buildSelectionPayload(
  kind: 'diff' | 'code',
  path: string,
  lines: Array<{ lineNumber: number; text: string; sign?: '+' | '-' }>,
): AskAboutSelectionPayload | null {
  if (lines.length === 0) return null
  const startLine = Math.min(...lines.map((line) => line.lineNumber))
  const endLine = Math.max(...lines.map((line) => line.lineNumber))
  const code = lines.map((line) => (kind === 'diff' ? `${line.sign ?? ' '} ${line.text}` : line.text)).join('\n')
  return { kind, path, startLine, endLine, code }
}
