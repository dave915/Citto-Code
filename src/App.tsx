import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useSessionsStore, findTabByClaudeSessionId } from './store/sessions'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsPanel } from './components/SettingsPanel'
import type { ClaudeStreamEvent, SelectedFile } from '../electron/preload'
import type { PermissionMode } from './store/sessions'
import { getCurrentPlatform, getShortcutLabel, matchShortcut } from './lib/shortcuts'

export default function App() {
  const expandedSidebarWidthRef = useRef(240)
  const {
    sessions,
    activeSessionId,
    sidebarMode,
    addSession,
    removeSession,
    setActiveSession,
    setSidebarMode,
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
    shortcutConfig,
  } = useSessionsStore()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) ?? null : null
  const shortcutPlatform = getCurrentPlatform()

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchShortcut(event, shortcutConfig.toggleSidebar[shortcutPlatform])) {
        event.preventDefault()
        handleToggleSidebar()
        return
      }

      if (matchShortcut(event, shortcutConfig.openSettings[shortcutPlatform])) {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }

      if (matchShortcut(event, shortcutConfig.newSession[shortcutPlatform])) {
        event.preventDefault()
        void handleNewSession()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shortcutConfig, shortcutPlatform, sidebarCollapsed, sidebarWidth])

  const handleSidebarResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(420, Math.max(180, startWidth + (moveEvent.clientX - startX)))
      setSidebarWidth(nextWidth)
      expandedSidebarWidthRef.current = nextWidth
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

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
    if (!activeSession || !activeSessionId || activeSession.isStreaming) return

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
    if (!activeSession?.sessionId || !activeSessionId) return
    await window.claude.abort({ sessionId: activeSession.sessionId })
    setStreaming(activeSessionId, false)
  }

  async function handleSelectFolder(tabId?: string) {
    const id = tabId ?? activeSessionId
    if (!id) return
    const folder = await window.claude.selectFolder()
    if (!folder) return
    const name = folder.split('/').pop() || folder
    updateSession(id, () => ({ cwd: folder, name }))
  }

  async function handleNewSession(cwdOverride?: string) {
    let folder = cwdOverride ?? null
    if (!folder) {
      folder = await window.claude.selectFolder()
    }
    const cwd = folder ?? '~'
    const name = folder ? (folder.split('/').pop() || folder) : '~'
    addSession(cwd, name)
  }

  function handleSelectSession(sessionId: string) {
    setSettingsOpen(false)
    setActiveSession(sessionId)
  }

  function handleToggleSidebar() {
    if (sidebarCollapsed) {
      setSidebarWidth(expandedSidebarWidthRef.current)
      setSidebarCollapsed(false)
      return
    }

    expandedSidebarWidthRef.current = sidebarWidth
    setSidebarCollapsed(true)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-claude-sidebar font-sans">
      {!sidebarCollapsed && (
      <div className="relative flex-shrink-0" style={{ width: `${sidebarWidth}px` }}>
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          sidebarMode={sidebarMode}
          onSelectSession={handleSelectSession}
          onRenameSession={(id, name) => updateSession(id, () => ({ name }))}
          onNewSession={handleNewSession}
          onRemoveSession={removeSession}
          onSelectFolder={(sid) => handleSelectFolder(sid)}
          onOpenSettings={() => setSettingsOpen(true)}
          newSessionShortcutLabel={getShortcutLabel(shortcutConfig, 'newSession', shortcutPlatform)}
          settingsShortcutLabel={getShortcutLabel(shortcutConfig, 'openSettings', shortcutPlatform)}
        />
        <div
          onMouseDown={handleSidebarResizeStart}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-claude-border/80 transition-colors"
        />
      </div>
      )}

      <main className="flex-1 overflow-hidden">
        {settingsOpen ? (
          <SettingsPanel onClose={() => setSettingsOpen(false)} onSidebarModeChange={setSidebarMode} />
        ) : (
          activeSession ? (
            <ChatView
              key={activeSession.id}
              session={activeSession}
              onSend={handleSend}
              onAbort={handleAbort}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={handleToggleSidebar}
              sidebarShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleSidebar', shortcutPlatform)}
              filesShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleFiles', shortcutPlatform)}
              sessionInfoShortcutLabel={getShortcutLabel(shortcutConfig, 'toggleSessionInfo', shortcutPlatform)}
              onSelectFolder={() => handleSelectFolder()}
              onPermissionModeChange={(mode: PermissionMode) => setPermissionMode(activeSession.id, mode)}
              onPlanModeChange={(val: boolean) => setPlanMode(activeSession.id, val)}
              onModelChange={(model) => setModel(activeSession.id, model)}
            />
          ) : (
            <EmptyMainState onNewSession={handleNewSession} />
          )
        )}
      </main>
    </div>
  )
}

function EmptyMainState({ onNewSession }: { onNewSession: () => void }) {
  return (
    <div className="h-full flex items-center justify-center bg-claude-bg px-8">
      <div className="max-w-sm text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white border border-claude-border flex items-center justify-center shadow-sm">
          <svg className="w-7 h-7 text-claude-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-claude-text">열린 세션이 없습니다</h2>
        <p className="mt-2 text-sm text-claude-muted leading-relaxed">
          새 세션을 만들고 프로젝트 폴더를 선택하면 바로 작업을 시작할 수 있습니다.
        </p>
        <button
          onClick={onNewSession}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-claude-orange text-white text-sm font-medium hover:bg-claude-orange/90 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          새 세션 만들기
        </button>
      </div>
    </div>
  )
}
