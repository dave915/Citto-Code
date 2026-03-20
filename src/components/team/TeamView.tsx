import { useState, useRef, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useTeamStore } from '../../store/teamStore'
import { useAgentTeamStream } from '../../hooks/useAgentTeam'
import { TeamSetupModal } from './TeamSetupModal'
import type { AgentIconType } from './AgentPixelIcon'
import { AgentPixelIcon } from './AgentPixelIcon'
import type { DiscussionMode, TeamAgent, AgentMessage } from '../../store/teamTypes'

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

function AgentMessageCard({
  message,
  color,
  roundIndex,
}: {
  message: AgentMessage
  color: string
  roundIndex: number
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-claude-border bg-claude-bg-base/50 p-4">
      <div className="flex items-center gap-2 text-xs text-claude-text-muted">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span>Round {roundIndex + 1}</span>
      </div>

      {message.thinking && <ThinkingBubble text={message.thinking} />}

      <div
        className="rounded-2xl border px-4 py-3 text-sm leading-relaxed text-claude-text"
        style={{ borderColor: `${color}44`, backgroundColor: `${color}10` }}
      >
        {message.text ? (
          <div className="prose prose-sm prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
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
  const yStart = rows === 1 ? 54 : rows === 2 ? 43 : 35
  const yEnd = rows === 1 ? 54 : rows === 2 ? 67 : 73
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

  return (
    <button
      type="button"
      onClick={onSelect}
      className="absolute flex w-[116px] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center transition-all duration-200 hover:scale-[1.03]"
      style={{
        left: `${x}%`,
        top: `${y}%`,
      }}
    >
      <span
        className={`mb-2 max-w-full truncate rounded-sm border px-2 py-1 text-[10px] font-semibold ${nameTone}`}
        style={{
          boxShadow: isFocused ? '0 2px 0 rgba(57,88,168,0.2)' : '0 2px 0 rgba(76,60,49,0.12)',
        }}
      >
        {agent.name}
      </span>

      <div className="relative h-[108px] w-[104px]">
        <span className="absolute left-1/2 top-[81px] h-[8px] w-[48px] -translate-x-1/2 bg-black/8 blur-sm" />
        <span className="absolute left-1/2 top-[88px] h-[16px] w-[12px] -translate-x-1/2 bg-[#524236]" />
        <span className="absolute left-1/2 top-[98px] h-[8px] w-[30px] -translate-x-1/2 border border-[#6b5e53] bg-[#b5a89a]" />

        <div
          className="absolute left-1/2 top-[10px] h-[24px] w-[38px] -translate-x-1/2 border-2 border-[#34414f] bg-[linear-gradient(180deg,#6d7f99_0%,#4a596c_100%)]"
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
          className="absolute left-1/2 top-[36px] flex h-[30px] w-[86px] -translate-x-1/2 items-start justify-center border-2 border-[#56402f] bg-[linear-gradient(180deg,#89664b_0%,#6b4d39_100%)]"
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

        <div className="absolute left-1/2 top-[67px] h-[18px] w-[38px] -translate-x-1/2 border-2 border-[#774a29] bg-[linear-gradient(180deg,#cc8753_0%,#a35e35_100%)]">
          <span className="absolute inset-x-[6px] top-[4px] h-[4px] bg-white/8" />
        </div>

        {agent.error && (
          <span className="absolute right-[2px] top-[26px] border border-red-900 bg-red-500 px-1 py-0.5 text-[9px] font-bold text-white shadow-lg">
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
  onClose,
}: {
  agent: TeamAgent
  isFirst: boolean
  roundNumber: number
  onClose: () => void
}) {
  const [showMeta, setShowMeta] = useState(false)
  const latestMessage = agent.messages.at(-1)
  const preview = latestMessage?.text?.trim() || latestMessage?.thinking?.trim() || ''

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[28px] border border-claude-border bg-claude-bg-base/70 backdrop-blur-sm">
      <div
        className="shrink-0 rounded-t-[28px] border-b border-claude-border px-5 py-5"
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
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-claude-text">{agent.name}</h3>
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

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-claude-border px-3 py-1 text-xs text-claude-text-muted transition-colors hover:border-claude-border-hover hover:text-claude-text"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-claude-border px-2.5 py-1 text-xs text-claude-text-muted">
            {agent.messages.length}개 발언
          </span>
          <span className="rounded-full border border-claude-border px-2.5 py-1 text-xs text-claude-text-muted">
            현재 Round {roundNumber}
          </span>
          <button
            type="button"
            onClick={() => setShowMeta((current) => !current)}
            className="rounded-full border border-claude-border px-2.5 py-1 text-xs text-claude-text-muted transition-colors hover:border-claude-border-hover hover:text-claude-text"
          >
            {showMeta ? '정보 접기' : '설명/프롬프트'}
          </button>
        </div>

        {preview && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Latest cue
            </p>
            <p className="line-clamp-3 text-sm leading-relaxed text-white/80">{preview}</p>
          </div>
        )}

        {showMeta && (
          <div className="mt-4 space-y-3 rounded-2xl border border-claude-border bg-claude-bg/70 p-4">
            {agent.description && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-claude-text-muted">
                  설명
                </p>
                <p className="text-sm leading-relaxed text-claude-text">{agent.description}</p>
              </div>
            )}
            {agent.systemPrompt && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-claude-text-muted">
                  시스템 프롬프트
                </p>
                <div className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-claude-border bg-claude-bg-base px-3 py-2 text-xs leading-relaxed text-claude-text">
                  {agent.systemPrompt}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeTeam = activeTeamId ? teams.find((t) => t.id === activeTeamId) ?? null : null

  // Determine which agent is currently active (streaming)
  const activeAgentId = activeTeam?.agents.find((a) => a.isStreaming)?.id ?? null
  const focusedAgent = activeTeam?.agents.find((agent) => agent.id === focusedAgentId) ?? null

  useEffect(() => {
    if (!activeTeam) {
      setFocusedAgentId(null)
      return
    }

    if (focusedAgentId && !activeTeam.agents.some((agent) => agent.id === focusedAgentId)) {
      setFocusedAgentId(null)
    }
  }, [activeTeam, focusedAgentId])

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

  const handleStart = useCallback(async () => {
    if (!activeTeam || !task.trim() || activeTeam.status === 'running') return
    await startDiscussion(activeTeam.id, task.trim())
  }, [activeTeam, task, startDiscussion])

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void handleStart()
    }
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
                  color={i === 0 ? '#3B82F6' : i === 1 ? '#EF4444' : '#10B981'}
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

          {/* Actions */}
          <div className="flex items-center gap-2">
            {activeTeam && (
              <>
                <button
                  onClick={handleReset}
                  disabled={activeTeam.status === 'running'}
                  className="rounded-lg px-3 py-1.5 text-xs text-claude-text-muted hover:bg-claude-bg-hover hover:text-claude-text disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  초기화
                </button>
                <button
                  onClick={() => removeTeam(activeTeam.id)}
                  disabled={activeTeam.status === 'running'}
                  className="rounded-lg p-1.5 text-claude-text-muted hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="팀 삭제"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </>
            )}
            <button
              onClick={() => setShowSetup(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/30"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              새 팀
            </button>
          </div>
        </div>

        {activeTeam && (
          <>
            {/* Team info bar */}
            <div className="flex shrink-0 items-center gap-3 border-b border-claude-border bg-claude-bg-base/50 px-4 py-2">
              {/* Mode selector */}
              <ModeSelector
                mode={activeTeam.mode ?? 'sequential'}
                disabled={activeTeam.status === 'running'}
                onChange={(m) => setTeamMode(activeTeam.id, m)}
              />

              <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
                <span className="text-xs text-claude-text-muted shrink-0">Round</span>
                <span className="text-xs font-bold text-claude-text shrink-0">{activeTeam.roundNumber}</span>
                <span className="mx-1 text-claude-border shrink-0">·</span>
                {activeTeam.agents.map((agent, i) => {
                  const isParallel = (activeTeam.mode ?? 'sequential') === 'parallel'
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

              {activeTeam.currentTask && (
                <p className="max-w-xs truncate text-xs text-claude-text-muted">
                  "{activeTeam.currentTask}"
                </p>
              )}
            </div>

            {/* Roundtable */}
            <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4 lg:flex-row">
              <section
                className={`flex min-h-[420px] min-w-0 items-center justify-center rounded-[30px] border border-claude-border bg-[linear-gradient(180deg,#302a28_0%,#2a2423_20%,#d5c2ad_20%,#cfbba5_100%)] p-5 transition-all duration-300 ${
                  focusedAgent ? 'lg:flex-[1.05]' : 'flex-1'
                }`}
              >
                <div
                  className="relative mx-auto aspect-[5/4] w-full max-w-[860px] min-w-0 overflow-hidden rounded-[18px] border-2 border-[#5d4d45] shadow-[0_18px_40px_rgba(0,0,0,0.25)]"
                  style={{
                    backgroundImage: [
                      'linear-gradient(180deg, #473c39 0%, #3a3130 29%, #cfb79c 29%, #d8c5b1 100%)',
                      'repeating-linear-gradient(90deg, transparent 0 39px, rgba(106,82,59,0.06) 39px 40px)',
                      'repeating-linear-gradient(0deg, transparent 0 39px, rgba(106,82,59,0.06) 39px 40px)',
                    ].join(', '),
                  }}
                >
                  <div className="absolute left-1/2 top-[7%] w-[20%] min-w-[164px] -translate-x-1/2 border-2 border-[#7a695c] bg-[linear-gradient(180deg,#fffaf2,#eadbc8)] px-4 py-3 text-center shadow-[0_4px_0_#c7b39a]">
                    <span className="inline-flex border border-[#cfb9a1] bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7d624f]">
                      Task
                    </span>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#4f3d30]">
                      {activeTeam.currentTask || '아직 토론 주제가 없습니다'}
                    </p>
                  </div>

                  <div className="absolute inset-x-[27%] top-[23%] bottom-[9%] bg-white/6" />
                  <div className="absolute inset-y-[23%] left-[50%] w-px -translate-x-1/2 bg-[#bfa98f]/30" />

                  {activeTeam.agents.map((agent, index) => (
                    <AgentSeat
                      key={agent.id}
                      agent={agent}
                      index={index}
                      total={activeTeam.agents.length}
                      isFocused={agent.id === focusedAgent?.id}
                      isActive={agent.id === activeAgentId}
                      onSelect={() =>
                        setFocusedAgentId((current) => (current === agent.id ? null : agent.id))
                      }
                    />
                  ))}
                </div>
              </section>

              {focusedAgent && (
                <section className="min-h-0 min-w-0 lg:w-[420px] lg:max-w-[420px]">
                  <SelectedAgentPanel
                    agent={focusedAgent}
                    isFirst={activeTeam.agents[0]?.id === focusedAgent.id}
                    roundNumber={activeTeam.roundNumber}
                    onClose={() => setFocusedAgentId(null)}
                  />
                </section>
              )}
            </div>

            {/* Input area */}
            <div className="shrink-0 border-t border-claude-border p-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <textarea
                    ref={textareaRef}
                    className="w-full resize-none rounded-xl border border-claude-border bg-claude-bg px-4 py-3 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
                    placeholder="에이전트들이 토론할 작업이나 질문을 입력하세요..."
                    rows={2}
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={activeTeam.status === 'running'}
                  />
                  <span className="absolute bottom-2 right-3 text-xs text-claude-text-muted opacity-50">
                    ⌘↵
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {activeTeam.status === 'running' ? (
                    <button
                      onClick={handleAbort}
                      className="flex items-center gap-2 rounded-xl bg-red-600/20 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-600/30"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="2" y="2" width="8" height="8" fill="currentColor" rx="1" />
                      </svg>
                      중단
                    </button>
                  ) : activeTeam.status === 'done' ? (
                    <>
                      <button
                        onClick={handleContinue}
                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        {activeTeam.mode === 'meeting'
                          ? `Round ${activeTeam.roundNumber + 1} 진행`
                          : activeTeam.mode === 'parallel'
                          ? '다음 라운드'
                          : '계속 토론'}
                      </button>
                      <button
                        onClick={handleStart}
                        disabled={!task.trim()}
                        className="flex items-center gap-2 rounded-xl border border-claude-border px-4 py-2 text-sm text-claude-text-muted hover:text-claude-text disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        새 주제
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleStart}
                      disabled={!task.trim()}
                      className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7C2 7 4 2 7 2s5 5 5 5-2 5-5 5S2 7 2 7Z" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="7" cy="7" r="1.5" fill="currentColor" />
                      </svg>
                      토론 시작
                    </button>
                  )}
                </div>
              </div>

              {activeTeam.status === 'running' && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-claude-text-muted">
                    {(() => {
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
                    })()}
                  </span>
                </div>
              )}
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
