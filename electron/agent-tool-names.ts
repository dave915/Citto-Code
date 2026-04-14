const AGENT_TOOL_NAMES = new Set([
  'agent',
  'task',
  'call_omo_agent',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAgentToolName(name: string | null | undefined): boolean {
  if (typeof name !== 'string') return false
  return AGENT_TOOL_NAMES.has(name.trim().toLowerCase())
}

export function normalizeAgentToolName(name: string): string {
  return isAgentToolName(name) ? 'Agent' : name
}

export function sanitizeAgentToolInput(input: unknown): unknown {
  if (!isRecord(input)) return input

  const {
    team_name: _ignoredTeamName,
    isolation: _ignoredIsolation,
    isolated: _ignoredIsolated,
    execution_mode: _ignoredExecutionMode,
    ...rest
  } = input

  return rest
}
