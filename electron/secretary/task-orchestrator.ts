import type { SecretaryAction, SecretaryActionResult } from './actions'
import type {
  SecretaryApprovalRequest,
  SecretaryTask,
  SecretaryTaskControlCommand,
  SecretaryTaskLog,
  SecretaryTaskRiskLevel,
  SecretaryTaskSnapshot,
  SecretaryTaskStatus,
  SecretaryTaskStep,
  SecretaryToolLane,
  SecretaryVirtualCursorState,
} from './types'

type SecretaryTaskOrchestratorOptions = {
  onSnapshot?: (snapshot: SecretaryTaskSnapshot) => void
}

const ID_PREFIX = 'secretary-task'
const MAX_LOGS = 12

const IDLE_CURSOR: SecretaryVirtualCursorState = {
  visible: true,
  x: 18,
  y: 72,
  label: '대기',
  targetLabel: '요청 입력',
  mode: 'idle',
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createActionKey(action: SecretaryAction): string {
  return JSON.stringify(action)
}

function createLog(message: string, level: SecretaryTaskLog['level'] = 'info'): SecretaryTaskLog {
  return {
    id: createId('secretary-log'),
    createdAt: Date.now(),
    level,
    message,
  }
}

function getActionRisk(action: SecretaryAction): SecretaryTaskRiskLevel {
  if (
    action.type === 'runClaudeCode'
    || action.type === 'runWorkflow'
    || action.type === 'createWorkflow'
    || action.type === 'createSkill'
    || action.type === 'installComputerUse'
    || action.type === 'cancelActiveTask'
  ) {
    return 'high'
  }

  if (
    action.type === 'draftWorkflow'
    || action.type === 'draftSkill'
    || action.type === 'startChat'
    || action.type === 'openSession'
  ) {
    return 'medium'
  }

  return 'low'
}

function getActionLabel(action: SecretaryAction) {
  if (action.type === 'navigate') return `${action.route} 화면으로 이동`
  if (action.type === 'startChat') return '새 채팅 시작'
  if (action.type === 'openRoundTable') return '라운드테이블 열기'
  if (action.type === 'openSession') return '세션 열기'
  if (action.type === 'runWorkflow') return '워크플로우 실행'
  if (action.type === 'draftWorkflow') return '워크플로우 초안 작성'
  if (action.type === 'createWorkflow') return '워크플로우 저장'
  if (action.type === 'draftSkill') return '스킬 초안 작성'
  if (action.type === 'createSkill') return '스킬 생성'
  if (action.type === 'runClaudeCode') return action.mode === 'interactive' ? '채팅에서 실행' : 'Claude Code 실행'
  if (action.type === 'installComputerUse') return 'Cua Driver 설치'
  if (action.type === 'openSettings') return '설정 열기'
  if (action.type === 'cancelActiveTask') return '진행 작업 취소'
  return '액션 실행'
}

function getActionPreview(action: SecretaryAction) {
  if (action.type === 'runClaudeCode') return action.prompt
  if (action.type === 'startChat') return action.initialPrompt ?? '새 프로젝트 채팅을 엽니다.'
  if (action.type === 'runWorkflow') return `workflowId: ${action.workflowId}`
  if (action.type === 'openSession') return action.messageId
    ? `sessionId: ${action.sessionId}\nmessageId: ${action.messageId}`
    : `sessionId: ${action.sessionId}`
  if (action.type === 'draftWorkflow') return action.initialPrompt ?? action.summary ?? action.name
  if (action.type === 'createWorkflow') return action.prompt ?? action.description ?? action.name
  if (action.type === 'draftSkill') return action.initialPrompt ?? action.description ?? action.name
  if (action.type === 'createSkill') return action.description
  if (action.type === 'navigate') return `route: ${action.route}`
  if (action.type === 'installComputerUse') return 'Cua Driver를 설치하고 daemon을 시작합니다. 설치 중 공식 스크립트를 다운로드합니다.'
  if (action.type === 'openSettings') return action.section ? `section: ${action.section}` : '설정 화면을 엽니다.'
  return getActionLabel(action)
}

function getToolLanesForAction(action: SecretaryAction): SecretaryToolLane[] {
  if (
    action.type === 'navigate'
    || action.type === 'openSettings'
    || action.type === 'openRoundTable'
    || action.type === 'openSession'
    || action.type === 'startChat'
  ) {
    return ['citto_renderer']
  }

  if (action.type === 'draftWorkflow' || action.type === 'createWorkflow' || action.type === 'runWorkflow') {
    return ['citto_renderer', 'file_system']
  }

  if (action.type === 'draftSkill' || action.type === 'createSkill') {
    return ['citto_renderer', 'file_system']
  }

  if (action.type === 'runClaudeCode' || action.type === 'installComputerUse') {
    return ['citto_renderer', 'file_system']
  }

  return ['citto_renderer']
}

function createStep(
  label: string,
  description: string,
  toolLane: SecretaryToolLane,
  status: SecretaryTaskStep['status'],
  riskLevel: SecretaryTaskRiskLevel,
  requiresApproval = false,
): SecretaryTaskStep {
  return {
    id: createId('secretary-step'),
    label,
    description,
    toolLane,
    status,
    riskLevel,
    requiresApproval,
  }
}

function clampLogList(logs: SecretaryTaskLog[]) {
  return logs.slice(Math.max(0, logs.length - MAX_LOGS))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asCursorMode(value: unknown): SecretaryVirtualCursorState['mode'] {
  return value === 'moving'
    || value === 'clicking'
    || value === 'typing'
    || value === 'waiting'
    || value === 'danger'
    || value === 'done'
    || value === 'failed'
    || value === 'idle'
    ? value
    : 'moving'
}

function clampPercent(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback
}

export class SecretaryTaskOrchestrator {
  private snapshot: SecretaryTaskSnapshot = {
    task: null,
    cursor: IDLE_CURSOR,
    updatedAt: Date.now(),
  }

  constructor(private readonly options: SecretaryTaskOrchestratorOptions = {}) {}

  getSnapshot(): SecretaryTaskSnapshot {
    return this.snapshot
  }

  startPlanning(goal: string, conversationId: string | null): SecretaryTaskSnapshot {
    const now = Date.now()
    const task: SecretaryTask = {
      id: createId(ID_PREFIX),
      conversationId,
      goal: goal.trim() || '사용자 요청 처리',
      status: 'planning',
      steps: [
        createStep('요청 분석', '목표와 필요한 작업 단위를 확인합니다.', 'citto_renderer', 'running', 'low'),
        createStep('도구 선택', '안정적인 실행 경로와 위험도를 고릅니다.', 'citto_renderer', 'pending', 'low'),
        createStep('실행 전 확인', '위험 액션이면 사용자 승인 카드로 멈춥니다.', 'citto_renderer', 'pending', 'medium', true),
      ],
      currentStepIndex: 0,
      requiredTools: ['citto_renderer'],
      riskLevel: 'low',
      createdAt: now,
      updatedAt: now,
      logs: [createLog('요청을 분석하고 작업 계획을 만들고 있어요.')],
      approvalRequest: null,
    }

    return this.commit({
      task,
      cursor: {
        visible: true,
        x: 28,
        y: 58,
        label: '분석 중',
        targetLabel: '작업 계획',
        mode: 'waiting',
      },
      updatedAt: now,
    })
  }

  markPlanningWaiting(model: string | null): SecretaryTaskSnapshot {
    const task = this.snapshot.task
    if (!task || task.status !== 'planning') return this.getSnapshot()
    const modelLabel = model?.trim() || '기본 모델'
    const steps = task.steps.map((step, index) => {
      if (index === 0) return { ...step, status: 'done' as const }
      if (index === 1) {
        return {
          ...step,
          status: 'running' as const,
          description: `${modelLabel}에게 실행 계획과 승인 필요 여부를 묻고 있습니다.`,
        }
      }
      return step
    })

    return this.commit({
      task: {
        ...task,
        currentStepIndex: Math.min(1, steps.length - 1),
        steps,
        updatedAt: Date.now(),
        logs: clampLogList([...task.logs, createLog(`${modelLabel} 응답을 기다리고 있어요.`)]),
      },
      cursor: {
        visible: true,
        x: 42,
        y: 52,
        label: '응답 대기',
        targetLabel: modelLabel,
        mode: 'waiting',
      },
      updatedAt: Date.now(),
    })
  }

  completePlanning(result: { action: SecretaryAction | null; reply: string }): SecretaryTaskSnapshot {
    const task = this.snapshot.task
    if (!task) return this.getSnapshot()

    if (!result.action) {
      return this.updateTask('completed', {
        currentStepIndex: task.steps.length - 1,
        steps: task.steps.map((step) => ({ ...step, status: step.status === 'pending' ? 'done' : step.status === 'running' ? 'done' : step.status })),
        completedAt: Date.now(),
        logs: [...task.logs, createLog('실행 액션 없이 답변을 완료했어요.')],
      }, {
        visible: true,
        x: 82,
        y: 30,
        label: '완료',
        targetLabel: '결과 보고',
        mode: 'done',
      })
    }

    const riskLevel = getActionRisk(result.action)
    const requiredTools = getToolLanesForAction(result.action)
    const steps = [
      { ...task.steps[0], status: 'done' as const },
      createStep('실행 위치 표시', `${getActionLabel(result.action)} 위치를 확인합니다.`, requiredTools[0] ?? 'citto_renderer', 'done', riskLevel),
      createStep('사용자 승인', '확인 버튼을 누르기 전까지 실제 액션을 실행하지 않습니다.', 'citto_renderer', 'running', riskLevel, true),
    ]
    const approvalRequest: SecretaryApprovalRequest = {
      id: createId('secretary-approval'),
      taskId: task.id,
      actionKey: createActionKey(result.action),
      action: result.action,
      title: getActionLabel(result.action),
      description: riskLevel === 'high'
        ? '되돌리기 어렵거나 실제 실행으로 이어질 수 있는 작업입니다.'
        : '현재 화면이나 작업 흐름을 바꾸기 전 확인이 필요합니다.',
      riskLevel,
      actionPreview: getActionPreview(result.action),
      approveLabel: `승인하고 ${getActionLabel(result.action)}`,
      rejectLabel: '취소',
    }

    return this.commit({
      task: {
        ...task,
        status: 'waiting_approval',
        currentStepIndex: 2,
        requiredTools,
        riskLevel,
        steps,
        updatedAt: Date.now(),
        logs: clampLogList([...task.logs, createLog('위험도와 실행 경로를 확인했고 승인 대기 중입니다.')]),
        approvalRequest,
      },
      cursor: {
        visible: true,
        x: 68,
        y: 34,
        label: '확인 대기',
        targetLabel: approvalRequest.title,
        mode: riskLevel === 'high' ? 'danger' : 'waiting',
      },
      updatedAt: Date.now(),
    })
  }

  canApproveAction(action: SecretaryAction): boolean {
    const task = this.snapshot.task
    return Boolean(
      task
      && task.status === 'waiting_approval'
      && task.approvalRequest?.actionKey === createActionKey(action),
    )
  }

  failPlanning(message: string): SecretaryTaskSnapshot {
    return this.updateTask('failed', {
      logs: [createLog(message, 'error')],
      completedAt: Date.now(),
    }, {
      visible: true,
      x: 44,
      y: 54,
      label: '막힘',
      targetLabel: '오류 지점',
      mode: 'failed',
    })
  }

  startExecution(action: SecretaryAction): SecretaryTaskSnapshot {
    const currentTask = this.snapshot.task
    const now = Date.now()
    const riskLevel = getActionRisk(action)
    const requiredTools = getToolLanesForAction(action)
    const baseTask = currentTask ?? {
      id: createId(ID_PREFIX),
      conversationId: null,
      goal: getActionLabel(action),
      status: 'running' as const,
      steps: [],
      currentStepIndex: 0,
      requiredTools,
      riskLevel,
      createdAt: now,
      updatedAt: now,
      logs: [],
      approvalRequest: null,
    }
    const executionStep = createStep('승인된 액션 실행', `${getActionLabel(action)} 요청을 실행합니다.`, requiredTools[0] ?? 'citto_renderer', 'running', riskLevel)
    const steps = baseTask.steps.length > 0
      ? baseTask.steps.map((step, index) => (
          index === baseTask.currentStepIndex
            ? { ...step, status: 'done' as const }
            : step.status === 'pending'
            ? { ...step, status: 'skipped' as const }
            : step
        )).concat(executionStep)
      : [executionStep]

    return this.commit({
      task: {
        ...baseTask,
        status: 'running',
        currentStepIndex: steps.length - 1,
        requiredTools,
        riskLevel,
        steps,
        updatedAt: now,
        logs: clampLogList([...baseTask.logs, createLog('사용자가 승인해서 액션 실행을 시작합니다.')]),
        approvalRequest: null,
      },
      cursor: {
        visible: true,
        x: 54,
        y: 44,
        label: '실행 중',
        targetLabel: getActionLabel(action),
        mode: 'moving',
      },
      updatedAt: now,
    })
  }

  completeExecution(result: SecretaryActionResult): SecretaryTaskSnapshot {
    const status: SecretaryTaskStatus = result.ok ? 'completed' : 'failed'
    const message = result.ok
      ? result.message ?? '액션 실행이 완료되었습니다.'
      : result.error ?? result.message ?? '액션 실행이 실패했습니다.'
    return this.updateTask(status, {
      steps: this.snapshot.task?.steps.map((step, index) => (
        index === this.snapshot.task?.currentStepIndex
          ? { ...step, status: result.ok ? 'done' as const : 'failed' as const }
          : step
      )),
      logs: [createLog(message, result.ok ? 'info' : 'error')],
      completedAt: Date.now(),
      approvalRequest: null,
    }, {
      visible: true,
      x: result.ok ? 82 : 42,
      y: result.ok ? 30 : 56,
      label: result.ok ? '완료' : '막힘',
      targetLabel: result.ok ? '결과 보고' : '오류 지점',
      mode: result.ok ? 'done' : 'failed',
    })
  }

  control(command: SecretaryTaskControlCommand): SecretaryTaskSnapshot {
    if (command === 'cancel') {
      return this.updateTask('cancelled', {
        logs: [createLog('사용자가 작업을 중단했습니다.', 'warning')],
        completedAt: Date.now(),
        approvalRequest: null,
      }, {
        ...IDLE_CURSOR,
        label: '중단됨',
        targetLabel: '사용자 중단',
      })
    }

    if (command === 'pause') {
      return this.updateTask('paused', {
        logs: [createLog('작업을 일시정지했습니다.', 'warning')],
      }, {
        visible: true,
        x: 50,
        y: 50,
        label: '일시정지',
        targetLabel: '대기',
        mode: 'waiting',
      })
    }

    return this.updateTask('running', {
      logs: [createLog('작업을 다시 맡겼습니다.')],
    }, {
      visible: true,
      x: 54,
      y: 44,
      label: '재개',
      targetLabel: '현재 단계',
      mode: 'moving',
    })
  }

  applyComputerUseEvent(event: unknown): SecretaryTaskSnapshot {
    const task = this.snapshot.task
    if (!task || task.status !== 'running') return this.getSnapshot()

    const record = isRecord(event) ? event : {}
    const cursorRecord = isRecord(record.cursor) ? record.cursor : {}
    const message = typeof record.message === 'string' && record.message.trim()
      ? record.message.trim()
      : '화면 조작 상태가 갱신되었습니다.'
    const label = typeof cursorRecord.label === 'string' && cursorRecord.label.trim()
      ? cursorRecord.label.trim()
      : '화면 조작'
    const targetLabel = typeof cursorRecord.targetLabel === 'string' && cursorRecord.targetLabel.trim()
      ? cursorRecord.targetLabel.trim()
      : '대상 위치'

    return this.commit({
      task: {
        ...task,
        updatedAt: Date.now(),
        logs: clampLogList([...task.logs, createLog(message)]),
      },
      cursor: {
        visible: cursorRecord.visible !== false,
        x: clampPercent(cursorRecord.x, this.snapshot.cursor.x),
        y: clampPercent(cursorRecord.y, this.snapshot.cursor.y),
        label,
        targetLabel,
        mode: asCursorMode(cursorRecord.mode),
      },
      updatedAt: Date.now(),
    })
  }

  reset(): SecretaryTaskSnapshot {
    return this.commit({
      task: null,
      cursor: IDLE_CURSOR,
      updatedAt: Date.now(),
    })
  }

  private updateTask(
    status: SecretaryTaskStatus,
    patch: Partial<Omit<SecretaryTask, 'status' | 'logs' | 'updatedAt'> & { logs: SecretaryTaskLog[] }>,
    cursor: SecretaryVirtualCursorState,
  ): SecretaryTaskSnapshot {
    const task = this.snapshot.task
    if (!task) {
      return this.commit({
        task: null,
        cursor,
        updatedAt: Date.now(),
      })
    }

    const logs = patch.logs
      ? clampLogList([...task.logs, ...patch.logs])
      : task.logs

    return this.commit({
      task: {
        ...task,
        ...patch,
        status,
        logs,
        updatedAt: Date.now(),
      },
      cursor,
      updatedAt: Date.now(),
    })
  }

  private commit(snapshot: SecretaryTaskSnapshot): SecretaryTaskSnapshot {
    this.snapshot = snapshot
    this.options.onSnapshot?.(snapshot)
    return snapshot
  }
}
