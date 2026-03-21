import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { collectSubagentCalls } from '../../lib/agent-subcalls'
import { useI18n } from '../../hooks/useI18n'
import { useSessionsStore, type Session } from '../../store/sessions'

type Props = {
  session: Session
}

function CopyButton({
  text,
  label,
  copiedLabel,
}: {
  text: string
  label: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)

  if (!text.trim()) return null

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        }).catch(() => undefined)
      }}
      className="rounded-lg border border-claude-border/70 bg-claude-surface px-2.5 py-1 text-[11px] text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
    >
      {copied ? copiedLabel : label}
    </button>
  )
}

function getStatusLabel(status: 'pending' | 'running' | 'done' | 'error', language: string) {
  if (status === 'pending') return language === 'en' ? 'Pending' : '준비 중'
  if (status === 'running') return language === 'en' ? 'Running' : '실행 중'
  if (status === 'error') return language === 'en' ? 'Error' : '오류'
  return language === 'en' ? 'Done' : '완료'
}

function getStatusClassName(status: 'pending' | 'running' | 'done' | 'error') {
  if (status === 'pending') return 'border-amber-400/30 bg-amber-400/10 text-amber-100'
  if (status === 'running') return 'border-sky-400/30 bg-sky-400/10 text-sky-100'
  if (status === 'error') return 'border-red-400/30 bg-red-400/10 text-red-100'
  return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
}

