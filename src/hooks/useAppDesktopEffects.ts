import { useEffect, useRef } from 'react'
import type { RecentProject } from '../../electron/preload'
import { matchShortcut } from '../lib/shortcuts'
import { applyTheme, type ThemeId } from '../lib/theme'
import type { HandleSendForSession } from './claudeStream/types'
import type { PermissionMode, Session, ShortcutConfig, ShortcutPlatform } from '../store/sessions'
import type {
  Workflow,
  WorkflowExecutionDonePayload,
  WorkflowFiredPayload,
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
  quickPanelEnabled: boolean
  shortcutConfig: ShortcutConfig
  shortcutPlatform: ShortcutPlatform
  shortcutTarget: {
    permissionMode: PermissionMode
    planMode: boolean
  } | null
  createSessionFromUserPrompt: (prompt: string, cwdOverride?: string) => Promise<string>
  openPendingSessionDraft: (cwdOverride?: string) => Promise<void>
  handleSendForSession: HandleSendForSession
  applyPermissionMode: (mode: PermissionMode) => void
  applyPlanMode: (value: boolean) => void
  onToggleSidebar: () => void
  openSettingsPanel: () => void
  toggleCommandPalette: () => void
  recordWorkflowExecutionStart: (payload: WorkflowFiredPayload) => void
  appendWorkflowStepTextChunk: (executionId: string, stepId: string, chunk: string) => void
  applyWorkflowStepUpdate: (payload: WorkflowStepUpdatePayload) => void
  completeWorkflowExecution: (payload: WorkflowExecutionDonePayload) => void
  closeOverlayPanels: () => void
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
  quickPanelEnabled,
  shortcutConfig,
  shortcutPlatform,
  shortcutTarget,
  createSessionFromUserPrompt,
  openPendingSessionDraft,
  handleSendForSession,
  applyPermissionMode,
  applyPlanMode,
  onToggleSidebar,
  openSettingsPanel,
  toggleCommandPalette,
  recordWorkflowExecutionStart,
  appendWorkflowStepTextChunk,
  applyWorkflowStepUpdate,
  completeWorkflowExecution,
  closeOverlayPanels,
}: Params) {
  const syncedQuickPanelProjectsSignatureRef = useRef('')

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
