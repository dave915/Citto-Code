import { useEffect, useMemo, useRef } from 'react'
import { collectSubagentCalls } from '../lib/agent-subcalls'
import type { Session, ToolCallBlock } from '../store/sessions'

type Params = {
  sessions: Session[]
  appendSubagentText: (sessionId: string, toolUseId: string, chunk: string) => void
  updateSubagent: (
    sessionId: string,
    toolUseId: string,
    patch: Partial<Pick<ToolCallBlock, 'streamingText' | 'subagentState' | 'subagentSessionId' | 'subagentAgentId' | 'subagentTranscriptPath'>>,
  ) => void
}

type ActiveWatch = {
  watchId: string | null
  signature: string
}

export function useSubagentStreams({
  sessions,
  appendSubagentText,
  updateSubagent,
}: Params) {
  const activeWatchesRef = useRef<Map<string, ActiveWatch>>(new Map())

  const candidates = useMemo(() => {
    return sessions.flatMap((session) =>
      collectSubagentCalls(session.messages)
        .filter((item) => {
          if (item.status === 'done' || item.status === 'error') return false
          return Boolean(item.transcriptPath || item.sessionId || item.agentId)
        })
        .map((item) => ({
          sessionId: session.id,
          cwd: session.cwd,
          parentSessionId: session.sessionId,
          toolUseId: item.toolUseId,
          transcriptPath: item.transcriptPath,
          subagentSessionId: item.sessionId,
          agentId: item.agentId,
          signature: [
            session.id,
            session.cwd,
            session.sessionId ?? '',
            item.toolUseId,
            item.transcriptPath ?? '',
            item.sessionId ?? '',
            item.agentId ?? '',
          ].join('|'),
        })),
    )
  }, [sessions])

  useEffect(() => {
    const cleanup = window.claude.onSubagentTextChunk((event) => {
      if (event.chunk) {
        appendSubagentText(event.tabId, event.toolUseId, event.chunk)
      }

      const patch: Partial<Pick<ToolCallBlock, 'streamingText' | 'subagentState' | 'subagentSessionId' | 'subagentAgentId' | 'subagentTranscriptPath'>> = {
        subagentState: event.error
          ? 'error'
          : event.done
            ? 'done'
            : 'running',
      }
      if (event.transcriptPath) {
        patch.subagentTranscriptPath = event.transcriptPath
      }

      updateSubagent(event.tabId, event.toolUseId, patch)
    })

    return cleanup
  }, [appendSubagentText, updateSubagent])

  useEffect(() => {
    const nextKeys = new Set(candidates.map((candidate) => `${candidate.sessionId}:${candidate.toolUseId}`))

    for (const [key, activeWatch] of [...activeWatchesRef.current.entries()]) {
      if (nextKeys.has(key)) continue
      activeWatchesRef.current.delete(key)
      if (activeWatch.watchId) {
        void window.claude.unwatchSubagentText({ watchId: activeWatch.watchId }).catch(() => undefined)
      }
    }

    for (const candidate of candidates) {
      const key = `${candidate.sessionId}:${candidate.toolUseId}`
      const existingWatch = activeWatchesRef.current.get(key)
      if (existingWatch?.signature === candidate.signature) continue

      if (existingWatch?.watchId) {
        void window.claude.unwatchSubagentText({ watchId: existingWatch.watchId }).catch(() => undefined)
      }

      activeWatchesRef.current.set(key, {
        watchId: null,
        signature: candidate.signature,
      })

      void window.claude.watchSubagentText({
        tabId: candidate.sessionId,
        toolUseId: candidate.toolUseId,
        cwd: candidate.cwd,
        parentSessionId: candidate.parentSessionId,
        subagentSessionId: candidate.subagentSessionId,
        agentId: candidate.agentId,
        transcriptPath: candidate.transcriptPath,
      })
        .then((result) => {
          const activeWatch = activeWatchesRef.current.get(key)
          if (!activeWatch || activeWatch.signature !== candidate.signature) {
            if (result.watchId) {
              void window.claude.unwatchSubagentText({ watchId: result.watchId }).catch(() => undefined)
            }
            return
          }

          activeWatchesRef.current.set(key, {
            watchId: result.watchId,
            signature: candidate.signature,
          })

          const patch: Partial<Pick<ToolCallBlock, 'streamingText' | 'subagentState' | 'subagentSessionId' | 'subagentAgentId' | 'subagentTranscriptPath'>> = {
            subagentState: result.transcriptPath ? 'running' : 'pending',
          }
          if (result.transcriptPath ?? candidate.transcriptPath) {
            patch.subagentTranscriptPath = result.transcriptPath ?? candidate.transcriptPath ?? null
          }
          if (candidate.subagentSessionId) {
            patch.subagentSessionId = candidate.subagentSessionId
          }
          if (candidate.agentId) {
            patch.subagentAgentId = candidate.agentId
          }

          updateSubagent(candidate.sessionId, candidate.toolUseId, patch)
        })
        .catch(() => undefined)
    }

  }, [candidates, updateSubagent])

  useEffect(() => {
    return () => {
      for (const activeWatch of [...activeWatchesRef.current.values()]) {
        if (activeWatch.watchId) {
          void window.claude.unwatchSubagentText({ watchId: activeWatch.watchId }).catch(() => undefined)
        }
      }
      activeWatchesRef.current.clear()
    }
  }, [])
}
