import { useEffect, useRef, useState } from 'react'
import { useSessionsStore, findTabByClaudeSessionId } from './store/sessions'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsPanel } from './components/SettingsPanel'
import type { ClaudeStreamEvent, SelectedFile } from '../electron/preload'
import type { PermissionMode } from './store/sessions'

export default function App() {
  const {
    sessions,
    activeSessionId,
    addSession,
    removeSession,
    setActiveSession,
    addUserMessage,
    startAssistantMessage,
    appendTextChunk,
    addToolCall,
    resolveToolCall,
    setStreaming,
    setClaudeSessionId,
    setError,
    setLastCost,
    updateSession,
    setPermissionMode,
    setPlanMode,
    setModel,
    envVars,
  } = useSessionsStore()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const activeSession = sessions.find((s) => s.id === activeSessionId)!

  const pendingTabIdRef = useRef<string | null>(null)
  const currentAsstMsgRef = useRef<Map<string, string>>(new Map())
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  const storeRef = useRef({
    setClaudeSessionId, startAssistantMessage, appendTextChunk,
    addToolCall, resolveToolCall, setStreaming, setLastCost, setError,
    activeSessionId
  })
  storeRef.current = {
    setClaudeSessionId, startAssistantMessage, appendTextChunk,
    addToolCall, resolveToolCall, setStreaming, setLastCost, setError,
    activeSessionId
  }

  useEffect(() => {
    const cleanup = window.claude.onClaudeEvent(handleClaudeEvent)
    return cleanup
  }, [])

  function resolveTabId(claudeSessionId: string | null | undefined): string | null {
    if (!claudeSessionId) return null
    return findTabByClaudeSessionId(sessionsRef.current, claudeSessionId)?.id ?? null
  }

  function handleClaudeEvent(event: ClaudeStreamEvent) {
    const store = storeRef.current

    if (event.type === 'stream-start') {
      let tabId = resolveTabId(event.sessionId)
      if (!tabId && pendingTabIdRef.current) {
        tabId = pendingTabIdRef.current
        pendingTabIdRef.current = null
        store.setClaudeSessionId(tabId, event.sessionId)
      }
      if (!tabId) return
      const msgId = store.startAssistantMessage(tabId)
      currentAsstMsgRef.current.set(tabId, msgId)
      return
    }

    if (event.type === 'text-chunk') {
      const tabId = resolveTabId(event.sessionId)
      if (!tabId) return
      const msgId = currentAsstMsgRef.current.get(tabId)
      if (!msgId) return
      store.appendTextChunk(tabId, msgId, event.text)
      return
    }

    if (event.type === 'tool-start') {
      const tabId = resolveTabId(event.sessionId)
      if (!tabId) return
      const msgId = currentAsstMsgRef.current.get(tabId)
      if (!msgId) return
      store.addToolCall(tabId, msgId, {
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        toolInput: event.toolInput,
        status: 'running'
      })
      return
    }

    if (event.type === 'tool-result') {
      const tabId = resolveTabId(event.sessionId as string)
      if (!tabId) return
      store.resolveToolCall(tabId, event.toolUseId as string, event.content, event.isError as boolean)
      return
    }

    if (event.type === 'result') {
      const tabId = resolveTabId(event.sessionId)
      if (!tabId) return
      if (event.totalCostUsd) store.setLastCost(tabId, event.totalCostUsd)
      return
    }

    if (event.type === 'stream-end') {
      const tabId = resolveTabId(event.sessionId ?? null)
      if (!tabId) return
      store.setStreaming(tabId, false)
      currentAsstMsgRef.current.delete(tabId)
      return
    }

    if (event.type === 'error') {
      const tabId = resolveTabId(event.sessionId ?? null) ?? store.activeSessionId
      store.setError(tabId, event.error)
      return
    }
  }

  async function handleSend(text: string, files: SelectedFile[]) {
    if (!activeSession || activeSession.isStreaming) return

    setError(activeSessionId, null)
    setStreaming(activeSessionId, true)

    // 첨부파일이 있으면 프롬프트 앞에 파일 내용 삽입
    let fullPrompt = text
    if (files.length > 0) {
      const fileSections = files
        .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
        .join('\n\n')
      fullPrompt = files.length > 0 && text
        ? `${fileSections}\n\n${text}`
        : fileSections || text
    }

    // UI에 표시할 메시지 (원본 텍스트 + 첨부파일 메타만)
    addUserMessage(
      activeSessionId,
      text || `(파일 ${files.length}개 첨부)`,
      files.length > 0 ? files : undefined
    )

    if (!activeSession.sessionId) {
      pendingTabIdRef.current = activeSessionId
    }

    try {
      await window.claude.sendMessage({
        sessionId: activeSession.sessionId ?? null,
        prompt: fullPrompt,
        cwd: activeSession.cwd && activeSession.cwd !== '~' ? activeSession.cwd : '~',
        permissionMode: activeSession.permissionMode,
        planMode: activeSession.planMode,
        model: activeSession.model ?? undefined,
        envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
      })
    } catch (err) {
      setError(activeSessionId, String(err))
      pendingTabIdRef.current = null
    }
  }

  async function handleAbort() {
    if (!activeSession?.sessionId) return
    await window.claude.abort({ sessionId: activeSession.sessionId })
    setStreaming(activeSessionId, false)
  }

  async function handleSelectFolder(tabId?: string) {
    const id = tabId ?? activeSessionId
    const folder = await window.claude.selectFolder()
    if (!folder) return
    const name = folder.split('/').pop() || folder
    updateSession(id, () => ({ cwd: folder, name }))
  }

  async function handleNewSession() {
    const folder = await window.claude.selectFolder()
    const cwd = folder ?? '~'
    const name = folder ? (folder.split('/').pop() || folder) : '~'
    addSession(cwd, name)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-claude-sidebar font-sans">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSession}
        onRenameSession={(id, name) => updateSession(id, () => ({ name }))}
        onNewSession={handleNewSession}
        onRemoveSession={removeSession}
        onSelectFolder={(sid) => handleSelectFolder(sid)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex-1 overflow-hidden">
        {settingsOpen ? (
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        ) : activeSession && (
          <ChatView
            key={activeSessionId}
            session={activeSession}
            onSend={handleSend}
            onAbort={handleAbort}
            onSelectFolder={() => handleSelectFolder()}
            onPermissionModeChange={(mode: PermissionMode) => setPermissionMode(activeSessionId, mode)}
            onPlanModeChange={(val: boolean) => setPlanMode(activeSessionId, val)}
            onModelChange={(model) => setModel(activeSessionId, model)}
          />
        )}
      </main>
    </div>
  )
}
