import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { useSessionsStore, type Session } from './store/sessions'
import { useScheduledTasksStore, type ScheduledTask } from './store/scheduledTasks'
import { useWorkflowStore, type Workflow, type WorkflowExecution } from './store/workflowStore'

type PersistEnvelope = {
  state?: {
    sessions?: Session[]
    tasks?: ScheduledTask[]
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
  return Array.isArray(persisted?.state?.sessions) ? persisted?.state?.sessions : undefined
}

function readLegacyScheduledTasks(): ScheduledTask[] | undefined {
  const persisted = readPersistEnvelope(SCHEDULED_TASKS_STORAGE_KEY)
  return Array.isArray(persisted?.state?.tasks) ? persisted?.state?.tasks : undefined
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

function applyLoadedScheduledTasks(tasks: ScheduledTask[]) {
  useScheduledTasksStore.setState({ tasks })
  useScheduledTasksStore.getState().recomputeAll()
}

function applyLoadedWorkflows(workflows: Workflow[], executions: WorkflowExecution[]) {
  useWorkflowStore.getState().replaceAll(workflows, executions)
  useWorkflowStore.getState().recomputeAll()
}

function installPersistenceSync() {
  let pendingSessions = useSessionsStore.getState().sessions
  let pendingScheduledTasks = useScheduledTasksStore.getState().tasks
  let pendingWorkflows = useWorkflowStore.getState().workflows
  let pendingWorkflowExecutions = useWorkflowStore.getState().executions
  let sessionsTimer: number | null = null
  let scheduledTasksTimer: number | null = null
  let workflowsTimer: number | null = null

  const flushSessions = () => {
    sessionsTimer = null
    void window.claude.saveSessionsSnapshot({ sessions: pendingSessions }).catch(() => undefined)
  }

  const flushScheduledTasks = () => {
    scheduledTasksTimer = null
    void window.claude.saveScheduledTasksSnapshot({ tasks: pendingScheduledTasks }).catch(() => undefined)
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

  const scheduleScheduledTasksFlush = (tasks: ScheduledTask[]) => {
    pendingScheduledTasks = tasks
    if (scheduledTasksTimer !== null) {
      window.clearTimeout(scheduledTasksTimer)
    }
    scheduledTasksTimer = window.setTimeout(flushScheduledTasks, PERSISTENCE_DEBOUNCE_MS)
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

  useScheduledTasksStore.subscribe((state, previousState) => {
    if (state.tasks !== previousState.tasks) {
      scheduleScheduledTasksFlush(state.tasks)
    }
  })

  useWorkflowStore.subscribe((state, previousState) => {
    if (state.workflows !== previousState.workflows || state.executions !== previousState.executions) {
      scheduleWorkflowsFlush(state.workflows, state.executions)
    }
  })

  scheduleSessionsFlush(pendingSessions)
  scheduleScheduledTasksFlush(pendingScheduledTasks)
  scheduleWorkflowsFlush(pendingWorkflows, pendingWorkflowExecutions)

  window.addEventListener('beforeunload', () => {
    if (sessionsTimer !== null) {
      window.clearTimeout(sessionsTimer)
      flushSessions()
    }
    if (scheduledTasksTimer !== null) {
      window.clearTimeout(scheduledTasksTimer)
      flushScheduledTasks()
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
    applyLoadedScheduledTasks(snapshot.scheduledTasks)
    applyLoadedWorkflows(snapshot.workflows, snapshot.workflowExecutions)
  } catch (error) {
    console.error('[storage] failed to initialize sqlite persistence', error)
  }

  installPersistenceSync()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
