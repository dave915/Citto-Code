import { useEffect, useRef, type MutableRefObject } from 'react'
import type { RecentProject, ScheduledTaskSyncItem } from '../../electron/preload'
import { getScheduledTaskChangedPaths, getScheduledTaskSnapshotStatus, getScheduledTaskSnapshotSummary } from '../lib/scheduledTaskSnapshots'
import { matchShortcut } from '../lib/shortcuts'
import { applyTheme, type ThemeId } from '../lib/theme'
import type { HandleSendForSession, ScheduledTaskRunMeta } from './claudeStream/types'
import { getProjectNameFromPath, type PermissionMode, type Session, type ShortcutConfig, type ShortcutPlatform } from '../store/sessions'
import type { ScheduledTaskAdvancePayload, ScheduledTaskRunSnapshotStatus } from '../store/scheduledTasks'
import type {
  Workflow,
  WorkflowExecutionDonePayload,
  WorkflowFiredPayload,
  WorkflowStepUpdatePayload,
} from '../store/workflowTypes'
import { cycleClaudeCodeMode } from '../components/input/inputUtils'
import { useI18n } from './useI18n'

type Params = {
  themeId: ThemeId
  uiFontSize: number
  uiZoomPercent: number
  hasUnsafeReloadState: boolean
  quickPanelProjects: RecentProject[]
  quickPanelProjectsSignature: string
  scheduledTasksSyncPayload: ScheduledTaskSyncItem[]
  workflowSyncPayload: Workflow[]
  quickPanelEnabled: boolean
  shortcutConfig: ShortcutConfig
  shortcutPlatform: ShortcutPlatform
  sessions: Session[]
  shortcutTarget: {
    permissionMode: PermissionMode
    planMode: boolean
  } | null
  defaultProjectPath: string
  addSession: (cwd: string, name: string) => string
  applyPermissionMode: (mode: PermissionMode) => void
  applyPlanMode: (value: boolean) => void
  setModel: (sessionId: string, model: string | null) => void
  onToggleSidebar: () => void
  openSettingsPanel: () => void
  toggleCommandPalette: () => void
  createSessionFromUserPrompt: (prompt: string, cwdOverride?: string) => Promise<string>
  openPendingSessionDraft: (cwdOverride?: string) => Promise<void>
  handleSendForSession: HandleSendForSession
  applyScheduledTaskAdvance: (payload: ScheduledTaskAdvancePayload) => void
  updateScheduledTaskRunSnapshot: (
    taskId: string,
    runAt: number,
    snapshot: {
      status: ScheduledTaskRunSnapshotStatus
      summary: string | null
      changedPaths: string[]
      cost: number | null
    },
  ) => void
  recordWorkflowExecutionStart: (payload: WorkflowFiredPayload) => void
  appendWorkflowStepTextChunk: (executionId: string, stepId: string, chunk: string) => void
  applyWorkflowStepUpdate: (payload: WorkflowStepUpdatePayload) => void
  completeWorkflowExecution: (payload: WorkflowExecutionDonePayload) => void
  scheduledTaskRunMetaBySessionRef: MutableRefObject<Map<string, ScheduledTaskRunMeta>>
  scheduledTaskSessionByRunRef: MutableRefObject<Map<string, string>>
  closeOverlayPanels: () => void
}

export function useAppDesktopEffects({
  themeId,
  uiFontSize,
  uiZoomPercent,
  hasUnsafeReloadState,
  quickPanelProjects,
  quickPanelProjectsSignature,
  scheduledTasksSyncPayload,
  workflowSyncPayload,
  quickPanelEnabled,
  shortcutConfig,
  shortcutPlatform,
  sessions,
  shortcutTarget,
  defaultProjectPath,
  addSession,
  applyPermissionMode,
  applyPlanMode,
  setModel,
  onToggleSidebar,
  openSettingsPanel,
  toggleCommandPalette,
  createSessionFromUserPrompt,
  openPendingSessionDraft,
  handleSendForSession,
  applyScheduledTaskAdvance,
  updateScheduledTaskRunSnapshot,
  recordWorkflowExecutionStart,
  appendWorkflowStepTextChunk,
  applyWorkflowStepUpdate,
  completeWorkflowExecution,
  scheduledTaskRunMetaBySessionRef,
  scheduledTaskSessionByRunRef,
  closeOverlayPanels,
}: Params) {
  const { language, t } = useI18n()
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
    void window.claude.syncScheduledTasks(scheduledTasksSyncPayload).catch(() => undefined)
  }, [scheduledTasksSyncPayload])

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
    const cleanup = window.claude.onScheduledTaskAdvance((payload) => {
      const runKey = `${payload.taskId}:${payload.firedAt}`
      const sessionTabId = scheduledTaskSessionByRunRef.current.get(runKey) ?? null
      scheduledTaskSessionByRunRef.current.delete(runKey)
      applyScheduledTaskAdvance({
        ...payload,
        sessionTabId,
      })
    })

    return cleanup
  }, [applyScheduledTaskAdvance, scheduledTaskSessionByRunRef])

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
    for (const [sessionId, meta] of scheduledTaskRunMetaBySessionRef.current) {
      const session = sessions.find((item) => item.id === sessionId)
      if (!session) {
        scheduledTaskRunMetaBySessionRef.current.delete(sessionId)
        continue
      }

      const status = getScheduledTaskSnapshotStatus(session)
      updateScheduledTaskRunSnapshot(meta.taskId, meta.runAt, {
        status,
        summary: getScheduledTaskSnapshotSummary(session, language),
        changedPaths: getScheduledTaskChangedPaths(session),
        cost: typeof session.lastCost === 'number' ? session.lastCost : null,
      })

      if (status === 'completed' || status === 'failed') {
        scheduledTaskRunMetaBySessionRef.current.delete(sessionId)
      }
    }
  }, [language, sessions, scheduledTaskRunMetaBySessionRef, updateScheduledTaskRunSnapshot])

  useEffect(() => {
    const cleanup = window.claude.onScheduledTaskFired(async (payload) => {
      closeOverlayPanels()

      const cwd = payload.cwd?.trim() || defaultProjectPath
      const baseSessionName = payload.name?.trim() || getProjectNameFromPath(cwd)
      const sessionName = baseSessionName.startsWith('[Schedule] ')
        ? baseSessionName
        : `[Schedule] ${baseSessionName}`
      const sessionId = addSession(cwd, sessionName)
      setModel(sessionId, payload.model ?? null)
      scheduledTaskSessionByRunRef.current.set(`${payload.taskId}:${payload.firedAt}`, sessionId)
      scheduledTaskRunMetaBySessionRef.current.set(sessionId, {
        taskId: payload.taskId,
        runAt: payload.firedAt,
      })

      await handleSendForSession(sessionId, payload.prompt, [], {
        bare: true,
        permissionModeOverride: payload.permissionMode,
        visibleTextOverride: payload.manual
          ? t('scheduled.app.runNowLabel', { sessionName })
          : payload.catchUp
            ? t('scheduled.app.catchUpLabel', { sessionName })
            : sessionName,
      })
    })
    return cleanup
  }, [addSession, closeOverlayPanels, defaultProjectPath, handleSendForSession, language, scheduledTaskRunMetaBySessionRef, scheduledTaskSessionByRunRef, setModel])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [applyPermissionMode, applyPlanMode, onToggleSidebar, openPendingSessionDraft, openSettingsPanel, shortcutConfig, shortcutPlatform, shortcutTarget, toggleCommandPalette])
}
