import { useCallback, useEffect, useMemo } from 'react'
import type {
  CittoRoute,
  SecretaryAction,
  SecretaryActiveContext,
  SecretaryActionResult,
  SecretaryRecentSession,
  SecretaryRendererActionRequest,
} from '../../../electron/preload'
import type { AppOverlayPanel } from '../../hooks/useAppPanels'
import type { Session } from '../../store/sessions'
import type { ThemeId } from '../../lib/theme'

type DraftWorkflowAction = Extract<SecretaryAction, { type: 'draftWorkflow' }>
type CreateWorkflowAction = Extract<SecretaryAction, { type: 'createWorkflow' }>
type DraftSkillAction = Extract<SecretaryAction, { type: 'draftSkill' }>
type CreateSkillAction = Extract<SecretaryAction, { type: 'createSkill' }>

type Params = {
  activePanel: AppOverlayPanel
  activeSession: Session | null
  sessionViewSession: Session | null
  recentSessions: SecretaryRecentSession[]
  recentWorkflows: { id: string; name: string }[]
  isTaskRunning: boolean
  themeId: ThemeId
  uiFontSize: number
  sidebarCollapsed: boolean
  settingsTab: string | null
  onNavigate: (route: CittoRoute) => void
  onStartChat: (initialPrompt?: string) => Promise<SecretaryActionResult>
  onOpenSession: (sessionId: string, messageId?: string) => SecretaryActionResult
  onDraftWorkflow: (action: DraftWorkflowAction) => Promise<SecretaryActionResult>
  onCreateWorkflow: (action: CreateWorkflowAction) => Promise<SecretaryActionResult>
  onDraftSkill: (action: DraftSkillAction) => Promise<SecretaryActionResult>
  onCreateSkill: (action: CreateSkillAction) => Promise<SecretaryActionResult>
}

function resolveActiveRoute(activePanel: AppOverlayPanel, session: Session | null): CittoRoute {
  if (activePanel === 'settings') return 'settings'
  if (activePanel === 'workflow') return 'workflow'
  if (activePanel === 'team' || activePanel === 'sessionTeam') return 'roundTable'
  if (activePanel === 'secretary') return 'secretary'
  if (session) return 'chat'
  return 'home'
}

export function useSecretaryAppBridge({
  activePanel,
  activeSession,
  sessionViewSession,
  recentSessions,
  recentWorkflows,
  isTaskRunning,
  themeId,
  uiFontSize,
  sidebarCollapsed,
  settingsTab,
  onNavigate,
  onStartChat,
  onOpenSession,
  onDraftWorkflow,
  onCreateWorkflow,
  onDraftSkill,
  onCreateSkill,
}: Params) {
  const displaySession = sessionViewSession ?? activeSession
  const activeContext = useMemo<SecretaryActiveContext>(() => ({
    activeRoute: resolveActiveRoute(activePanel, displaySession),
    currentSessionId: displaySession?.id ?? null,
    currentProjectId: displaySession?.cwd ?? null,
    currentSessionName: displaySession?.name ?? null,
    currentProjectPath: displaySession?.cwd ?? null,
    currentModel: displaySession?.model ?? null,
    permissionMode: displaySession?.permissionMode ?? null,
    planMode: displaySession?.planMode ?? false,
    themeId,
    uiFontSize,
    sidebarCollapsed,
    settingsTab,
    isTaskRunning,
    recentSessions,
    recentArtifacts: [],
    recentWorkflows,
  }), [activePanel, displaySession, isTaskRunning, recentSessions, recentWorkflows, settingsTab, sidebarCollapsed, themeId, uiFontSize])

  const handleNavigate = useCallback((route: CittoRoute) => {
    onNavigate(route)
  }, [onNavigate])

  useEffect(() => {
    void window.secretary.updateActiveContext(activeContext).catch(() => undefined)
  }, [activeContext])

  useEffect(() => {
    const cleanup = window.secretary.onNavigate((event) => {
      handleNavigate(event.route)
    })
    return cleanup
  }, [handleNavigate])

  useEffect(() => {
    const reportActionResult = async (
      request: SecretaryRendererActionRequest,
      run: () => SecretaryActionResult | Promise<SecretaryActionResult>,
    ) => {
      const result = await Promise.resolve()
        .then(run)
        .catch((error): SecretaryActionResult => ({
          ok: false,
          error: error instanceof Error && error.message.trim()
            ? error.message
            : '작업을 처리하지 못했어요.',
        }))

      await window.secretary.reportRendererActionResult(request.requestId, result).catch(() => undefined)
    }

    const handleAction = (request: SecretaryRendererActionRequest) => {
      const action = request.action
      if (action.type === 'startChat') {
        void reportActionResult(request, () => onStartChat(action.initialPrompt))
        return
      }
      if (action.type === 'openSession') {
        void reportActionResult(request, () => onOpenSession(action.sessionId, action.messageId))
        return
      }
      if (action.type === 'draftWorkflow') {
        void reportActionResult(request, () => onDraftWorkflow(action))
        return
      }
      if (action.type === 'createWorkflow') {
        void reportActionResult(request, () => onCreateWorkflow(action))
        return
      }
      if (action.type === 'draftSkill') {
        void reportActionResult(request, () => onDraftSkill(action))
        return
      }
      if (action.type === 'createSkill') {
        void reportActionResult(request, () => onCreateSkill(action))
      }
    }

    const cleanup = window.secretary.onRendererAction(handleAction)
    return cleanup
  }, [onCreateSkill, onCreateWorkflow, onDraftSkill, onDraftWorkflow, onOpenSession, onStartChat])
}
