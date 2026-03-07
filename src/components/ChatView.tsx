import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Session, PermissionMode } from '../store/sessions'
import { useSessionsStore } from '../store/sessions'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import type { DirEntry, OpenWithApp, SelectedFile } from '../../electron/preload'
import { matchShortcut } from '../lib/shortcuts'
import vscodeIcon from '../assets/open-with/vscode.png'
import finderIcon from '../assets/open-with/finder.png'
import terminalIcon from '../assets/open-with/terminal.png'
import iterm2Icon from '../assets/open-with/iterm2.png'
import warpIcon from '../assets/open-with/warp.png'
import xcodeIcon from '../assets/open-with/xcode.png'
import intellijIdeaIcon from '../assets/open-with/intellij-idea.png'
import webstormIcon from '../assets/open-with/webstorm.png'

type Props = {
  session: Session
  onSend: (text: string, files: SelectedFile[]) => void
  onAbort: () => void
  onPermissionRequestAction: (action: 'once' | 'always' | 'deny') => void
  onQuestionResponse: (answer: string | null) => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  sidebarShortcutLabel: string
  filesShortcutLabel: string
  sessionInfoShortcutLabel: string
  onSelectFolder: () => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
}

const INITIAL_RIGHT_PANEL_WIDTH = 290
const INITIAL_EXPLORER_WIDTH = 290

const OPEN_WITH_ICONS: Record<string, string> = {
  vscode: vscodeIcon,
  finder: finderIcon,
  terminal: terminalIcon,
  iterm2: iterm2Icon,
  warp: warpIcon,
  xcode: xcodeIcon,
  'intellij-idea': intellijIdeaIcon,
  webstorm: webstormIcon,
}

