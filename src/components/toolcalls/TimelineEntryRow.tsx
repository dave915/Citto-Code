import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { useSessionsStore } from '../../store/sessions'
import {
  buildDiffSegments,
  formatToolResult,
  getEditableToolPath,
  getEditDiffHunks,
  getSubagentSessionInfo,
  stripLineNumberPrefixes,
  type AskAboutSelectionPayload,
  type TimelineEntry,
} from '../../lib/toolCallUtils'
import { CodePreview } from './CodePreview'
import { DiffPreview } from './DiffPreview'
import { TodoPreview } from './TodoPreview'

export function TimelineEntryRow({
  entry,
  onAskAboutSelection,
}: {
  entry: TimelineEntry
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  const { language } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [showFullDiff, setShowFullDiff] = useState(false)
  const [editedFileContent, setEditedFileContent] = useState<string | null>(null)
  const [loadingEditedFile, setLoadingEditedFile] = useState(false)
  const [openingSubagentSession, setOpeningSubagentSession] = useState(false)
  const [subagentSessionError, setSubagentSessionError] = useState<string | null>(null)
  const importSession = useSessionsStore((state) => state.importSession)
  const setActiveSession = useSessionsStore((state) => state.setActiveSession)

  const primaryTool = entry.toolCalls[entry.toolCalls.length - 1]
  const primaryPath = getEditableToolPath(primaryTool.toolName, primaryTool.toolInput)
  const subagentSessionInfo = useMemo(() => getSubagentSessionInfo(primaryTool), [primaryTool])
  const diffHunks = useMemo(
    () => entry.toolCalls.flatMap((toolCall) => getEditDiffHunks(toolCall.toolName, toolCall.toolInput)),
    [entry.toolCalls],
  )
  const resultText = useMemo(() => formatToolResult(primaryTool.result), [primaryTool.result])
  const showCodePreview = entry.label === 'Read' && resultText.trim().length > 0
  const diffSegments = useMemo(
    () => buildDiffSegments(entry.toolCalls, editedFileContent),
    [entry.toolCalls, editedFileContent],
  )

  useEffect(() => {
    if (!expanded || !primaryPath) return
    let cancelled = false
    setLoadingEditedFile(true)

    window.claude.readFile(primaryPath)
      .then((file) => {
        if (!cancelled) setEditedFileContent(file?.content ?? null)
      })
      .catch(() => {
        if (!cancelled) setEditedFileContent(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingEditedFile(false)
      })

    return () => {
      cancelled = true
    }
  }, [expanded, primaryPath])

  const handleOpenSubagentSession = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (!subagentSessionInfo || openingSubagentSession) return

    const existingSession = useSessionsStore.getState().sessions.find(
      (session) => session.sessionId === subagentSessionInfo.lookupId,
    )
    if (existingSession) {
      setActiveSession(existingSession.id)
      return
    }

    setOpeningSubagentSession(true)
    setSubagentSessionError(null)

    try {
      const session = await window.claude.loadCliSession({ filePath: subagentSessionInfo.outputFile })
      if (!session) {
        setSubagentSessionError(language === 'en' ? 'The subagent transcript is not available yet.' : '서브에이전트 transcript를 아직 불러올 수 없습니다.')
        return
      }

      const importedId = importSession({
        ...session,
        sessionId: session.sessionId ?? subagentSessionInfo.lookupId,
        name: subagentSessionInfo.description?.trim()
          ? `${session.name} · ${subagentSessionInfo.description.trim()}`
          : session.name,
      })
      setActiveSession(importedId)
    } catch {
      setSubagentSessionError(language === 'en' ? 'An error occurred while opening the subagent session.' : '서브에이전트 세션을 여는 중 오류가 발생했습니다.')
    } finally {
      setOpeningSubagentSession(false)
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-1.5 text-[14px] leading-5 text-claude-muted">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-[1px] flex h-4 w-4 items-center justify-center text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
        >
          <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : 'rotate-0'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[14px] text-claude-muted/95">{entry.label}</span>
            {entry.badge && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="inline-flex max-w-[min(38rem,62vw)] items-center gap-1 truncate rounded-md bg-black/20 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-claude-text/90 outline-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
              >
                <span className="truncate">{entry.badge}</span>
              </button>
            )}
            {(entry.added > 0 || entry.removed > 0) && (
              <span className="shrink-0 font-mono text-[10px]">
                {entry.added > 0 && <span className="text-emerald-400">+{entry.added}</span>}
                {entry.removed > 0 && <span className="ml-1 text-red-400">-{entry.removed}</span>}
              </span>
            )}
          </div>

          {entry.detail && (
            <div className="mt-0.5 text-[10px] text-claude-muted/80">{entry.detail}</div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="ml-[10px] border-l border-claude-border/70 pl-3">
          {entry.kind === 'todo' ? (
            <TodoPreview toolCalls={entry.toolCalls} />
          ) : subagentSessionInfo ? (
            <div className="space-y-1 rounded-lg border border-claude-border/70 bg-claude-bg px-3 py-2">
              <div className="text-[11px] font-medium text-claude-text/80">{language === 'en' ? 'Subagent session' : '서브에이전트 세션'}</div>
              {subagentSessionInfo.description && (
                <div className="text-[11px] text-claude-muted/80">{subagentSessionInfo.description}</div>
              )}
              <div className="break-all font-mono text-[10px] text-claude-muted/80">{subagentSessionInfo.outputFile}</div>
              {subagentSessionError ? (
                <div className="text-[11px] text-amber-200">{subagentSessionError}</div>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenSubagentSession}
                  disabled={openingSubagentSession}
                  className="mt-1 rounded bg-claude-border/50 px-2 py-0.5 text-[11px] text-claude-text/80 transition-colors hover:bg-claude-border disabled:opacity-50"
                >
                  {language === 'en' ? 'Open session' : '세션 열기'}
                </button>
              )}
            </div>
          ) : entry.status === 'error' ? (
            <pre className="tool-error-block overflow-x-auto whitespace-pre-wrap break-all rounded-lg px-3 py-2 font-mono text-[11px] leading-5">
              {resultText}
            </pre>
          ) : diffHunks.length > 0 ? (
            <div className="space-y-1">
              <DiffPreview
                path={primaryPath ?? entry.badge ?? 'diff.txt'}
                diffSegments={diffSegments}
                diffHunks={diffHunks}
                editedFileContent={editedFileContent}
                showFullDiff={showFullDiff}
                onShowFullDiff={() => setShowFullDiff(true)}
                onAskAboutSelection={onAskAboutSelection}
              />
            </div>
          ) : loadingEditedFile ? (
            <div className="text-[11px] text-claude-muted">{language === 'en' ? 'Loading file contents...' : '파일 내용을 불러오는 중...'}</div>
          ) : showCodePreview ? (
            <div className="space-y-1">
              {(() => {
                const parsed = stripLineNumberPrefixes(resultText)
                return (
                  <CodePreview
                    code={parsed.code}
                    path={primaryPath}
                    startLine={parsed.startLine}
                    onAskAboutSelection={onAskAboutSelection}
                  />
                )
              })()}
            </div>
          ) : editedFileContent ? (
            <CodePreview code={editedFileContent} path={primaryPath} onAskAboutSelection={onAskAboutSelection} />
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-claude-border/70 bg-claude-bg px-3 py-2 font-mono text-[11px] leading-5 text-claude-text">
              {resultText}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
