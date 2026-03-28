import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { SelectedFile } from '../../../electron/preload'
import { useTeamStore } from '../../store/teamStore'
import { useInputAttachments } from '../../hooks/useInputAttachments'
import { useI18n } from '../../hooks/useI18n'
import { TeamSetupModal } from './TeamSetupModal'
import type { TeamSetupSelectedAgent } from './TeamSetupModalParts'
import { AgentTeamGuideModal } from './AgentTeamGuideModal'
import type { AgentIconType } from './AgentPixelIcon'
import { AgentPixelIcon } from './AgentPixelIcon'
import { resolveAgentColor, resolveTeamAgentStrings } from '../../lib/teamAgentPresets'
import { AttachmentList } from '../input/AttachmentList'
import {
  AgentSeat,
  clampDetailPanelWidth,
  DETAIL_PANEL_DEFAULT_WIDTH,
  formatTeamTaskSummary,
  getOfficeCarpetInsets,
  ModeSelector,
  normalizeTeamProjectKey,
  SelectedAgentPanel,
  StatusBadge,
  TaskPopover,
} from './TeamViewParts'

type Props = {
  defaultCwd: string
  startDiscussion: (teamId: string, task: string, files?: SelectedFile[]) => Promise<void>
  continueDiscussion: (teamId: string) => Promise<void>
  abortDiscussion: (teamId: string) => Promise<void>
  onClose: () => void
  /** 세션 내 embedded 모드: 헤더 Back 버튼을 'Chat으로 돌아가기' 형태로 표시 */
  embedded?: boolean
  /** 팀 토론 완료 후 결과를 채팅에 주입할 때 호출 */
  onInjectSummary?: (text: string) => void
  /** 팀이 생성/선택되었을 때 호출 (세션 linkedTeamId 업데이트용) */
  onTeamLinked?: (teamId: string) => void
}

const TEAM_TASK_TEXTAREA_MAX_HEIGHT = 140

