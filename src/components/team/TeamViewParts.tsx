import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { useI18n } from '../../hooks/useI18n'
import { translate, type AppLanguage } from '../../lib/i18n'
import { buildAttachmentCopyText, formatAttachedFilesSummary } from '../../lib/attachmentPrompts'
import type { AttachedFile } from '../../store/sessionTypes'
import type { AgentMessage, DiscussionMode, TeamAgent } from '../../store/teamTypes'
import { formatBytes } from '../input/inputUtils'
import { AgentPixelIcon } from './AgentPixelIcon'

export const DETAIL_PANEL_DEFAULT_WIDTH = 420
const DETAIL_PANEL_MIN_WIDTH = 320
const DETAIL_PANEL_MAX_WIDTH = 640

function getModeOptions(language: AppLanguage): { value: DiscussionMode; label: string; icon: string; desc: string }[] {
  return [
    {
      value: 'sequential',
      label: translate(language, 'team.mode.sequential.label'),
      icon: '→',
      desc: translate(language, 'team.mode.sequential.description'),
    },
    {
      value: 'parallel',
      label: translate(language, 'team.mode.parallel.label'),
      icon: '⇉',
      desc: translate(language, 'team.mode.parallel.description'),
    },
    {
      value: 'meeting',
      label: translate(language, 'team.mode.meeting.label'),
      icon: '◎',
      desc: translate(language, 'team.mode.meeting.description'),
    },
  ]
}

export function formatTeamTaskSummary(
  task: string,
  attachedFiles: AttachedFile[],
  language: AppLanguage,
) {
  const trimmed = task.trim()
  if (trimmed) return trimmed
  if (attachedFiles.length > 0) return formatAttachedFilesSummary(attachedFiles.length, language)
  return translate(language, 'team.noTopicYet')
}

export function clampDetailPanelWidth(width: number) {
  const viewportMax =
    typeof window === 'undefined'
      ? DETAIL_PANEL_MAX_WIDTH
      : Math.max(
          DETAIL_PANEL_MIN_WIDTH,
          Math.min(DETAIL_PANEL_MAX_WIDTH, window.innerWidth - 460),
        )

  return Math.min(viewportMax, Math.max(DETAIL_PANEL_MIN_WIDTH, width))
}

export function normalizeTeamProjectKey(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '~') return '~'

  const normalized = trimmed.replace(/\\/g, '/')
  if (normalized === '/') return normalized
  return normalized.replace(/\/+$/, '').toLowerCase()
}