function AgentDetailModal({
  session,
  selectedKey,
  onClose,
}: {
  session: Session
  selectedKey: string
  onClose: () => void
}) {
  const { language } = useI18n()
  const entries = useMemo(() => collectSubagentCalls(session.messages), [session.messages])
  const entry = entries.find((item) => item.key === selectedKey) ?? null
  const [loadedText, setLoadedText] = useState('')
  const [loadingText, setLoadingText] = useState(false)
  const [modalWidth, setModalWidth] = useState(760)
  const [modalHeight, setModalHeight] = useState(520)
  const [openingSession, setOpeningSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const importSession = useSessionsStore((state) => state.importSession)
  const setActiveSession = useSessionsStore((state) => state.setActiveSession)

  useEffect(() => {
    if (!entry?.transcriptPath) {
      setLoadedText('')
      return
    }

    let cancelled = false
    setLoadedText('')
    setLoadingText(true)

    void window.claude.loadCliSession({ filePath: entry.transcriptPath })
      .then((loadedSession) => {
        if (cancelled || !loadedSession) return
        const assistantText = loadedSession.messages
          .filter((message) => message.role === 'assistant' && message.text.trim())
          .map((message) => message.text.trim())
          .join('\n\n')
        setLoadedText(assistantText)
      })
      .catch(() => {
        if (!cancelled) setLoadedText('')
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false)
      })

    return () => {
      cancelled = true
    }
  }, [entry?.transcriptPath])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!entry) return null

  const prompt = entry.prompt ?? ''
  const resultText = entry.streamingText.trim() || loadedText.trim()
  const lookupId = entry.agentId
    ? `subagent:${entry.agentId}`
    : entry.sessionId?.startsWith('ses_')
      ? entry.sessionId
      : null

  const handleOpenSession = async () => {
    if (!entry.transcriptPath || openingSession) return

    const existingSession = lookupId
      ? useSessionsStore.getState().sessions.find((item) => item.sessionId === lookupId)
      : null
    if (existingSession) {
      setActiveSession(existingSession.id)
      return
    }

    setOpeningSession(true)
    setSessionError(null)

    try {
      const loadedSession = await window.claude.loadCliSession({ filePath: entry.transcriptPath })
      if (!loadedSession) {
        setSessionError(language === 'en' ? 'The subagent transcript is not available yet.' : '서브에이전트 transcript를 아직 불러올 수 없습니다.')
        return
      }

      const importedId = importSession(loadedSession)
      setActiveSession(importedId)
    } catch {
      setSessionError(language === 'en' ? 'Failed to open the subagent session.' : '서브에이전트 세션을 여는 중 오류가 발생했습니다.')
    } finally {
      setOpeningSession(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[130]">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center px-6 py-8">
        <div
          className="relative flex max-h-full max-w-full flex-col overflow-hidden rounded-[12px] border border-claude-border bg-claude-panel shadow-2xl"
          style={{ width: `${modalWidth}px`, height: `${modalHeight}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-claude-border/70 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-claude-text">
                  {entry.description || entry.agent || (language === 'en' ? 'Subagent' : '서브에이전트')}
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusClassName(entry.status)}`}>
                  {getStatusLabel(entry.status, language)}
                </span>
              </div>
              <div className="mt-1 text-xs text-claude-muted">
                {entry.agent ? `${entry.agent} · ` : ''}{entry.toolUseId}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-claude-border/70 bg-claude-surface px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
            >
              {language === 'en' ? 'Close' : '닫기'}
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <section className="min-w-0 rounded-2xl border border-claude-border/70 bg-claude-bg px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-claude-text/90">{language === 'en' ? 'Prompt' : '프롬프트'}</div>
                  <CopyButton
                    text={prompt}
                    label={language === 'en' ? 'Copy prompt' : '프롬프트 복사'}
                    copiedLabel={language === 'en' ? 'Copied' : '복사됨'}
                  />
                </div>
                <pre className="max-h-[18rem] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-claude-text/85">
                  {prompt || (language === 'en' ? 'No prompt available.' : '프롬프트 정보가 없습니다.')}
                </pre>
              </section>

              <section className="min-w-0 rounded-2xl border border-claude-border/70 bg-claude-bg px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-claude-text/90">{language === 'en' ? 'Result' : '결과'}</div>
                  <CopyButton
                    text={resultText}
                    label={language === 'en' ? 'Copy result' : '결과 복사'}
                    copiedLabel={language === 'en' ? 'Copied' : '복사됨'}
                  />
                </div>
                <div className="max-h-[18rem] overflow-auto overflow-x-hidden rounded-xl bg-claude-surface px-3 py-3">
                  {resultText ? (
                    <div className="prose max-w-none break-words text-[13px] leading-6 [overflow-wrap:anywhere]">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {resultText}
                      </ReactMarkdown>
                    </div>
                  ) : loadingText ? (
                    <div className="text-xs text-claude-muted">{language === 'en' ? 'Loading transcript...' : 'transcript를 불러오는 중...'}</div>
                  ) : (
                    <div className="text-xs text-claude-muted">{language === 'en' ? 'No output yet.' : '아직 출력이 없습니다.'}</div>
                  )}
                </div>
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-claude-muted">
              {entry.transcriptPath ? (
                <span className="rounded-full border border-claude-border/70 bg-claude-bg px-2.5 py-1 font-mono">
                  {entry.transcriptPath}
                </span>
              ) : null}
              {entry.transcriptPath ? (
                <button
                  type="button"
                  onClick={() => void handleOpenSession()}
                  disabled={openingSession}
                  className="rounded-lg border border-claude-border/70 bg-claude-surface px-2.5 py-1 text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
                >
                  {openingSession
                    ? (language === 'en' ? 'Opening...' : '여는 중...')
                    : (language === 'en' ? 'Open transcript session' : 'transcript 세션 열기')}
                </button>
              ) : null}
              {sessionError ? <span className="text-red-200">{sessionError}</span> : null}
            </div>
          </div>

          <button
            type="button"
            aria-label={language === 'en' ? 'Resize modal' : '모달 크기 조절'}
            onMouseDown={(event) => {
              event.preventDefault()
              const startX = event.clientX
              const startY = event.clientY
              const startWidth = modalWidth
              const startHeight = modalHeight

              const onMouseMove = (moveEvent: MouseEvent) => {
                setModalWidth(Math.max(620, startWidth + (moveEvent.clientX - startX)))
                setModalHeight(Math.max(420, startHeight + (moveEvent.clientY - startY)))
              }

              const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove)
                window.removeEventListener('mouseup', onMouseUp)
              }

              window.addEventListener('mousemove', onMouseMove)
              window.addEventListener('mouseup', onMouseUp)
            }}
            className="absolute bottom-2 right-2 h-6 w-6 rounded-md text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8 16h8M12 20h8M16 12h4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function AgentStatusBar({ session }: Props) {
  const { language } = useI18n()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const entries = useMemo(() => collectSubagentCalls(session.messages), [session.messages])

  useEffect(() => {
    if (!selectedKey) return
    if (entries.some((entry) => entry.key === selectedKey)) return
    setSelectedKey(null)
  }, [entries, selectedKey])

  if (entries.length === 0) return null

  const runningCount = entries.filter((entry) => entry.status === 'running' || entry.status === 'pending').length
  const completedCount = entries.filter((entry) => entry.status === 'done').length

  return (
    <>
      <div className="mb-3 rounded-[12px] border border-claude-border/80 bg-claude-panel/90 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-semibold text-claude-text/90">
            {language === 'en' ? 'Subagents' : '서브에이전트'}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-claude-muted">
            {runningCount > 0 ? <span>{language === 'en' ? `${runningCount} running` : `${runningCount}개 실행 중`}</span> : null}
            {completedCount > 0 ? <span>{language === 'en' ? `${completedCount} done` : `${completedCount}개 완료`}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {entries.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setSelectedKey(entry.key)}
              className="min-w-0 rounded-2xl border border-claude-border/70 bg-claude-bg px-3 py-2 text-left transition-colors hover:bg-claude-surface"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusClassName(entry.status)}`}>
                  {getStatusLabel(entry.status, language)}
                </span>
                <span className="truncate text-[12px] font-medium text-claude-text">
                  {entry.description || entry.agent || entry.toolUseId}
                </span>
              </div>
              <div className="mt-1 max-w-[26rem] truncate text-[11px] text-claude-muted">
                {entry.streamingText.trim() || entry.prompt || entry.toolUseId}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedKey ? (
        <AgentDetailModal
          session={session}
          selectedKey={selectedKey}
          onClose={() => setSelectedKey(null)}
        />
      ) : null}
    </>
  )
}
