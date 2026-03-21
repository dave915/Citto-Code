import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import ReactMarkdown from 'react-markdown'
import { useTeamStore } from '../../store/teamStore'
import { useAgentTeamStream } from '../../hooks/useAgentTeam'
import { TeamSetupModal } from './TeamSetupModal'
import type { AgentIconType } from './AgentPixelIcon'
import { AgentPixelIcon } from './AgentPixelIcon'
import type { DiscussionMode, TeamAgent, AgentMessage } from '../../store/teamTypes'
import { resolveAgentColor } from '../../lib/teamAgentPresets'

type Props = {
  defaultCwd: string
  envVars: Record<string, string>
  claudeBinaryPath?: string
  onClose: () => void
}

const MODE_OPTIONS: { value: DiscussionMode; label: string; icon: string; desc: string }[] = [
  {
    value: 'sequential',
    label: '순차',
    icon: '→',
    desc: '앞 에이전트 응답을 보며 차례로 발언',
  },
  {
    value: 'parallel',
    label: '병렬',
    icon: '⇉',
    desc: '모두 동시에 독립 응답 후 서로 참고',
  },
  {
    value: 'meeting',
    label: '회의',
    icon: '◎',
    desc: '여러 라운드 맞대응하며 합의 도출',
  },
]

const DETAIL_PANEL_DEFAULT_WIDTH = 420
const DETAIL_PANEL_MIN_WIDTH = 320
const DETAIL_PANEL_MAX_WIDTH = 640
const TEAM_TASK_TEXTAREA_MAX_HEIGHT = 140

function clampDetailPanelWidth(width: number) {
  const viewportMax =
    typeof window === 'undefined'
      ? DETAIL_PANEL_MAX_WIDTH
      : Math.max(
          DETAIL_PANEL_MIN_WIDTH,
          Math.min(DETAIL_PANEL_MAX_WIDTH, window.innerWidth - 460),
        )

  return Math.min(viewportMax, Math.max(DETAIL_PANEL_MIN_WIDTH, width))
}

