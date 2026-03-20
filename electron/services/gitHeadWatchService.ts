import { existsSync, readFileSync, statSync, watch, type FSWatcher } from 'fs'
import { dirname, join, resolve } from 'path'
import type { WebContents } from 'electron'

type GitHeadWatchState = {
  id: string
  cwd: string
  headPath: string
  sender: WebContents
  watcher: FSWatcher | null
  debounceTimer: NodeJS.Timeout | null
}

function resolveGitDirPath(cwd: string): string | null {
  const gitEntryPath = join(cwd, '.git')
  if (!existsSync(gitEntryPath)) return null

  try {
    if (statSync(gitEntryPath).isDirectory()) {
      return gitEntryPath
    }

    const content = readFileSync(gitEntryPath, 'utf-8')
    const match = content.match(/^gitdir:\s*(.+)\s*$/im)
    if (!match?.[1]?.trim()) return null
    return resolve(dirname(gitEntryPath), match[1].trim())
  } catch {
    return null
  }
}

function resolveGitHeadPath(cwd: string): string | null {
  const gitDirPath = resolveGitDirPath(cwd)
  if (!gitDirPath) return null
  const headPath = join(gitDirPath, 'HEAD')
  return existsSync(headPath) ? headPath : null
}

export function createGitHeadWatchService() {
  const watchStates = new Map<string, GitHeadWatchState>()
  const watchIdsBySenderId = new Map<number, Set<string>>()
  const observedSenderIds = new Set<number>()
  let nextWatchId = 1

  function cleanupWatch(id: string) {
    const state = watchStates.get(id)
    if (!state) return

    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.watcher?.close()
    watchStates.delete(id)

    const senderIds = watchIdsBySenderId.get(state.sender.id)
    if (!senderIds) return
    senderIds.delete(id)
    if (senderIds.size === 0) {
      watchIdsBySenderId.delete(state.sender.id)
    }
  }

  function cleanupSender(senderId: number) {
    const ids = [...(watchIdsBySenderId.get(senderId) ?? [])]
    for (const id of ids) cleanupWatch(id)
    observedSenderIds.delete(senderId)
  }

  function scheduleEvent(state: GitHeadWatchState) {
    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null
      if (!state.sender.isDestroyed()) {
        state.sender.send('git:head-changed', {
          cwd: state.cwd,
          headPath: state.headPath,
        })
      }
    }, 150)
  }

  function startWatcher(state: GitHeadWatchState) {
    state.watcher?.close()

    try {
      state.watcher = watch(state.headPath, () => {
        scheduleEvent(state)
      })
    } catch {
      state.watcher = watch(dirname(state.headPath), (_eventType, filename) => {
        if (filename && filename !== 'HEAD') return
        scheduleEvent(state)
      })
    }
  }

  function observeSender(sender: WebContents) {
    if (observedSenderIds.has(sender.id)) return
    observedSenderIds.add(sender.id)
    sender.once('destroyed', () => {
      cleanupSender(sender.id)
    })
  }

  function register(sender: WebContents, cwd: string) {
    const normalizedCwd = cwd.trim()
    const headPath = resolveGitHeadPath(normalizedCwd)
    if (!headPath) {
      return { watchId: null as string | null }
    }

    const watchId = `git-head-${nextWatchId++}`
    const state: GitHeadWatchState = {
      id: watchId,
      cwd: normalizedCwd,
      headPath,
      sender,
      watcher: null,
      debounceTimer: null,
    }

    observeSender(sender)
    const senderWatchIds = watchIdsBySenderId.get(sender.id) ?? new Set<string>()
    senderWatchIds.add(watchId)
    watchIdsBySenderId.set(sender.id, senderWatchIds)
    watchStates.set(watchId, state)
    startWatcher(state)

    return { watchId }
  }

  function unregister(watchId: string) {
    cleanupWatch(watchId)
  }

  function dispose() {
    for (const id of [...watchStates.keys()]) {
      cleanupWatch(id)
    }
  }

  return {
    register,
    unregister,
    dispose,
  }
}
