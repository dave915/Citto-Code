import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SelectedFile } from '../../electron/preload'
import { useTeamStore } from '../store/teamStore'
import { useI18n } from './useI18n'
import { useAppPanels } from './useAppPanels'
import { useClaudeStream } from './useClaudeStream'
import { useAgentTeamStream } from './useAgentTeam'
import { useAppDesktopEffects } from './useAppDesktopEffects'
import { useInstallationCheck } from './useInstallationCheck'
import { useSidebarLayout } from './useSidebarLayout'
import { useSubagentStreams } from './useSubagentStreams'
import { buildSecretaryRecentSessions, normalizeSelectedFolder, resolveEnvVarsForModel, sanitizeEnvVars } from '../lib/claudeRuntime'
import { getCurrentPlatform } from '../lib/shortcuts'
import { buildSessionFileLockState } from '../lib/sessionLocks'
import { useWorkflowStore } from '../store/workflowStore'
import type { WorkflowConditionOperator, WorkflowInput, WorkflowStep, WorkflowTrigger } from '../store/workflowTypes'
import { summarizeSessionTitleFromPrompt } from '../lib/sessionUtils'
import { normalizeConfiguredModelSelection } from '../lib/modelSelection'
import { nanoid } from '../store/nanoid'
import { DEFAULT_PROJECT_PATH, getProjectNameFromPath, useSessionsStore, type PermissionMode, type Session } from '../store/sessions'
import { useSecretaryAppBridge } from '../components/secretary/useSecretaryAppBridge'
import type {
  CittoRoute,
  SecretaryAction,
  SecretaryActionResult,
  SecretaryRuntimeConfig,
  SecretarySearchResult,
} from '../../electron/preload'

type PendingSessionDraft = {
  id: string
  cwd: string
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
}

type DraftWorkflowAction = Extract<SecretaryAction, { type: 'draftWorkflow' }>
type CreateWorkflowAction = Extract<SecretaryAction, { type: 'createWorkflow' }>
type DraftSkillAction = Extract<SecretaryAction, { type: 'draftSkill' }>
type CreateSkillAction = Extract<SecretaryAction, { type: 'createSkill' }>
type WorkflowDraftStep = NonNullable<CreateWorkflowAction['steps']>[number]
type WorkflowAgentDraftStep = Extract<WorkflowDraftStep, { type?: 'agent' }>
type WorkflowConditionDraftStep = Extract<WorkflowDraftStep, { type: 'condition' }>
type WorkflowLoopDraftStep = Extract<WorkflowDraftStep, { type: 'loop' }>

function normalizeProjectKey(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '~') return '~'

  const normalized = trimmed.replace(/\\/g, '/')
  if (normalized === '/') return normalized
  return normalized.replace(/\/+$/, '').toLowerCase()
}

function formatSecretaryWorkflowSteps(steps: DraftWorkflowAction['steps'] | CreateWorkflowAction['steps']) {
  if (!steps || steps.length === 0) return null

  return steps
    .map((step, index) => {
      const label = step.label?.trim() || `단계 ${index + 1}`
      if (step.type === 'condition') {
        return `${index + 1}. ${label}: 조건 ${step.operator ?? 'always_true'} ${step.value ?? ''}`.trim()
      }
      if (step.type === 'loop') {
        const body = step.bodySteps?.map((bodyStep) => bodyStep.prompt).join(' / ') || '반복 본문'
        return `${index + 1}. ${label}: 최대 ${step.maxIterations ?? 3}회 반복 · ${body}`
      }
      return `${index + 1}. ${label}: ${step.prompt}`
    })
    .join('\n')
}

