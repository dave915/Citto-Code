import { access, readdir, stat } from 'fs/promises'
import { join } from 'path'
import type {
  CliHistoryEntry,
  ImportedCliMessage,
  ImportedCliSession,
  ImportedCliToolCall,
} from '../../preload'
import {
  extractTextBlocks,
  getToolFileSnapshotBeforeAsync,
  getRecordTimestamp,
  parseJsonlFileAsync,
} from './shared'

type CreateCliHistoryServiceOptions = {
  defaultProjectPath: string
  getHomePath: () => string
  getProjectNameFromPath: (path: string) => string
}

export function createCliHistoryService({
  defaultProjectPath,
  getHomePath,
  getProjectNameFromPath,
}: CreateCliHistoryServiceOptions) {
  async function pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath)
      return true
    } catch {
      return false
    }
  }

  async function buildCliHistoryEntry(filePath: string, source: 'project' | 'transcript'): Promise<CliHistoryEntry | null> {
    const records = await parseJsonlFileAsync(filePath)
    if (records.length === 0) return null

    let cwd = ''
    let claudeSessionId: string | null = null
    let preview = ''
    let updatedAt = 0

    for (const record of records) {
      if (!cwd && typeof record.cwd === 'string') {
        cwd = record.cwd
      }
      if (!claudeSessionId && typeof record.sessionId === 'string') {
        claudeSessionId = record.sessionId
      }
      if (!preview && record.type === 'user') {
        const message = record.message as { content?: unknown } | undefined
        preview = extractTextBlocks(message?.content ?? record.content)
      }
      updatedAt = Math.max(updatedAt, getRecordTimestamp(record))
    }

    if (!updatedAt) {
      try {
        updatedAt = (await stat(filePath)).mtimeMs
      } catch {
        updatedAt = Date.now()
      }
    }

    const title = cwd ? getProjectNameFromPath(cwd) : (claudeSessionId ?? filePath.split('/').pop() ?? '세션')
    return {
      id: `${source}:${filePath}`,
      filePath,
      claudeSessionId,
      cwd,
      title,
      preview,
      updatedAt,
      source,
    }
  }

  async function listCliHistoryFiles(): Promise<Array<{ filePath: string; source: 'project' | 'transcript' }>> {
    const files: Array<{ filePath: string; source: 'project' | 'transcript' }> = []
    const home = getHomePath()
    const projectsDir = join(home, '.claude', 'projects')
    const transcriptsDir = join(home, '.claude', 'transcripts')

    try {
      if (await pathExists(projectsDir)) {
        for (const projectDir of await readdir(projectsDir, { withFileTypes: true })) {
          if (!projectDir.isDirectory()) continue
          const fullProjectDir = join(projectsDir, projectDir.name)
          for (const entry of await readdir(fullProjectDir, { withFileTypes: true })) {
            if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
            files.push({
              filePath: join(fullProjectDir, entry.name),
              source: 'project',
            })
          }
        }
      }
    } catch {
      // Ignore history discovery failures.
    }

    try {
      if (await pathExists(transcriptsDir)) {
        for (const entry of await readdir(transcriptsDir, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
          files.push({
            filePath: join(transcriptsDir, entry.name),
            source: 'transcript',
          })
        }
      }
    } catch {
      // Ignore transcript discovery failures.
    }

    return files
  }

  async function listCliSessions(query = ''): Promise<CliHistoryEntry[]> {
    const entries = (await Promise.all(
      (await listCliHistoryFiles()).map(({ filePath, source }) => buildCliHistoryEntry(filePath, source)),
    ))
      .filter((entry): entry is CliHistoryEntry => entry !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)

    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return entries.slice(0, 200)

    return entries
      .filter((entry) => {
        const haystack = `${entry.title}\n${entry.cwd}\n${entry.preview}\n${entry.claudeSessionId ?? ''}`.toLowerCase()
        return haystack.includes(trimmed)
      })
      .slice(0, 200)
  }

  async function loadCliSession(filePath: string): Promise<ImportedCliSession | null> {
    const records = await parseJsonlFileAsync(filePath)
    if (records.length === 0) return null

    let cwd = ''
    let sessionId: string | null = null
    let sidechainAgentId: string | null = null
    let isSidechain = false
    let model: string | null = null
    let lastCost: number | undefined
    const messages: ImportedCliMessage[] = []
    const toolCallsById = new Map<string, ImportedCliToolCall>()

    for (const record of records) {
      if (!cwd && typeof record.cwd === 'string') {
        cwd = record.cwd
      }
      if (!sessionId && typeof record.sessionId === 'string') {
        sessionId = record.sessionId
      }
      if (record.isSidechain === true) {
        isSidechain = true
        if (!sidechainAgentId && typeof record.agentId === 'string' && record.agentId.trim()) {
          sidechainAgentId = record.agentId.trim()
        }
      }

      if (record.type === 'assistant') {
        const message = record.message as { model?: unknown; content?: unknown } | undefined
        if (typeof message?.model === 'string') {
          model = message.model
        }

        const content = Array.isArray(message?.content) ? message.content : []
        const toolCalls: ImportedCliToolCall[] = []
        const textParts: string[] = []

        for (const block of content) {
          if (!block || typeof block !== 'object') continue
          const blockRecord = block as Record<string, unknown>
          if (blockRecord.type === 'text' && typeof blockRecord.text === 'string') {
            textParts.push(blockRecord.text)
            continue
          }

          if (blockRecord.type === 'tool_use') {
            const toolCall: ImportedCliToolCall = {
              toolUseId: String(blockRecord.id ?? ''),
              toolName: String(blockRecord.name ?? ''),
              toolInput: blockRecord.input,
              fileSnapshotBefore: await getToolFileSnapshotBeforeAsync(String(blockRecord.name ?? ''), blockRecord.input),
              status: 'running',
            }
            toolCalls.push(toolCall)
            if (toolCall.toolUseId) {
              toolCallsById.set(toolCall.toolUseId, toolCall)
            }
          }
        }

        if (textParts.length > 0 || toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            text: textParts.join('\n').trim(),
            toolCalls,
            createdAt: getRecordTimestamp(record),
          })
        }
        continue
      }

      if (record.type === 'user') {
        const message = record.message as { content?: unknown } | undefined
        const content = message?.content ?? record.content

        if (Array.isArray(content)) {
          for (const block of content) {
            if (!block || typeof block !== 'object') continue
            const blockRecord = block as Record<string, unknown>
            if (blockRecord.type !== 'tool_result') continue
            const toolUseId = String(blockRecord.tool_use_id ?? '')
            const toolCall = toolCallsById.get(toolUseId)
            if (!toolCall) continue
            toolCall.result = blockRecord.content
            toolCall.isError = Boolean(blockRecord.is_error)
            toolCall.status = toolCall.isError ? 'error' : 'done'
          }
        }

        const text = extractTextBlocks(content)
        if (text) {
          messages.push({
            role: 'user',
            text,
            toolCalls: [],
            createdAt: getRecordTimestamp(record),
          })
        }
        continue
      }

      if (record.type === 'result' && typeof record.total_cost_usd === 'number') {
        lastCost = record.total_cost_usd
        continue
      }

      if (record.type === 'tool_result') {
        const toolUseId = String(record.tool_use_id ?? '')
        const toolCall = toolCallsById.get(toolUseId)
        if (!toolCall) continue

        const hasToolOutput = typeof record.tool_output !== 'undefined' || typeof record.toolOutput !== 'undefined'
        toolCall.result = hasToolOutput
          ? {
              content: record.content,
              toolOutput: typeof record.tool_output !== 'undefined' ? record.tool_output : record.toolOutput,
            }
          : record.content
        toolCall.isError = Boolean(record.is_error)
        toolCall.status = toolCall.isError ? 'error' : 'done'
      }
    }

    for (const message of messages) {
      for (const toolCall of message.toolCalls) {
        if (toolCall.status === 'running') {
          toolCall.status = 'done'
        }
      }
    }

    const importedSessionId = isSidechain
      ? `subagent:${sidechainAgentId ?? filePath}`
      : sessionId
    const importedName = isSidechain
      ? `${cwd ? getProjectNameFromPath(cwd) : '가져온 세션'} · ${sidechainAgentId ?? 'Subagent'}`
      : cwd ? getProjectNameFromPath(cwd) : (sessionId ?? '가져온 세션')

    return {
      sessionId: importedSessionId,
      name: importedName,
      cwd: cwd || defaultProjectPath,
      messages,
      lastCost,
      model,
    }
  }

  return {
    listCliSessions,
    loadCliSession,
  }
}
