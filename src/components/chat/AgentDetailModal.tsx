import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import type { SubagentCallSummary } from '../../lib/agent-subcalls'
import { useI18n } from '../../hooks/useI18n'
import { useSessionsStore } from '../../store/sessions'
import { AppButton, AppChip, AppPanel } from '../ui/appDesignSystem'
import { AgentStatusCopyButton } from './AgentStatusCopyButton'
import { getStatusClassName, getStatusLabel } from './agentStatusShared'

type ResizeState = {
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

type AgentDetailModalProps = {
  entry: SubagentCallSummary | null
  onClose: () => void
}

export function AgentDetailModal({ entry, onClose }: AgentDetailModalProps) {
  const { language, t } = useI18n()
  const [loadedText, setLoadedText] = useState('')
  const [loadingText, setLoadingText] = useState(false)
  const [modalWidth, setModalWidth] = useState(760)
  const [modalHeight, setModalHeight] = useState(520)
  const [openingSession, setOpeningSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const importSession = useSessionsStore((state) => state.importSession)
  const setActiveSession = useSessionsStore((state) => state.setActiveSession)

  const prompt = entry?.prompt ?? ''
  const resultText = useMemo(
    () => entry?.streamingText.trim() || loadedText.trim() || '',
    [entry?.streamingText, loadedText],
  )
  const lookupId = entry?.agentId
    ? `subagent:${entry.agentId}`
    : entry?.sessionId?.startsWith('ses_')
      ? entry.sessionId
      : null

  useEffect(() => {
    setSessionError(null)
  }, [entry?.key])

  useEffect(() => {
    if (!entry?.transcriptPath) {
      setLoadedText('')
      setLoadingText(false)
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
    if (!entry) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [entry, onClose])

  useEffect(() => {
    if (!resizeState) return

    const handlePointerMove = (event: PointerEvent) => {
      setModalWidth(Math.max(620, resizeState.startWidth + (event.clientX - resizeState.startX)))
      setModalHeight(Math.max(420, resizeState.startHeight + (event.clientY - resizeState.startY)))
    }

    const handlePointerEnd = () => {
      setResizeState(null)
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'nwse-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [resizeState])

  if (!entry) return null

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
        setSessionError(t('subagent.transcriptUnavailable'))
        return
      }

      const importedId = importSession(loadedSession)
      setActiveSession(importedId)
    } catch {
      setSessionError(t('subagent.openSessionFailed'))
    } finally {
      setOpeningSession(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[130]">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center px-6 py-8">
        <AppPanel
          className="relative flex max-h-full max-w-full flex-col overflow-hidden rounded-lg"
          style={{ width: `${modalWidth}px`, height: `${modalHeight}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-claude-border/70 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-claude-text">
                  {entry.description || entry.agent || t('subagent.defaultName')}
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusClassName(entry.status)}`}>
                  {getStatusLabel(entry.status, language)}
                </span>
              </div>
              <div className="mt-1 text-xs text-claude-muted">
                {entry.agent ? `${entry.agent} · ` : ''}{entry.toolUseId}
              </div>
            </div>

            <AppButton
              onClick={onClose}
              tone="ghost"
            >
              {t('common.close')}
            </AppButton>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <section className="min-w-0 rounded-lg border border-claude-border/70 bg-claude-bg px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-claude-text/90">{t('subagent.promptLabel')}</div>
                  <AgentStatusCopyButton
                    text={prompt}
                    label={t('subagent.copyPrompt')}
                    copiedLabel={t('common.copied')}
                  />
                </div>
                <pre className="max-h-[18rem] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-claude-text/85">
                  {prompt || t('subagent.noPrompt')}
                </pre>
              </section>

              <section className="min-w-0 rounded-lg border border-claude-border/70 bg-claude-bg px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-claude-text/90">{t('subagent.resultLabel')}</div>
                  <AgentStatusCopyButton
                    text={resultText}
                    label={t('subagent.copyResult')}
                    copiedLabel={t('common.copied')}
                  />
                </div>
                <div className="max-h-[18rem] overflow-auto overflow-x-hidden rounded-lg bg-claude-surface px-3 py-3">
                  {resultText ? (
                    <div className="prose max-w-none break-words text-[13px] leading-6 [overflow-wrap:anywhere]">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {resultText}
                      </ReactMarkdown>
                    </div>
                  ) : loadingText ? (
                    <div className="text-xs text-claude-muted">{t('subagent.loadingTranscript')}</div>
                  ) : (
                    <div className="text-xs text-claude-muted">{t('subagent.noOutput')}</div>
                  )}
                </div>
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-claude-muted">
              {entry.transcriptPath ? (
                <AppChip className="font-mono">
                  {entry.transcriptPath}
                </AppChip>
              ) : null}
              {entry.transcriptPath ? (
                <AppButton
                  onClick={() => void handleOpenSession()}
                  disabled={openingSession}
                  tone="ghost"
                  className="h-7 px-2.5 text-[11px]"
                >
                  {openingSession
                    ? t('subagent.opening')
                    : t('subagent.openTranscriptSession')}
                </AppButton>
              ) : null}
              {sessionError ? <span className="text-red-200">{sessionError}</span> : null}
            </div>
          </div>

          <button
            type="button"
            aria-label={t('subagent.resizeModal')}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              setResizeState({
                startX: event.clientX,
                startY: event.clientY,
                startWidth: modalWidth,
                startHeight: modalHeight,
              })
            }}
            className="absolute bottom-2 right-2 h-6 w-6 rounded-md text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8 16h8M12 20h8M16 12h4" strokeLinecap="round" />
            </svg>
          </button>
        </AppPanel>
      </div>
    </div>,
    document.body,
  )
}
