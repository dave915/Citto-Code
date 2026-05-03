import type { BrowserWindow } from 'electron'
import { CITTO_ROUTES } from './routes'
import type { SecretaryService } from './secretary-service'
import type { SecretaryAction, SecretaryActionResult } from './actions'

type ActionHandlerOptions = {
  service: SecretaryService
  getActiveConversationId: () => string | null
  showMainWindow: () => BrowserWindow
  sendWhenRendererReady: (window: BrowserWindow, channel: string, payload?: unknown) => void
  runWorkflowNow: (workflowId: string) => Promise<{ ok: boolean; error?: string }>
  runRendererAction: (action: SecretaryAction) => Promise<SecretaryActionResult>
}

export function createSecretaryActionHandlers({
  service,
  getActiveConversationId,
  showMainWindow,
  sendWhenRendererReady,
  runWorkflowNow,
  runRendererAction,
}: ActionHandlerOptions) {
  const navigate = (route: keyof typeof CITTO_ROUTES): SecretaryActionResult => {
    const window = showMainWindow()
    sendWhenRendererReady(window, 'citto:navigate', {
      route,
      path: CITTO_ROUTES[route].path,
    })
    return { ok: true, message: `${CITTO_ROUTES[route].label} 화면을 열었어요.` }
  }

  return async function executeSecretaryAction(action: SecretaryAction): Promise<SecretaryActionResult> {
    if (action.type === 'navigate') {
      return navigate(action.route)
    }

    if (action.type === 'openSettings') {
      return navigate('settings')
    }

    if (action.type === 'openRoundTable') {
      return navigate('roundTable')
    }

    if (
      action.type === 'startChat'
      || action.type === 'openSession'
      || action.type === 'draftWorkflow'
      || action.type === 'createWorkflow'
      || action.type === 'draftSkill'
      || action.type === 'createSkill'
    ) {
      return await runRendererAction(action)
    }

    if (action.type === 'runWorkflow') {
      const result = await runWorkflowNow(action.workflowId)
      return result.ok
        ? { ok: true, message: '워크플로우 실행을 시작했어요.' }
        : { ok: false, error: result.error ?? '워크플로우를 실행하지 못했어요.' }
    }

    if (action.type === 'runClaudeCode') {
      if (action.mode === 'interactive') {
        return await runRendererAction({
          type: 'startChat',
          initialPrompt: action.prompt,
        })
      }

      const result = await service.runClaudeCode(action.prompt, getActiveConversationId() ?? undefined)
      return result.ok
        ? { ok: true, message: result.output ?? '실행이 완료되었습니다.', payload: { output: result.output } }
        : { ok: false, error: result.error ?? result.output ?? 'Claude Code 실행이 실패했습니다.' }
    }

    if (action.type === 'cancelActiveTask') {
      return { ok: false, error: '진행 중 작업 취소는 아직 연결되지 않았어요.' }
    }

    return { ok: false, error: '지원하지 않는 액션입니다.' }
  }
}
