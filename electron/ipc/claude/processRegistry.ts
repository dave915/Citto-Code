import type { ChildProcess } from 'child_process'

const activeProcesses = new Map<string, ChildProcess>()

export function getActiveProcess(sessionId: string) {
  return activeProcesses.get(sessionId)
}

export function hasActiveProcess(sessionId: string) {
  return activeProcesses.has(sessionId)
}

export function trackActiveProcess(key: string, proc: ChildProcess) {
  activeProcesses.set(key, proc)
}

export function bindResolvedSessionProcess(tempKey: string, sessionId: string, proc: ChildProcess) {
  activeProcesses.set(sessionId, proc)
  if (activeProcesses.get(tempKey) === proc) {
    activeProcesses.delete(tempKey)
  }
}

export function removeActiveProcessReferences(proc: ChildProcess) {
  for (const [key, value] of activeProcesses.entries()) {
    if (value === proc) {
      activeProcesses.delete(key)
    }
  }
}

export function stopTrackedProcess(sessionId: string) {
  const proc = activeProcesses.get(sessionId)
  if (!proc) return

  try {
    proc.kill()
  } catch {
    // Ignore process cleanup failures while replacing the current request.
  }

  removeActiveProcessReferences(proc)
}

export function killAllActiveProcesses() {
  const uniqueProcesses = new Set(activeProcesses.values())
  for (const proc of uniqueProcesses) {
    try {
      proc.kill()
    } catch {
      // Ignore process cleanup failures during shutdown.
    }
  }
  activeProcesses.clear()
}
