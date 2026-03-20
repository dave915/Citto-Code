import { useState, useRef, useCallback } from 'react'
import { useTeamStore } from '../../store/teamStore'
import { useAgentTeamStream } from '../../hooks/useAgentTeam'
import { AgentColumn } from './AgentColumn'
import { TeamSetupModal } from './TeamSetupModal'
import type { AgentIconType } from './AgentPixelIcon'
import { AgentPixelIcon } from './AgentPixelIcon'
import type { DiscussionMode } from '../../store/teamTypes'

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
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeTeam = activeTeamId ? teams.find((t) => t.id === activeTeamId) ?? null : null

  // Determine which agent is currently active (streaming)
  const activeAgentId = activeTeam?.agents.find((a) => a.isStreaming)?.id ?? null

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
    const teamId = addTeam(cwd, teamName, selectedAgents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      description: a.description,
      color: a.color,
      emoji: '',
      iconType: a.iconType,
      isCustom: a.isCustom,
      // Store system prompt in description for now (could be extended)
      systemPromptHint: a.systemPrompt,
    } as any)))
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
                  flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors max-w-[160px]
                  ${team.id === activeTeamId
                    ? 'bg-claude-bg-hover text-claude-text font-medium'
                    : 'text-claude-text-muted hover:text-claude-text'
                  }
                `}
              >
                <span className="truncate">{team.name}</span>
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
                        type={(agent as any).iconType ?? 'custom'}
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

            {/* Agent columns */}
            <div className="flex flex-1 gap-3 overflow-hidden p-4">
              {activeTeam.agents.map((agent, i) => (
                <AgentColumn
                  key={agent.id}
                  agent={agent as any}
                  roundNumber={activeTeam.roundNumber}
                  isActive={agent.id === activeAgentId}
                  isFirst={i === 0}
                />
              ))}
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
