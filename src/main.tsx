import React from 'react'
import ReactDOM from 'react-dom/client'
import type { LegacyScheduledTask } from '../electron/preload'
import App from './App'
import './styles.css'
import { useSessionsStore, type Session } from './store/sessions'
import { useWorkflowStore, type Workflow, type WorkflowExecution, type WorkflowStep } from './store/workflowStore'

type PersistEnvelope = {
  state?: {
    sessions?: Session[]
    tasks?: LegacyScheduledTask[]
  }
}

const SESSIONS_STORAGE_KEY = 'citto-code-sessions'
const SCHEDULED_TASKS_STORAGE_KEY = 'citto-code-scheduled-tasks'
const PERSISTENCE_DEBOUNCE_MS = 400

function readPersistEnvelope(key: string): PersistEnvelope | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistEnvelope
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function readLegacySessions(): Session[] | undefined {
  const persisted = readPersistEnvelope(SESSIONS_STORAGE_KEY)
  return Array.isArray(persisted?.state?.sessions) ? persisted.state.sessions : undefined
}

function readLegacyScheduledTasks(): LegacyScheduledTask[] | undefined {
  const persisted = readPersistEnvelope(SCHEDULED_TASKS_STORAGE_KEY)
  return Array.isArray(persisted?.state?.tasks) ? persisted.state.tasks : undefined
}

function applyLoadedSessions(loadedSessions: Session[]) {
  const currentState = useSessionsStore.getState()
  const sessions = loadedSessions.length > 0 ? loadedSessions : currentState.sessions
  const activeSessionId = sessions.some((session) => session.id === currentState.activeSessionId)
    ? currentState.activeSessionId
    : sessions[0]?.id ?? null

  useSessionsStore.setState({
    sessions,
    activeSessionId,
  })
}

function applyLoadedWorkflows(workflows: Workflow[], executions: WorkflowExecution[]) {
  useWorkflowStore.getState().replaceAll(workflows, executions)
  useWorkflowStore.getState().recomputeAll()
}

function buildMigratedWorkflow(task: LegacyScheduledTask): Workflow {
  const now = Date.now()
  const step: Extract<WorkflowStep, { type: 'agent' }> = {
    type: 'agent',
    id: `step-${task.id}`,
    label: task.name,
    prompt: task.prompt,
    cwd: task.cwd,
    model: task.model,
    permissionMode: task.permissionMode,
    systemPrompt: '',
  }

  return {
    id: `wf-migrated-${task.id}`,
    name: task.name,
    steps: [step],
    trigger: task.frequency === 'manual'
      ? { type: 'manual' }
      : {
          type: 'schedule',
          frequency: task.frequency,
          hour: task.hour,
          minute: task.minute,
          dayOfWeek: task.dayOfWeek,
        },
    active: task.active,
    nextRunAt: null,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
    nodePositions: {
      [step.id]: { x: 80, y: 120 },
    },
  }
}

async function migrateScheduledTasksToWorkflows(tasks: LegacyScheduledTask[]) {
  if (tasks.length === 0) return

  const workflowStore = useWorkflowStore.getState()
  const existingIds = new Set(workflowStore.workflows.map((workflow) => workflow.id))
  const incomingWorkflows = tasks
    .map(buildMigratedWorkflow)
    .filter((workflow) => !existingIds.has(workflow.id))

  if (incomingWorkflows.length > 0) {
    workflowStore.addWorkflows(incomingWorkflows)
  }

  const nextState = useWorkflowStore.getState()
  const saveResult = await window.claude.saveWorkflowsSnapshot({
    workflows: nextState.workflows,
    executions: nextState.executions,
  })

  if (!saveResult.ok) {
    throw new Error(saveResult.error ?? 'Failed to persist migrated workflows.')
  }

  await window.claude.syncWorkflows(nextState.workflows)
  const migrateResult = await window.claude.markScheduledTasksMigrated({ ids: tasks.map((task) => task.id) })
  if (!migrateResult.ok) {
    throw new Error(migrateResult.error ?? 'Failed to mark scheduled tasks as migrated.')
  }
}

function installPersistenceSync() {
  let pendingSessions = useSessionsStore.getState().sessions
  let pendingWorkflows = useWorkflowStore.getState().workflows
  let pendingWorkflowExecutions = useWorkflowStore.getState().executions
  let sessionsTimer: number | null = null
  let workflowsTimer: number | null = null

  const flushSessions = () => {
    sessionsTimer = null
    void window.claude.saveSessionsSnapshot({ sessions: pendingSessions }).catch(() => undefined)
  }

  const flushWorkflows = () => {
    workflowsTimer = null
    void window.claude.saveWorkflowsSnapshot({
      workflows: pendingWorkflows,
      executions: pendingWorkflowExecutions,
    }).catch(() => undefined)
  }

  const scheduleSessionsFlush = (sessions: Session[]) => {
    pendingSessions = sessions
    if (sessionsTimer !== null) {
      window.clearTimeout(sessionsTimer)
    }
    sessionsTimer = window.setTimeout(flushSessions, PERSISTENCE_DEBOUNCE_MS)
  }

  const scheduleWorkflowsFlush = (workflows: Workflow[], executions: WorkflowExecution[]) => {
    pendingWorkflows = workflows
    pendingWorkflowExecutions = executions
    if (workflowsTimer !== null) {
      window.clearTimeout(workflowsTimer)
    }
    workflowsTimer = window.setTimeout(flushWorkflows, PERSISTENCE_DEBOUNCE_MS)
  }

  useSessionsStore.subscribe((state, previousState) => {
    if (state.sessions !== previousState.sessions) {
      scheduleSessionsFlush(state.sessions)
    }
  })

  useWorkflowStore.subscribe((state, previousState) => {
    if (state.workflows !== previousState.workflows || state.executions !== previousState.executions) {
      scheduleWorkflowsFlush(state.workflows, state.executions)
    }
  })

  scheduleSessionsFlush(pendingSessions)
  scheduleWorkflowsFlush(pendingWorkflows, pendingWorkflowExecutions)

  window.addEventListener('beforeunload', () => {
    if (sessionsTimer !== null) {
      window.clearTimeout(sessionsTimer)
      flushSessions()
    }
    if (workflowsTimer !== null) {
      window.clearTimeout(workflowsTimer)
      flushWorkflows()
    }
  })
}

async function bootstrap() {
  try {
    const legacySessions = readLegacySessions()
    const legacyScheduledTasks = readLegacyScheduledTasks()

    await useSessionsStore.persist.rehydrate()

    const snapshot = await window.claude.initPersistence({
      legacySessions,
      legacyScheduledTasks,
    })

    applyLoadedSessions(snapshot.sessions)
    applyLoadedWorkflows(snapshot.workflows, snapshot.workflowExecutions)
    await migrateScheduledTasksToWorkflows(snapshot.legacyScheduledTasks)
  } catch (error) {
    console.error('[storage] failed to initialize sqlite persistence', error)
  }

  installPersistenceSync()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void bootstrap()