export function ModeSelector({
  mode,
  disabled,
  onChange,
}: {
  mode: DiscussionMode
  disabled: boolean
  onChange: (m: DiscussionMode) => void
}) {
  const { language } = useI18n()
  const modeOptions = getModeOptions(language)

  return (
    <div className="flex items-center gap-1 rounded-lg border border-claude-border bg-claude-bg p-0.5">
      {modeOptions.map((opt) => (
        <button
          key={opt.value}
          disabled={disabled}
          title={opt.desc}
          onClick={() => onChange(opt.value)}
          className={`
            flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all
            disabled:cursor-not-allowed disabled:opacity-50
            ${mode === opt.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-claude-text-muted hover:text-claude-text'
            }
          `}
        >
          <span className="font-mono text-base leading-none">{opt.icon}</span>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const { language } = useI18n()
  const configs = {
    idle: { label: translate(language, 'team.status.idle'), className: 'bg-gray-500/20 text-gray-400' },
    running: { label: translate(language, 'team.status.running'), className: 'bg-blue-500/20 text-blue-400 animate-pulse' },
    done: { label: translate(language, 'team.status.done'), className: 'bg-green-500/20 text-green-400' },
    error: { label: translate(language, 'team.status.error'), className: 'bg-red-500/20 text-red-400' },
  }
  const config = configs[status as keyof typeof configs] ?? configs.idle
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none ${config.className}`}>
      {config.label}
    </span>
  )
}

function ThinkingBubble({ text }: { text: string }) {
  const { t } = useI18n()

  if (!text?.trim()) return null
  return (
    <div className="rounded-xl border border-blue-500/25 bg-blue-500/8 px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-500">
        {t('team.thinking')}
      </p>
      <p className="line-clamp-4 text-xs leading-relaxed text-claude-text/90">{text}</p>
    </div>
  )
}

function StreamingCursor() {
  return <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle bg-current" />
}

function AgentSpeechBubble({ text }: { text: string }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    setIsOverflowing(content.offsetHeight > viewport.clientHeight + 1)
  }, [text])

  return (
    <div className="pointer-events-none absolute left-1/2 top-[-40px] z-30 w-[152px] -translate-x-1/2">
      <div className="rounded-[8px] border border-[#d7c7b7] bg-[linear-gradient(180deg,#fffaf4_0%,#f9f0e6_100%)] px-3 py-2 text-left text-[11px] leading-[1.35] text-[#4b3c30] shadow-[0_3px_0_#d8ccb9,0_10px_18px_rgba(69,53,40,0.18)]">
        <div ref={viewportRef} className="relative flex max-h-[74px] items-end overflow-hidden">
          {isOverflowing && (
            <div className="absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-[#fffaf4] to-transparent opacity-95" />
          )}
          <span ref={contentRef} className="block w-full whitespace-pre-wrap break-words">
            {text}
          </span>
        </div>
      </div>
      <span className="absolute left-1/2 top-[100%] h-3 w-3 -translate-x-1/2 -translate-y-[5px] rotate-45 border-b border-r border-[#d7c7b7] bg-[#f9f0e6]" />
    </div>
  )
}

function SystemPromptHoverCard({ prompt }: { prompt: string }) {
  const { t } = useI18n()

  if (!prompt.trim()) return null

  return (
    <>
      <button
        type="button"
        className="peer/prompt flex h-7 w-7 items-center justify-center rounded-full text-claude-text-muted transition-colors hover:bg-white/5 hover:text-claude-text"
        aria-label={t('team.systemPrompt.show')}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v5m0-8h.01" />
        </svg>
      </button>
      <div
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-[24rem] rounded-2xl border border-claude-border bg-claude-panel/95 p-3 opacity-0 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm transition-opacity peer-hover/prompt:opacity-100 peer-focus-visible/prompt:opacity-100"
        style={{
          maxWidth: 'min(calc(100vw - 5rem), calc(var(--team-detail-width) - 3rem), 100%)',
        }}
      >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-claude-text-muted">
          {t('team.systemPrompt.title')}
        </p>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-claude-text">
          {prompt}
        </div>
      </div>
    </>
  )
}

export function TaskPopover({
  task,
  attachedFiles,
  language,
  onClose,
}: {
  task?: string
  attachedFiles: AttachedFile[]
  language: AppLanguage
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copyLabel = copied ? translate(language, 'common.copied') : translate(language, 'common.copy')
  const closeLabel = translate(language, 'team.taskPopover.close')

  useEffect(() => {
    if (!copied) return

    const timeoutId = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  useEffect(() => {
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => window.removeEventListener('keydown', handleKeyDownCapture, true)
  }, [onClose])

  const handleCopy = useCallback(() => {
    const nextText = buildAttachmentCopyText(task ?? '', attachedFiles, language)
    if (!nextText.trim()) return

    void navigator.clipboard.writeText(nextText).then(() => {
      setCopied(true)
    })
  }, [attachedFiles, language, task])

  if (typeof document === 'undefined' || (!task?.trim() && attachedFiles.length === 0)) return null

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        aria-label={closeLabel}
      />

      <div className="relative z-10 flex max-h-[min(76vh,48rem)] w-[min(44rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-[12px] border-2 border-[#96a3b0] bg-[linear-gradient(180deg,#ffffff,#edf2f6)] shadow-[0_18px_42px_rgba(38,52,68,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#d3dbe3] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#607080]">
              {translate(language, 'team.taskPopover.title')}
            </p>
            <p className="mt-1 text-xs text-[#6f8090]">
              {translate(language, 'team.taskPopover.description')}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-[#607080] transition-colors hover:bg-[#dfe7ef] hover:text-[#41515e]"
            aria-label={closeLabel}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="group/task relative min-h-0 flex-1 overflow-hidden">
          <button
            type="button"
            onClick={handleCopy}
            className="invisible absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-[#c8d2dc] bg-white/95 text-[#41515e] opacity-0 shadow-sm transition-all hover:bg-[#f4f7fa] group-hover/task:visible group-hover/task:opacity-100 group-focus-within/task:visible group-focus-within/task:opacity-100"
            title={copyLabel}
            aria-label={copyLabel}
          >
            {copied ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <rect x="9" y="9" width="10" height="10" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 9V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2h2" />
              </svg>
            )}
          </button>

          <div className="h-full overflow-y-auto px-5 py-4">
            {attachedFiles.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-1.5 rounded-xl border border-[#c8d2dc] bg-white/85 px-3 py-1.5 text-xs text-[#41515e]"
                  >
                    <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#607080]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="max-w-[240px] truncate font-medium">{file.name}</span>
                    <span className="text-[#6f8090]">{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            )}

            {task?.trim() ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#41515e]">
                {task}
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-[#6f8090]">
                {translate(language, 'team.taskPopover.filesOnly')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function getAgentSpeechPreview(agent: TeamAgent, language: AppLanguage) {
  if (!agent.isStreaming) return null
  return translate(language, 'team.agent.speakingPreview', { name: agent.name })
}

function AgentMessageCard({
  message,
  color,
  roundIndex,
  agentName,
  highlighted = false,
  containerRef,
}: {
  message: AgentMessage
  color: string
  roundIndex: number
  agentName: string
  highlighted?: boolean
  containerRef?: (node: HTMLDivElement | null) => void
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [showPopup, setShowPopup] = useState(false)

  useEffect(() => {
    if (!copied) return

    const timeoutId = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  const handleCopy = useCallback(() => {
    if (!message.text?.trim()) return

    void navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true)
    })
  }, [message.text])

  const canOpenPopup = Boolean(message.text?.trim() || message.thinking?.trim())

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`space-y-2 rounded-2xl bg-claude-bg-base/50 p-4 outline-none transition-all duration-300 ${
          highlighted ? 'bg-claude-surface/80' : ''
        }`}
        style={highlighted ? { boxShadow: `0 0 0 1px ${color}66, inset 0 0 0 1px ${color}22` } : undefined}
      >
        <div className="flex items-center gap-2 text-xs text-claude-text-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span>{t('team.roundWithNumber', { round: roundIndex + 1 })}</span>
        </div>

        {message.thinking && <ThinkingBubble text={message.thinking} />}

        <div
          className="group/message relative rounded-2xl border px-4 py-3 text-sm leading-relaxed text-claude-text"
          style={{ borderColor: `${color}44`, backgroundColor: `${color}10` }}
        >
          {(canOpenPopup || message.text?.trim()) && (
            <div className="pointer-events-auto absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-all group-hover/message:opacity-100 group-focus-within/message:opacity-100">
              {canOpenPopup ? (
                <button
                  type="button"
                  onClick={() => setShowPopup(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-panel/90 text-claude-muted transition-all hover:bg-claude-surface-2 hover:text-claude-text focus:outline-none focus-visible:text-claude-text"
                  title={t('team.message.openPopup')}
                  aria-label={t('team.message.openPopup')}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H5a1 1 0 00-1 1v4m11-5h4a1 1 0 011 1v4M4 15v4a1 1 0 001 1h4m11-5v4a1 1 0 01-1 1h-4" />
                  </svg>
                </button>
              ) : null}
              {message.text?.trim() ? (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-panel/90 text-claude-muted transition-all hover:bg-claude-surface-2 hover:text-claude-text focus:outline-none focus-visible:text-claude-text"
                  title={copied ? t('common.copied') : t('common.copy')}
                  aria-label={copied ? t('common.copied') : t('common.copy')}
                >
                  {copied ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <rect x="9" y="9" width="10" height="10" rx="2" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2h2" />
                    </svg>
                  )}
                </button>
              ) : null}
            </div>
          )}

          {message.text ? (
            <div className="prose prose-sm prose-invert max-w-none break-words pr-20 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown>{message.text}</ReactMarkdown>
            </div>
          ) : (
            <span className="text-xs text-claude-text-muted">{t('team.message.generating')}</span>
          )}
          {message.isStreaming && <StreamingCursor />}
        </div>
      </div>

      {showPopup && (
        <AgentMessagePopup
          agentName={agentName}
          message={message}
          color={color}
          roundIndex={roundIndex}
          onClose={() => setShowPopup(false)}
        />
      )}
    </>
  )
}

function AgentMessagePopup({
  agentName,
  message,
  color,
  roundIndex,
  onClose,
}: {
  agentName: string
  message: AgentMessage
  color: string
  roundIndex: number
  onClose: () => void
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => window.removeEventListener('keydown', handleKeyDownCapture, true)
  }, [onClose])

  useEffect(() => {
    if (!copied) return
    const timeoutId = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  const handleCopy = useCallback(() => {
    if (!message.text?.trim()) return

    void navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true)
    })
  }, [message.text])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[145] flex items-center justify-center p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label={t('common.close')}
      />

      <div className="relative z-10 flex max-h-[min(84vh,56rem)] w-[min(56rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-[18px] border border-claude-border bg-claude-panel shadow-[0_26px_70px_rgba(0,0,0,0.34)]">
        <div className="flex items-start justify-between gap-4 border-b border-claude-border/70 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <h3 className="truncate text-base font-semibold text-claude-text">{agentName}</h3>
              <span className="rounded-full border border-claude-border/70 px-2 py-0.5 text-[11px] text-claude-text-muted">
                {t('team.roundWithNumber', { round: roundIndex + 1 })}
              </span>
            </div>
            <p className="mt-1 text-xs text-claude-text-muted">{t('team.message.popupDescription')}</p>
          </div>

          <div className="flex items-center gap-2">
            {message.text?.trim() ? (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-claude-border/70 bg-claude-surface px-3 text-xs font-medium text-claude-text-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
              >
                {copied ? t('common.copied') : t('common.copy')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg border border-claude-border/70 bg-claude-surface px-3 text-xs font-medium text-claude-text-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
            >
              {t('common.close')}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {message.thinking ? (
            <div className="mb-4 rounded-2xl border border-blue-500/25 bg-blue-500/8 px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-blue-400">
                {t('team.thinking')}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-claude-text/90">
                {message.thinking}
              </p>
            </div>
          ) : null}

          <div
            className="rounded-[20px] border px-5 py-4 text-[15px] leading-8 text-claude-text"
            style={{ borderColor: `${color}44`, backgroundColor: `${color}12` }}
          >
            {message.text?.trim() ? (
              <div className="prose prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown>{message.text}</ReactMarkdown>
              </div>
            ) : (
              <span className="text-sm text-claude-text-muted">{t('team.message.generating')}</span>
            )}
            {message.isStreaming && <StreamingCursor />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function getOfficeCarpetInsets(agentCount: number) {
  const columns = agentCount <= 3 ? agentCount : agentCount <= 4 ? 2 : agentCount <= 6 ? 3 : 4

  switch (columns) {
    case 1:
      return { outer: '34%', inner: '37%' }
    case 2:
      return { outer: '25%', inner: '28%' }
    case 3:
      return { outer: '15.5%', inner: '18.5%' }
    default:
      return { outer: '10.5%', inner: '13.5%' }
  }
}

export function AgentSeat({
  agent,
  index,
  total,
  isFocused,
  isActive,
  onSelect,
}: {
  agent: TeamAgent
  index: number
  total: number
  isFocused: boolean
  isActive: boolean
  onSelect: () => void
}) {
  const columns = total <= 3 ? total : total <= 4 ? 2 : total <= 6 ? 3 : 4
  const rows = Math.ceil(total / Math.max(columns, 1))
  const column = index % Math.max(columns, 1)
  const row = Math.floor(index / Math.max(columns, 1))
  const xStart = columns === 1 ? 50 : columns === 2 ? 36 : columns === 3 ? 24 : 20
  const xEnd = 100 - xStart
  const yStart = rows === 1 ? 56 : rows === 2 ? 41 : 36
  const yEnd = rows === 1 ? 56 : rows === 2 ? 73 : 78
  const xBase =
    columns === 1
      ? 50
      : xStart + ((xEnd - xStart) * column) / Math.max(columns - 1, 1)
  const x = Math.min(82, Math.max(18, xBase))
  const y =
    rows === 1 ? 54 : yStart + ((yEnd - yStart) * row) / Math.max(rows - 1, 1)
  const nameTone = agent.error
    ? 'border-red-500 bg-red-50 text-red-900'
    : isFocused
      ? 'border-[#3958a8] bg-[#eef3ff] text-[#1b2950]'
      : 'border-[#8a7868] bg-[#f3e9dc] text-[#43342a]'
  const { language } = useI18n()
  const speechPreview = getAgentSpeechPreview(agent, language)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="absolute flex w-[116px] -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center transition-all duration-200 hover:scale-[1.03]"
      style={{
        left: `${x}%`,
        top: `${y}%`,
      }}
    >
      <div className="relative h-[108px] w-[104px]">
        {speechPreview && <AgentSpeechBubble text={speechPreview} />}

        <span
          className={`absolute left-1/2 top-[84px] z-20 max-w-[84px] -translate-x-1/2 truncate rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${nameTone}`}
          style={{
            boxShadow: isFocused ? '0 2px 0 rgba(57,88,168,0.2)' : '0 2px 0 rgba(76,60,49,0.12)',
          }}
        >
          {agent.name}
        </span>

        <span className="absolute left-1/2 top-[81px] h-[8px] w-[48px] -translate-x-1/2 bg-black/8 blur-sm" />
        <span className="absolute left-1/2 top-[88px] h-[16px] w-[12px] -translate-x-1/2 bg-[#524236]" />
        <span className="absolute left-1/2 top-[98px] h-[8px] w-[30px] -translate-x-1/2 border border-[#6b5e53] bg-[#b5a89a]" />

        <div
          className="absolute left-1/2 top-[14px] h-[24px] w-[38px] -translate-x-1/2 border-2 border-[#34414f] bg-[linear-gradient(180deg,#6d7f99_0%,#4a596c_100%)]"
          style={{
            boxShadow: isActive
              ? `0 0 0 2px ${agent.color}55, 0 0 12px ${agent.color}30, 0 3px 0 #283240`
              : '0 3px 0 #283240',
          }}
        >
          <span
            className="absolute inset-[3px] border border-black/30"
            style={{ backgroundColor: isActive ? `${agent.color}99` : '#dbe9f9' }}
          />
          <span className="absolute bottom-[-8px] left-1/2 h-[8px] w-[6px] -translate-x-1/2 bg-[#566172]" />
        </div>

        <div
          className="absolute left-1/2 top-[40px] flex h-[30px] w-[86px] -translate-x-1/2 items-start justify-center border-2 border-[#56402f] bg-[linear-gradient(180deg,#89664b_0%,#6b4d39_100%)]"
          style={{
            boxShadow: isFocused
              ? `0 0 0 2px ${agent.color}40, 0 4px 0 #5b412f`
              : '0 4px 0 #5b412f',
          }}
        >
          <span className="absolute inset-x-[8px] top-[4px] h-[6px] bg-white/10" />
          <span className="absolute inset-x-[18px] top-[14px] h-[5px] border border-[#6c5140] bg-[#9a7760]" />
          <div className="relative z-10 mt-[2px]">
            <AgentPixelIcon type={agent.iconType} size={40} color={agent.color} />
          </div>
          {agent.isStreaming && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3 w-3">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                style={{ backgroundColor: agent.color }}
              />
              <span
                className="relative inline-flex h-3 w-3 rounded-full border border-black/30"
                style={{ backgroundColor: agent.color }}
              />
            </span>
          )}
        </div>

        <div className="absolute left-1/2 top-[74px] h-[18px] w-[38px] -translate-x-1/2 border-2 border-[#774a29] bg-[linear-gradient(180deg,#cc8753_0%,#a35e35_100%)]">
          <span className="absolute inset-x-[6px] top-[4px] h-[4px] bg-white/8" />
        </div>

        {agent.error && (
          <span className="absolute right-[2px] top-[30px] border border-red-900 bg-red-500 px-1 py-0.5 text-[9px] font-bold text-white shadow-lg">
            !
          </span>
        )}
        {isFocused && (
          <span className="absolute inset-[10px] -z-10 bg-white/8 blur-xl" />
        )}
      </div>
    </button>
  )
}

