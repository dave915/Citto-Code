import { useEffect, useRef } from 'react'
import type { RecentProject } from '../../electron/preload'
import { matchShortcut } from '../lib/shortcuts'
import { applyTheme, type ThemeId } from '../lib/theme'
import type { HandleSendForSession } from './claudeStream/types'
import { useI18n } from './useI18n'
import {
  getProjectNameFromPath,
  type AttachedFile,
  type PermissionMode,
  type ShortcutConfig,
  type ShortcutPlatform,
} from '../store/sessions'
import type {
  Workflow,
  WorkflowExecutionDonePayload,
  WorkflowFiredPayload,
  WorkflowScheduleAdvancedPayload,
  WorkflowStepUpdatePayload,
} from '../store/workflowTypes'
import { cycleClaudeCodeMode } from '../components/input/inputUtils'

type Params = {
  themeId: ThemeId
  uiFontSize: number
  uiZoomPercent: number
  hasUnsafeReloadState: boolean
  quickPanelProjects: RecentProject[]
  quickPanelProjectsSignature: string
  workflowSyncPayload: Workflow[]
  claudeBinaryPath: string
  sanitizedEnvVars: Record<string, string>
  defaultWorkflowModel: string | null
  quickPanelEnabled: boolean
  shortcutConfig: ShortcutConfig
  shortcutPlatform: ShortcutPlatform
  shortcutTarget: {
    permissionMode: PermissionMode
    planMode: boolean
  } | null
  defaultProjectPath: string
  createSessionFromUserPrompt: (prompt: string, cwdOverride?: string) => Promise<string>
  openPendingSessionDraft: (cwdOverride?: string) => Promise<void>
  handleSendForSession: HandleSendForSession
  addSession: (cwd: string, name: string) => string
  addUserMessage: (sessionId: string, text: string, files?: AttachedFile[]) => string
  startAssistantMessage: (sessionId: string) => string
  appendTextChunk: (sessionId: string, assistantMessageId: string, chunk: string) => void
  setClaudeSessionId: (sessionId: string, claudeSessionId: string) => void
  setError: (sessionId: string, error: string | null) => void
  setSessionPermissionMode: (sessionId: string, mode: PermissionMode) => void
  setSessionModel: (sessionId: string, model: string | null) => void
  commitStreamEnd: (sessionId: string) => void
  applyPermissionMode: (mode: PermissionMode) => void
  applyPlanMode: (value: boolean) => void
  onToggleSidebar: () => void
  openSettingsPanel: () => void
  toggleCommandPalette: () => void
  recordWorkflowExecutionStart: (payload: WorkflowFiredPayload) => void
  advanceWorkflowSchedule: (payload: WorkflowScheduleAdvancedPayload) => void
  appendWorkflowStepTextChunk: (executionId: string, stepId: string, chunk: string) => void
  applyWorkflowStepUpdate: (payload: WorkflowStepUpdatePayload) => void
  completeWorkflowExecution: (payload: WorkflowExecutionDonePayload) => void
  closeOverlayPanels: () => void
}

function buildWorkflowSessionName(
  prefix: string,
  workflowName: string,
  stepLabel: string,
) {
  const trimmedWorkflowName = workflowName.trim()
  const trimmedStepLabel = stepLabel.trim()
  const baseName = trimmedWorkflowName || trimmedStepLabel || prefix

  if (!trimmedStepLabel || trimmedStepLabel === trimmedWorkflowName) {
    return `[${prefix}] ${baseName}`
  }

  return `[${prefix}] ${baseName} · ${trimmedStepLabel}`
}

function isTextEntryTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  const tagName = element.tagName.toLowerCase()
  return (
    tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || element.isContentEditable
  )
}

