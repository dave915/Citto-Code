import { useEffect } from 'react'
import type { ToolCallBlock } from '../store/sessions'

type Params = {
  appendSubagentText: (sessionId: string, toolUseId: string, chunk: string) => void
  updateSubagent: (
    sessionId: string,
    toolUseId: string,
    patch: Partial<Pick<ToolCallBlock, 'streamingText' | 'subagentState' | 'subagentSessionId' | 'subagentAgentId' | 'subagentTranscriptPath'>>,
  ) => void
}

export function useSubagentStreams({
  appendSubagentText,
  updateSubagent,
}: Params) {
  useEffect(() => {
    return window.claude.onSubagentTextChunk((event) => {
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

      if (typeof event.subagentSessionId === 'string' && event.subagentSessionId.trim()) {
        patch.subagentSessionId = event.subagentSessionId.trim()
      }
      if (event.transcriptPath) {
        patch.subagentTranscriptPath = event.transcriptPath
      }

      updateSubagent(event.tabId, event.toolUseId, patch)
    })
  }, [appendSubagentText, updateSubagent])
}