export function SelectedAgentPanel({
  agent,
  isFirst,
  roundNumber,
}: {
  agent: TeamAgent
  isFirst: boolean
  roundNumber: number
}) {
  const { t } = useI18n()
  const latestMessage = agent.messages.at(-1)
  const preview = latestMessage?.text?.trim() || latestMessage?.thinking?.trim() || ''
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    setHighlightedMessageId(null)
    messageRefs.current = {}
  }, [agent.id])

  useEffect(() => {
    if (!highlightedMessageId) return

    const timeoutId = window.setTimeout(() => {
      setHighlightedMessageId(null)
    }, 1800)

    return () => window.clearTimeout(timeoutId)
  }, [highlightedMessageId])

  const focusMessage = useCallback((messageId: string) => {
    const node = messageRefs.current[messageId]
    if (!node) return

    setHighlightedMessageId(messageId)
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    requestAnimationFrame(() => {
      node.focus({ preventScroll: true })
    })
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[16px] border border-claude-border bg-claude-bg-base/70 backdrop-blur-sm">
      <div
        className="shrink-0 rounded-t-[16px] border-b border-claude-border px-4 py-5"
        style={{ background: `linear-gradient(160deg, ${agent.color}20 0%, transparent 70%)` }}
      >
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <AgentPixelIcon type={agent.iconType} size={56} color={agent.color} />
            {agent.isStreaming && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                  style={{ backgroundColor: agent.color }}
                />
                <span
                  className="relative inline-flex h-4 w-4 rounded-full border border-black/30"
                  style={{ backgroundColor: agent.color }}
                />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-claude-text">{agent.name}</h3>
              {agent.systemPrompt && <SystemPromptHoverCard prompt={agent.systemPrompt} />}
              {isFirst && (
                <span
                  className="rounded-full border px-2 py-1 text-[11px] font-medium"
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.14)',
                    borderColor: 'rgba(59, 130, 246, 0.28)',
                    color: '#2f6fe4',
                  }}
                >
                  {t('team.panel.firstAgent')}
                </span>
              )}
              {agent.isStreaming && (
                <span className="rounded-full px-2 py-1 text-[11px] font-medium" style={{ backgroundColor: `${agent.color}22`, color: agent.color }}>
                  {t('team.panel.speaking')}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-claude-text-muted">{agent.role}</p>
            {agent.description && (
              <p className="mt-2 text-sm leading-relaxed text-claude-text-muted">
                {agent.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-claude-border px-2.5 py-1 text-xs text-claude-text-muted">
            {t('team.panel.messageCount', { count: agent.messages.length })}
          </span>
          <span className="rounded-full border border-claude-border px-2.5 py-1 text-xs text-claude-text-muted">
            {t('team.panel.currentRound', { round: roundNumber })}
          </span>
        </div>

        {preview && latestMessage && (
          <button
            type="button"
            onClick={() => focusMessage(latestMessage.id)}
            className="mt-4 block w-full rounded-2xl border border-claude-border bg-claude-surface/80 px-4 py-3 text-left transition-colors hover:bg-claude-surface focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-border"
          >
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-claude-text/65">
              {t('team.panel.latestCue')}
            </p>
            <p className="line-clamp-3 text-sm leading-relaxed text-claude-text">{preview}</p>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-3 pt-2">
        {agent.messages.length === 0 && !agent.isStreaming && !agent.error ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-claude-border bg-claude-bg/60 text-center">
            <AgentPixelIcon type={agent.iconType} size={60} color={agent.color} />
            <div>
              <p className="text-sm font-medium text-claude-text">{t('team.panel.emptyTitle')}</p>
              <p className="mt-1 text-xs text-claude-text-muted">
                {t('team.panel.emptyDescription')}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {agent.messages.map((message, index) => (
              <AgentMessageCard
                key={message.id}
                message={message}
                color={agent.color}
                roundIndex={index}
                agentName={agent.name}
                highlighted={message.id === highlightedMessageId}
                containerRef={(node) => {
                  if (node) {
                    messageRefs.current[message.id] = node
                  } else {
                    delete messageRefs.current[message.id]
                  }
                }}
              />
            ))}

            {agent.error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {t('team.panel.error', { error: agent.error })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