function ModeSelector({
  mode,
  disabled,
  onChange,
}: {
  mode: DiscussionMode
  disabled: boolean
  onChange: (m: DiscussionMode) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-claude-border bg-claude-bg p-0.5">
      {MODE_OPTIONS.map((opt) => (
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

function StatusBadge({ status }: { status: string }) {
  const configs = {
    idle: { label: '대기 중', className: 'bg-gray-500/20 text-gray-400' },
    running: { label: '토론 중', className: 'bg-blue-500/20 text-blue-400 animate-pulse' },
    done: { label: '완료', className: 'bg-green-500/20 text-green-400' },
    error: { label: '오류', className: 'bg-red-500/20 text-red-400' },
  }
  const c = configs[status as keyof typeof configs] ?? configs.idle
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none ${c.className}`}>
      {c.label}
    </span>
  )
}

function ThinkingBubble({ text }: { text: string }) {
  if (!text?.trim()) return null
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-300/90">
        Thinking
      </p>
      <p className="line-clamp-4 text-xs leading-relaxed text-blue-100/75">{text}</p>
    </div>
  )
}

function StreamingCursor() {
  return <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle bg-current" />
}

function AgentSpeechBubble({
  text,
}: {
  text: string
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const nextOverflowing = content.offsetHeight > viewport.clientHeight + 1
    setIsOverflowing(nextOverflowing)
  }, [text])

  return (
    <div className="pointer-events-none absolute left-1/2 top-[-40px] z-30 w-[152px] -translate-x-1/2">
      <div className="rounded-[14px] border border-[#d7c7b7] bg-[linear-gradient(180deg,#fffaf4_0%,#f9f0e6_100%)] px-3 py-2 text-left text-[11px] leading-[1.35] text-[#4b3c30] shadow-[0_3px_0_#d8ccb9,0_10px_18px_rgba(69,53,40,0.18)]">
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
  if (!prompt.trim()) return null

  return (
    <>
      <button
        type="button"
        className="peer/prompt flex h-7 w-7 items-center justify-center rounded-full text-claude-text-muted transition-colors hover:bg-white/5 hover:text-claude-text"
        aria-label="시스템 프롬프트 보기"
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
          시스템 프롬프트
        </p>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-claude-text">
          {prompt}
        </div>
      </div>
    </>
  )
}

function getAgentSpeechPreview(agent: TeamAgent) {
  if (!agent.isStreaming) return null
  return `${agent.name}가 발언중입니다.`
}

function AgentMessageCard({
  message,
  color,
  roundIndex,
  highlighted = false,
  containerRef,
}: {
  message: AgentMessage
  color: string
  roundIndex: number
  highlighted?: boolean
  containerRef?: (node: HTMLDivElement | null) => void
}) {
  const [copied, setCopied] = useState(false)

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

  return (
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
        <span>Round {roundIndex + 1}</span>
      </div>

      {message.thinking && <ThinkingBubble text={message.thinking} />}

      <div
        className="group/message relative rounded-2xl border px-4 py-3 text-sm leading-relaxed text-claude-text"
        style={{ borderColor: `${color}44`, backgroundColor: `${color}10` }}
      >
        {message.text?.trim() && (
          <button
            type="button"
            onClick={handleCopy}
            className="pointer-events-auto absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-panel/90 text-claude-muted opacity-0 transition-all hover:bg-claude-surface-2 hover:text-claude-text group-hover/message:opacity-100 focus:outline-none focus-visible:opacity-100"
            title={copied ? '복사됨' : '복사'}
            aria-label={copied ? '복사됨' : '복사'}
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
        )}

        {message.text ? (
          <div className="prose prose-sm prose-invert max-w-none break-words pr-10 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown>{message.text}</ReactMarkdown>
          </div>
        ) : (
          <span className="text-xs text-claude-text-muted">응답 생성 중...</span>
        )}
        {message.isStreaming && <StreamingCursor />}
      </div>
    </div>
  )
}

function getOfficeCarpetInsets(agentCount: number) {
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

function AgentSeat({
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
  const speechPreview = getAgentSpeechPreview(agent)

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

function SelectedAgentPanel({
  agent,
  isFirst,
  roundNumber,
}: {
  agent: TeamAgent
  isFirst: boolean
  roundNumber: number
}) {
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
    <div className="flex h-full min-h-0 flex-col rounded-[28px] border border-claude-border bg-claude-bg-base/70 backdrop-blur-sm">
      <div
        className="shrink-0 rounded-t-[28px] border-b border-claude-border px-4 py-5"
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
                <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[11px] font-medium text-blue-300">
                  선발 에이전트
                </span>
              )}
              {agent.isStreaming && (
                <span className="rounded-full px-2 py-1 text-[11px] font-medium" style={{ backgroundColor: `${agent.color}22`, color: agent.color }}>
                  발언 중
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
            {agent.messages.length}개 발언
          </span>
          <span className="rounded-full border border-claude-border px-2.5 py-1 text-xs text-claude-text-muted">
            현재 Round {roundNumber}
          </span>
        </div>

        {preview && latestMessage && (
          <button
            type="button"
            onClick={() => focusMessage(latestMessage.id)}
            className="mt-4 block w-full rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-left transition-colors hover:bg-black/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
          >
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Latest cue
            </p>
            <p className="line-clamp-3 text-sm leading-relaxed text-white/80">{preview}</p>
          </button>
        )}

      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-3 pt-2">
        {agent.messages.length === 0 && !agent.isStreaming && !agent.error ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-claude-border bg-claude-bg/60 text-center">
            <AgentPixelIcon type={agent.iconType} size={60} color={agent.color} />
            <div>
              <p className="text-sm font-medium text-claude-text">아직 발언이 없습니다</p>
              <p className="mt-1 text-xs text-claude-text-muted">
                토론이 시작되면 이곳에서 전체 내용을 확인할 수 있습니다
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
                오류: {agent.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function TeamView({ defaultCwd, envVars, claudeBinaryPath, onClose }: Props) {
  const {
    teams,
    activeTeamId,
    addTeam,
    removeTeam,
    setActiveTeam,
    setTeamMode,
    resetDiscussion,
  } = useTeamStore()

  const { startDiscussion, continueDiscussion, abortDiscussion } = useAgentTeamStream(
    envVars,
    claudeBinaryPath,
  )

  const [showSetup, setShowSetup] = useState(false)
  const [task, setTask] = useState('')
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const [detailPanelWidth, setDetailPanelWidth] = useState(DETAIL_PANEL_DEFAULT_WIDTH)
  const [isResizingDetailPanel, setIsResizingDetailPanel] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const escapePressedAtRef = useRef(0)
  const detailPanelResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const activeTeam = activeTeamId ? teams.find((t) => t.id === activeTeamId) ?? null : null
  const displayActiveTeam = activeTeam
    ? {
        ...activeTeam,
        agents: activeTeam.agents.map((agent) => ({
          ...agent,
          color: resolveAgentColor(agent.iconType, agent.color),
        })),
      }
    : null

  // Determine which agent is currently active (streaming)
  const activeAgentId = activeTeam?.agents.find((a) => a.isStreaming)?.id ?? null
  const focusedAgent =
    displayActiveTeam?.agents.find((agent) => agent.id === focusedAgentId)
    ?? displayActiveTeam?.agents[0]
    ?? null
  const carpetInsets = displayActiveTeam
    ? getOfficeCarpetInsets(displayActiveTeam.agents.length)
    : { outer: '15.5%', inner: '18.5%' }
  const detailPanelStyle: CSSProperties = {
    ['--team-detail-width' as string]: `${detailPanelWidth}px`,
  }

  useEffect(() => {
    if (!displayActiveTeam) {
      setFocusedAgentId(null)
      return
    }

    const hasFocusedAgent = focusedAgentId
      ? displayActiveTeam.agents.some((agent) => agent.id === focusedAgentId)
      : false

    if (!hasFocusedAgent) {
      setFocusedAgentId(displayActiveTeam.agents[0]?.id ?? null)
    }
  }, [displayActiveTeam, focusedAgentId])

  useEffect(() => {
    setDetailPanelWidth((current) => clampDetailPanelWidth(current))

    const handleWindowResize = () => {
      setDetailPanelWidth((current) => clampDetailPanelWidth(current))
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  useEffect(() => {
    if (!isResizingDetailPanel) return

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = detailPanelResizeStateRef.current
      if (!resizeState) return

      const deltaX = event.clientX - resizeState.startX
      setDetailPanelWidth(clampDetailPanelWidth(resizeState.startWidth - deltaX))
    }

    const handlePointerEnd = () => {
      detailPanelResizeStateRef.current = null
      setIsResizingDetailPanel(false)
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
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
  }, [isResizingDetailPanel])

  useEffect(() => {
    if (activeTeam?.status !== 'running') {
      escapePressedAtRef.current = 0
      return
    }

    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      const now = Date.now()
      event.preventDefault()
      event.stopPropagation()

      if (now - escapePressedAtRef.current < 600) {
        escapePressedAtRef.current = 0
        void abortDiscussion(activeTeam.id)
        return
      }

      escapePressedAtRef.current = now
    }

    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => window.removeEventListener('keydown', onKeyDownCapture, true)
  }, [activeTeam, abortDiscussion])

  const handleDetailPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return

      detailPanelResizeStateRef.current = {
        startX: event.clientX,
        startWidth: detailPanelWidth,
      }
      setIsResizingDetailPanel(true)
      event.preventDefault()
    },
    [detailPanelWidth],
  )

  function handleCreateTeam(
    teamName: string,
    cwd: string,
    selectedAgents: Array<{
      id: string
      name: string
      role: string
      description: string
      color: string
      iconType: AgentIconType
      isCustom: boolean
      systemPrompt: string
    }>,
  ) {
    addTeam(
      cwd,
      teamName,
      selectedAgents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        description: a.description,
        color: a.color,
        iconType: a.iconType,
        emoji: '',
        systemPrompt: a.systemPrompt,
        isCustom: a.isCustom,
      })),
    )
    setShowSetup(false)
    setTask('')
  }

  const syncTextareaHeight = useCallback((value: string) => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, TEAM_TASK_TEXTAREA_MAX_HEIGHT)}px`
    if (value.length === 0) {
      textareaRef.current.style.height = 'auto'
    }
  }, [])

  useEffect(() => {
    syncTextareaHeight(task)
  }, [syncTextareaHeight, task])

  const handleStart = useCallback(async () => {
    if (!activeTeam || !task.trim() || activeTeam.status === 'running') return
    await startDiscussion(activeTeam.id, task.trim())
    setTask('')
    requestAnimationFrame(() => syncTextareaHeight(''))
  }, [activeTeam, startDiscussion, syncTextareaHeight, task])

  const handleContinue = useCallback(async () => {
    if (!activeTeam) return
    await continueDiscussion(activeTeam.id)
  }, [activeTeam, continueDiscussion])

  const handleAbort = useCallback(async () => {
    if (!activeTeam) return
    await abortDiscussion(activeTeam.id)
  }, [activeTeam, abortDiscussion])

  const handleReset = useCallback(() => {
    if (!activeTeam) return
    resetDiscussion(activeTeam.id)
    setTask('')
  }, [activeTeam, resetDiscussion])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing || isComposingRef.current) return
    e.preventDefault()
    void handleStart()
  }

  // Empty state (no teams yet)
  if (teams.length === 0) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-6 bg-claude-bg">
          {/* Hero */}
          <div className="flex items-end gap-2">
            {(['architect', 'critic', 'developer'] as AgentIconType[]).map((type, i) => (
              <div
                key={type}
                className="animate-bounce"
                style={{ animationDelay: `${i * 150}ms`, animationDuration: '2s' }}
              >
                <AgentPixelIcon
                  type={type}
                  size={i === 1 ? 64 : 48}
                  color={i === 0 ? '#F97316' : i === 1 ? '#EF4444' : '#10B981'}
                />
              </div>
            ))}
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-claude-text">에이전트 팀</h2>
            <p className="mt-2 max-w-sm text-sm text-claude-text-muted leading-relaxed">
              여러 AI 에이전트들이 함께 의논·토론·협력하며
              <br />더 나은 답을 찾아갑니다
            </p>
          </div>

          <button
            onClick={() => setShowSetup(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            첫 팀 만들기
          </button>
        </div>

        {showSetup && (
          <TeamSetupModal
            defaultCwd={defaultCwd}
            onConfirm={handleCreateTeam}
            onClose={() => setShowSetup(false)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="flex h-full flex-col bg-claude-bg">
        {/* Top bar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-claude-border px-4 py-3">
          {/* Back / close */}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-claude-text-muted hover:bg-claude-bg-hover hover:text-claude-text"
            title="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {/* Team selector */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setActiveTeam(team.id)}
                className={`
                  flex min-w-0 max-w-[220px] items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors
                  ${team.id === activeTeamId
                    ? 'bg-claude-bg-hover text-claude-text font-medium'
                    : 'text-claude-text-muted hover:text-claude-text'
                  }
                `}
              >
                <span className="min-w-0 flex-1 truncate text-left">{team.name}</span>
                <StatusBadge status={team.status} />
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowSetup(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/30"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            새 팀
          </button>

        </div>

        {displayActiveTeam && (
          <>
            {/* Team info bar */}
            <div className="flex shrink-0 items-center gap-3 border-b border-claude-border bg-claude-bg-base/50 px-4 py-2">
              {/* Mode selector */}
              <ModeSelector
                mode={displayActiveTeam.mode ?? 'sequential'}
                disabled={activeTeam?.status === 'running'}
                onChange={(m) => setTeamMode(displayActiveTeam.id, m)}
              />

              <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
                <span className="text-xs text-claude-text-muted shrink-0">Round</span>
                <span className="text-xs font-bold text-claude-text shrink-0">{displayActiveTeam.roundNumber}</span>
                <span className="mx-1 text-claude-border shrink-0">·</span>
                {displayActiveTeam.agents.map((agent, i) => {
                  const isParallel = (displayActiveTeam.mode ?? 'sequential') === 'parallel'
                  return (
                    <div key={agent.id} className="flex items-center gap-1 shrink-0">
                      {i > 0 && (
                        isParallel ? (
                          <span className="text-claude-text-muted text-xs px-0.5">+</span>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 12 12" className="text-claude-text-muted">
                            <path d="M4 6h4M6 4l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        )
                      )}
                      <AgentPixelIcon
                        type={agent.iconType}
                        size={20}
                        color={agent.color}
                      />
                      <span className={`text-xs ${agent.id === activeAgentId ? 'font-semibold text-claude-text' : 'text-claude-text-muted'}`}>
                        {agent.name}
                      </span>
                    </div>
                  )
                })}
              </div>

              {displayActiveTeam.currentTask && (
                <p className="max-w-xs truncate text-xs text-claude-text-muted">
                  "{displayActiveTeam.currentTask}"
                </p>
              )}

              {activeTeam && (
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <button
                    onClick={handleReset}
                    disabled={activeTeam.status === 'running'}
                    className="rounded-lg px-3 py-1.5 text-xs text-claude-text-muted hover:bg-claude-bg-hover hover:text-claude-text disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    초기화
                  </button>
                  <button
                    onClick={() => removeTeam(activeTeam.id)}
                    disabled={activeTeam.status === 'running'}
                    className="rounded-lg p-1.5 text-claude-text-muted hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                    title="팀 삭제"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Roundtable */}
            <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4 lg:flex-row">
              <section
                className={`flex min-h-[360px] min-w-0 items-center justify-center overflow-hidden rounded-[30px] border border-claude-border bg-[linear-gradient(180deg,#d9e1e8_0%,#d4dce4_19%,#bfc8d1_19%,#b8c1cb_100%)] px-5 py-3 transition-all duration-300 ${
                  focusedAgent ? 'lg:flex-[1.05]' : 'flex-1'
                }`}
              >
                <div
                  className="relative mx-auto aspect-[5/4] h-full max-h-full w-auto max-w-full min-w-0 overflow-hidden rounded-[18px] border-2 border-[#8c98a4] shadow-[0_18px_40px_rgba(38,52,68,0.18)]"
                  style={{
                    backgroundImage: [
                      'linear-gradient(180deg, #eef3f7 0%, #e7edf3 28%, #c5cdd6 28%, #bcc5ce 100%)',
                      'repeating-linear-gradient(90deg, transparent 0 43px, rgba(118,132,147,0.08) 43px 44px)',
                      'repeating-linear-gradient(0deg, transparent 0 43px, rgba(118,132,147,0.08) 43px 44px)',
                    ].join(', '),
                  }}
                >
                  <div className="absolute left-[7%] top-[6%] h-[16%] w-[24%] rounded-[6px] border-2 border-[#93a7bc] bg-[linear-gradient(180deg,#d4ecff_0%,#c3ddf7_100%)] shadow-[0_4px_0_#a6b6c6]">
                    <span className="absolute inset-x-[6px] top-1/2 h-px -translate-y-1/2 bg-white/70" />
                    <span className="absolute inset-y-[6px] left-1/2 w-px -translate-x-1/2 bg-white/60" />
                  </div>

                  <div className="absolute right-[7%] top-[6%] h-[16%] w-[24%] rounded-[6px] border-2 border-[#93a7bc] bg-[linear-gradient(180deg,#d4ecff_0%,#c3ddf7_100%)] shadow-[0_4px_0_#a6b6c6]">
                    <span className="absolute inset-x-[6px] top-1/2 h-px -translate-y-1/2 bg-white/70" />
                    <span className="absolute inset-y-[6px] left-1/2 w-px -translate-x-1/2 bg-white/60" />
                  </div>

                  <div className="absolute inset-x-0 top-[28%] h-[2px] bg-[#a4afba]/70" />

                  <div className="absolute left-1/2 top-[7%] w-[20%] min-w-[164px] -translate-x-1/2 border-2 border-[#96a3b0] bg-[linear-gradient(180deg,#ffffff,#edf2f6)] px-4 py-3 text-center shadow-[0_4px_0_#c7d0d9]">
                    <span className="inline-flex border border-[#cfd8e1] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#607080]">
                      Task
                    </span>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#4c5a67]">
                      {displayActiveTeam.currentTask || '아직 토론 주제가 없습니다'}
                    </p>
                  </div>

                  <div
                    className="absolute top-[34%] bottom-[10%] rounded-[18px] border border-white/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))]"
                    style={{ left: carpetInsets.outer, right: carpetInsets.outer }}
                  />
                  <div
                    className="absolute top-[36%] bottom-[12%] rounded-[14px] border border-[#aeb8c2]/40 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.03)_0_28px,rgba(139,151,163,0.09)_28px_29px),repeating-linear-gradient(0deg,rgba(255,255,255,0.02)_0_28px,rgba(139,151,163,0.08)_28px_29px)]"
                    style={{ left: carpetInsets.inner, right: carpetInsets.inner }}
                  />

                  {displayActiveTeam.agents.map((agent, index) => (
                    <AgentSeat
                      key={agent.id}
                      agent={agent}
                      index={index}
                      total={displayActiveTeam.agents.length}
                      isFocused={agent.id === focusedAgent?.id}
                      isActive={agent.id === activeAgentId}
                      onSelect={() => setFocusedAgentId(agent.id)}
                    />
                  ))}
                </div>
              </section>

              {focusedAgent && (
                <div className="relative min-h-0 min-w-0 lg:shrink-0" style={detailPanelStyle}>
                  <button
                    type="button"
                    onPointerDown={handleDetailPanelResizeStart}
                    className="absolute bottom-[28px] left-[-12px] top-[28px] z-20 hidden w-6 cursor-col-resize items-center justify-center lg:flex"
                    aria-label="에이전트 상세 패널 너비 조절"
                    title="드래그해서 상세 패널 너비 조절"
                  >
                    <span className="relative h-full w-full">
                      <span className="absolute left-1/2 top-1/2 h-14 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-claude-border/80 bg-claude-bg-base shadow-[0_4px_12px_rgba(0,0,0,0.22)]" />
                      <span className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-claude-text-muted/60" />
                    </span>
                  </button>

                  <section className="min-h-0 min-w-0 lg:h-full lg:w-[var(--team-detail-width)] lg:min-w-[var(--team-detail-width)] lg:max-w-[var(--team-detail-width)]">
                    <SelectedAgentPanel
                      agent={focusedAgent}
                      isFirst={displayActiveTeam.agents[0]?.id === focusedAgent.id}
                      roundNumber={displayActiveTeam.roundNumber}
                    />
                  </section>
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="shrink-0 border-t border-claude-border bg-claude-chat-bg px-4 py-4">
              <div className="mx-auto w-full max-w-[980px]">
                <div className="relative overflow-hidden rounded-[24px] border border-claude-border bg-claude-panel">
                  <div className="px-5 pb-3 pt-4">
                    <textarea
                      ref={textareaRef}
                      value={task}
                      onChange={(e) => setTask(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onCompositionStart={() => { isComposingRef.current = true }}
                      onCompositionEnd={() => { isComposingRef.current = false }}
                      placeholder={
                        activeTeam.status === 'running'
                          ? '토론이 진행 중입니다...'
                          : displayActiveTeam.currentTask
                          ? '새 토론 주제를 입력하세요...'
                          : '토론 주제를 입력하세요...'
                      }
                      rows={1}
                      disabled={activeTeam.status === 'running'}
                      className="chat-input-textarea min-h-[28px] max-h-[140px] w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[15px] leading-7 text-claude-text outline-none [overflow-wrap:anywhere] placeholder:text-claude-muted disabled:opacity-50"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-claude-border/70 px-4 pb-3 pt-2.5">
                    <span className="text-xs text-claude-text-muted">
                      {activeTeam.status === 'running'
                        ? (() => {
                            const mode = activeTeam.mode ?? 'sequential'
                            const streamingAgents = activeTeam.agents.filter((a) => a.isStreaming)
                            if (mode === 'parallel' && streamingAgents.length > 1) {
                              return `${streamingAgents.length}명이 동시 응답 중...`
                            }
                            if (mode === 'meeting') {
                              const name = streamingAgents[0]?.name ?? '에이전트'
                              return `회의 Round ${activeTeam.roundNumber} — ${name} 발언 중...`
                            }
                            return `${streamingAgents[0]?.name ?? '에이전트'}가 응답 중...`
                          })()
                        : 'Shift+Enter: 줄바꿈 · Enter: 전송'}
                    </span>

                    <div className="flex-1" />

                    {activeTeam.status === 'running' ? (
                      <button
                        onClick={handleAbort}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90"
                        title="중단"
                      >
                        <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <rect x="5.25" y="5.25" width="13.5" height="13.5" rx="2.85" />
                        </svg>
                      </button>
                    ) : (
                      <>
                        {activeTeam.status === 'done' && (
                          <button
                            onClick={handleContinue}
                            className="rounded-xl border border-claude-border px-3 py-1.5 text-xs font-medium text-claude-text-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                          >
                            {activeTeam.mode === 'meeting'
                              ? `Round ${activeTeam.roundNumber + 1} 진행`
                              : activeTeam.mode === 'parallel'
                              ? '다음 라운드'
                              : '계속 토론'}
                          </button>
                        )}

                        <button
                          onClick={handleStart}
                          disabled={!task.trim()}
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-claude-surface-2 text-claude-text transition-colors hover:bg-claude-panel disabled:bg-claude-surface-2 disabled:text-claude-muted disabled:opacity-100"
                          title={activeTeam.status === 'done' ? '새 주제 전송 (Enter)' : '토론 시작 (Enter)'}
                        >
                          <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showSetup && (
        <TeamSetupModal
          defaultCwd={defaultCwd}
          onConfirm={handleCreateTeam}
          onClose={() => setShowSetup(false)}
        />
      )}
    </>
  )
}