export function useAppDesktopEffects({
  themeId,
  uiFontSize,
  uiZoomPercent,
  hasUnsafeReloadState,
  quickPanelProjects,
  quickPanelProjectsSignature,
  workflowSyncPayload,
  claudeBinaryPath,
  sanitizedEnvVars,
  defaultWorkflowModel,
  quickPanelEnabled,
  shortcutConfig,
  shortcutPlatform,
  shortcutTarget,
  defaultProjectPath,
  createSessionFromUserPrompt,
  openPendingSessionDraft,
  handleSendForSession,
  addSession,
  addUserMessage,
  startAssistantMessage,
  appendTextChunk,
  setClaudeSessionId,
  setError,
  setSessionPermissionMode,
  setSessionModel,
  commitStreamEnd,
  applyPermissionMode,
  applyPlanMode,
  onToggleSidebar,
  openSettingsPanel,
  toggleCommandPalette,
  recordWorkflowExecutionStart,
  advanceWorkflowSchedule,
  appendWorkflowStepTextChunk,
  applyWorkflowStepUpdate,
  completeWorkflowExecution,
  closeOverlayPanels,
}: Params) {
  const { t } = useI18n()
  const syncedQuickPanelProjectsSignatureRef = useRef('')
  const workflowSessionByRunRef = useRef(new Map<string, { sessionId: string; assistantMessageId: string }>())

  useEffect(() => {
    applyTheme(themeId)
  }, [themeId])

  useEffect(() => {
    document.documentElement.style.setProperty('--citto-code-font-size', `${uiFontSize}px`)
    document.documentElement.style.setProperty('--citto-code-zoom', `${uiZoomPercent / 100}`)
  }, [uiFontSize, uiZoomPercent])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsafeReloadState) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsafeReloadState])

  useEffect(() => {
    if (syncedQuickPanelProjectsSignatureRef.current === quickPanelProjectsSignature) return
    syncedQuickPanelProjectsSignatureRef.current = quickPanelProjectsSignature
    void window.claude.setQuickPanelProjects(quickPanelProjects).catch(() => undefined)
  }, [quickPanelProjects, quickPanelProjectsSignature])

  useEffect(() => {
    void window.claude.syncClaudeRuntime({
      claudePath: claudeBinaryPath.trim() || null,
      envVars: sanitizedEnvVars,
      defaultModel: defaultWorkflowModel,
    }).catch(() => undefined)
  }, [claudeBinaryPath, defaultWorkflowModel, sanitizedEnvVars])

  useEffect(() => {
    void window.claude.syncWorkflows(workflowSyncPayload).catch(() => undefined)
  }, [workflowSyncPayload])

  useEffect(() => {
    void window.claude.updateQuickPanelShortcut({
      accelerator: shortcutConfig.toggleQuickPanel[shortcutPlatform],
      enabled: quickPanelEnabled,
    }).catch(() => undefined)
  }, [quickPanelEnabled, shortcutConfig, shortcutPlatform])

  useEffect(() => {
    const cleanup = window.claude.onTrayNewSession(() => {
      void openPendingSessionDraft()
    })
    return cleanup
  }, [openPendingSessionDraft])

  useEffect(() => {
    const cleanup = window.claude.onQuickPanelMessage(async (payload) => {
      closeOverlayPanels()
      if (payload.text.trim()) {
        const sessionId = await createSessionFromUserPrompt(payload.text, payload.cwd)
        await handleSendForSession(sessionId, payload.text, [])
        return
      }
      await openPendingSessionDraft(payload.cwd)
    })
    return cleanup
  }, [closeOverlayPanels, createSessionFromUserPrompt, handleSendForSession, openPendingSessionDraft])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowFired((payload) => {
      recordWorkflowExecutionStart(payload)
    })
    return cleanup
  }, [recordWorkflowExecutionStart])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowScheduleAdvanced((payload) => {
      advanceWorkflowSchedule(payload)
    })
    return cleanup
  }, [advanceWorkflowSchedule])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowStepTextChunk((payload) => {
      appendWorkflowStepTextChunk(payload.executionId, payload.stepId, payload.chunk)
    })
    return cleanup
  }, [appendWorkflowStepTextChunk])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowStepUpdate((payload) => {
      applyWorkflowStepUpdate(payload)
    })
    return cleanup
  }, [applyWorkflowStepUpdate])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowExecutionDone((payload) => {
      completeWorkflowExecution(payload)
    })
    return cleanup
  }, [completeWorkflowExecution])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowAgentSessionStarted((payload) => {
      const cwd = payload.cwd.trim() || defaultProjectPath
      const sessionPrefix = t('sidebar.workflows')
      const sessionName = buildWorkflowSessionName(
        sessionPrefix,
        payload.workflowName,
        payload.stepLabel,
      )
      const sessionId = addSession(
        cwd,
        sessionName || `[${sessionPrefix}] ${getProjectNameFromPath(cwd)}`,
      )

      setSessionModel(sessionId, payload.model ?? null)
      setSessionPermissionMode(sessionId, payload.permissionMode)

      const visibleText = payload.manual
        ? t('workflow.session.runNowLabel', { sessionName })
        : payload.catchUp
          ? t('workflow.session.catchUpLabel', { sessionName })
          : t('workflow.session.scheduledLabel', { sessionName })

      addUserMessage(sessionId, visibleText, [])
      const assistantMessageId = startAssistantMessage(sessionId)
      workflowSessionByRunRef.current.set(payload.agentRunId, {
        sessionId,
        assistantMessageId,
      })
    })
    return cleanup
  }, [
    addSession,
    addUserMessage,
    defaultProjectPath,
    setSessionModel,
    setSessionPermissionMode,
    startAssistantMessage,
    t,
  ])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowAgentSessionLinked((payload) => {
      const sessionState = workflowSessionByRunRef.current.get(payload.agentRunId)
      if (!sessionState) return
      setClaudeSessionId(sessionState.sessionId, payload.claudeSessionId)
    })
    return cleanup
  }, [setClaudeSessionId])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowAgentSessionTextChunk((payload) => {
      const sessionState = workflowSessionByRunRef.current.get(payload.agentRunId)
      if (!sessionState || !payload.chunk) return
      appendTextChunk(sessionState.sessionId, sessionState.assistantMessageId, payload.chunk)
    })
    return cleanup
  }, [appendTextChunk])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowAgentSessionDone((payload) => {
      const sessionState = workflowSessionByRunRef.current.get(payload.agentRunId)
      if (!sessionState) return

      workflowSessionByRunRef.current.delete(payload.agentRunId)
      if (payload.status === 'error') {
        setError(sessionState.sessionId, payload.error ?? 'Workflow agent step failed.')
        return
      }

      commitStreamEnd(sessionState.sessionId)
    })
    return cleanup
  }, [commitStreamEnd, setError])

  useEffect(() => {
    const cleanup = window.claude.onWorkflowNotify((payload) => {
      void window.claude.notify(payload).catch(() => undefined)
    })
    return cleanup
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return

      if (matchShortcut(event, shortcutConfig.toggleSidebar[shortcutPlatform])) {
        event.preventDefault()
        onToggleSidebar()
        return
      }

      if (matchShortcut(event, shortcutConfig.openSettings[shortcutPlatform])) {
        event.preventDefault()
        openSettingsPanel()
        return
      }

      if (matchShortcut(event, shortcutConfig.newSession[shortcutPlatform])) {
        event.preventDefault()
        void openPendingSessionDraft()
        return
      }

      if (matchShortcut(event, shortcutConfig.openCommandPalette[shortcutPlatform])) {
        event.preventDefault()
        toggleCommandPalette()
        return
      }

      if (!shortcutTarget) return

      if (matchShortcut(event, shortcutConfig.cyclePermissionMode[shortcutPlatform])) {
        event.preventDefault()
        cycleClaudeCodeMode(
          shortcutTarget.permissionMode,
          shortcutTarget.planMode,
          applyPermissionMode,
          applyPlanMode,
        )
        return
      }

      if (matchShortcut(event, shortcutConfig.toggleBypassPermissions[shortcutPlatform])) {
        event.preventDefault()
        if (!shortcutTarget.planMode) {
          applyPermissionMode(shortcutTarget.permissionMode === 'bypassPermissions' ? 'default' : 'bypassPermissions')
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [
    applyPermissionMode,
    applyPlanMode,
    onToggleSidebar,
    openPendingSessionDraft,
    openSettingsPanel,
    shortcutConfig,
    shortcutPlatform,
    shortcutTarget,
    toggleCommandPalette,
  ])
}
