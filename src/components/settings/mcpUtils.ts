import {
  isRecord,
  type McpForm,
  type McpServer,
} from './shared'

export function parseHeadersStr(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const index = line.indexOf(':')
    if (index < 1) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (key) result[key] = value
  }
  return result
}

export function parseEnvStr(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const index = line.indexOf('=')
    if (index < 1) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (key) result[key] = value
  }
  return result
}

export function parseArgsStr(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .flatMap((line) => line.trim().split(/\s+/))
    .filter(Boolean)
}

export function serverToForm(server: McpServer): McpForm {
  const serverType = server.type === 'stdio' ? 'stdio' : 'http'
  const headers = server.headers
    ? Object.entries(server.headers).map(([key, value]) => `${key}: ${value}`).join('\n')
    : ''
  const env = server.env
    ? Object.entries(server.env).map(([key, value]) => `${key}=${value}`).join('\n')
    : ''

  return {
    name: server.name,
    serverType,
    command: server.command ?? '',
    args: server.args?.join('\n') ?? '',
    url: server.url ?? '',
    headers,
    env,
  }
}

export function buildEntry(form: McpForm): Record<string, unknown> {
  const entry: Record<string, unknown> = { type: form.serverType }
  if (form.serverType === 'stdio') {
    entry.command = form.command.trim()
    if (form.args.trim()) entry.args = parseArgsStr(form.args)
    if (form.env.trim()) entry.env = parseEnvStr(form.env)
  } else {
    entry.url = form.url.trim()
    if (form.headers.trim()) entry.headers = parseHeadersStr(form.headers)
  }
  return entry
}

export function mapMcpServers(raw: Record<string, unknown>): McpServer[] {
  return Object.entries(raw)
    .map(([name, config]) => ({
      name,
      ...(isRecord(config) ? config : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
