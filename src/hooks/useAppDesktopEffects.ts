import { useEffect, useRef, type MutableRefObject } from 'react'
import type { RecentProject, ScheduledTaskSyncItem } from '../../electron/preload'
import { getScheduledTaskChangedPaths, getScheduledTaskSnapshotStatus, getScheduledTaskSnapshotSummary } from '../lib/scheduledTaskSnapshots'
import { matchShortcut } from '../lib/shortcuts'
import { applyTheme, type ThemeId } from '../lib/theme'
import type { HandleSendForSession, ScheduledTaskRunMeta } from './claudeStream/types'
import { getProjectNameFromPath, type PermissionMode, type Session, type ShortcutConfig, type ShortcutPlatform } from '../store/sessions'
import type { ScheduledTaskAdvancePayload, ScheduledTaskRunSnapshotStatus } from '../store/scheduledTasks'
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
  quickPanelEnabled: boolean
  shortcutConfig: ShortcutConfig
  shortcutPlatform: ShortcutPlatform
  sessions: Session[]
  activeSession: Session | null
  defaultProjectPath: string
  addSession: (cwd: string, name: string) => string
  setPermissionMode: (sessionId: string, mode: PermissionMode) => void
  setPlanMode: (sessionId: string, value: boolean) => void
  onToggleSidebar: () => void
  openSettingsPanel: () => void
  toggleCommandPalette: () => void
  handleNewSession: (cwdOverride?: string) => Promise<string>
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
  quickPanelEnabled,
  shortcutConfig,
  shortcutPlatform,
  sessions,
  activeSession,
  defaultProjectPath,
  addSession,
  setPermissionMode,
  setPlanMode,
  onToggleSidebar,
  openSettingsPanel,
  toggleCommandPalette,
  handleNewSession,
  handleSendForSession,
  applyScheduledTaskAdvance,
  updateScheduledTaskRunSnapshot,
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
    void window.claude.updateQuickPanelShortcut({
      accelerator: shortcutConfig.toggleQuickPanel[shortcutPlatform],
      enabled: quickPanelEnabled,
    }).catch(() => undefined)
  }, [quickPanelEnabled, shortcutConfig, shortcutPlatform])

  useEffect(() => {
    const cleanup = window.claude.onTrayNewSession(() => {
      void handleNewSession()
    })
    return cleanup
  }, [handleNewSession])

  useEffect(() => {
    const cleanup = window.claude.onQuickPanelMessage(async (payload) => {
      const sessionId = await handleNewSession(payload.cwd)
      closeOverlayPanels()
      if (payload.text.trim()) {
        await handleSendForSession(sessionId, payload.text, [])
      }
    })
    return cleanup
  }, [closeOverlayPanels, handleNewSession, handleSendForSession])

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
      scheduledTaskSessionByRunRef.current.set(`${payload.taskId}:${payload.firedAt}`, sessionId)
      scheduledTaskRunMetaBySessionRef.current.set(sessionId, {
        taskId: payload.taskId,
        runAt: payload.firedAt,
      })

      await handleSendForSession(sessionId, payload.prompt, [], {
        permissionModeOverride: payload.permissionMode,
        visibleTextOverride: payload.manual
          ? t('scheduled.app.runNowLabel', { sessionName })
          : payload.catchUp
            ? t('scheduled.app.catchUpLabel', { sessionName })
            : sessionName,
      })
    })
    return cleanup
  }, [addSession, closeOverlayPanels, defaultProjectPath, handleSendForSession, language, scheduledTaskRunMetaBySessionRef, scheduledTaskSessionByRunRef])

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
        void handleNewSession()
        return
      }

      if (matchShortcut(event, shortcutConfig.openCommandPalette[shortcutPlatform])) {
        event.preventDefault()
        toggleCommandPalette()
        return
      }

      if (!activeSession) return

      if (matchShortcut(event, shortcutConfig.cyclePermissionMode[shortcutPlatform])) {
        event.preventDefault()
        cycleClaudeCodeMode(
          activeSession.permissionMode,
          activeSession.planMode,
          (mode) => setPermissionMode(activeSession.id, mode),
          (value) => setPlanMode(activeSession.id, value),
        )
        return
      }

      if (matchShortcut(event, shortcutConfig.toggleBypassPermissions[shortcutPlatform])) {
        event.preventDefault()
        if (!activeSession.planMode) {
          setPermissionMode(
            activeSession.id,
            activeSession.permissionMode === 'bypassPermissions' ? 'default' : 'bypassPermissions',
          )
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [activeSession, handleNewSession, onToggleSidebar, openSettingsPanel, setPermissionMode, setPlanMode, shortcutConfig, shortcutPlatform, toggleCommandPalette])
}
