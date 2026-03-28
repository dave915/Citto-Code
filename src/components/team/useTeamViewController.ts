import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { SelectedFile } from '../../../electron/preload'
import { useInputAttachments } from '../../hooks/useInputAttachments'
import { useI18n } from '../../hooks/useI18n'
import { resolveAgentColor, resolveTeamAgentStrings } from '../../lib/teamAgentPresets'
import { useTeamStore } from '../../store/teamStore'
import type { AgentTeam } from '../../store/teamTypes'
import type { TeamSetupSelectedAgent } from './TeamSetupModalParts'
import {
  clampDetailPanelWidth,
  DETAIL_PANEL_DEFAULT_WIDTH,
  formatTeamTaskSummary,
  getOfficeCarpetInsets,
  normalizeTeamProjectKey,
} from './TeamViewParts'

const TEAM_TASK_TEXTAREA_MAX_HEIGHT = 140

type TeamViewControllerParams = {
  defaultCwd: string
  startDiscussion: (teamId: string, task: string, files?: SelectedFile[]) => Promise<void>
  continueDiscussion: (teamId: string) => Promise<void>
  abortDiscussion: (teamId: string) => Promise<void>
  onInjectSummary?: (text: string) => void
  onTeamLinked?: (teamId: string) => void
}

export function useTeamViewController({
  defaultCwd,
  startDiscussion,
  continueDiscussion,
  abortDiscussion,
  onInjectSummary,
  onTeamLinked,
}: TeamViewControllerParams) {
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

  const displayActiveTeam: AgentTeam | null = activeTeam
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

  const activeAgentId = activeTeam?.agents.find((agent) => agent.isStreaming)?.id ?? null
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

  const handleCreateTeam = useCallback(
    (teamName: string, selectedAgents: TeamSetupSelectedAgent[]) => {
      const teamId = addTeam(
        defaultCwd.trim() || '~',
        teamName,
        selectedAgents.map((agent) => ({
          id: agent.id,
          presetId: agent.presetId,
          name: agent.name,
          role: agent.role,
          description: agent.description,
          color: agent.color,
          iconType: agent.iconType,
          emoji: '',
          systemPrompt: agent.systemPrompt,
          isCustom: agent.isCustom,
        })),
      )

      onTeamLinked?.(teamId)
      setShowSetup(false)
      setTask('')
    },
    [addTeam, defaultCwd, onTeamLinked],
  )

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
      const lastMessage = agent.messages.at(-1)
      if (!lastMessage?.text?.trim()) continue

      lines.push(
        t('team.injectSummaryAgentLine', {
          name: agent.name,
          role: agent.role,
          text: lastMessage.text.trim(),
        }),
      )
      lines.push('')
    }

    const summary = lines.join('\n').trim()
    if (!summary) return

    onInjectSummary(summary)
    setInjected(true)
  }, [displayActiveTeam, onInjectSummary, t])

  const handleTaskKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing || isComposingRef.current) return

    event.preventDefault()
    void handleStart()
  }, [handleStart])

  const handleSelectTeam = useCallback((teamId: string) => {
    setActiveTeam(teamId)
    onTeamLinked?.(teamId)
  }, [onTeamLinked, setActiveTeam])

  const handleChangeMode = useCallback((mode: AgentTeam['mode']) => {
    if (!displayActiveTeam) return
    setTeamMode(displayActiveTeam.id, mode)
  }, [displayActiveTeam, setTeamMode])

  const handleRemoveActiveTeam = useCallback(() => {
    if (!activeTeam) return
    removeTeam(activeTeam.id)
  }, [activeTeam, removeTeam])

  return {
    activeAgentId,
    activeTeam,
    attachedFiles,
    canSubmitTask,
    carpetInsets,
    detailPanelStyle,
    displayActiveTeam,
    focusedAgent,
    handleAbort,
    handleAttachFiles,
    handleChangeMode,
    handleContinue,
    handleCreateTeam,
    handleDetailPanelResizeStart,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleInjectSummary,
    handlePaste,
    handleRemoveActiveTeam,
    handleReset,
    handleSelectTeam,
    handleStart,
    handleTaskKeyDown,
    injected,
    isAttaching,
    isComposingRef,
    isDragOver,
    isTaskPopoverOpen,
    language,
    openGuide: () => setShowGuide(true),
    openSetup: () => setShowSetup(true),
    projectTeams,
    resolvedActiveTeamId,
    setAttachedFiles,
    setFocusedAgentId,
    setIsTaskPopoverOpen,
    setTask,
    showGuide,
    showSetup,
    skippedFiles,
    task,
    taskSummary,
    textareaRef,
    closeGuide: () => setShowGuide(false),
    closeSetup: () => setShowSetup(false),
  }
}
