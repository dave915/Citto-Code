import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { SelectedFile } from '../../../electron/preload'
import { useInputAttachments } from '../../hooks/useInputAttachments'
import type { AgentTeam } from '../../store/teamTypes'
import type { AppLanguage, TranslationKey } from '../../lib/i18n'
import { formatTeamTaskSummary } from './TeamViewParts'

const TEAM_TASK_TEXTAREA_MAX_HEIGHT = 140

type UseTeamTaskComposerParams = {
  activeTeam: AgentTeam | null
  displayActiveTeam: AgentTeam | null
  language: AppLanguage
  onInjectSummary?: (text: string) => void
  resetDiscussion: (teamId: string) => void
  startDiscussion: (teamId: string, task: string, files?: SelectedFile[]) => Promise<void>
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export function useTeamTaskComposer({
  activeTeam,
  displayActiveTeam,
  language,
  onInjectSummary,
  resetDiscussion,
  startDiscussion,
  t,
}: UseTeamTaskComposerParams) {
  const [task, setTask] = useState('')
  const [injected, setInjected] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
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

  const syncTextareaHeight = useCallback((value: string) => {
    if (!textareaRef.current) return

    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, TEAM_TASK_TEXTAREA_MAX_HEIGHT)}px`

    if (value.length === 0) {
      textareaRef.current.style.height = 'auto'
    }
  }, [])

  useEffect(() => {
    setInjected(false)
  }, [activeTeam?.id])

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

  return {
    attachedFiles,
    canSubmitTask: (task.trim().length > 0 || attachedFiles.length > 0) && activeTeam?.status !== 'running',
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
    isAttaching,
    isComposingRef,
    isDragOver,
    setAttachedFiles,
    setTask,
    skippedFiles,
    task,
    taskSummary: displayActiveTeam
      ? formatTeamTaskSummary(displayActiveTeam.currentTask, displayActiveTeam.currentTaskAttachments, language)
      : '',
    textareaRef,
  }
}
