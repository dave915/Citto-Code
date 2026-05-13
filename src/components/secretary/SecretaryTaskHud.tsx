import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { SecretaryAction, SecretaryBotState, SecretaryTaskSnapshot } from '../../../electron/preload'

export type SecretaryTaskMode =
  | 'idle'
  | 'planning'
  | 'running'
  | 'waiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

type SecretaryActionRisk = 'low' | 'medium' | 'high'

type Props = {
  botState: SecretaryBotState
  sending: boolean
  pendingAction: SecretaryAction | null
  activity?: 'planning' | 'running' | null
  snapshot?: SecretaryTaskSnapshot | null
  compact?: boolean
  onAbort?: () => void
}

type TaskPresentationProps = Props & {
  showIdle?: boolean
}

type StatusCopy = {
  title: string
  detail: string
  cursorLabel: string
  targetLabel: string
  stepLabel: string
}

const STATUS_COPY: Record<SecretaryTaskMode, StatusCopy> = {
  idle: {
    title: '관전 모드 대기 중',
    detail: '요청을 받으면 계획부터 세우고 실행 지점을 먼저 보여줍니다.',
    cursorLabel: '대기',
    targetLabel: '요청 입력',
    stepLabel: '대기',
  },
  planning: {
    title: '요청을 분석하는 중',
    detail: '목표와 필요한 도구를 나누고 안전하게 실행할 수 있는 경로를 고릅니다.',
    cursorLabel: '분석 중',
    targetLabel: '작업 계획',
    stepLabel: '계획',
  },
  running: {
    title: '승인된 작업 실행 중',
    detail: '실제 사용자 커서는 그대로 두고 Citto 내부 액션 경계에서 처리합니다.',
    cursorLabel: '실행 중',
    targetLabel: '현재 단계',
    stepLabel: '실행',
  },
  waiting_approval: {
    title: '승인 필요',
    detail: '화면 이동이나 실행 액션은 확인 버튼을 누르기 전까지 멈춰 있습니다.',
    cursorLabel: '확인 대기',
    targetLabel: '승인 카드',
    stepLabel: '확인',
  },
  paused: {
    title: '작업 일시정지',
    detail: '작업 상태를 보존하고 사용자의 다음 지시를 기다립니다.',
    cursorLabel: '일시정지',
    targetLabel: '대기',
    stepLabel: '정지',
  },
  completed: {
    title: '작업 완료',
    detail: '결과를 확인했고 다음 요청을 받을 준비가 되어 있습니다.',
    cursorLabel: '완료',
    targetLabel: '결과 보고',
    stepLabel: '완료',
  },
  failed: {
    title: '작업이 막혔어요',
    detail: '실패한 지점을 남겨두고 다시 시도하거나 다른 경로를 고를 수 있습니다.',
    cursorLabel: '막힘',
    targetLabel: '오류 지점',
    stepLabel: '실패',
  },
  cancelled: {
    title: '작업이 중단됐어요',
    detail: '사용자가 작업을 끊었고 새 요청을 받을 준비가 되어 있습니다.',
    cursorLabel: '중단됨',
    targetLabel: '사용자 중단',
    stepLabel: '중단',
  },
}

const TOOL_LABELS: Record<string, string> = {
  official_api: '공식 API',
  playwright_dom: 'Playwright/DOM',
  accessibility_tree: '접근성 트리',
  screenshot_vision: '화면 분석',
  os_input: 'OS 입력',
  file_system: '파일',
  citto_renderer: 'Citto',
}

