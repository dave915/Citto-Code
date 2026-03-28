import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { SelectedFile } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { resolveAgentColor, resolveTeamAgentStrings } from '../../lib/teamAgentPresets'
import { useTeamStore } from '../../store/teamStore'
import type { AgentTeam } from '../../store/teamTypes'
import type { TeamSetupSelectedAgent } from './TeamSetupModalParts'
import {
  getOfficeCarpetInsets,
  normalizeTeamProjectKey,
} from './TeamViewParts'
import { useTeamDetailPanel } from './useTeamDetailPanel'
import { useTeamTaskComposer } from './useTeamTaskComposer'

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
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const [isTaskPopoverOpen, setIsTaskPopoverOpen] = useState(false)

  const escapePressedAtRef = useRef(0)

  const projectKey = normalizeTeamProjectKey(defaultCwd)
  const projectTeams = teams.filter((team) => normalizeTeamProjectKey(team.cwd) === projectKey)
  const scopedActiveTeam = activeTeamId ? projectTeams.find((team) => team.id === activeTeamId) ?? null : null
  const activeTeam = scopedActiveTeam ?? projectTeams[0] ?? null
  const resolvedActiveTeamId = activeTeam?.id ?? null

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

  const {
    attachedFiles,
    canSubmitTask,
    isAttaching,
    isDragOver,
    setAttachedFiles,
    skippedFiles,
    handleAttachFiles,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleInjectSummary,
    handlePaste,
    handleReset,
    handleStart,
    handleTaskKeyDown,
    injected,
    isComposingRef,
    setTask,
    task,
    taskSummary,
    textareaRef,
  } = useTeamTaskComposer({
    activeTeam,
    displayActiveTeam,
    language,
    onInjectSummary,
    resetDiscussion,
    startDiscussion,
    t,
  })
  const {
    detailPanelStyle,
    handleDetailPanelResizeStart,
  } = useTeamDetailPanel()

  const activeAgentId = activeTeam?.agents.find((agent) => agent.isStreaming)?.id ?? null
  const focusedAgent =
    displayActiveTeam?.agents.find((agent) => agent.id === focusedAgentId)
    ?? displayActiveTeam?.agents[0]
    ?? null
  const carpetInsets = displayActiveTeam
    ? getOfficeCarpetInsets(displayActiveTeam.agents.length)
    : { outer: '15.5%', inner: '18.5%' }

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
          model: agent.model,
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

  const handleContinue = useCallback(async () => {
    if (!activeTeam) return
    await continueDiscussion(activeTeam.id)
  }, [activeTeam, continueDiscussion])

  const handleAbort = useCallback(async () => {
    if (!activeTeam) return
    await abortDiscussion(activeTeam.id)
  }, [activeTeam, abortDiscussion])

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