export function TeamView({
  defaultCwd,
  startDiscussion,
  continueDiscussion,
  abortDiscussion,
  onClose,
  embedded,
  onInjectSummary,
  onTeamLinked,
}: Props) {
  const { language, t } = useI18n()
  const {
    teams,
    activeTeamId,
    addTeam,
    removeTeam,
    setActiveTeam,
    setTeamMode,
    resetDiscussion,
  } = useTeamStore()

  const [showSetup, setShowSetup] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [task, setTask] = useState('')
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const [injected, setInjected] = useState(false)
  const [detailPanelWidth, setDetailPanelWidth] = useState(DETAIL_PANEL_DEFAULT_WIDTH)
  const [isResizingDetailPanel, setIsResizingDetailPanel] = useState(false)
  const [isTaskPopoverOpen, setIsTaskPopoverOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const escapePressedAtRef = useRef(0)
  const detailPanelResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const projectKey = normalizeTeamProjectKey(defaultCwd)
  const projectTeams = teams.filter((team) => normalizeTeamProjectKey(team.cwd) === projectKey)
  const scopedActiveTeam = activeTeamId ? projectTeams.find((team) => team.id === activeTeamId) ?? null : null
  const activeTeam = scopedActiveTeam ?? projectTeams[0] ?? null
  const resolvedActiveTeamId = activeTeam?.id ?? null
  const {
    attachedFiles,
    isAttaching,
    isDragOver,
    setAttachedFiles,
    skippedFiles,
    handleAttachFiles,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
  } = useInputAttachments({
    disabled: activeTeam?.status === 'running',
    isStreaming: activeTeam?.status === 'running',
  })
  const displayActiveTeam = activeTeam
    ? {
        ...activeTeam,
        currentTaskPrompt: activeTeam.currentTaskPrompt ?? activeTeam.currentTask,
        currentTaskAttachments: activeTeam.currentTaskAttachments ?? [],
        agents: activeTeam.agents.map((agent) => ({
          ...agent,
          ...resolveTeamAgentStrings(agent, language),
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
  const taskSummary = displayActiveTeam
    ? formatTeamTaskSummary(displayActiveTeam.currentTask, displayActiveTeam.currentTaskAttachments, language)
    : ''
  const canSubmitTask = (task.trim().length > 0 || attachedFiles.length > 0) && activeTeam?.status !== 'running'
  const carpetInsets = displayActiveTeam
    ? getOfficeCarpetInsets(displayActiveTeam.agents.length)
    : { outer: '15.5%', inner: '18.5%' }
  const detailPanelStyle: CSSProperties = {
    ['--team-detail-width' as string]: `${detailPanelWidth}px`,
  }

  useEffect(() => {
    setInjected(false)
  }, [resolvedActiveTeamId])

  useEffect(() => {
    if (!displayActiveTeam) {
      setFocusedAgentId(null)
      setIsTaskPopoverOpen(false)
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
    setIsTaskPopoverOpen(false)
  }, [
    displayActiveTeam?.id,
    displayActiveTeam?.currentTask,
    displayActiveTeam?.currentTaskPrompt,
    displayActiveTeam?.currentTaskAttachments?.length,
  ])

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
    if (activeTeam?.status !== 'running' || isTaskPopoverOpen) {
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
  }, [activeTeam, abortDiscussion, isTaskPopoverOpen])

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
    selectedAgents: TeamSetupSelectedAgent[],
  ) {
    const teamId = addTeam(
      defaultCwd.trim() || '~',
      teamName,
      selectedAgents.map((a) => ({
        id: a.id,
        presetId: a.presetId,
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
    onTeamLinked?.(teamId)
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
    if (!activeTeam || (!task.trim() && attachedFiles.length === 0) || activeTeam.status === 'running') return
    await startDiscussion(activeTeam.id, task.trim(), attachedFiles)
    setTask('')
    setAttachedFiles([])
    requestAnimationFrame(() => syncTextareaHeight(''))
  }, [activeTeam, attachedFiles, setAttachedFiles, startDiscussion, syncTextareaHeight, task])

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
    setAttachedFiles([])
    setInjected(false)
  }, [activeTeam, resetDiscussion, setAttachedFiles])

  const handleInjectSummary = useCallback(() => {
    if (!displayActiveTeam || !onInjectSummary) return
    const lines: string[] = [
      t('team.injectSummaryHeading', { teamName: displayActiveTeam.name }),
      '',
    ]
    for (const agent of displayActiveTeam.agents) {
      const lastMsg = agent.messages.at(-1)
      if (!lastMsg?.text?.trim()) continue
      lines.push(
        t('team.injectSummaryAgentLine', {
          name: agent.name,
          role: agent.role,
          text: lastMsg.text.trim(),
        }),
      )
      lines.push('')
    }
    const summary = lines.join('\n').trim()
    if (!summary) return
    onInjectSummary(summary)
    setInjected(true)
  }, [displayActiveTeam, onInjectSummary, t])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing || isComposingRef.current) return
    e.preventDefault()
    void handleStart()
  }

  // Empty state (no teams yet)
  if (projectTeams.length === 0) {
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
            <h2 className="text-2xl font-bold text-claude-text">{t('team.empty.title')}</h2>
            <p className="mt-2 max-w-sm text-sm text-claude-text-muted leading-relaxed">
              {t('team.empty.descriptionTop')}
              <br />{t('team.empty.descriptionBottom')}
            </p>
          </div>

          <button
            onClick={() => setShowSetup(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t('team.empty.createFirst')}
          </button>
        </div>

        {showSetup && (
          <TeamSetupModal
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
            className="flex items-center gap-1.5 rounded-lg p-1.5 text-claude-text-muted hover:bg-claude-bg-hover hover:text-claude-text"
            title={embedded ? t('team.backToChat') : t('settings.close')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {embedded && (
              <span className="text-xs font-medium">{t('team.backToChat')}</span>
            )}
          </button>

          {/* Team selector */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {projectTeams.map((team) => (
              <button
                key={team.id}
                onClick={() => {
                  setActiveTeam(team.id)
                  onTeamLinked?.(team.id)
                }}
                className={`
                  flex min-w-0 max-w-[220px] items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors
                  ${team.id === resolvedActiveTeamId
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
            type="button"
            onClick={() => setShowGuide(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-claude-border bg-claude-panel px-3 py-1.5 text-xs font-medium text-claude-text shadow-sm transition-colors hover:bg-claude-bg-hover"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v5m0-8h.01" />
            </svg>
            {t('team.guide')}
          </button>

          <button
            onClick={() => setShowSetup(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/30"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {t('team.new')}
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
                <span className="text-xs text-claude-text-muted shrink-0">{t('team.roundLabel')}</span>
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

              {(displayActiveTeam.currentTask || displayActiveTeam.currentTaskAttachments.length > 0) && (
                <p className="max-w-xs truncate text-xs text-claude-text-muted">
                  "{taskSummary}"
                </p>
              )}

              {activeTeam && (
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <button
                    onClick={handleReset}
                    disabled={activeTeam.status === 'running'}
                    className="rounded-lg px-3 py-1.5 text-xs text-claude-text-muted hover:bg-claude-bg-hover hover:text-claude-text disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('team.reset')}
                  </button>
                  <button
                    onClick={() => removeTeam(activeTeam.id)}
                    disabled={activeTeam.status === 'running'}
                    className="rounded-lg p-1.5 text-claude-text-muted hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                    title={t('team.delete')}
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
                className={`flex min-h-[360px] min-w-0 items-center justify-center overflow-hidden rounded-[16px] border border-claude-border bg-[linear-gradient(180deg,#d9e1e8_0%,#d4dce4_19%,#bfc8d1_19%,#b8c1cb_100%)] px-5 py-3 transition-all duration-300 ${
                  focusedAgent ? 'lg:flex-[1.05]' : 'flex-1'
                }`}
              >
                <div
                  className="relative mx-auto aspect-[5/4] h-full max-h-full w-auto max-w-full min-w-0 overflow-hidden rounded-[10px] border-2 border-[#8c98a4] shadow-[0_18px_40px_rgba(38,52,68,0.18)]"
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

                  <button
                    type="button"
                    onClick={() => setIsTaskPopoverOpen((current) => !current)}
                    className="absolute left-1/2 top-[7%] z-10 w-[20%] min-w-[164px] -translate-x-1/2 border-2 border-[#96a3b0] bg-[linear-gradient(180deg,#ffffff,#edf2f6)] px-4 py-3 text-center shadow-[0_4px_0_#c7d0d9] transition-transform hover:-translate-y-[1px]"
                  >
                    <span className="inline-flex border border-[#cfd8e1] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#607080]">
                      {t('team.taskLabel')}
                    </span>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#4c5a67]">
                      {taskSummary}
                    </p>
                  </button>

                  <div
                    className="absolute top-[34%] bottom-[10%] rounded-[10px] border border-white/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))]"
                    style={{ left: carpetInsets.outer, right: carpetInsets.outer }}
                  />
                  <div
                    className="absolute top-[36%] bottom-[12%] rounded-[8px] border border-[#aeb8c2]/40 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.03)_0_28px,rgba(139,151,163,0.09)_28px_29px),repeating-linear-gradient(0deg,rgba(255,255,255,0.02)_0_28px,rgba(139,151,163,0.08)_28px_29px)]"
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
                    aria-label={t('team.resizePanel')}
                    title={t('team.resizePanelHint')}
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

            {isTaskPopoverOpen && (
              <TaskPopover
                task={displayActiveTeam.currentTask}
                attachedFiles={displayActiveTeam.currentTaskAttachments}
                language={language}
                onClose={() => setIsTaskPopoverOpen(false)}
              />
            )}

            {/* Input area */}
            <div className="shrink-0 border-t border-claude-border/60 bg-claude-bg px-4 py-4">
              <div className="w-full">
                <AttachmentList
                  attachedFiles={attachedFiles}
                  skippedFiles={skippedFiles}
                  language={language}
                  onRemoveFile={(path) => setAttachedFiles((current) => current.filter((file) => file.path !== path))}
                />

                <div
                  className={`relative overflow-hidden rounded-[12px] border bg-claude-panel transition-colors ${
                    isDragOver
                      ? 'border-blue-500/60 ring-1 ring-blue-500/20'
                      : 'border-claude-border'
                  }`}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(event) => {
                    void handleDrop(event)
                  }}
                >
                  <div className="px-5 pb-3 pt-4">
                    <textarea
                      ref={textareaRef}
                      value={task}
                      onChange={(e) => setTask(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onPaste={(event) => {
                        void handlePaste(event)
                      }}
                      onCompositionStart={() => { isComposingRef.current = true }}
                      onCompositionEnd={() => { isComposingRef.current = false }}
                      placeholder={
                        activeTeam.status === 'running'
                          ? t('team.placeholder.running')
                          : displayActiveTeam.currentTask
                          ? t('team.placeholder.newTopic')
                          : t('team.placeholder.topic')
                      }
                      rows={1}
                      disabled={activeTeam.status === 'running'}
                      className="chat-input-textarea min-h-[28px] max-h-[140px] w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[15px] leading-7 text-claude-text outline-none [overflow-wrap:anywhere] placeholder:text-claude-muted disabled:opacity-50"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-claude-border/70 px-4 pb-3 pt-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        void handleAttachFiles()
                      }}
                      disabled={activeTeam.status === 'running' || isAttaching}
                      title={t('team.attachFiles')}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text disabled:opacity-30"
                    >
                      {isAttaching ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      )}
                    </button>

                    <span className="text-xs text-claude-text-muted">
                      {activeTeam.status === 'running'
                        ? (() => {
                            const mode = activeTeam.mode ?? 'sequential'
                            const streamingAgents = activeTeam.agents.filter((a) => a.isStreaming)
                            if (mode === 'parallel' && streamingAgents.length > 1) {
                              return t('team.streaming.parallel', { count: streamingAgents.length })
                            }
                            const defaultAgentName = streamingAgents[0]?.name ?? t('team.streaming.defaultAgent')
                            if (mode === 'meeting') {
                              return t('team.streaming.meeting', { round: activeTeam.roundNumber, name: defaultAgentName })
                            }
                            return t('team.streaming.agent', { name: defaultAgentName })
                          })()
                        : t('team.inputHint')}
                    </span>

                    <div className="flex-1" />

                    {activeTeam.status === 'running' ? (
                      <button
                        onClick={handleAbort}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90"
                        title={t('team.abort')}
                      >
                        <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <rect x="5.25" y="5.25" width="13.5" height="13.5" rx="2.85" />
                        </svg>
                      </button>
                    ) : (
                      <>
                        {activeTeam.status === 'done' && (
                          <>
                            <button
                              onClick={handleContinue}
                              className="rounded-xl border border-claude-border px-3 py-1.5 text-xs font-medium text-claude-text-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                            >
                              {activeTeam.mode === 'meeting'
                                ? t('team.continue.meeting', { round: activeTeam.roundNumber + 1 })
                                : activeTeam.mode === 'parallel'
                                ? t('team.continue.parallel')
                                : t('team.continue.sequential')}
                            </button>
                            {onInjectSummary && (
                              <button
                                onClick={handleInjectSummary}
                                disabled={injected}
                                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  injected
                                    ? 'border-green-500/40 bg-green-500/10 text-green-400 cursor-default'
                                    : 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                                }`}
                              >
                                {injected ? (
                                  <>
                                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    {t('team.injectToChatDone')}
                                  </>
                                ) : (
                                  <>
                                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 4h14a2 2 0 002-2V8l-6-6H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    {t('team.injectToChat')}
                                  </>
                                )}
                              </button>
                            )}
                          </>
                        )}

                        <button
                          onClick={handleStart}
                          disabled={!canSubmitTask}
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-claude-surface-2 text-claude-text transition-colors hover:bg-claude-panel disabled:bg-claude-surface-2 disabled:text-claude-muted disabled:opacity-100"
                          title={activeTeam.status === 'done' ? t('team.startNewTopic') : t('team.startDiscussion')}
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
          onConfirm={handleCreateTeam}
          onClose={() => setShowSetup(false)}
        />
      )}

      {showGuide && <AgentTeamGuideModal onClose={() => setShowGuide(false)} />}
    </>
  )
}
