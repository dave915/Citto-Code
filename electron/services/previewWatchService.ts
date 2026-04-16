import chokidar, { type FSWatcher } from 'chokidar'
import type { WebContents } from 'electron'

type PreviewWatchState = {
  id: string
  rootPath: string
  sender: WebContents
  watcher: FSWatcher | null
  debounceTimer: NodeJS.Timeout | null
  lastChangedPath: string | null
}

const IGNORED_PATH_PATTERN = /(^|[/\\])(node_modules|\.git)([/\\]|$)/

export function createPreviewWatchService() {
  const watchStates = new Map<string, PreviewWatchState>()
  const watchIdsBySenderId = new Map<number, Set<string>>()
  const observedSenderIds = new Set<number>()
  let nextWatchId = 1

  function cleanupWatch(id: string) {
    const state = watchStates.get(id)
    if (!state) return

    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    void state.watcher?.close()
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

  function observeSender(sender: WebContents) {
    if (observedSenderIds.has(sender.id)) return
    observedSenderIds.add(sender.id)
    sender.once('destroyed', () => {
      cleanupSender(sender.id)
    })
  }

  function emitChange(state: PreviewWatchState, changedPath: string) {
    state.lastChangedPath = changedPath
    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null
      if (state.sender.isDestroyed()) return
      state.sender.send('preview:file-changed', {
        watchId: state.id,
        rootPath: state.rootPath,
        filePath: state.lastChangedPath ?? state.rootPath,
      })
    }, 300)
  }

  function register(sender: WebContents, rootPath: string) {
    const normalizedRootPath = rootPath.trim()
    if (!normalizedRootPath) {
      return { watchId: null as string | null }
    }

    const watchId = `preview-watch-${nextWatchId++}`
    const state: PreviewWatchState = {
      id: watchId,
      rootPath: normalizedRootPath,
      sender,
      watcher: null,
      debounceTimer: null,
      lastChangedPath: null,
    }

    observeSender(sender)
    const senderWatchIds = watchIdsBySenderId.get(sender.id) ?? new Set<string>()
    senderWatchIds.add(watchId)
    watchIdsBySenderId.set(sender.id, senderWatchIds)
    watchStates.set(watchId, state)

    state.watcher = chokidar.watch(normalizedRootPath, {
      ignored: (candidatePath) => IGNORED_PATH_PATTERN.test(candidatePath),
      ignoreInitial: true,
      persistent: true,
    })

    state.watcher
      .on('add', (changedPath) => emitChange(state, changedPath))
      .on('change', (changedPath) => emitChange(state, changedPath))
      .on('unlink', (changedPath) => emitChange(state, changedPath))
      .on('addDir', (changedPath) => emitChange(state, changedPath))
      .on('unlinkDir', (changedPath) => emitChange(state, changedPath))

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