function buildWorkflowDraftSessionPrompt(action: DraftWorkflowAction) {
  const initialPrompt = action.initialPrompt?.trim()
  if (initialPrompt) return initialPrompt

  const steps = formatSecretaryWorkflowSteps(action.steps)
  return [
    '씨토 비서가 워크플로우 초안으로 넘긴 작업입니다.',
    '',
    `이름: ${action.name}`,
    action.summary ? `요약: ${action.summary}` : null,
    steps ? `초안 단계:\n${steps}` : null,
    '',
    '이 초안을 실제로 저장 가능한 워크플로우로 다듬어 주세요.',
    '필요한 단계, 실행 프롬프트, 작업 디렉터리, 검증 기준을 정리하고 구현이 필요하면 이어서 진행해 주세요.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function buildSkillDraftSessionPrompt(action: DraftSkillAction) {
  const initialPrompt = action.initialPrompt?.trim()
  if (initialPrompt) return initialPrompt

  return [
    '씨토 비서가 스킬 초안으로 넘긴 작업입니다.',
    '',
    `이름: ${action.name}`,
    action.description ? `설명: ${action.description}` : null,
    action.instructions ? `초안 지침:\n${action.instructions}` : null,
    '',
    '~/.claude/skills/<name>/SKILL.md 형식에 맞게 스킬을 다듬어 주세요.',
    '트리거 설명은 명확하게 쓰고, 본문은 실제 작업 절차만 간결하게 남겨 주세요.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function createSecretaryWorkflowInput(
  action: CreateWorkflowAction,
  fallbackCwd: string,
  defaultModel: string | null,
): WorkflowInput {
  const workflowName = action.name.trim() || '씨토 워크플로우'
  const fallbackPrompt = action.prompt?.trim() || action.description?.trim() || workflowName
  const sourceSteps = buildWorkflowSourceSteps(action, workflowName, fallbackPrompt)
  const steps = buildWorkflowStepsFromSource(action, sourceSteps, workflowName, fallbackPrompt, fallbackCwd, defaultModel)
  const trigger = resolveWorkflowTrigger(action)

  return {
    name: workflowName,
    steps,
    trigger,
    active: trigger.type === 'schedule',
    nodePositions: steps.reduce<Record<string, { x: number; y: number }>>((positions, step, index) => {
      const isLoopBody = steps.some((candidate) => (
        candidate.type === 'loop' && candidate.bodyStepIds.includes(step.id)
      ))
      positions[step.id] = {
        x: 280 + (index * 320),
        y: isLoopBody ? 460 : 300,
      }
      return positions
    }, {}),
  }
}

function isConditionDraftStep(step: WorkflowDraftStep): step is WorkflowConditionDraftStep {
  return step.type === 'condition'
}

function isLoopDraftStep(step: WorkflowDraftStep): step is WorkflowLoopDraftStep {
  return step.type === 'loop'
}

function buildWorkflowActionText(action: CreateWorkflowAction) {
  return [
    action.name,
    action.description,
    action.prompt,
    ...(action.steps ?? []).flatMap((step) => {
      if (isConditionDraftStep(step)) return [step.label, step.operator, step.value]
      if (isLoopDraftStep(step)) return [step.label, String(step.maxIterations ?? ''), ...(step.bodySteps ?? []).map((bodyStep) => bodyStep.prompt)]
      return [step.label, step.prompt, step.systemPrompt]
    }),
  ].filter(Boolean).join(' ')
}

function buildWorkflowSourceSteps(
  action: CreateWorkflowAction,
  workflowName: string,
  fallbackPrompt: string,
): WorkflowDraftStep[] {
  if (action.steps && action.steps.length > 0) return action.steps

  const baseAgent: WorkflowAgentDraftStep = {
    type: 'agent',
    label: workflowName,
    prompt: fallbackPrompt,
    cwd: action.cwd,
    systemPrompt: action.description,
  }
  const actionText = buildWorkflowActionText(action)
  if (/(반복|loop|repeat|iterate|iteration)/i.test(actionText)) {
    return [{
      type: 'loop',
      label: `${workflowName} 반복`,
      maxIterations: 3,
      bodySteps: [baseAgent],
    }]
  }

  return [baseAgent]
}

function clampScheduleHour(value: number | undefined) {
  return Math.max(0, Math.min(23, Math.floor(value ?? 9)))
}

function clampScheduleMinute(value: number | undefined) {
  return Math.max(0, Math.min(59, Math.floor(value ?? 0)))
}

function clampScheduleDay(value: number | undefined) {
  return Math.max(0, Math.min(6, Math.floor(value ?? 1)))
}

function resolveWorkflowTrigger(action: CreateWorkflowAction): WorkflowTrigger {
  if (action.trigger?.type === 'manual') return { type: 'manual' }
  if (action.trigger?.type === 'schedule') {
    return {
      type: 'schedule',
      frequency: action.trigger.frequency,
      hour: clampScheduleHour(action.trigger.hour),
      minute: clampScheduleMinute(action.trigger.minute),
      dayOfWeek: clampScheduleDay(action.trigger.dayOfWeek),
    }
  }

  const actionText = buildWorkflowActionText(action)
  if (/(매시간|매 시간|hourly|every hour)/i.test(actionText)) {
    return { type: 'schedule', frequency: 'hourly', hour: 9, minute: 0, dayOfWeek: 1 }
  }
  if (/(평일|weekdays|weekday)/i.test(actionText)) {
    return { type: 'schedule', frequency: 'weekdays', hour: 9, minute: 0, dayOfWeek: 1 }
  }
  if (/(매주|weekly|every week)/i.test(actionText)) {
    return { type: 'schedule', frequency: 'weekly', hour: 9, minute: 0, dayOfWeek: 1 }
  }
  if (/(매일|매일마다|daily|every day)/i.test(actionText)) {
    return { type: 'schedule', frequency: 'daily', hour: 9, minute: 0, dayOfWeek: 1 }
  }
  return { type: 'manual' }
}

function normalizeWorkflowConditionOperator(operator: WorkflowConditionOperator | undefined): WorkflowConditionOperator {
  return operator ?? 'always_true'
}

function createWorkflowAgentStep(
  action: CreateWorkflowAction,
  source: WorkflowAgentDraftStep,
  label: string,
  fallbackPrompt: string,
  fallbackCwd: string,
  defaultModel: string | null,
): Extract<WorkflowStep, { type: 'agent' }> {
  return {
    type: 'agent',
    id: nanoid(),
    label,
    prompt: source.prompt.trim() || fallbackPrompt,
    cwd: normalizeSelectedFolder(source.cwd)
      ?? normalizeSelectedFolder(action.cwd)
      ?? fallbackCwd,
    model: defaultModel,
    permissionMode: action.permissionMode ?? 'default',
    systemPrompt: source.systemPrompt?.trim() || action.description?.trim() || '',
  }
}

function buildWorkflowStepsFromSource(
  action: CreateWorkflowAction,
  sourceSteps: WorkflowDraftStep[],
  workflowName: string,
  fallbackPrompt: string,
  fallbackCwd: string,
  defaultModel: string | null,
): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  const sourceTopLevelIds: string[] = []
  const topLevelStepIds: string[] = []
  const loopBodyIdsByLoopId = new Map<string, string[]>()

  sourceSteps.forEach((source, index) => {
    if (isConditionDraftStep(source)) {
      const step: Extract<WorkflowStep, { type: 'condition' }> = {
        type: 'condition',
        id: nanoid(),
        label: source.label?.trim() || `${workflowName} 조건 ${index + 1}`,
        operator: normalizeWorkflowConditionOperator(source.operator),
        value: source.value?.trim() || '',
        trueBranchStepId: null,
        falseBranchStepId: null,
      }
      steps.push(step)
      sourceTopLevelIds[index] = step.id
      topLevelStepIds.push(step.id)
      return
    }

    if (isLoopDraftStep(source)) {
      const loopId = nanoid()
      const bodySourceSteps = source.bodySteps && source.bodySteps.length > 0
        ? source.bodySteps
        : [{
            type: 'agent' as const,
            label: `${workflowName} 반복 작업`,
            prompt: fallbackPrompt,
            cwd: action.cwd,
            systemPrompt: action.description,
          }]
      const bodySteps = bodySourceSteps.map((bodySource, bodyIndex) => createWorkflowAgentStep(
        action,
        bodySource,
        bodySource.label?.trim() || `${workflowName} 반복 ${bodyIndex + 1}`,
        fallbackPrompt,
        fallbackCwd,
        defaultModel,
      ))
      bodySteps.forEach((bodyStep, bodyIndex) => {
        bodyStep.nextStepId = bodySteps[bodyIndex + 1]?.id ?? null
      })
      const bodyStepIds = bodySteps.map((bodyStep) => bodyStep.id)
      const breakCondition = source.breakCondition
        ? {
            operator: normalizeWorkflowConditionOperator(source.breakCondition.operator),
            value: source.breakCondition.value?.trim() || '',
          }
        : null
      const loopStep: Extract<WorkflowStep, { type: 'loop' }> = {
        type: 'loop',
        id: loopId,
        label: source.label?.trim() || `${workflowName} 반복 ${index + 1}`,
        maxIterations: Math.max(1, Math.min(20, Math.floor(source.maxIterations ?? 3))),
        bodyStepIds,
        breakCondition,
      }
      steps.push(loopStep, ...bodySteps)
      loopBodyIdsByLoopId.set(loopId, bodyStepIds)
      sourceTopLevelIds[index] = loopStep.id
      topLevelStepIds.push(loopStep.id)
      return
    }

    const step = createWorkflowAgentStep(
      action,
      source,
      source.label?.trim() || (sourceSteps.length === 1 ? workflowName : `${workflowName} ${index + 1}`),
      fallbackPrompt,
      fallbackCwd,
      defaultModel,
    )
    steps.push(step)
    sourceTopLevelIds[index] = step.id
    topLevelStepIds.push(step.id)
  })

  const topLevelNextById = new Map<string, string | null>()
  topLevelStepIds.forEach((stepId, index) => {
    topLevelNextById.set(stepId, topLevelStepIds[index + 1] ?? null)
  })

  sourceSteps.forEach((source, index) => {
    const stepId = sourceTopLevelIds[index]
    const step = steps.find((candidate) => candidate.id === stepId)
    if (!step) return
    step.nextStepId = topLevelNextById.get(step.id) ?? null

    if (step.type === 'condition' && isConditionDraftStep(source)) {
      step.trueBranchStepId = source.trueBranchStepIndex === undefined
        ? null
        : sourceTopLevelIds[source.trueBranchStepIndex] ?? null
      step.falseBranchStepId = source.falseBranchStepIndex === undefined
        ? null
        : sourceTopLevelIds[source.falseBranchStepIndex] ?? null
    }

    if (step.type === 'loop') {
      const bodyStepIds = loopBodyIdsByLoopId.get(step.id) ?? []
      bodyStepIds.forEach((bodyStepId, bodyIndex) => {
        const bodyStep = steps.find((candidate) => candidate.id === bodyStepId)
        if (bodyStep) bodyStep.nextStepId = bodyStepIds[bodyIndex + 1] ?? null
      })
    }
  })

  return steps
}

function createSkillSlug(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')

  return slug || `citto-skill-${Date.now().toString(36)}`
}

async function resolveAvailableSkillName(baseName: string) {
  const existingSkills = await window.claude.listSkills().catch(() => [])
  const existingNames = new Set(existingSkills.map((skill) => skill.name))
  if (!existingNames.has(baseName)) return baseName

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${baseName}-${suffix}`
    if (!existingNames.has(candidate)) return candidate
  }

  return `${baseName}-${Date.now().toString(36)}`
}

function buildSkillContent(action: CreateSkillAction, skillName: string) {
  const description = action.description.replace(/\s+/g, ' ').trim()
  const body = action.instructions
    .replace(/^---[\s\S]*?---\s*/m, '')
    .trim()
  const contentBody = body.startsWith('#')
    ? body
    : [`# ${action.name.trim() || skillName}`, '', body].join('\n')

  return [
    '---',
    `name: ${skillName}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    contentBody,
    '',
  ].join('\n')
}

export function useAppController() {
  const { language, t } = useI18n()
  const messageJumpTokenRef = useRef(0)
  const {
    sessions,
    activeSessionId,
    defaultProjectPath,
    sidebarMode,
    addSession,
    removeSession,
    setActiveSession,
    setSidebarMode,
    addUserMessage,
    startAssistantMessage,
    appendThinkingChunk,
    appendTextChunk,
    addBtwCard,
    appendBtwCardChunk,
    updateBtwCard,
    appendSubagentText,
    addToolCall,
    resolveToolCall,
    updateSubagent,
    setStreaming,
    setClaudeSessionId,
    setError,
    setPendingPermission,
    setPendingQuestion,
    setTokenUsage,
    setLastCost,
    updateSession,
    setPermissionMode,
    setPlanMode,
    setModel,
    reorderSessions,
    commitStreamEnd,
    setLinkedTeamId,
    envVars,
    themeId,
    notificationMode,
    uiFontSize,
    uiZoomPercent,
    secretaryEnabled,
    shortcutConfig,
    claudeBinaryPath,
  } = useSessionsStore()
  const { setActiveTeam, teams: agentTeams } = useTeamStore()

  const panels = useAppPanels()
  const [pendingSessionDraft, setPendingSessionDraft] = useState<PendingSessionDraft | null>(null)
  const [messageJumpTarget, setMessageJumpTarget] = useState<{
    sessionId: string
    messageId: string
    token: number
  } | null>(null)
  const { sidebarWidth, sidebarCollapsed, handleSidebarResizeStart, handleToggleSidebar } = useSidebarLayout()

  const activeSession = activeSessionId ? sessions.find((session) => session.id === activeSessionId) ?? null : null
  const pendingSessionView = useMemo<Session | null>(() => {
    if (!pendingSessionDraft) return null

    return {
      id: pendingSessionDraft.id,
      sessionId: null,
      name: getProjectNameFromPath(pendingSessionDraft.cwd),
      favorite: false,
      cwd: pendingSessionDraft.cwd,
      messages: [],
      isStreaming: false,
      currentAssistantMsgId: null,
      error: null,
      pendingPermission: null,
      pendingQuestion: null,
      tokenUsage: null,
      lastCost: undefined,
      permissionMode: pendingSessionDraft.permissionMode,
      planMode: pendingSessionDraft.planMode,
      model: pendingSessionDraft.model,
      modelSwitchNotice: null,
      checkpointRestoreState: null,
      checkpoints: [],
      linkedTeamId: null,
    }
  }, [pendingSessionDraft])
  const sessionViewSession = pendingSessionView ?? activeSession
  const sessionFileLockState = useMemo(() => buildSessionFileLockState(sessions), [sessions])
  const secretaryRecentSessions = useMemo(() => buildSecretaryRecentSessions(sessions), [sessions])
  const defaultWorkflowModel = useMemo(() => {
    const activeModel = normalizeConfiguredModelSelection(activeSession?.model)
    if (activeModel) return activeModel

    for (let index = sessions.length - 1; index >= 0; index -= 1) {
      const sessionModel = normalizeConfiguredModelSelection(sessions[index]?.model)
      if (sessionModel) return sessionModel
    }

    return null
  }, [activeSession?.model, sessions])
  const shortcutPlatform = getCurrentPlatform()
  const sanitizedEnvVars = useMemo(() => sanitizeEnvVars(envVars), [envVars])
  const secretaryRuntimeModel = sessionViewSession ? sessionViewSession.model : defaultWorkflowModel
  const secretaryRuntimeConfig = useMemo<SecretaryRuntimeConfig>(() => ({
    claudePath: claudeBinaryPath.trim() || null,
    envVars: resolveEnvVarsForModel(secretaryRuntimeModel, sanitizedEnvVars) ?? sanitizedEnvVars,
    defaultModel: normalizeConfiguredModelSelection(secretaryRuntimeModel),
  }), [claudeBinaryPath, sanitizedEnvVars, secretaryRuntimeModel])
  const workflows = useWorkflowStore((state) => state.workflows)
  const addWorkflow = useWorkflowStore((state) => state.addWorkflow)
  const recordWorkflowExecutionStart = useWorkflowStore((state) => state.recordExecutionStart)
  const advanceWorkflowSchedule = useWorkflowStore((state) => state.advanceSchedule)
  const appendWorkflowStepTextChunk = useWorkflowStore((state) => state.appendStepTextChunk)
  const applyWorkflowStepUpdate = useWorkflowStore((state) => state.applyStepUpdate)
  const completeWorkflowExecution = useWorkflowStore((state) => state.completeExecution)
  const workflowSyncPayload = useMemo(
    () => workflows.map((workflow) => ({ ...workflow })),
    [workflows],
  )
  const secretaryRecentWorkflows = useMemo(
    () => workflows.map((workflow) => ({ id: workflow.id, name: workflow.name })).slice(0, 8),
    [workflows],
  )
  const activeSessionConflict = activeSessionId ? sessionFileLockState[activeSessionId] : null
  const activeSessionConflictDetails = activeSessionConflict?.hasConflict
    ? {
        paths: activeSessionConflict.conflictingPaths,
        sessionNames: activeSessionConflict.conflictingSessionIds
          .map((sessionId) => sessions.find((session) => session.id === sessionId)?.name ?? t('app.anotherSession'))
          .filter((value, index, array) => array.indexOf(value) === index),
      }
    : null

  const installation = useInstallationCheck(claudeBinaryPath)

  const claudeStream = useClaudeStream({
    sessions,
    activeSessionId,
    defaultProjectPath,
    sanitizedEnvVars,
    claudeBinaryPath,
    notificationMode,
    addUserMessage,
    startAssistantMessage,
    appendThinkingChunk,
    appendTextChunk,
    addBtwCard,
    appendBtwCardChunk,
    updateBtwCard,
    addToolCall,
    resolveToolCall,
    setStreaming,
    setClaudeSessionId,
    setError,
    setPendingPermission,
    setPendingQuestion,
    setTokenUsage,
    setLastCost,
    updateSession,
    setPermissionMode,
    setModel,
    commitStreamEnd,
    removeSession,
  })

  const hasUnsafeReloadState = useMemo(
    () => (
      sessions.some((session) => session.isStreaming || Boolean(session.pendingPermission) || Boolean(session.pendingQuestion))
      || sessions.some((session) =>
        session.messages.some((message) => message.btwCards?.some((card) => card.isStreaming)),
      )
    ),
    [sessions],
  )

  const teamStream = useAgentTeamStream(
    sanitizedEnvVars,
    claudeBinaryPath || undefined,
    language,
  )

  useSubagentStreams({
    appendSubagentText,
    updateSubagent,
  })

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    if (!messageJumpTarget) return

    const timer = window.setTimeout(() => {
      setMessageJumpTarget((current) => (current?.token === messageJumpTarget.token ? null : current))
    }, 1600)

    return () => window.clearTimeout(timer)
  }, [messageJumpTarget])

  useEffect(() => {
    if (!pendingSessionDraft || !activeSessionId) return
    setPendingSessionDraft(null)
  }, [activeSessionId, pendingSessionDraft])

  const openSessionTeamPanel = useCallback(() => {
    if (!activeSession) return
    const linkedTeam = activeSession.linkedTeamId
      ? agentTeams.find((team) => team.id === activeSession.linkedTeamId) ?? null
      : null
    const isSameProject = linkedTeam
      ? normalizeProjectKey(linkedTeam.cwd) === normalizeProjectKey(activeSession.cwd)
      : false

    setActiveTeam(isSameProject ? linkedTeam?.id ?? null : null)
    panels.openSessionTeamPanel()
  }, [activeSession, agentTeams, panels, setActiveTeam])

  const handleInjectTeamSummary = useCallback((summary: string) => {
    if (!activeSession) return
    panels.closeSessionTeamPanel()
    claudeStream.handleSend(summary, [])
  }, [activeSession, claudeStream, panels])

  const resolveSessionCwd = useCallback(async (cwdOverride?: string) => {
    const fallbackPath = defaultProjectPath.trim() || DEFAULT_PROJECT_PATH
    const folder = normalizeSelectedFolder(cwdOverride)
      ?? normalizeSelectedFolder(await window.claude.selectFolder({
        defaultPath: fallbackPath,
        title: t('app.selectProjectFolderTitle'),
      }))
    return folder || fallbackPath
  }, [defaultProjectPath, t])

  const createSessionRecord = useCallback((options: {
    cwd: string
    name: string
    permissionMode?: PermissionMode
    planMode?: boolean
    model?: string | null
  }): string => {
    setPendingSessionDraft(null)
    const sessionId = addSession(options.cwd, options.name)

    if (options.permissionMode && options.permissionMode !== 'default') {
      setPermissionMode(sessionId, options.permissionMode)
    }
    if (options.planMode) {
      setPlanMode(sessionId, true)
    }
    if (options.model) {
      setModel(sessionId, options.model)
    }

    return sessionId
  }, [addSession, setModel, setPermissionMode, setPlanMode])

  const openPendingSessionDraft = useCallback(async (cwdOverride?: string): Promise<void> => {
    panels.closeOverlayPanels()
    setMessageJumpTarget(null)
    const cwd = await resolveSessionCwd(cwdOverride)
    setActiveSession(null)
    setPendingSessionDraft({
      id: nanoid(),
      cwd,
      permissionMode: 'default',
      planMode: false,
      model: null,
    })
  }, [panels, resolveSessionCwd, setActiveSession])

  const startPendingDraftConversation = useCallback(async (
    draft: PendingSessionDraft,
    text: string,
    files: SelectedFile[],
  ) => {
    const sessionId = createSessionRecord({
      cwd: draft.cwd,
      name: summarizeSessionTitleFromPrompt(text, getProjectNameFromPath(draft.cwd)),
      permissionMode: draft.permissionMode,
      planMode: draft.planMode,
      model: draft.model,
    })
    await claudeStream.handleSendForSession(sessionId, text, files)
  }, [claudeStream, createSessionRecord])

  const handleSelectSession = useCallback((sessionId: string) => {
    panels.closeOverlayPanels()
    setMessageJumpTarget(null)
    setPendingSessionDraft(null)
    setActiveSession(sessionId)
  }, [panels, setActiveSession])

  const handleSelectMessageResult = useCallback((sessionId: string, messageId: string) => {
    messageJumpTokenRef.current += 1
    panels.closeOverlayPanels()
    setPendingSessionDraft(null)
    setMessageJumpTarget({
      sessionId,
      messageId,
      token: messageJumpTokenRef.current,
    })
    setActiveSession(sessionId)
  }, [panels, setActiveSession])

  const handleSend = useCallback(async (text: string, files: SelectedFile[]) => {
    if (pendingSessionDraft) {
      await startPendingDraftConversation(pendingSessionDraft, text, files)
      return
    }
    await claudeStream.handleSend(text, files)
  }, [claudeStream, pendingSessionDraft, startPendingDraftConversation])

  const handleBtwSend = useCallback(async (text: string, files: SelectedFile[]) => {
    if (pendingSessionDraft) {
      await startPendingDraftConversation(pendingSessionDraft, text, files)
      return
    }
    await claudeStream.handleBtwSend(text, files)
  }, [claudeStream, pendingSessionDraft, startPendingDraftConversation])

  const handlePermissionModeChange = useCallback((mode: PermissionMode) => {
    if (pendingSessionDraft) {
      setPendingSessionDraft((current) => (current ? { ...current, permissionMode: mode } : current))
      return
    }
    if (!activeSession) return
    setPermissionMode(activeSession.id, mode)
  }, [activeSession, pendingSessionDraft, setPermissionMode])

  const handlePlanModeChange = useCallback((value: boolean) => {
    if (pendingSessionDraft) {
      setPendingSessionDraft((current) => (current ? { ...current, planMode: value } : current))
      return
    }
    if (!activeSession) return
    setPlanMode(activeSession.id, value)
  }, [activeSession, pendingSessionDraft, setPlanMode])

  const handleModelChange = useCallback((model: string | null) => {
    if (pendingSessionDraft) {
      setPendingSessionDraft((current) => (current ? { ...current, model } : current))
      return
    }
    if (!activeSession) return
    claudeStream.handleModelChange(activeSession.id, model)
  }, [activeSession, claudeStream, pendingSessionDraft])

  const handleSecretaryNavigate = useCallback((route: CittoRoute) => {
    setMessageJumpTarget(null)
    if (route === 'settings') {
      panels.openSettingsPanel()
      return
    }
    if (route === 'workflow') {
      panels.openWorkflowPanel()
      return
    }
    if (route === 'roundTable') {
      panels.openTeamPanel()
      return
    }
    if (route === 'secretary') {
      panels.openSecretaryPanel()
      return
    }

    panels.closeOverlayPanels()

    if (route === 'home') {
      setPendingSessionDraft(null)
      setActiveSession(null)
      return
    }

    if (route === 'chat' && !activeSessionId && sessions.length > 0) {
      setActiveSession(sessions[sessions.length - 1].id)
    }
  }, [activeSessionId, panels, sessions, setActiveSession])

  const handleSecretaryStartChat = useCallback(async (initialPrompt?: string) => {
    panels.closeOverlayPanels()
    setMessageJumpTarget(null)
    const cwd = activeSession?.cwd ?? (defaultProjectPath.trim() || DEFAULT_PROJECT_PATH)
    const prompt = initialPrompt?.trim()
    const name = prompt
      ? summarizeSessionTitleFromPrompt(prompt, getProjectNameFromPath(cwd))
      : getProjectNameFromPath(cwd)
    const sessionId = createSessionRecord({
      cwd,
      name,
    })
    setActiveSession(sessionId)
    if (prompt) {
      await claudeStream.handleSendForSession(sessionId, prompt, [])
    }
    return {
      ok: true,
      message: `새 세션을 만들었어요: ${name}`,
      payload: { sessionId, name },
    } satisfies SecretaryActionResult
  }, [activeSession?.cwd, claudeStream, createSessionRecord, defaultProjectPath, panels, setActiveSession])

  const handleSecretaryOpenSession = useCallback((sessionId: string, messageId?: string) => {
    const session = sessions.find((item) => item.id === sessionId)
    if (!session) {
      return { ok: false, error: '세션을 찾지 못했어요.' } satisfies SecretaryActionResult
    }
    if (messageId) {
      handleSelectMessageResult(sessionId, messageId)
    } else {
      panels.closeOverlayPanels()
      setMessageJumpTarget(null)
      setPendingSessionDraft(null)
      setActiveSession(sessionId)
    }
    return {
      ok: true,
      message: messageId
        ? `세션 메시지로 이동했어요: ${session.name}`
        : `세션을 열었어요: ${session.name}`,
      payload: { sessionId, messageId, name: session.name },
    } satisfies SecretaryActionResult
  }, [handleSelectMessageResult, panels, sessions, setActiveSession])

  const handleSecretaryDraftWorkflow = useCallback(async (action: DraftWorkflowAction) => {
    const result = await handleSecretaryStartChat(buildWorkflowDraftSessionPrompt(action))
    return {
      ...result,
      message: `워크플로우 초안을 새 세션으로 넘겼어요: ${action.name}`,
    } satisfies SecretaryActionResult
  }, [handleSecretaryStartChat])

  const handleSecretaryDraftSkill = useCallback(async (action: DraftSkillAction) => {
    const result = await handleSecretaryStartChat(buildSkillDraftSessionPrompt(action))
    return {
      ...result,
      message: `스킬 초안을 새 세션으로 넘겼어요: ${action.name}`,
    } satisfies SecretaryActionResult
  }, [handleSecretaryStartChat])

  const handleSecretaryCreateWorkflow = useCallback(async (action: CreateWorkflowAction) => {
    const fallbackCwd = normalizeSelectedFolder(activeSession?.cwd)
      ?? normalizeSelectedFolder(defaultProjectPath)
      ?? DEFAULT_PROJECT_PATH
    const workflowInput = createSecretaryWorkflowInput(action, fallbackCwd, defaultWorkflowModel)
    const workflowId = addWorkflow(workflowInput)
    setMessageJumpTarget(null)
    panels.openWorkflowPanel()
    return {
      ok: true,
      message: `워크플로우 생성 완료: ${workflowInput.name}`,
      payload: { workflowId, name: workflowInput.name, trigger: workflowInput.trigger },
    } satisfies SecretaryActionResult
  }, [activeSession?.cwd, addWorkflow, defaultProjectPath, defaultWorkflowModel, panels])

  const handleSecretaryCreateSkill = useCallback(async (action: CreateSkillAction) => {
    const skillName = await resolveAvailableSkillName(createSkillSlug(action.name))
    const result = await window.claude.writeClaudeFile({
      subdir: `skills/${skillName}`,
      name: 'SKILL.md',
      content: buildSkillContent(action, skillName),
    })
    if (!result.ok) {
      console.error('Failed to create Citto skill:', result.error)
      return {
        ok: false,
        error: result.error ?? '스킬을 생성하지 못했어요.',
      } satisfies SecretaryActionResult
    }
    panels.openSettingsPanel('skill')
    if (result.path) void window.claude.openFile(result.path).catch(() => undefined)
    return {
      ok: true,
      message: `스킬 생성 완료: /${skillName}${result.path ? `\n${result.path}` : ''}`,
      payload: { name: skillName, path: result.path },
    } satisfies SecretaryActionResult
  }, [panels])

  const handleSecretarySelectSearchResult = useCallback((result: SecretarySearchResult) => {
    if (result.sessionId) {
      const messageId = result.messageId ?? result.id.replace(/^session-message-/, '')
      if (messageId) {
        handleSelectMessageResult(result.sessionId, messageId)
        return
      }
      handleSelectSession(result.sessionId)
      return
    }

    if (result.route) {
      handleSecretaryNavigate(result.route)
    }
  }, [handleSecretaryNavigate, handleSelectMessageResult, handleSelectSession])

  useSecretaryAppBridge({
    activePanel: panels.activePanel,
    activeSession,
    recentSessions: secretaryRecentSessions,
    recentWorkflows: secretaryRecentWorkflows,
    sessionViewSession,
    isTaskRunning: hasUnsafeReloadState,
    themeId,
    uiFontSize,
    sidebarCollapsed,
    settingsTab: panels.settingsInitialTab,
    onNavigate: handleSecretaryNavigate,
    onStartChat: handleSecretaryStartChat,
    onOpenSession: handleSecretaryOpenSession,
    onDraftWorkflow: handleSecretaryDraftWorkflow,
    onCreateWorkflow: handleSecretaryCreateWorkflow,
    onDraftSkill: handleSecretaryDraftSkill,
    onCreateSkill: handleSecretaryCreateSkill,
  })

  useAppDesktopEffects({
    themeId,
    uiFontSize,
    uiZoomPercent,
    hasUnsafeReloadState,
    workflowSyncPayload,
    claudeBinaryPath,
    sanitizedEnvVars,
    defaultWorkflowModel,
    secretaryEnabled,
    shortcutConfig,
    shortcutPlatform,
    shortcutTarget: pendingSessionDraft
      ? {
          permissionMode: pendingSessionDraft.permissionMode,
          planMode: pendingSessionDraft.planMode,
        }
        : activeSession
        ? {
            permissionMode: activeSession.permissionMode,
            planMode: activeSession.planMode,
          }
        : null,
    defaultProjectPath,
    applyPermissionMode: handlePermissionModeChange,
    applyPlanMode: handlePlanModeChange,
    onToggleSidebar: handleToggleSidebar,
    openSettingsPanel: panels.openSettingsPanel,
    toggleCommandPalette: panels.toggleCommandPalette,
    openPendingSessionDraft,
    addSession,
    addUserMessage,
    startAssistantMessage,
    appendTextChunk,
    setClaudeSessionId,
    setError,
    setSessionPermissionMode: setPermissionMode,
    setSessionModel: setModel,
    commitStreamEnd,
    recordWorkflowExecutionStart,
    advanceWorkflowSchedule,
    appendWorkflowStepTextChunk,
    applyWorkflowStepUpdate,
    completeWorkflowExecution,
  })

  return {
    activePanel: panels.activePanel,
    activeSession,
    activeSessionConflictDetails,
    claudeStream,
    closeCommandPalette: panels.closeCommandPalette,
    closeSessionTeamPanel: panels.closeSessionTeamPanel,
    closeSecretaryPanel: panels.closeSecretaryPanel,
    closeSettingsPanel: panels.closeSettingsPanel,
    closeTeamPanel: panels.closeTeamPanel,
    closeWorkflowPanel: panels.closeWorkflowPanel,
    commandPaletteOpen: panels.commandPaletteOpen,
    defaultProjectPath,
    dismissInstallation: installation.dismissInstallation,
    handleAbort: claudeStream.handleAbort,
    handleBtwSend,
    handleInjectTeamSummary,
    handleNewSession: openPendingSessionDraft,
    handleRemoveSession: claudeStream.handleRemoveSession,
    handleQuestionResponse: claudeStream.handleQuestionResponse,
    handleSelectFolder: claudeStream.handleSelectFolder,
    handleSelectMessageResult,
    handleSecretarySelectSearchResult,
    handleSelectSession,
    handleSend,
    handleSidebarResizeStart,
    handleToggleSidebar,
    installationDismissed: installation.installationDismissed,
    installationStatus: installation.installationStatus,
    messageJumpTarget,
    openSessionTeamPanel,
    openSecretaryPanel: panels.openSecretaryPanel,
    openSettingsPanel: panels.openSettingsPanel,
    openWorkflowPanel: panels.openWorkflowPanel,
    refreshInstallationStatus: installation.refreshInstallationStatus,
    settingsInitialTab: panels.settingsInitialTab,
    settingsOpen: panels.settingsOpen,
    secretaryOpen: panels.secretaryOpen,
    secretaryRuntimeConfig,
    workflowOpen: panels.workflowOpen,
    sessionViewSession,
    sessionFileLockState,
    sessions,
    setActiveSessionPermissionMode: handlePermissionModeChange,
    setActiveSessionPlanMode: handlePlanModeChange,
    setActiveSessionModel: handleModelChange,
    dismissActiveSessionModelSwitchNotice: () => {
      if (!activeSession) return
      updateSession(activeSession.id, () => ({ modelSwitchNotice: null }))
    },
    setLinkedTeamIdForActiveSession: (teamId: string) => {
      if (!activeSession) return
      setLinkedTeamId(activeSession.id, teamId)
    },
    setSidebarMode,
    reorderSessions,
    shortcutConfig,
    shortcutPlatform,
    sidebarCollapsed,
    sidebarMode,
    sidebarWidth,
    startTeamDiscussion: teamStream.startDiscussion,
    continueTeamDiscussion: teamStream.continueDiscussion,
    abortTeamDiscussion: teamStream.abortDiscussion,
    updateSession,
  }
}