function createActionKey(action: SecretaryAction): string {
  return JSON.stringify(action)
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}분 ${String(seconds).padStart(2, '0')}초` : `${seconds}초`
}

export function getSecretaryActionRisk(action: SecretaryAction): SecretaryActionRisk {
  if (
    action.type === 'runClaudeCode'
    || action.type === 'runAppAutomation'
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
    || action.type === 'saveMemory'
    || action.type === 'startChat'
    || action.type === 'openSession'
  ) {
    return 'medium'
  }

  return 'low'
}

export function getSecretaryTaskMode(
  botState: SecretaryBotState,
  sending: boolean,
  pendingAction: SecretaryAction | null,
  activity: 'planning' | 'running' | null = null,
): SecretaryTaskMode {
  if (pendingAction) return 'waiting_approval'
  if (sending && activity === 'running') return 'running'
  if (sending && botState === 'working') return 'planning'
  if (sending) return 'running'
  if (botState === 'done') return 'completed'
  if (botState === 'error') return 'failed'
  return 'idle'
}

function getStepState(mode: SecretaryTaskMode, step: 'plan' | 'point' | 'approve') {
  if (mode === 'failed') return 'failed'
  if (step === 'plan') {
    return mode === 'idle' ? 'pending' : 'done'
  }
  if (step === 'point') {
    return mode === 'planning' ? 'active' : mode === 'idle' ? 'pending' : 'done'
  }
  if (mode === 'waiting_approval') return 'active'
  if (mode === 'running' || mode === 'completed') return 'done'
  return 'pending'
}

function mapSnapshotStatus(snapshot?: SecretaryTaskSnapshot | null): SecretaryTaskMode | null {
  const status = snapshot?.task?.status
  if (!status || status === 'idle') return null
  return status
}

function useSecretaryTaskPresentation({
  botState,
  sending,
  pendingAction,
  activity = null,
  snapshot = null,
  showIdle = false,
}: TaskPresentationProps) {
  const snapshotMode = mapSnapshotStatus(snapshot)
  const snapshotApprovalActionKey = snapshot?.task?.approvalRequest?.actionKey ?? null
  const pendingActionMatchesSnapshot = Boolean(
    pendingAction
    && snapshotApprovalActionKey
    && createActionKey(pendingAction) === snapshotApprovalActionKey,
  )
  const snapshotHasRunnableApproval = snapshotMode !== 'waiting_approval' || pendingActionMatchesSnapshot
  const effectiveSnapshot = snapshotHasRunnableApproval ? snapshot : null
  const mode = snapshotHasRunnableApproval && snapshotMode
    ? snapshotMode
    : getSecretaryTaskMode(botState, sending, pendingAction, activity)
  const copy = STATUS_COPY[mode]
  const actionRisk = pendingAction ? getSecretaryActionRisk(pendingAction) : null
  const task = effectiveSnapshot?.task
  const currentStep = task?.steps[task.currentStepIndex] ?? null
  const recentLog = task?.logs[task.logs.length - 1] ?? null
  const risk = task?.riskLevel ?? actionRisk
  const toolLanes = task?.requiredTools ?? []
  const isLiveTask = mode === 'planning' || mode === 'running'
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isLiveTask) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isLiveTask])

  const elapsedMs = task ? Math.max(0, now - task.createdAt) : 0
  const elapsedText = task && isLiveTask ? formatElapsed(elapsedMs) : null
  const statusDetail = useMemo(() => {
    const base = currentStep?.description ?? recentLog?.message ?? copy.detail
    if (!task || !isLiveTask) return base
    if (mode === 'planning' && elapsedMs >= 20_000) {
      return `${base} ${formatElapsed(elapsedMs)} 경과. 로컬/외부 모델 응답이 느리면 이 단계가 길어질 수 있어요.`
    }
    if (mode === 'planning' && elapsedMs >= 5_000) {
      return `${base} 응답을 받으면 바로 승인 카드나 답변으로 넘어갑니다.`
    }
    if (mode === 'running' && elapsedMs >= 20_000) {
      return `${base} ${formatElapsed(elapsedMs)} 경과. 외부 앱 조작이나 설치 작업은 시간이 더 걸릴 수 있어요.`
    }
    return base
  }, [copy.detail, currentStep?.description, elapsedMs, isLiveTask, mode, recentLog?.message, task])
  const liveLog = useMemo(() => {
    if (!task || !isLiveTask) return recentLog
    if (mode === 'planning' && elapsedMs >= 20_000) {
      return {
        id: 'secretary-live-wait-long',
        level: 'warning' as const,
        message: `아직 모델 응답을 기다리는 중입니다. 경과 시간: ${formatElapsed(elapsedMs)}.`,
      }
    }
    if (mode === 'planning') {
      return {
        id: 'secretary-live-wait',
        level: 'info' as const,
        message: `모델 응답 대기 중 · 경과 ${formatElapsed(elapsedMs)}`,
      }
    }
    if (mode === 'running') {
      return {
        id: 'secretary-live-running',
        level: elapsedMs >= 30_000 ? 'warning' as const : 'info' as const,
        message: `승인된 작업 실행 중 · 경과 ${formatElapsed(elapsedMs)}`,
      }
    }
    return recentLog
  }, [elapsedMs, isLiveTask, mode, recentLog, task])

  return {
    copy,
    currentStep,
    effectiveSnapshot,
    elapsedText,
    isLiveTask,
    liveLog,
    mode,
    risk,
    shouldRender: showIdle || Boolean(task || pendingAction || sending),
    statusDetail,
    task,
    toolLanes,
  }
}

function VirtualCursorPreview({
  mode,
  copy,
  snapshot,
}: {
  mode: SecretaryTaskMode
  copy: StatusCopy
  snapshot?: SecretaryTaskSnapshot | null
}) {
  const cursor = snapshot?.cursor
  const cursorStyle = cursor
    ? ({
        left: `${Math.min(82, Math.max(8, cursor.x))}%`,
        top: `${Math.min(78, Math.max(12, cursor.y))}%`,
        bottom: 'auto',
        transform: 'translate(-20%, -20%)',
      } satisfies CSSProperties)
    : undefined
  const targetStyle = cursor
    ? ({
        left: `${Math.min(72, Math.max(8, cursor.x + 10))}%`,
        top: `${Math.min(70, Math.max(10, cursor.y - 22))}%`,
        right: 'auto',
      } satisfies CSSProperties)
    : undefined
  const targetLabel = cursor?.targetLabel ?? copy.targetLabel
  const cursorLabel = cursor?.label ?? copy.cursorLabel
  const cursorMode = cursor?.mode

  return (
    <div className={`secretary-virtual-cursor secretary-virtual-cursor-${mode}${cursorMode ? ` secretary-virtual-cursor-mode-${cursorMode}` : ''}`} aria-hidden="true">
      <div className="secretary-virtual-target" style={targetStyle}>
        <span>{targetLabel}</span>
      </div>
      <div className="secretary-virtual-pointer" style={cursorStyle}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 3.75l13.2 8.1-6.05 1.66-3.18 5.52L5 3.75z" />
        </svg>
        <span>{cursorLabel}</span>
      </div>
      {(mode === 'planning' || mode === 'running') && (
        <div className="secretary-virtual-loading">
          <i />
          <i />
          <i />
        </div>
      )}
      {mode === 'completed' && <div className="secretary-virtual-check">✓</div>}
    </div>
  )
}

export function SecretaryTaskHud({
  botState,
  sending,
  pendingAction,
  activity = null,
  snapshot = null,
  compact = false,
  onAbort,
}: Props) {
  const {
    copy,
    currentStep,
    effectiveSnapshot,
    elapsedText,
    liveLog,
    mode,
    risk,
    statusDetail,
    task,
    toolLanes,
  } = useSecretaryTaskPresentation({
    botState,
    sending,
    pendingAction,
    activity,
    snapshot,
    compact,
    onAbort,
    showIdle: true,
  })

  return (
    <section className={`secretary-task-hud secretary-task-hud-${mode}${compact ? ' secretary-task-hud-compact' : ''}`} aria-label="씨토 작업 상태">
      <div className="secretary-task-hud-main">
        <VirtualCursorPreview mode={mode} copy={copy} snapshot={effectiveSnapshot} />
        <div className="secretary-task-hud-copy">
          <div className="secretary-task-hud-kicker">
            <span>Level 2</span>
            <span>관전 모드</span>
            {elapsedText && <span>경과 {elapsedText}</span>}
            {risk && (
              <span className={`secretary-risk-chip secretary-risk-chip-${risk}`}>
                {risk === 'high' ? '위험 확인' : risk === 'medium' ? '확인 필요' : '낮은 위험'}
              </span>
            )}
          </div>
          <h3>{copy.title}</h3>
          <p>{statusDetail}</p>
          {toolLanes.length > 0 && (
            <div className="secretary-task-tools" aria-label="선택된 실행 경로">
              {toolLanes.map((tool) => (
                <span key={tool}>{TOOL_LABELS[tool] ?? tool}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="secretary-task-steps" aria-label="작업 단계">
          {task?.steps.length ? task.steps.slice(0, 4).map((step) => (
            <span key={step.id} className={`secretary-task-step secretary-task-step-${step.status === 'running' ? 'active' : step.status === 'failed' ? 'failed' : step.status === 'done' ? 'done' : 'pending'}`}>
              {step.label}
            </span>
          )) : (
            <>
              <span className={`secretary-task-step secretary-task-step-${getStepState(mode, 'plan')}`}>요청 분석</span>
              <span className={`secretary-task-step secretary-task-step-${getStepState(mode, 'point')}`}>위치 표시</span>
              <span className={`secretary-task-step secretary-task-step-${getStepState(mode, 'approve')}`}>{copy.stepLabel}</span>
            </>
          )}
        </div>
      )}

      {!compact && liveLog && (
        <div className={`secretary-task-log secretary-task-log-${liveLog.level}`}>
          {liveLog.message}
        </div>
      )}

      {sending && onAbort && (
        <div className="secretary-task-controls">
          <button type="button" className="secretary-task-control-button" onClick={onAbort}>
            중단
          </button>
        </div>
      )}
    </section>
  )
}

export function SecretaryTaskInline({
  botState,
  sending,
  pendingAction,
  activity = null,
  snapshot = null,
  onAbort,
}: Props) {
  const {
    copy,
    elapsedText,
    isLiveTask,
    liveLog,
    mode,
    risk,
    shouldRender,
    statusDetail,
    task,
    toolLanes,
  } = useSecretaryTaskPresentation({
    botState,
    sending,
    pendingAction,
    activity,
    snapshot,
    onAbort,
  })
  const [expanded, setExpanded] = useState(() => (
    isLiveTask || mode === 'waiting_approval' || mode === 'failed'
  ))
  const currentStep = task?.steps[task.currentStepIndex] ?? null
  const previewSteps = task?.steps.length ? task.steps.slice(0, 4) : []

  useEffect(() => {
    if (isLiveTask || mode === 'waiting_approval' || mode === 'failed') setExpanded(true)
  }, [isLiveTask, mode, task?.id])

  if (!shouldRender) return null

  return (
    <div className={`secretary-task-inline secretary-task-inline-${mode}`} aria-label="씨토 작업 내역">
      <button
        type="button"
        className="secretary-task-inline-summary"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <svg className={expanded ? 'expanded' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
        <span className={`secretary-task-inline-dot secretary-task-inline-dot-${mode}`} />
        <span className="secretary-task-inline-title">{currentStep?.label ?? copy.title}</span>
        {elapsedText && <span className="secretary-task-inline-meta">경과 {elapsedText}</span>}
        {risk && (
          <span className={`secretary-risk-chip secretary-risk-chip-${risk}`}>
            {risk === 'high' ? '위험 확인' : risk === 'medium' ? '확인 필요' : '낮은 위험'}
          </span>
        )}
      </button>

      {expanded && (
        <div className="secretary-task-inline-body">
          <p>{statusDetail}</p>

          {toolLanes.length > 0 && (
            <div className="secretary-task-tools" aria-label="선택된 실행 경로">
              {toolLanes.map((tool) => (
                <span key={tool}>{TOOL_LABELS[tool] ?? tool}</span>
              ))}
            </div>
          )}

          {previewSteps.length > 0 && (
            <div className="secretary-task-inline-steps" aria-label="작업 단계">
              {previewSteps.map((step) => (
                <span key={step.id} className={`secretary-task-step secretary-task-step-${step.status === 'running' ? 'active' : step.status === 'failed' ? 'failed' : step.status === 'done' ? 'done' : 'pending'}`}>
                  {step.label}
                </span>
              ))}
            </div>
          )}

          {liveLog && (
            <div className={`secretary-task-log secretary-task-log-${liveLog.level}`}>
              {liveLog.message}
            </div>
          )}

          {sending && onAbort && (
            <div className="secretary-task-controls">
              <button type="button" className="secretary-task-control-button" onClick={onAbort}>
                중단
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
