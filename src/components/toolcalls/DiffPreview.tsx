import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Diff, Hunk, getChangeKey, parseDiff } from 'react-diff-view'
import { useI18n } from '../../hooks/useI18n'
import { buildDiffRows, buildUnifiedDiffText, buildUnifiedDiffTextFromSegments, type AskAboutSelectionPayload, type DiffHunk, type DiffSegment } from '../../lib/toolCallUtils'
import { SelectionActionBar } from './SelectionActionBar'
import { buildSelectedRange, buildSelectionPayload, summarizeLineRange } from './selectionUtils'

type ParsedDiffFile = ReturnType<typeof parseDiff>[number]
type ParsedChange = ParsedDiffFile['hunks'][number]['changes'][number]

type SelectableLine = {
  key: string
  lineNumber: number
  text: string
  sign: '+' | '-'
}

function trimParsedDiffFile(file: ParsedDiffFile, limit: number): ParsedDiffFile {
  let remaining = limit
  const hunks = []

  for (const hunk of file.hunks) {
    if (remaining <= 0) break
    const changes = hunk.changes.slice(0, remaining)
    if (changes.length === 0) continue

    let oldLines = 0
    let newLines = 0
    for (const change of changes) {
      if (change.type === 'delete') oldLines += 1
      else if (change.type === 'insert') newLines += 1
      else {
        oldLines += 1
        newLines += 1
      }
    }

    hunks.push({
      ...hunk,
      changes,
      oldLines,
      newLines,
    })
    remaining -= changes.length
  }

  return { ...file, hunks }
}

function buildDiffSelectionLines(file: ParsedDiffFile | null): SelectableLine[] {
  if (!file) return []

  return file.hunks.flatMap((hunk) =>
    hunk.changes
      .filter((change) => change.type === 'insert' || change.type === 'delete')
      .map((change) => ({
        key: getChangeKey(change),
        lineNumber: change.lineNumber,
        text: change.content,
        sign: change.type === 'insert' ? '+' : '-',
      })),
  )
}

