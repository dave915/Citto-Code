# 03. 데이터 모델

```ts
type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

type ToolCallStatus = 'running' | 'done' | 'error'

type ToolCallBlock = {
  id: string
  toolUseId: string
  toolName: string
  toolInput: unknown
  result?: unknown
  isError?: boolean
  status: ToolCallStatus
}

type AttachedFile = {
  id: string
  name: string
  path: string
  content: string
  size: number
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls: ToolCallBlock[]
  attachedFiles?: AttachedFile[]
  createdAt: number
}

type Session = {
  id: string
  sessionId: string | null
  name: string
  cwd: string
  messages: Message[]
  isStreaming: boolean
  currentAssistantMsgId: string | null
  error: string | null
  lastCost?: number
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
}
```

## 상태 스토어 최소 연산
- `addSession`, `removeSession`, `setActiveSession`
- `addUserMessage`, `startAssistantMessage`, `appendTextChunk`
- `addToolCall`, `resolveToolCall`
- `setStreaming`, `setClaudeSessionId`, `setError`, `setLastCost`
- `setPermissionMode`, `setPlanMode`, `setModel`
