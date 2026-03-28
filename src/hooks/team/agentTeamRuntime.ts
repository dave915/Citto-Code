export type AgentStreamContext = {
  teamId: string
  agentId: string
  msgId: string
  requestId: string
}

export type TeamRuntime = {
  execQueue: Array<() => void>
  isQueueRunning: boolean
  pendingResolve: (() => void) | null
  parallelPendingCount: number
  parallelDoneCallback: (() => void) | null
}

export function createAgentStreamContext(
  teamId: string,
  agentId: string,
  msgId: string,
  requestId: string,
): AgentStreamContext {
  return { teamId, agentId, msgId, requestId }
}

export function getTeamRuntime(teamRuntimes: Map<string, TeamRuntime>, teamId: string): TeamRuntime {
  const existing = teamRuntimes.get(teamId)
  if (existing) return existing

  const created: TeamRuntime = {
    execQueue: [],
    isQueueRunning: false,
    pendingResolve: null,
    parallelPendingCount: 0,
    parallelDoneCallback: null,
  }
  teamRuntimes.set(teamId, created)
  return created
}

export function resetTeamRuntimeState(teamRuntimes: Map<string, TeamRuntime>, teamId: string) {
  const runtime = getTeamRuntime(teamRuntimes, teamId)
  runtime.execQueue = []
  runtime.isQueueRunning = false
  runtime.pendingResolve = null
  runtime.parallelPendingCount = 0
  runtime.parallelDoneCallback = null
}

function deleteIfMatches(
  contexts: Map<string, AgentStreamContext>,
  key: string | null | undefined,
  context: AgentStreamContext,
) {
  if (!key) return
  const current = contexts.get(key)
  if (!current) return
  if (
    current.teamId === context.teamId
    && current.agentId === context.agentId
    && current.msgId === context.msgId
    && current.requestId === context.requestId
  ) {
    contexts.delete(key)
  }
}

export function clearContextMappings(
  requestContexts: Map<string, AgentStreamContext>,
  sessionContexts: Map<string, AgentStreamContext>,
  context: AgentStreamContext,
  sessionId?: string | null,
  requestId?: string,
) {
  deleteIfMatches(requestContexts, requestId ?? context.requestId, context)
  deleteIfMatches(sessionContexts, sessionId, context)
}

export function resolveAgentContext(
  requestContexts: Map<string, AgentStreamContext>,
  sessionContexts: Map<string, AgentStreamContext>,
  sessionId?: string | null,
  requestId?: string,
): AgentStreamContext | null {
  if (sessionId) {
    const mapped = sessionContexts.get(sessionId)
    if (mapped) return mapped
  }
  if (requestId) {
    return requestContexts.get(requestId) ?? null
  }
  return null
}

export function settleParallelTeam(teamRuntimes: Map<string, TeamRuntime>, teamId: string) {
  const runtime = getTeamRuntime(teamRuntimes, teamId)
  runtime.parallelPendingCount -= 1
  if (runtime.parallelPendingCount <= 0) {
    runtime.parallelPendingCount = 0
    const callback = runtime.parallelDoneCallback
    runtime.parallelDoneCallback = null
    callback?.()
  }
}

export function drainExecQueue(teamRuntimes: Map<string, TeamRuntime>, teamId: string) {
  const runtime = getTeamRuntime(teamRuntimes, teamId)
  const resolve = runtime.pendingResolve
  runtime.pendingResolve = null
  resolve?.()

  const next = runtime.execQueue.shift()
  if (next) {
    next()
  } else {
    runtime.isQueueRunning = false
  }
}

export function enqueueExec(teamRuntimes: Map<string, TeamRuntime>, teamId: string, fn: () => void) {
  const runtime = getTeamRuntime(teamRuntimes, teamId)
  runtime.execQueue.push(fn)
  if (!runtime.isQueueRunning) {
    runtime.isQueueRunning = true
    const next = runtime.execQueue.shift()
    next?.()
  }
}

export function clearQueuedRuntime(teamRuntimes: Map<string, TeamRuntime>, teamId: string) {
  const runtime = getTeamRuntime(teamRuntimes, teamId)
  runtime.execQueue = []
  runtime.isQueueRunning = false
  const resolve = runtime.pendingResolve
  runtime.pendingResolve = null
  resolve?.()
}

export function resetParallelRuntime(teamRuntimes: Map<string, TeamRuntime>, teamId: string) {
  const runtime = getTeamRuntime(teamRuntimes, teamId)
  runtime.parallelPendingCount = 0
  runtime.parallelDoneCallback = null
}
