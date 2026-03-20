import { existsSync, readdirSync, statSync, watch, type FSWatcher } from 'fs'
import { dirname, join } from 'path'
import type { WebContents } from 'electron'
import { extractTextBlocks, isRecord, parseJsonlFile } from './settingsData/shared'

type WatchSubagentTextParams = {
  tabId: string
  toolUseId: string
  cwd: string
  parentSessionId: string | null
  subagentSessionId?: string | null
  agentId?: string | null
  transcriptPath?: string | null
}

type SubagentWatchState = {
  id: string
  sender: WebContents
  request: WatchSubagentTextParams
  watcher: FSWatcher | null
  debounceTimer: NodeJS.Timeout | null
  transcriptPath: string | null
  watchPath: string | null
  lastText: string
  finished: boolean
}

function normalizeAgentFileName(agentId: string): string {
  const trimmed = agentId.trim()
  if (!trimmed) return ''
  if (trimmed.endsWith('.jsonl')) return trimmed
  return `${trimmed.startsWith('agent-') ? trimmed : `agent-${trimmed}`}.jsonl`
}

function safeListDirectories(rootPath: string): string[] {
  try {
    return readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(rootPath, entry.name))
  } catch {
    return []
  }
}

function safeListFiles(rootPath: string): string[] {
  try {
    return readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(rootPath, entry.name))
  } catch {
    return []
  }
}

function buildTranscriptCandidates(homePath: string, request: WatchSubagentTextParams): string[] {
  const candidates: string[] = []
  const explicitTranscriptPath = request.transcriptPath?.trim()
  if (explicitTranscriptPath) candidates.push(explicitTranscriptPath)

  const subagentSessionId = request.subagentSessionId?.trim()
  if (subagentSessionId) {
    candidates.push(join(homePath, '.claude', 'transcripts', `${subagentSessionId}.jsonl`))
  }

  const parentSessionId = request.parentSessionId?.trim()
  const agentId = request.agentId?.trim()
  if (parentSessionId && agentId) {
    const agentFileName = normalizeAgentFileName(agentId)
    const projectsDir = join(homePath, '.claude', 'projects')
    for (const projectDirPath of safeListDirectories(projectsDir)) {
      candidates.push(join(projectDirPath, parentSessionId, 'subagents', agentFileName))
    }
  }

  return candidates.filter(Boolean)
}

function resolveTranscriptPath(homePath: string, request: WatchSubagentTextParams): string | null {
  const candidates = buildTranscriptCandidates(homePath, request)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  const parentSessionId = request.parentSessionId?.trim()
  if (!parentSessionId) return candidates[0] ?? null

  const projectsDir = join(homePath, '.claude', 'projects')
  for (const projectDirPath of safeListDirectories(projectsDir)) {
    const subagentsDirPath = join(projectDirPath, parentSessionId, 'subagents')
    const files = safeListFiles(subagentsDirPath)
      .filter((filePath) => filePath.endsWith('.jsonl'))
      .sort((left, right) => {
        try {
          return statSync(right).mtimeMs - statSync(left).mtimeMs
        } catch {
          return 0
        }
      })
    if (files.length === 1) return files[0]
  }

  return candidates[0] ?? null
}

function extractAssistantText(record: Record<string, unknown>): string {
  const message = isRecord(record.message) ? record.message : null
  if (!message) return ''
  if (message.role !== 'assistant') return ''
  return extractTextBlocks(message.content)
}

function isTranscriptFinished(record: Record<string, unknown>): boolean {
  const message = isRecord(record.message) ? record.message : null
  if (record.type === 'result') return true
  if (!message || message.role !== 'assistant') return false
  return typeof message.stop_reason === 'string' && message.stop_reason === 'end_turn'
}

function isTranscriptError(record: Record<string, unknown>): boolean {
  if (record.type === 'result' && record.is_error === true) return true
  return false
}

