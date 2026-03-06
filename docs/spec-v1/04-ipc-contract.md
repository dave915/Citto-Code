# 04. IPC 계약

## 1) Preload 노출 API
```ts
type ClaudeAPI = {
  sendMessage(params: {
    sessionId: string | null
    prompt: string
    cwd: string
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
    planMode?: boolean
    model?: string
  }): Promise<{ tempKey: string } | undefined>

  abort(params: { sessionId: string }): Promise<void>
  selectFolder(): Promise<string | null>
  selectFiles(): Promise<Array<{name:string;path:string;content:string;size:number}>>
  openFile(filePath: string): Promise<void>
  getModels(): Promise<Array<{id:string;displayName:string;family:string}>>

  onClaudeEvent(handler: (event: ClaudeStreamEvent) => void): () => void
}
```

## 2) 이벤트 채널/페이로드
- `claude:stream-start` -> `{ sessionId: string, cwd: string }`
- `claude:text-chunk` -> `{ sessionId: string, text: string }`
- `claude:tool-start` -> `{ sessionId: string, toolUseId: string, toolName: string, toolInput: unknown }`
- `claude:tool-result` -> `{ sessionId: string, toolUseId: string, content: unknown, isError: boolean }`
- `claude:result` -> `{ sessionId: string, costUsd: number, totalCostUsd: number, isError: boolean, durationMs: number }`
- `claude:stream-end` -> `{ sessionId: string | null, exitCode: number | null }`
- `claude:error` -> `{ sessionId: string | null, error: string }`

## 3) 구현 제약
- Renderer는 preload API만 사용
- IPC 채널 이름/페이로드 형태를 고정해 타 구현체와 호환