export function DiffPreview({
  path,
  diffSegments,
  diffHunks,
  editedFileContent,
  showFullDiff,
  onShowFullDiff,
  onAskAboutSelection,
}: {
  path: string
  diffSegments: DiffSegment[]
  diffHunks: DiffHunk[]
  editedFileContent: string | null
  showFullDiff: boolean
  onShowFullDiff?: () => void
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  const { language, t } = useI18n()
  const [anchorKey, setAnchorKey] = useState<string | null>(null)
  const [selectedChangeKeys, setSelectedChangeKeys] = useState<string[]>([])
  const [hoveredChangeKey, setHoveredChangeKey] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentValue, setCommentValue] = useState('')

  const parsed = useMemo(() => {
    const diffBuild = diffSegments.length > 0
      ? buildUnifiedDiffTextFromSegments(path, diffSegments, editedFileContent)
      : buildUnifiedDiffText(path, diffHunks, editedFileContent)
    const file = parseDiff(diffBuild.text)[0] ?? null
    return {
      file,
      hunkHasReliableLineNumbers: diffBuild.hunkHasReliableLineNumbers,
    }
  }, [path, diffSegments, diffHunks, editedFileContent])

  const parsedFile = parsed.file
  const selectableLines = useMemo(() => buildDiffSelectionLines(parsedFile), [parsedFile])
  const selectedLines = useMemo(() => {
    const selected = new Set(selectedChangeKeys)
    return selectableLines.filter((line) => selected.has(line.key))
  }, [selectableLines, selectedChangeKeys])
  const selectedPayload = useMemo(
    () => buildSelectionPayload('diff', path, selectedLines),
    [path, selectedLines],
  )
  const allRows = useMemo(() => diffHunks.flatMap((hunk) => buildDiffRows(hunk, editedFileContent)), [diffHunks, editedFileContent])
  const previewLimit = 24
  const hiddenCount = Math.max(0, allRows.length - previewLimit)
  const visibleFile = useMemo(() => {
    if (!parsedFile) return null
    return showFullDiff ? parsedFile : trimParsedDiffFile(parsedFile, previewLimit)
  }, [parsedFile, showFullDiff])
  const visibleHunkReliability = useMemo(() => {
    if (!visibleFile) return []
    return parsed.hunkHasReliableLineNumbers.slice(0, visibleFile.hunks.length)
  }, [parsed.hunkHasReliableLineNumbers, visibleFile])
  const reliableChangeKeys = useMemo(() => {
    const keys = new Set<string>()
    if (!visibleFile) return keys
    visibleFile.hunks.forEach((hunk, index) => {
      if (!visibleHunkReliability[index]) return
      hunk.changes.forEach((change) => {
        if (change.type === 'insert' || change.type === 'delete') {
          keys.add(getChangeKey(change))
        }
      })
    })
    return keys
  }, [visibleFile, visibleHunkReliability])
  const visibleSelectableLines = useMemo(() => buildDiffSelectionLines(visibleFile), [visibleFile])

  useEffect(() => {
    if (!isDragging) return
    const stopDragging = () => setIsDragging(false)
    window.addEventListener('mouseup', stopDragging)
    window.addEventListener('blur', stopDragging)
    return () => {
      window.removeEventListener('mouseup', stopDragging)
      window.removeEventListener('blur', stopDragging)
    }
  }, [isDragging])

  useEffect(() => {
    if (selectedChangeKeys.length === 0) {
      setCommentOpen(false)
      setCommentValue('')
    }
  }, [selectedChangeKeys])

  if (!visibleFile) return null

  const selectSingleChange = (changeKey: string) => {
    setAnchorKey(changeKey)
    setSelectedChangeKeys([changeKey])
  }

  const handleChangeMouseDown = ({ change }: { change: ParsedChange | null }, event: ReactMouseEvent<HTMLElement>) => {
    if (!change || (change.type !== 'insert' && change.type !== 'delete')) return

    event.preventDefault()
    const nextKey = getChangeKey(change)
    if (!event.shiftKey || !anchorKey) {
      if (selectedChangeKeys.length === 1 && selectedChangeKeys[0] === nextKey) {
        setSelectedChangeKeys([])
        setAnchorKey(null)
        return
      }
      selectSingleChange(nextKey)
      setCommentOpen(false)
      setIsDragging(true)
      return
    }

    setSelectedChangeKeys(buildSelectedRange(visibleSelectableLines, anchorKey, nextKey))
    setCommentOpen(false)
    setIsDragging(true)
  }

  const handleChangeMouseEnter = ({ change }: { change: ParsedChange | null }) => {
    if (!change || (change.type !== 'insert' && change.type !== 'delete')) return
    const nextKey = getChangeKey(change)
    setHoveredChangeKey(nextKey)
    if (!isDragging || !anchorKey) return
    setSelectedChangeKeys(buildSelectedRange(visibleSelectableLines, anchorKey, nextKey))
  }

  const handleChangeMouseLeave = () => {
    if (!isDragging) setHoveredChangeKey(null)
  }

  const openCommentForChange = (change: ParsedChange) => {
    const nextKey = getChangeKey(change)
    selectSingleChange(nextKey)
    setCommentOpen(true)
  }

  const handleSubmitComment = () => {
    if (!selectedPayload || !onAskAboutSelection || !commentValue.trim()) return
    onAskAboutSelection({ ...selectedPayload, prompt: commentValue.trim() })
    setCommentOpen(false)
    setCommentValue('')
  }

  return (
    <div className="overflow-hidden rounded-lg border border-claude-border/70 bg-claude-bg">
      <div className="tool-diff-shell">
        <Diff
          viewType="unified"
          diffType={visibleFile.type}
          hunks={visibleFile.hunks}
          className="tool-diff-view"
          selectedChanges={selectedChangeKeys}
          generateLineClassName={({ changes, defaultGenerate }) => {
            const classNames = [defaultGenerate()]
            if (changes.some((change) => selectedChangeKeys.includes(getChangeKey(change)))) {
              classNames.push('tool-diff-line-selected')
            }
            return classNames.join(' ')
          }}
          renderGutter={({ change, renderDefault, side }) => {
            if (!change || (change.type !== 'insert' && change.type !== 'delete')) return renderDefault()
            const changeKey = getChangeKey(change)
            const shouldRenderAction =
              (change.type === 'insert' && side === 'new') || (change.type === 'delete' && side === 'old')
            const shouldRenderLineNumber =
              (change.type === 'insert' && side === 'new') || (change.type === 'delete' && side === 'old')
            const lineNumber =
              shouldRenderLineNumber &&
              reliableChangeKeys.has(changeKey) &&
              typeof change.lineNumber === 'number' &&
              change.lineNumber > 0
                ? change.lineNumber
                : null
            return (
              <div className="tool-diff-gutter-wrap">
                {lineNumber ? (
                  <span className="tool-diff-gutter-number">{lineNumber}</span>
                ) : (
                  <span className="tool-diff-gutter-number-hidden" />
                )}
                {shouldRenderAction && onAskAboutSelection ? (
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      openCommentForChange(change)
                    }}
                    className={`tool-line-action-button ${change.type === 'delete' ? 'tool-line-action-button-old' : ''} ${
                      hoveredChangeKey === changeKey && !selectedChangeKeys.includes(changeKey)
                        ? 'tool-line-action-button-visible'
                        : ''
                    }`}
                  >
                    +
                  </button>
                ) : null}
              </div>
            )
          }}
          gutterEvents={{ onMouseDown: handleChangeMouseDown, onMouseEnter: handleChangeMouseEnter, onMouseLeave: handleChangeMouseLeave }}
        >
          {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
        </Diff>
      </div>
      {hiddenCount > 0 && !showFullDiff && (
        <button
          type="button"
          onClick={onShowFullDiff}
          className="block w-full border-t border-claude-border/70 px-3 py-2 text-center text-[11px] text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/35"
        >
          {t('toolTimeline.showFullDiff', { count: hiddenCount })}
        </button>
      )}
      {selectedPayload && onAskAboutSelection && (
        <SelectionActionBar
          label={summarizeLineRange(selectedPayload.startLine, selectedPayload.endLine, language)}
          onAskAgain={() => onAskAboutSelection(selectedPayload)}
          onOpenComment={() => setCommentOpen(true)}
          commentOpen={commentOpen}
          commentValue={commentValue}
          onCommentChange={setCommentValue}
          onSubmitComment={handleSubmitComment}
          onCancelComment={() => {
            setCommentOpen(false)
            setCommentValue('')
          }}
        />
      )}
    </div>
  )
}