export function createSubagentWatchService({ getHomePath }: { getHomePath: () => string }) {
  const watchStates = new Map<string, SubagentWatchState>()
  const watchIdsBySenderId = new Map<number, Set<string>>()
  const observedSenderIds = new Set<number>()
  let nextWatchId = 1

  function cleanupWatch(id: string) {
    const state = watchStates.get(id)
    if (!state) return

    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.watcher?.close()
    watchStates.delete(id)

    const ids = watchIdsBySenderId.get(state.sender.id)
    if (!ids) return
    ids.delete(id)
    if (ids.size === 0) {
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

  function emit(state: SubagentWatchState, payload: { chunk?: string; done?: boolean; error?: string }) {
    if (state.sender.isDestroyed()) return
    state.sender.send('subagent:text-chunk', {
      tabId: state.request.tabId,
      toolUseId: state.request.toolUseId,
      transcriptPath: state.transcriptPath,
      chunk: payload.chunk ?? '',
      done: payload.done,
      error: payload.error,
    })
  }

  function syncState(state: SubagentWatchState) {
    const nextTranscriptPath = resolveTranscriptPath(getHomePath(), state.request)
    if (nextTranscriptPath !== state.transcriptPath) {
      state.transcriptPath = nextTranscriptPath
      emit(state, {})
      startWatcher(state)
    }

    if (!state.transcriptPath || !existsSync(state.transcriptPath)) return

    const records = parseJsonlFile(state.transcriptPath)
    const nextText = records
      .map(extractAssistantText)
      .filter(Boolean)
      .join('\n\n')
      .trim()
    const nextDone = records.some(isTranscriptFinished)
    const nextError = records.some(isTranscriptError)

    let chunk = ''
    if (nextText && nextText.startsWith(state.lastText)) {
      chunk = nextText.slice(state.lastText.length)
    } else if (nextText !== state.lastText) {
      chunk = nextText
    }

    if (chunk || nextDone || nextError) {
      emit(state, {
        chunk,
        done: nextDone,
        error: nextError ? 'Subagent transcript reported an error.' : undefined,
      })
    }

    state.lastText = nextText

    if (nextDone || nextError) {
      state.finished = true
      cleanupWatch(state.id)
    }
  }

  function scheduleSync(state: SubagentWatchState) {
    if (state.finished) return
    if (state.debounceTimer) clearTimeout(state.debounceTimer)
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null
      syncState(state)
    }, 80)
  }

  function resolveWatchPath(state: SubagentWatchState): string | null {
    const transcriptPath = resolveTranscriptPath(getHomePath(), state.request)
    if (transcriptPath) {
      return existsSync(transcriptPath) ? dirname(transcriptPath) : dirname(transcriptPath)
    }

    const subagentSessionId = state.request.subagentSessionId?.trim()
    if (subagentSessionId) {
      return join(getHomePath(), '.claude', 'transcripts')
    }

    return join(getHomePath(), '.claude', 'projects')
  }

  function startWatcher(state: SubagentWatchState) {
    const nextWatchPath = resolveWatchPath(state)
    if (!nextWatchPath || !existsSync(nextWatchPath)) return
    if (state.watchPath === nextWatchPath && state.watcher) return

    state.watcher?.close()
    state.watchPath = nextWatchPath

    const projectsRootPath = join(getHomePath(), '.claude', 'projects')

    try {
      if (nextWatchPath === projectsRootPath) {
        state.watcher = watch(nextWatchPath, { recursive: true }, () => {
          scheduleSync(state)
        })
      } else {
        state.watcher = watch(nextWatchPath, () => {
          scheduleSync(state)
        })
      }
    } catch {
      state.watcher = watch(nextWatchPath, () => {
        scheduleSync(state)
      })
    }
  }

  function register(sender: WebContents, request: WatchSubagentTextParams) {
    const watchId = `subagent-${nextWatchId++}`
    const state: SubagentWatchState = {
      id: watchId,
      sender,
      request,
      watcher: null,
      debounceTimer: null,
      transcriptPath: resolveTranscriptPath(getHomePath(), request),
      watchPath: null,
      lastText: '',
      finished: false,
    }

    observeSender(sender)
    const senderWatchIds = watchIdsBySenderId.get(sender.id) ?? new Set<string>()
    senderWatchIds.add(watchId)
    watchIdsBySenderId.set(sender.id, senderWatchIds)
    watchStates.set(watchId, state)

    startWatcher(state)
    syncState(state)

    return {
      watchId,
      transcriptPath: state.transcriptPath,
    }
  }

  function unregister(watchId: string) {
    cleanupWatch(watchId)
  }

  function dispose() {
    for (const watchId of [...watchStates.keys()]) {
      cleanupWatch(watchId)
    }
  }

  return {
    register,
    unregister,
    dispose,
  }
}