export function ChatView({
  session, onSend, onAbort, onPermissionRequestAction, onQuestionResponse, sidebarCollapsed, onToggleSidebar,
  sidebarShortcutLabel, filesShortcutLabel, sessionInfoShortcutLabel, onSelectFolder,
  onPermissionModeChange, onPlanModeChange, onModelChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const openWithMenuRef = useRef<HTMLDivElement>(null)
  const prevFilePanelOpenRef = useRef(false)
  const prevShowPreviewPaneRef = useRef(false)
  const lastMsg = session.messages[session.messages.length - 1]
  const [rightPanel, setRightPanel] = useState<'none' | 'files' | 'session'>('none')
  const [rootEntries, setRootEntries] = useState<DirEntry[]>([])
  const [childEntries, setChildEntries] = useState<Record<string, DirEntry[]>>({})
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({})
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({})
  const [selectedEntry, setSelectedEntry] = useState<DirEntry | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'unsupported'>('idle')
  const [filePanelWidth, setFilePanelWidth] = useState(INITIAL_RIGHT_PANEL_WIDTH)
  const [explorerWidth, setExplorerWidth] = useState(INITIAL_EXPLORER_WIDTH)
  const [markdownPreviewEnabled, setMarkdownPreviewEnabled] = useState(true)
  const [openWithMenuOpen, setOpenWithMenuOpen] = useState(false)
  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([])
  const [openWithLoading, setOpenWithLoading] = useState(false)
  const preferredOpenWithAppId = useSessionsStore((state) => state.preferredOpenWithAppId)
  const setPreferredOpenWithAppId = useSessionsStore((state) => state.setPreferredOpenWithAppId)
  const isNewSession = session.messages.length === 0
  const showPreviewPane = selectedEntry !== null
  const filePanelOpen = rightPanel === 'files'
  const sessionPanelOpen = rightPanel === 'session'
  const openTargetPath = session.cwd || '~'
  const promptHistory = session.messages
    .filter((message) => message.role === 'user' && message.text.trim().length > 0)
    .map((message) => message.text)
  const lastAssistantMessage = [...session.messages].reverse().find((message) => message.role === 'assistant')
  const showErrorCard = Boolean(
    session.error &&
    session.error.trim() &&
    session.error.trim() !== (lastAssistantMessage?.text.trim() ?? '')
  )
  const userMessageCount = session.messages.filter((message) => message.role === 'user').length
  const assistantMessageCount = session.messages.filter((message) => message.role === 'assistant').length
  const totalCharacters = session.messages.reduce((sum, message) => sum + message.text.length, 0)
  const totalToolCalls = session.messages.reduce((sum, message) => sum + message.toolCalls.length, 0)
  const totalAttachments = session.messages.reduce((sum, message) => sum + (message.attachedFiles?.length ?? 0), 0)
  const contextUsagePercent = estimateContextUsagePercent(totalCharacters, totalToolCalls, totalAttachments)
  const preferredOpenWithApp = openWithApps.find((app) => app.id === preferredOpenWithAppId) ?? null
  const defaultOpenWithApp = preferredOpenWithApp ?? openWithApps[0] ?? null

  const handleHeaderDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select, [data-no-drag="true"]')) return
    void window.claude.toggleWindowMaximize()
  }

  useEffect(() => {
    let cancelled = false

    window.claude.listOpenWithApps()
      .then((apps) => {
        if (cancelled) return
        setOpenWithApps(apps)
        if (preferredOpenWithAppId && !apps.some((app) => app.id === preferredOpenWithAppId)) {
          setPreferredOpenWithAppId('')
        }
      })
      .catch(() => {
        if (cancelled) return
        setOpenWithApps([])
        if (preferredOpenWithAppId) {
          setPreferredOpenWithAppId('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [preferredOpenWithAppId, setPreferredOpenWithAppId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages.length, lastMsg?.text?.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchShortcut(event, filesShortcutLabel)) {
        event.preventDefault()
        setRightPanel((open) => open === 'files' ? 'none' : 'files')
        return
      }

      if (matchShortcut(event, sessionInfoShortcutLabel)) {
        event.preventDefault()
        setRightPanel((open) => open === 'session' ? 'none' : 'session')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filesShortcutLabel, sessionInfoShortcutLabel])

  useEffect(() => {
    const wasFilePanelOpen = prevFilePanelOpenRef.current
    const wasShowingPreview = prevShowPreviewPaneRef.current
    prevFilePanelOpenRef.current = filePanelOpen
    prevShowPreviewPaneRef.current = showPreviewPane

    if (!filePanelOpen) return

    if (!showPreviewPane) {
      setFilePanelWidth(explorerWidth)
      return
    }

    if (wasFilePanelOpen && wasShowingPreview) {
      return
    }

    const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
    const targetWidth = Math.min(1100, Math.max(explorerWidth + 260, Math.floor(containerWidth / 2)))
    setFilePanelWidth(targetWidth)
  }, [explorerWidth, filePanelOpen, showPreviewPane])

  useEffect(() => {
    if (!sessionPanelOpen) return
    setFilePanelWidth(INITIAL_EXPLORER_WIDTH)
  }, [sessionPanelOpen])

  useEffect(() => {
    if (!openWithMenuOpen) return

    let cancelled = false
    setOpenWithLoading(true)

    window.claude.listOpenWithApps()
      .then((apps) => {
        if (cancelled) return
        setOpenWithApps(apps)
        if (preferredOpenWithAppId && !apps.some((app) => app.id === preferredOpenWithAppId)) {
          setPreferredOpenWithAppId('')
        }
      })
      .catch(() => {
        if (cancelled) return
        setOpenWithApps([])
        if (preferredOpenWithAppId) {
          setPreferredOpenWithAppId('')
        }
      })
      .finally(() => {
        if (!cancelled) setOpenWithLoading(false)
      })

    const handleMouseDown = (event: MouseEvent) => {
      if (openWithMenuRef.current && event.target instanceof Node && !openWithMenuRef.current.contains(event.target)) {
        setOpenWithMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    return () => {
      cancelled = true
      window.removeEventListener('mousedown', handleMouseDown)
    }
  }, [openWithMenuOpen])

  useEffect(() => {
    if (!filePanelOpen) return
    let cancelled = false
    setLoadingPaths((prev) => ({ ...prev, __root__: true }))
    window.claude.listCurrentDir(session.cwd || '~')
      .then((entries) => {
        if (!cancelled) {
          setRootEntries(entries)
          setChildEntries({})
          setExpandedDirs({})
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRootEntries([])
          setChildEntries({})
          setExpandedDirs({})
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPaths((prev) => ({ ...prev, __root__: false }))
        }
      })

    return () => { cancelled = true }
  }, [filePanelOpen, session.cwd])

  useEffect(() => {
    setSelectedEntry(null)
    setPreviewContent('')
    setPreviewState('idle')
    setMarkdownPreviewEnabled(true)
  }, [session.cwd])

  const toggleDirectory = async (entry: DirEntry) => {
    if (entry.type !== 'directory') return
    const isExpanded = expandedDirs[entry.path]
    if (isExpanded) {
      setExpandedDirs((prev) => ({ ...prev, [entry.path]: false }))
      return
    }

    if (!(entry.path in childEntries)) {
      setLoadingPaths((prev) => ({ ...prev, [entry.path]: true }))
      try {
        const children = await window.claude.listCurrentDir(entry.path)
        setChildEntries((prev) => ({ ...prev, [entry.path]: children }))
      } catch {
        setChildEntries((prev) => ({ ...prev, [entry.path]: [] }))
      } finally {
        setLoadingPaths((prev) => ({ ...prev, [entry.path]: false }))
      }
    }

    setExpandedDirs((prev) => ({ ...prev, [entry.path]: true }))
  }

  const handleSelectEntry = async (entry: DirEntry) => {
    if (entry.type === 'directory') return

    if (selectedEntry?.path === entry.path) {
      setSelectedEntry(null)
      setPreviewContent('')
      setPreviewState('idle')
      setMarkdownPreviewEnabled(true)
      return
    }

    setSelectedEntry(entry)
    setMarkdownPreviewEnabled(true)

    if (!isTextPreviewable(entry.name)) {
      setPreviewContent('')
      setPreviewState('unsupported')
      return
    }

    setPreviewState('loading')
    const result = await window.claude.readFile(entry.path)
    if (!result) {
      setPreviewContent('')
      setPreviewState('unsupported')
      return
    }
    setPreviewContent(result.content)
    setPreviewState('ready')
  }

  const handleFilePanelResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = filePanelWidth
    const minimumWidth = showPreviewPane ? Math.max(320, explorerWidth + 140) : explorerWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(1100, Math.max(minimumWidth, startWidth - (moveEvent.clientX - startX)))
      setFilePanelWidth(nextWidth)
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleExplorerResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = explorerWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(filePanelWidth - 260, Math.max(180, startWidth - (moveEvent.clientX - startX)))
      setExplorerWidth(nextWidth)
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleOpenWith = async (appId: string, persistPreference = true) => {
    const result = await window.claude.openPathWithApp({ targetPath: openTargetPath, appId })
    if (result.ok && persistPreference) {
      setPreferredOpenWithAppId(appId)
    }
    setOpenWithMenuOpen(false)
    if (!result.ok) {
      window.alert(result.error ?? '앱에서 열지 못했습니다.')
    }
  }

  const handleDefaultOpen = async () => {
    if (defaultOpenWithApp) {
      await handleOpenWith(defaultOpenWithApp.id, false)
      return
    }

    const result = await window.claude.openPathWithApp({ targetPath: openTargetPath, appId: 'default' })
    if (!result.ok) {
      window.alert(result.error ?? '앱에서 열지 못했습니다.')
    }
  }

  return (
    <div ref={containerRef} className="flex h-full bg-claude-bg">
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="draggable-region flex h-12 flex-shrink-0 items-center justify-between border-b border-claude-border bg-claude-panel pr-4"
          style={{ paddingLeft: sidebarCollapsed ? '76px' : '16px' }}
          onDoubleClick={handleHeaderDoubleClick}
        >
          <div
            className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-xs text-claude-muted"
            title="현재 작업 폴더"
          >
            <button
              onClick={onToggleSidebar}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
              title={`${sidebarCollapsed ? '사이드바 열기' : '사이드바 닫기'} (${sidebarShortcutLabel})`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5v14" />
              </svg>
            </button>
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="min-w-0 max-w-sm truncate font-mono text-[12px] text-[#cec0b4]">
              {session.cwd || '~'}
            </span>
          </div>

          <div className="no-drag flex items-center gap-2" data-no-drag="true">
            <div ref={openWithMenuRef} className="relative" data-no-drag="true">
              <div className="flex overflow-hidden rounded-2xl border border-claude-border/80 bg-claude-surface shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
                <button
                  onClick={() => void handleDefaultOpen()}
                  disabled={openWithApps.length === 0}
                  className="flex items-center gap-2 bg-claude-surface px-3.5 py-2 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-claude-surface"
                  title={defaultOpenWithApp ? `${defaultOpenWithApp.label}에서 열기` : '기본 앱으로 열기'}
                >
                  <OpenWithAppIcon app={defaultOpenWithApp} />
                  <span>열기</span>
                </button>
                <button
                  onClick={() => setOpenWithMenuOpen((open) => !open)}
                  disabled={openWithApps.length === 0}
                  className={`border-l border-claude-border/80 px-2 py-1.5 text-claude-text transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-claude-surface ${
                    openWithMenuOpen ? 'bg-claude-surface-2' : 'bg-claude-surface hover:bg-claude-surface-2'
                  }`}
                  title="다음에서 열기"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>

              {openWithMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-3xl border border-claude-border bg-claude-panel p-2 shadow-[0_24px_60px_rgba(0,0,0,0.34)]">
                  <p className="px-3 pb-2 pt-1 text-xs font-semibold text-claude-muted">다음에서 열기</p>
                  {openWithLoading ? (
                    <div className="flex items-center justify-center px-3 py-8 text-claude-muted">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                      </svg>
                    </div>
                  ) : openWithApps.length === 0 ? (
                    <div className="px-3 py-6 text-sm text-claude-muted">표시할 앱이 없습니다.</div>
                  ) : (
                    <div className="space-y-1">
                      {openWithApps.map((app) => (
                        <button
                          key={app.id}
                          onClick={() => void handleOpenWith(app.id)}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-claude-text transition-colors hover:bg-claude-surface"
                        >
                          <OpenWithAppIcon app={app} className="h-8 w-8" />
                          <span className="flex-1">{app.label}</span>
                          {preferredOpenWithAppId === app.id && (
                            <svg className="h-4 w-4 text-claude-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
            onClick={() => setRightPanel((open) => open === 'session' ? 'none' : 'session')}
            className={`flex items-center justify-center rounded-xl px-2.5 py-2 text-xs transition-colors ${
              sessionPanelOpen
                ? 'bg-claude-surface text-claude-text'
                : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
            }`}
            title={`현재 세션 정보 보기 (${sessionInfoShortcutLabel})`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7h.01" />
            </svg>
          </button>
          <button
            onClick={() => setRightPanel((open) => open === 'files' ? 'none' : 'files')}
            className={`flex items-center justify-center rounded-xl px-2.5 py-2 text-xs transition-colors ${
              filePanelOpen
                ? 'bg-claude-surface text-claude-text'
                : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
            }`}
            title={`현재 디렉토리 파일 보기 (${filesShortcutLabel})`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 18h10" />
            </svg>
          </button>
          </div>
        </div>

        {/* 메시지 영역 */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#2b2b2e_0%,#242427_100%)] px-6 py-7">
          <div className="mx-auto w-full max-w-[860px]">
            {isNewSession
              ? <WelcomeScreen onSelectFolder={onSelectFolder} />
              : session.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isStreaming={session.isStreaming && msg.id === session.currentAssistantMsgId}
                    onAbort={session.isStreaming && msg.id === session.currentAssistantMsgId ? onAbort : undefined}
                  />
                ))
            }

            {showErrorCard && (
              <div className="mb-4 flex justify-start">
                <div className="flex max-w-[88%] gap-3.5">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-claude-border bg-claude-surface text-[11px] font-semibold text-claude-text shadow-[0_8px_20px_rgba(0,0,0,0.16)]">
                    C
                  </div>
                  <div className="rounded-[22px] rounded-tl-md border border-red-900/60 bg-red-950/30 px-4 py-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
                    <div className="mb-1 flex items-center gap-2 font-medium text-red-200">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      오류 발생
                    </div>
                    <p className="whitespace-pre-wrap font-mono text-xs text-red-100">{session.error}</p>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
        {/* 입력창 (설정 툴바 포함) */}
        <InputArea
          cwd={session.cwd}
          promptHistory={promptHistory}
          onSend={onSend}
          onAbort={onAbort}
          isStreaming={session.isStreaming}
          pendingPermission={session.pendingPermission}
          onPermissionRequestAction={onPermissionRequestAction}
          pendingQuestion={session.pendingQuestion}
          onQuestionResponse={onQuestionResponse}
          permissionMode={session.permissionMode}
          planMode={session.planMode}
          model={session.model}
          onPermissionModeChange={onPermissionModeChange}
          onPlanModeChange={onPlanModeChange}
          onModelChange={onModelChange}
        />
      </div>

      {rightPanel !== 'none' && (
        <div
          onMouseDown={handleFilePanelResizeStart}
          className="w-1.5 cursor-col-resize bg-transparent hover:bg-claude-border/80 transition-colors flex-shrink-0"
        />
      )}

      {rightPanel !== 'none' && (
        <aside
          className="flex min-w-0 flex-shrink-0 flex-col border-l border-claude-border bg-claude-panel"
          style={{ width: `${filePanelWidth}px` }}
        >
          <div className="flex h-12 items-center border-b border-claude-border px-4">
            <p className="text-sm font-semibold text-claude-text">
              {filePanelOpen ? '파일 탐색기' : '세션 정보'}
            </p>
          </div>

          {filePanelOpen ? (
            <div className="flex flex-1 min-h-0">
              {showPreviewPane && (
                <>
                  <div className="min-w-0 flex-1 overflow-y-auto bg-[#141210]">
                    <PreviewPane
                      entry={selectedEntry}
                      previewContent={previewContent}
                      previewState={previewState}
                      markdownPreviewEnabled={markdownPreviewEnabled}
                      onToggleMarkdownPreview={() => setMarkdownPreviewEnabled((value) => !value)}
                    />
                  </div>

                  <div
                    onMouseDown={handleExplorerResizeStart}
                    className="w-1.5 cursor-col-resize bg-transparent hover:bg-claude-border/80 transition-colors flex-shrink-0"
                  />
                </>
              )}

              <div
                className={`min-w-0 overflow-y-auto px-2 py-3 ${showPreviewPane ? 'border-l border-claude-border bg-claude-panel' : 'flex-1 bg-claude-panel'}`}
                style={showPreviewPane ? { width: `${explorerWidth}px` } : undefined}
              >
                {loadingPaths.__root__ ? (
                  <div className="flex items-center justify-center py-12 text-claude-muted">
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                  </div>
                ) : rootEntries.length === 0 ? (
                  <div className="text-center py-12 text-claude-muted">
                    <p className="text-sm">표시할 파일이 없습니다.</p>
                  </div>
                ) : (
                  <div className="pl-2">
                    {rootEntries.map((entry) => (
                      <ExplorerNode
                        key={entry.path}
                        entry={entry}
                        depth={0}
                        expandedDirs={expandedDirs}
                        childEntries={childEntries}
                        loadingPaths={loadingPaths}
                        selectedPath={selectedEntry?.path ?? null}
                        onToggleDirectory={toggleDirectory}
                        onSelectEntry={handleSelectEntry}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <SessionInfoPanel
              session={session}
              userMessageCount={userMessageCount}
              assistantMessageCount={assistantMessageCount}
              promptHistoryCount={promptHistory.length}
              contextUsagePercent={contextUsagePercent}
              onCompact={() => onSend('/compact', [])}
            />
          )}
        </aside>
      )}
    </div>
  )
}

function SessionInfoPanel({
  session,
  userMessageCount,
  assistantMessageCount,
  promptHistoryCount,
  contextUsagePercent,
  onCompact,
}: {
  session: Session
  userMessageCount: number
  assistantMessageCount: number
  promptHistoryCount: number
  contextUsagePercent: number
  onCompact: () => void
}) {
  const createdAt = session.messages[0]?.createdAt ?? null

  return (
    <div className="flex-1 space-y-4 overflow-y-auto bg-claude-bg/40 p-4">
      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">세션</p>
        <div className="mt-3 space-y-3">
          <InfoRow label="이름" value={session.name} />
          <InfoRow label="경로" value={session.cwd || '~'} mono />
          <InfoRow label="세션 ID" value={session.sessionId ?? '아직 없음'} mono />
          <InfoRow label="모델" value={session.model ?? '기본 모델'} />
          <InfoRow label="권한" value={formatPermissionMode(session.permissionMode)} />
          <InfoRow label="플랜 모드" value={session.planMode ? '켜짐' : '꺼짐'} />
          <InfoRow label="상태" value={session.isStreaming ? '응답 생성 중' : '대기 중'} />
          <InfoRow label="오류" value={session.error ?? '없음'} mono={Boolean(session.error)} />
        </div>
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">현재 컨텍스트</p>
          <button
            onClick={onCompact}
            disabled={session.isStreaming}
            className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
          >
            압축하기
          </button>
        </div>
        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold text-claude-text">{contextUsagePercent}%</p>
            <p className="text-xs text-claude-muted">추정치</p>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#28231f]">
            <div
              className="h-full rounded-full bg-claude-orange transition-[width]"
              style={{ width: `${contextUsagePercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoStat label="사용자 메시지" value={String(userMessageCount)} />
        <InfoStat label="응답 메시지" value={String(assistantMessageCount)} />
        <InfoStat label="프롬프트 기록" value={String(promptHistoryCount)} />
        <InfoStat label="마지막 비용" value={session.lastCost !== undefined ? `$${session.lastCost.toFixed(4)}` : '-'} />
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">타임라인</p>
        <div className="mt-3 space-y-3">
          <InfoRow label="시작 시각" value={createdAt ? formatDateTime(createdAt) : '메시지 없음'} />
          <InfoRow label="마지막 메시지" value={lastMessageSummary(session)} />
        </div>
      </div>
    </div>
  )
}

function openWithMonogram(label: string): string {
  const compact = label.replace(/[^a-z0-9]/gi, '')
  return compact.slice(0, 2) || label.slice(0, 2)
}

function OpenWithAppIcon({
  app,
  className = 'h-4 w-4',
}: {
  app: OpenWithApp | null
  className?: string
}) {
  if (app?.iconDataUrl) {
    return <img src={app.iconDataUrl} alt="" className={`${className} rounded-md object-contain`} />
  }

  if (app && OPEN_WITH_ICONS[app.id]) {
    return <img src={OPEN_WITH_ICONS[app.id]} alt="" className={`${className} rounded-md object-contain`} />
  }

  if (app?.iconPath) {
    return <img src={encodeURI(`file://${app.iconPath}`)} alt="" className={`${className} rounded-md object-contain`} />
  }

  return (
      <span className={`flex items-center justify-center rounded-xl bg-claude-surface text-claude-muted ${className}`}>
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h9v9" />
      </svg>
    </span>
  )
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-claude-muted">{label}</span>
      <span className={`text-sm text-claude-text break-words ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
      <p className="text-xs text-claude-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-claude-text">{value}</p>
    </div>
  )
}

function formatPermissionMode(mode: PermissionMode): string {
  if (mode === 'acceptEdits') return '자동승인'
  if (mode === 'bypassPermissions') return '전체허용'
  return '기본'
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function estimateContextUsagePercent(totalCharacters: number, totalToolCalls: number, totalAttachments: number): number {
  const weightedSize = totalCharacters + (totalToolCalls * 1200) + (totalAttachments * 4000)
  const maxContextEstimate = 160000
  return Math.min(100, Math.max(0, Math.round((weightedSize / maxContextEstimate) * 100)))
}

function lastMessageSummary(session: Session): string {
  const message = session.messages[session.messages.length - 1]
  if (!message) return '메시지 없음'
  const prefix = message.role === 'user' ? '사용자' : 'Claude'
  const body = message.text.trim() || (message.attachedFiles?.length ? `파일 ${message.attachedFiles.length}개 첨부` : '내용 없음')
  return `${prefix} · ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`
}

function ExplorerNode({
  entry,
  depth,
  expandedDirs,
  childEntries,
  loadingPaths,
  selectedPath,
  onToggleDirectory,
  onSelectEntry,
}: {
  entry: DirEntry
  depth: number
  expandedDirs: Record<string, boolean>
  childEntries: Record<string, DirEntry[]>
  loadingPaths: Record<string, boolean>
  selectedPath: string | null
  onToggleDirectory: (entry: DirEntry) => void
  onSelectEntry: (entry: DirEntry) => void
}) {
  const isDirectory = entry.type === 'directory'
  const isExpanded = expandedDirs[entry.path]
  const children = childEntries[entry.path] ?? []
  const isLoading = loadingPaths[entry.path]
  const isSelected = selectedPath === entry.path

  return (
    <div>
      <button
        onClick={() => {
          if (isDirectory) {
            void onToggleDirectory(entry)
          } else {
            void onSelectEntry(entry)
          }
        }}
        className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors ${
          isSelected
            ? 'bg-claude-surface-2 text-claude-text ring-1 ring-[#4b4037] shadow-[0_10px_22px_rgba(0,0,0,0.16)]'
            : 'hover:bg-claude-surface'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        title={entry.path}
      >
        {isDirectory ? (
          <>
            <svg
              className={`w-3.5 h-3.5 flex-shrink-0 text-claude-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
            </svg>
            <svg className="w-4 h-4 flex-shrink-0 text-[#d0a06f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </>
        ) : (
          <>
            <span className="w-3.5 h-3.5 flex-shrink-0" />
            <FileGlyph name={entry.name} />
          </>
        )}
        <span className={`truncate text-[15px] ${isSelected ? 'font-medium text-claude-text' : 'text-claude-text'}`}>
          {entry.name}
        </span>
      </button>

      {isDirectory && isExpanded && (
        <div>
          {isLoading ? (
            <div className="px-2 py-2 text-xs text-claude-muted" style={{ paddingLeft: `${depth * 16 + 32}px` }}>
              불러오는 중...
            </div>
          ) : (
            children.map((child) => (
              <ExplorerNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                childEntries={childEntries}
                loadingPaths={loadingPaths}
                selectedPath={selectedPath}
                onToggleDirectory={onToggleDirectory}
                onSelectEntry={onSelectEntry}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function FileGlyph({ name }: { name: string }) {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''

  if (ext === 'html') {
    return (
      <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 3h16l-1.5 18L12 19l-6.5 2L4 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 8l-2 2 2 2m6-4l2 2-2 2" />
      </svg>
    )
  }

  if (ext === 'json' || ext === 'md') {
    return (
      <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zm0 0v6h6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h4" />
      </svg>
    )
  }

  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return (
      <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zm0 0v6h6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 15h3m2 0h3M10 12v6" />
      </svg>
    )
  }

  return (
    <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zm0 0v6h6" />
    </svg>
  )
}

function PreviewPane({
  entry,
  previewContent,
  previewState,
  markdownPreviewEnabled,
  onToggleMarkdownPreview,
}: {
  entry: DirEntry | null
  previewContent: string
  previewState: 'idle' | 'loading' | 'ready' | 'unsupported'
  markdownPreviewEnabled: boolean
  onToggleMarkdownPreview: () => void
}) {
  if (!entry) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center text-claude-muted">
        <p className="text-sm">파일을 선택하면 여기에서 미리보기를 표시합니다.</p>
      </div>
    )
  }

  if (previewState === 'loading') {
    return (
      <div className="h-full flex items-center justify-center text-claude-muted">
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
        </svg>
      </div>
    )
  }

  if (previewState === 'unsupported') {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center text-claude-muted">
        <div>
          <p className="text-sm font-medium text-claude-text">{entry.name}</p>
          <p className="text-xs mt-2">이 파일 형식은 앱 내 미리보기를 지원하지 않습니다.</p>
        </div>
      </div>
    )
  }

  if (previewState === 'ready' && isMarkdownFile(entry.name) && markdownPreviewEnabled) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-sm font-medium text-claude-text truncate">{entry.name}</p>
          <button
            onClick={onToggleMarkdownPreview}
            className="flex-shrink-0 rounded-xl border border-claude-border px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          >
            원문
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const isInline = !className
                  if (isInline) {
                    return (
                      <code
                        className="rounded-md border border-claude-border bg-claude-surface-2 px-1.5 py-0.5 text-xs font-mono text-[#f0c49d]"
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  }
                  return (
                    <code className={`hljs ${className ?? ''}`} {...props}>
                      {children}
                    </code>
                  )
                },
                pre({ children }) {
                  return (
                    <pre className="!bg-transparent !p-0 overflow-x-auto">
                      {children}
                    </pre>
                  )
                }
              }}
            >
              {previewContent}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-claude-border bg-claude-surface px-4 py-3">
        <p className="text-sm font-medium text-claude-text truncate">{entry.name}</p>
        {isMarkdownFile(entry.name) && previewState === 'ready' && (
          <button
            onClick={onToggleMarkdownPreview}
            className="flex-shrink-0 rounded-xl border border-claude-border px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          >
            미리보기
          </button>
        )}
      </div>
      <pre className="m-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-xs font-mono text-claude-text">
        {previewContent}
      </pre>
    </div>
  )
}

function isMarkdownFile(name: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(name)
}

function isTextPreviewable(name: string): boolean {
  return /\.(txt|md|json|ya?ml|toml|xml|html|css|scss|ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|sh|zsh|env|sql|graphql|proto)$/i.test(name)
}

function WelcomeScreen({ onSelectFolder }: { onSelectFolder: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 pt-10 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[28px] border border-[#4d3c2f] bg-gradient-to-br from-[#2a221d] to-[#1d1916] shadow-[0_20px_40px_rgba(0,0,0,0.24)]">
        <span className="text-white text-2xl font-bold">C</span>
      </div>
      <h2 className="mb-2 text-3xl font-semibold tracking-tight text-claude-text">Claude UI</h2>
      <p className="mb-10 max-w-sm text-[15px] leading-7 text-claude-muted">
        Claude Code CLI 기반 코드 어시스턴트입니다.
      </p>

      <button
        onClick={onSelectFolder}
        className="mb-8 flex items-center gap-2 rounded-2xl bg-claude-orange px-5 py-3 text-sm font-medium text-white shadow-[0_10px_24px_rgba(201,139,91,0.28)] transition-colors hover:brightness-110"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        프로젝트 폴더 열기
      </button>

      <div className="grid w-full max-w-md grid-cols-2 gap-3 text-left">
        {[
          { icon: '💡', label: '코드 설명해줘', desc: '특정 코드의 동작 방식 이해' },
          { icon: '🐛', label: '버그 찾아줘', desc: '오류 원인 파악 및 수정' },
          { icon: '✨', label: '기능 추가해줘', desc: '새로운 기능 구현 요청' },
          { icon: '📋', label: '먼저 계획 세워줘', desc: '플랜 모드로 안전하게 검토' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-claude-border bg-claude-surface p-4 text-sm shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
            <div className="text-xl mb-1">{item.icon}</div>
            <div className="font-medium text-claude-text">{item.label}</div>
            <div className="text-xs text-claude-muted mt-0.5">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
