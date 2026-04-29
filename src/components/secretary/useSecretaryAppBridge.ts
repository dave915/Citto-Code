import { useCallback, useEffect, useMemo } from 'react'
import type {
  CittoRoute,
  SecretaryAction,
  SecretaryActiveContext,
  SecretaryRecentSession,
} from '../../../electron/preload'
import type { AppOverlayPanel } from '../../hooks/useAppPanels'
import type { Session } from '../../store/sessions'

type Params = {
  activePanel: AppOverlayPanel
  activeSession: Session | null
  sessionViewSession: Session | null
  recentSessions: SecretaryRecentSession[]
  isTaskRunning: boolean
  onNavigate: (route: CittoRoute) => void
  onPanelToggle: (open: boolean) => void
  onStartChat: (initialPrompt?: string) => Promise<void>
  onOpenSession: (sessionId: string) => void
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
  isTaskRunning,
  onNavigate,
  onPanelToggle,
  onStartChat,
  onOpenSession,
}: Params) {
  const displaySession = sessionViewSession ?? activeSession
  const activeContext = useMemo<SecretaryActiveContext>(() => ({
    activeRoute: resolveActiveRoute(activePanel, displaySession),
    currentSessionId: displaySession?.id ?? null,
    currentProjectId: displaySession?.cwd ?? null,
    isTaskRunning,
    recentSessions,
    recentArtifacts: [],
  }), [activePanel, displaySession, isTaskRunning, recentSessions])

  const handleNavigate = useCallback((route: CittoRoute) => {
    onNavigate(route)
  }, [onNavigate])

  useEffect(() => {
    void window.secretary.updateActiveContext(activeContext).catch(() => undefined)
  }, [activeContext])

  useEffect(() => {
    void window.secretary.setPanelOpen(activePanel === 'secretary').catch(() => undefined)
  }, [activePanel])

  useEffect(() => {
    const cleanup = window.secretary.onPanelToggle((open) => {
      onPanelToggle(open)
    })
    return cleanup
  }, [onPanelToggle])

  useEffect(() => {
    const cleanup = window.secretary.onNavigate((event) => {
      handleNavigate(event.route)
    })
    return cleanup
  }, [handleNavigate])

  useEffect(() => {
    const handleAction = (action: SecretaryAction) => {
      if (action.type === 'startChat') {
        void onStartChat(action.initialPrompt)
        return
      }
      if (action.type === 'openSession') {
        onOpenSession(action.sessionId)
      }
    }

    const cleanup = window.secretary.onRendererAction(handleAction)
    return cleanup
  }, [onOpenSession, onStartChat])
}
