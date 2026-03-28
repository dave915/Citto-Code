import { app, BrowserWindow } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'

let devLogForwardingInstalled = false

export function appendClaudeResponseLog(isDev: boolean, entry: Record<string, unknown>) {
  if (!isDev) return

  try {
    const logsDir = join(app.getPath('userData'), 'logs')
    mkdirSync(logsDir, { recursive: true })
    const logPath = join(logsDir, 'claude-response.jsonl')
    appendFileSync(
      logPath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n\n`,
      'utf-8',
    )
  } catch {
    // Logging failures should not affect Claude execution.
  }
}

function formatDevLogArg(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack ?? value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function sendToAllWindows(channel: string, payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

export function installDevLogForwarding(isDev: boolean) {
  if (!isDev || devLogForwardingInstalled) return
  devLogForwardingInstalled = true

  const originalLog = console.log.bind(console)
  const originalError = console.error.bind(console)

  console.log = (...args: unknown[]) => {
    originalLog(...args)
    sendToAllWindows('dev:main-log', {
      level: 'log',
      args: args.map(formatDevLogArg),
    })
  }

  console.error = (...args: unknown[]) => {
    originalError(...args)
    sendToAllWindows('dev:main-log', {
      level: 'error',
      args: args.map(formatDevLogArg),
    })
  }
}
