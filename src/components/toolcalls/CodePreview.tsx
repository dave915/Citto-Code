import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { codeToTokens } from 'shiki'
import { useI18n } from '../../hooks/useI18n'
import { inferLanguageFromPath, type AskAboutSelectionPayload } from '../../lib/toolCallUtils'
import { SelectionActionBar } from './SelectionActionBar'
import { buildSelectionPayload, summarizeLineRange } from './selectionUtils'

type TokenLine = Array<{ content: string; color?: string; fontStyle?: number }>

function getShikiTheme(): string {
  if (typeof document === 'undefined') return 'github-dark'
  const themeId = document.documentElement.dataset.theme ?? 'current'
  return ['paper', 'mist', 'stone', 'sakura', 'mint', 'lavender'].includes(themeId) ? 'github-light' : 'github-dark'
}

export function CodePreview({
  code,
  path,
  startLine = 1,
  onAskAboutSelection,
}: {
  code: string
  path?: string | null
  startLine?: number
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  const { language } = useI18n()
  const [highlightReady, setHighlightReady] = useState(false)
  const [tokenLines, setTokenLines] = useState<TokenLine[]>([])
  const [anchorLine, setAnchorLine] = useState<number | null>(null)
  const [selectedLines, setSelectedLines] = useState<number[]>([])
  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentValue, setCommentValue] = useState('')

  useEffect(() => {
    let cancelled = false
    const language = inferLanguageFromPath(path) as Parameters<typeof codeToTokens>[1]['lang']
    const theme = getShikiTheme()

    codeToTokens(code, {
      lang: language,
      theme,
    })
      .then((result) => {
        if (!cancelled) {
          setTokenLines(result.tokens as TokenLine[])
          setHighlightReady(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTokenLines([])
          setHighlightReady(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [code, path])

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
    if (selectedLines.length === 0) {
      setCommentOpen(false)
      setCommentValue('')
    }
  }, [selectedLines])

  const codeLines = useMemo(() => code.split('\n'), [code])
  const selectedCodeLines = useMemo(() => (
    [...selectedLines]
      .sort((a, b) => a - b)
      .map((lineNumber) => ({
        lineNumber,
        text: codeLines[lineNumber - startLine] ?? '',
      }))
  ), [codeLines, selectedLines, startLine])
  const selectedPayload = useMemo(
    () => (path ? buildSelectionPayload('code', path, selectedCodeLines) : null),
    [path, selectedCodeLines],
  )

  const selectSingleLine = (lineNumber: number) => {
    setAnchorLine(lineNumber)
    setSelectedLines([lineNumber])
  }

  const handleLineMouseDown = (lineNumber: number, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    if (!event.shiftKey || anchorLine === null) {
      if (selectedLines.length === 1 && selectedLines[0] === lineNumber) {
        setSelectedLines([])
        setAnchorLine(null)
        return
      }

      selectSingleLine(lineNumber)
      setCommentOpen(false)
      setIsDragging(true)
      return
    }

    const start = Math.min(anchorLine, lineNumber)
    const end = Math.max(anchorLine, lineNumber)
    setSelectedLines(Array.from({ length: end - start + 1 }, (_, index) => start + index))
    setCommentOpen(false)
    setIsDragging(true)
  }

  const handleLineMouseEnter = (lineNumber: number) => {
    setHoveredLine(lineNumber)
    if (!isDragging || anchorLine === null) return
    const start = Math.min(anchorLine, lineNumber)
    const end = Math.max(anchorLine, lineNumber)
    setSelectedLines(Array.from({ length: end - start + 1 }, (_, index) => start + index))
  }

  const handleLineMouseLeave = () => {
    if (!isDragging) setHoveredLine(null)
  }

  const openCommentForLine = (lineNumber: number) => {
    selectSingleLine(lineNumber)
    setCommentOpen(true)
  }

  const handleSubmitComment = () => {
    if (!selectedPayload || !onAskAboutSelection || !commentValue.trim()) return
    onAskAboutSelection({ ...selectedPayload, prompt: commentValue.trim() })
    setCommentOpen(false)
    setCommentValue('')
  }

  if (!highlightReady) {
    return (
      <div className="overflow-x-auto rounded-lg border border-claude-border/70 bg-claude-bg px-3 py-2 font-mono text-[11px] leading-5 text-claude-text">
        <pre className="whitespace-pre-wrap break-all">{code}</pre>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-claude-border/70 bg-claude-bg">
      <div className="tool-code-review overflow-x-auto">
        <div className="tool-code-review-table">
          {tokenLines.map((line, index) => {
            const lineNumber = index + startLine
            const isSelected = selectedLines.includes(lineNumber)
            return (
              <div
                key={lineNumber}
                className={`tool-code-review-row ${isSelected ? 'tool-code-review-row-selected' : ''}`}
              >
                <span
                  className="tool-code-review-gutter"
                  onMouseDown={(event) => handleLineMouseDown(lineNumber, event)}
                  onMouseEnter={() => handleLineMouseEnter(lineNumber)}
                  onMouseLeave={handleLineMouseLeave}
                >
                  <span>{lineNumber}</span>
                  {onAskAboutSelection ? (
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        openCommentForLine(lineNumber)
                      }}
                      className={`tool-line-action-button ${
                        hoveredLine === lineNumber && !isSelected ? 'tool-line-action-button-visible' : ''
                      }`}
                    >
                      +
                    </button>
                  ) : null}
                </span>
                <span className="tool-code-review-content">
                  {line.length > 0 ? line.map((token, tokenIndex) => (
                    <span
                      key={`${lineNumber}-${tokenIndex}`}
                      style={{
                        color: token.color,
                        fontStyle: token.fontStyle === 1 ? 'italic' : 'normal',
                        fontWeight: token.fontStyle === 2 ? 600 : undefined,
                      }}
                    >
                      {token.content}
                    </span>
                  )) : ' '}
                </span>
              </div>
            )
          })}
        </div>
      </div>
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
