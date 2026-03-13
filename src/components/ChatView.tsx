import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { Diff, Hunk, parseDiff } from 'react-diff-view'
import type { Session, PermissionMode, SidebarMode } from '../store/sessions'
import { useSessionsStore } from '../store/sessions'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import type { DirEntry, GitBranchInfo, GitDiffResult, GitLogEntry, GitRepoStatus, GitStatusEntry, OpenWithApp, SelectedFile } from '../../electron/preload'
import { matchShortcut } from '../lib/shortcuts'
import vscodeIcon from '../assets/open-with/vscode.png'
import finderIcon from '../assets/open-with/finder.png'
import terminalIcon from '../assets/open-with/terminal.png'
import iterm2Icon from '../assets/open-with/iterm2.png'
import warpIcon from '../assets/open-with/warp.png'
import xcodeIcon from '../assets/open-with/xcode.png'
import intellijIdeaIcon from '../assets/open-with/intellij-idea.png'
import webstormIcon from '../assets/open-with/webstorm.png'
import welcomeTypingGif from '../assets/mascot/welcome-typing-transparent.gif'

type AskAboutSelectionPayload = {
  kind: 'diff' | 'code'
  path: string
  startLine: number
  endLine: number
  code: string
  prompt?: string
}

type Props = {
  session: Session
  fileConflict?: {
    paths: string[]
    sessionNames: string[]
  } | null
  onSend: (text: string, files: SelectedFile[]) => void
  onAbort: () => void
  onPermissionRequestAction: (action: 'once' | 'always' | 'deny') => void
  onQuestionResponse: (answer: string | null) => void
  sidebarMode: SidebarMode
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  sidebarShortcutLabel: string
  filesShortcutLabel: string
  sessionInfoShortcutLabel: string
  onSelectFolder: () => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
}

const INITIAL_RIGHT_PANEL_WIDTH = 290
const INITIAL_EXPLORER_WIDTH = 290
const INITIAL_GIT_LOG_PANEL_HEIGHT = 260
const INITIAL_GIT_COMMIT_PANEL_HEIGHT = 116

function areGitStatusEntriesEqual(a: GitStatusEntry | null, b: GitStatusEntry | null) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.path === b.path &&
    a.relativePath === b.relativePath &&
    (a.originalPath ?? null) === (b.originalPath ?? null) &&
    a.statusCode === b.statusCode &&
    a.stagedAdditions === b.stagedAdditions &&
    a.stagedDeletions === b.stagedDeletions &&
    a.unstagedAdditions === b.unstagedAdditions &&
    a.unstagedDeletions === b.unstagedDeletions &&
    a.totalAdditions === b.totalAdditions &&
    a.totalDeletions === b.totalDeletions &&
    a.staged === b.staged &&
    a.unstaged === b.unstaged &&
    a.untracked === b.untracked &&
    a.deleted === b.deleted &&
    a.renamed === b.renamed
  )
}

function areGitDiffResultsEqual(a: GitDiffResult | null, b: GitDiffResult | null) {
  if (a === b) return true
  if (!a || !b) return false
  return a.ok === b.ok && a.diff === b.diff && (a.error ?? null) === (b.error ?? null)
}

function areGitLogEntriesEqual(a: GitLogEntry | null, b: GitLogEntry | null) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.hash === b.hash &&
    a.shortHash === b.shortHash &&
    a.subject === b.subject &&
    a.author === b.author &&
    a.relativeDate === b.relativeDate &&
    a.decorations === b.decorations &&
    a.graph === b.graph
  )
}

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
  session, fileConflict, onSend, onAbort, onPermissionRequestAction, onQuestionResponse, sidebarMode, sidebarCollapsed, onToggleSidebar,
  sidebarShortcutLabel, filesShortcutLabel, sessionInfoShortcutLabel, onSelectFolder,
  onPermissionModeChange, onPlanModeChange, onModelChange, permissionShortcutLabel, bypassShortcutLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const openWithMenuRef = useRef<HTMLDivElement>(null)
  const branchMenuRef = useRef<HTMLDivElement>(null)
  const branchSearchInputRef = useRef<HTMLInputElement>(null)
  const branchCreateInputRef = useRef<HTMLInputElement>(null)
  const gitCommitTextareaRef = useRef<HTMLTextAreaElement>(null)
  const gitSidebarRef = useRef<HTMLDivElement>(null)
  const selectedGitEntryPathRef = useRef<string | null>(null)
  const selectedGitCommitHashRef = useRef<string | null>(null)
  const gitPanelRefreshInFlightRef = useRef(false)
  const gitPanelLastRefreshAtRef = useRef(0)
  const prevFilePanelOpenRef = useRef(false)
  const prevShowPreviewPaneRef = useRef(false)
  const lastMsg = session.messages[session.messages.length - 1]
  const [rightPanel, setRightPanel] = useState<'none' | 'files' | 'session' | 'git'>('none')
  const [rootEntries, setRootEntries] = useState<DirEntry[]>([])
  const [childEntries, setChildEntries] = useState<Record<string, DirEntry[]>>({})
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({})
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({})
  const [selectedEntry, setSelectedEntry] = useState<DirEntry | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'unsupported'>('idle')
  const [filePanelWidth, setFilePanelWidth] = useState(INITIAL_RIGHT_PANEL_WIDTH)
  const [explorerWidth, setExplorerWidth] = useState(INITIAL_EXPLORER_WIDTH)
  const [gitLogPanelHeight, setGitLogPanelHeight] = useState(INITIAL_GIT_LOG_PANEL_HEIGHT)
  const [gitCommitPanelHeight, setGitCommitPanelHeight] = useState(INITIAL_GIT_COMMIT_PANEL_HEIGHT)
  const [markdownPreviewEnabled, setMarkdownPreviewEnabled] = useState(true)
  const [openWithMenuOpen, setOpenWithMenuOpen] = useState(false)
  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([])
  const [openWithLoading, setOpenWithLoading] = useState(false)
  const [externalDraft, setExternalDraft] = useState<{ id: number; text: string } | null>(null)
  const [gitStatus, setGitStatus] = useState<GitRepoStatus | null>(null)
  const [gitLoading, setGitLoading] = useState(false)
  const [gitLog, setGitLog] = useState<GitLogEntry[]>([])
  const [gitLogLoading, setGitLogLoading] = useState(false)
  const [gitBranches, setGitBranches] = useState<GitBranchInfo[]>([])
  const [gitBranchesLoading, setGitBranchesLoading] = useState(false)
  const [selectedGitEntry, setSelectedGitEntry] = useState<GitStatusEntry | null>(null)
  const [selectedGitCommit, setSelectedGitCommit] = useState<GitLogEntry | null>(null)
  const [gitDiff, setGitDiff] = useState<GitDiffResult | null>(null)
  const [gitDiffLoading, setGitDiffLoading] = useState(false)
  const [gitActionLoading, setGitActionLoading] = useState(false)
  const [gitCommitMessage, setGitCommitMessage] = useState('')
  const [gitNewBranchName, setGitNewBranchName] = useState('')
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [branchQuery, setBranchQuery] = useState('')
  const [branchCreateModalOpen, setBranchCreateModalOpen] = useState(false)
  const preferredOpenWithAppId = useSessionsStore((state) => state.preferredOpenWithAppId)
  const setPreferredOpenWithAppId = useSessionsStore((state) => state.setPreferredOpenWithAppId)
  const isNewSession = session.messages.length === 0
  const showPreviewPane = selectedEntry !== null
  const filePanelOpen = rightPanel === 'files'
  const sessionPanelOpen = rightPanel === 'session'
  const gitPanelOpen = rightPanel === 'git'
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
  const showGitPreviewPane = selectedGitEntry !== null || selectedGitCommit !== null
  const gitAvailable = gitStatus?.gitAvailable ?? true
  const stagedGitEntryCount = gitStatus?.entries.filter((entry) => entry.staged).length ?? 0
  const fileConflictLabel = useMemo(() => {
    if (!fileConflict || fileConflict.paths.length === 0) return null
    const labels = fileConflict.paths.map((path) => path.split('/').filter(Boolean).pop() || path)
    if (labels.length === 1) return labels[0]
    if (labels.length === 2) return `${labels[0]}, ${labels[1]}`
    return `${labels[0]}, ${labels[1]} 외 ${labels.length - 2}개`
  }, [fileConflict])
  const conflictSessionLabel = useMemo(() => {
    if (!fileConflict || fileConflict.sessionNames.length === 0) return '다른 세션'
    if (fileConflict.sessionNames.length === 1) return fileConflict.sessionNames[0]
    return `${fileConflict.sessionNames[0]} 외 ${fileConflict.sessionNames.length - 1}개 세션`
  }, [fileConflict])
  const filteredGitBranches = useMemo(() => {
    const query = branchQuery.trim().toLowerCase()
    const branches = [...gitBranches].sort((a, b) => {
      if (a.current === b.current) return a.name.localeCompare(b.name)
      return a.current ? -1 : 1
    })
    if (!query) return branches
    return branches.filter((branch) => branch.name.toLowerCase().includes(query))
  }, [branchQuery, gitBranches])

  const handleAskAboutSelection = ({ kind, path, startLine, endLine, code, prompt }: AskAboutSelectionPayload) => {
    const lineLabel = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`
    const nextText = [
      prompt?.trim()
        ? kind === 'diff'
          ? '다음 변경 코드 줄을 기준으로 아래 요청을 처리해줘.'
          : '다음 코드 줄을 기준으로 아래 요청을 처리해줘.'
        : kind === 'diff'
          ? '다음 변경 코드 줄을 기준으로 다시 설명해줘.'
          : '다음 코드 줄을 기준으로 다시 설명해줘.',
      '',
      `파일: ${path}`,
      `줄: ${lineLabel}`,
      '```',
      code,
      '```',
      ...(prompt?.trim() ? ['', `요청: ${prompt.trim()}`] : []),
    ].join('\n')

    setExternalDraft({ id: Date.now(), text: nextText })
  }

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
    const textarea = gitCommitTextareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [gitCommitMessage, stagedGitEntryCount])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages.length, lastMsg?.text?.length, lastMsg?.thinking?.length, lastMsg?.toolCalls.length])

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
    if (!gitPanelOpen) return
    if (!showGitPreviewPane) {
      setFilePanelWidth(explorerWidth)
      return
    }

    const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
    const targetWidth = Math.min(1100, Math.max(explorerWidth + 180, Math.floor(containerWidth / 2)))
    setFilePanelWidth((current) => Math.max(current, targetWidth))
  }, [explorerWidth, gitPanelOpen, showGitPreviewPane])

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
    if (!branchMenuOpen) return

    let cancelled = false
    void refreshGitStatus(() => cancelled)
    void refreshGitBranches(() => cancelled)

    const focusTimer = window.setTimeout(() => {
      branchSearchInputRef.current?.focus()
      branchSearchInputRef.current?.select()
    }, 0)

    const handleMouseDown = (event: MouseEvent) => {
      if (branchMenuRef.current && event.target instanceof Node && !branchMenuRef.current.contains(event.target)) {
        setBranchMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBranchMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelled = true
      window.clearTimeout(focusTimer)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [branchMenuOpen])

  useEffect(() => {
    if (!branchCreateModalOpen) return

    const focusTimer = window.setTimeout(() => {
      branchCreateInputRef.current?.focus()
      branchCreateInputRef.current?.select()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBranchCreateModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [branchCreateModalOpen])

  useEffect(() => {
    if (!filePanelOpen) return
    let cancelled = false
    void refreshExplorer(true, () => cancelled)

    return () => { cancelled = true }
  }, [filePanelOpen, session.cwd])

  useEffect(() => {
    if (!gitPanelOpen) return

    void refreshGitPanel()

    const intervalId = window.setInterval(() => {
      void refreshGitPanelPassive()
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [gitPanelOpen, session.cwd])

  useEffect(() => {
    let cancelled = false
    void refreshGitStatus(() => cancelled)
    void refreshGitLog(() => cancelled)
    void refreshGitBranches(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [session.cwd])

  useEffect(() => {
    setSelectedEntry(null)
    setPreviewContent('')
    setPreviewState('idle')
    setMarkdownPreviewEnabled(true)
    setSelectedGitEntry(null)
    setSelectedGitCommit(null)
    setGitLog([])
    setGitDiff(null)
    setGitCommitMessage('')
    setGitNewBranchName('')
    setBranchMenuOpen(false)
    setBranchQuery('')
    setBranchCreateModalOpen(false)
    selectedGitEntryPathRef.current = null
    selectedGitCommitHashRef.current = null
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

  const refreshExplorer = async (resetExpanded: boolean, isCancelled?: () => boolean) => {
    setLoadingPaths((prev) => ({ ...prev, __root__: true }))

    try {
      const entries = await window.claude.listCurrentDir(session.cwd || '~')
      if (isCancelled?.()) return

      setRootEntries(entries)

      if (resetExpanded) {
        setChildEntries({})
        setExpandedDirs({})
        return
      }

      const expandedPaths = Object.entries(expandedDirs)
        .filter(([, expanded]) => expanded)
        .map(([path]) => path)

      if (expandedPaths.length === 0) return

      const refreshedChildren = await Promise.all(
        expandedPaths.map(async (path) => {
          try {
            const children = await window.claude.listCurrentDir(path)
            return [path, children] as const
          } catch {
            return [path, []] as const
          }
        })
      )

      if (isCancelled?.()) return
      setChildEntries(Object.fromEntries(refreshedChildren))
    } catch {
      if (isCancelled?.()) return
      setRootEntries([])
      if (resetExpanded) {
        setChildEntries({})
        setExpandedDirs({})
      }
    } finally {
      if (!isCancelled?.()) {
        setLoadingPaths((prev) => ({ ...prev, __root__: false }))
      }
    }
  }

  const refreshGitStatus = async (isCancelled?: () => boolean, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent || !gitStatus) {
      setGitLoading(true)
    }
    try {
      const nextStatus = await window.claude.getGitStatus(session.cwd || '~')
      if (isCancelled?.()) return
      setGitStatus(nextStatus)
      const selectedPath = selectedGitEntryPathRef.current
      const nextSelectedEntry = selectedPath && nextStatus.isRepo
        ? nextStatus.entries.find((entry) => entry.path === selectedPath) ?? null
        : null
      setSelectedGitEntry((prev) => (areGitStatusEntriesEqual(prev, nextSelectedEntry) ? prev : nextSelectedEntry))
      selectedGitEntryPathRef.current = nextSelectedEntry?.path ?? null
      if (!nextSelectedEntry && !selectedGitCommitHashRef.current) {
        setGitDiff(null)
      }
      return nextStatus
    } catch {
      if (isCancelled?.()) return
      const fallbackStatus = {
        gitAvailable: false,
        isRepo: false,
        rootPath: null,
        branch: null,
        ahead: 0,
        behind: 0,
        clean: true,
        entries: [],
      }
      setGitStatus(fallbackStatus)
      setSelectedGitEntry(null)
      selectedGitEntryPathRef.current = null
      if (!selectedGitCommitHashRef.current) {
        setGitDiff(null)
      }
      return fallbackStatus
    } finally {
      if (!isCancelled?.() && (!silent || !gitStatus)) setGitLoading(false)
    }
  }

  const refreshGitLog = async (isCancelled?: () => boolean, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent || gitLog.length === 0) {
      setGitLogLoading(true)
    }
    try {
      const result = await window.claude.getGitLog({ cwd: session.cwd || '~' })
      if (isCancelled?.()) return
      const nextEntries = result.ok ? result.entries : []
      setGitLog(nextEntries)
      const selectedHash = selectedGitCommitHashRef.current
      const nextSelectedCommit = selectedHash
        ? nextEntries.find((entry) => entry.hash === selectedHash) ?? null
        : null
      setSelectedGitCommit((prev) => (areGitLogEntriesEqual(prev, nextSelectedCommit) ? prev : nextSelectedCommit))
      selectedGitCommitHashRef.current = nextSelectedCommit?.hash ?? null
      if (!nextSelectedCommit && !selectedGitEntryPathRef.current) {
        setGitDiff(null)
      }
      return nextEntries
    } catch {
      if (isCancelled?.()) return
      setGitLog([])
      setSelectedGitCommit(null)
      selectedGitCommitHashRef.current = null
      if (!selectedGitEntryPathRef.current) {
        setGitDiff(null)
      }
      return []
    } finally {
      if (!isCancelled?.() && (!silent || gitLog.length === 0)) setGitLogLoading(false)
    }
  }

  const refreshGitBranches = async (isCancelled?: () => boolean, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent || gitBranches.length === 0) {
      setGitBranchesLoading(true)
    }
    try {
      const result = await window.claude.getGitBranches(session.cwd || '~')
      if (isCancelled?.()) return
      setGitBranches(result.ok ? result.branches : [])
    } catch {
      if (isCancelled?.()) return
      setGitBranches([])
    } finally {
      if (!isCancelled?.() && (!silent || gitBranches.length === 0)) setGitBranchesLoading(false)
    }
  }

  const handleSelectGitEntry = async (entry: GitStatusEntry) => {
    if (selectedGitEntry?.path === entry.path) {
      setSelectedGitEntry(null)
      selectedGitEntryPathRef.current = null
      setGitDiff(null)
      return
    }

    selectedGitEntryPathRef.current = entry.path
    selectedGitCommitHashRef.current = null
    setSelectedGitEntry(entry)
    setSelectedGitCommit(null)
    setGitDiffLoading(true)
    try {
      const nextDiff = await window.claude.getGitDiff({ cwd: session.cwd || '~', filePath: entry.path })
      setGitDiff(nextDiff)
    } catch {
      setGitDiff({ ok: false, diff: '', error: 'diff를 불러오지 못했습니다.' })
    } finally {
      setGitDiffLoading(false)
    }
  }

  const handleSelectGitCommit = async (entry: GitLogEntry) => {
    if (selectedGitCommit?.hash === entry.hash) {
      setSelectedGitCommit(null)
      selectedGitCommitHashRef.current = null
      setGitDiff(null)
      return
    }

    selectedGitCommitHashRef.current = entry.hash
    selectedGitEntryPathRef.current = null
    setSelectedGitCommit(entry)
    setSelectedGitEntry(null)
    setGitDiffLoading(true)
    try {
      const nextDiff = await window.claude.getGitCommitDiff({ cwd: session.cwd || '~', commitHash: entry.hash })
      setGitDiff(nextDiff)
    } catch {
      setGitDiff({ ok: false, diff: '', error: '커밋 diff를 불러오지 못했습니다.' })
    } finally {
      setGitDiffLoading(false)
    }
  }

  const refreshGitPanel = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    const [nextStatus, nextLogEntries] = await Promise.all([
      refreshGitStatus(undefined, { silent }),
      refreshGitLog(undefined, { silent }),
      refreshGitBranches(undefined, { silent }),
    ])
    if (!nextStatus) return
    const selectedPath = selectedGitEntryPathRef.current
    const selectedCommitHash = selectedGitCommitHashRef.current
    if (selectedPath) {
      const nextEntry = nextStatus.isRepo
        ? nextStatus.entries.find((entry) => entry.path === selectedPath) ?? null
        : null
      setSelectedGitEntry((prev) => (areGitStatusEntriesEqual(prev, nextEntry) ? prev : nextEntry))
      selectedGitEntryPathRef.current = nextEntry?.path ?? null
      if (nextEntry) {
        if (silent) {
          return
        }

        if (!gitDiff) {
          setGitDiffLoading(true)
        }
        try {
          const nextDiff = await window.claude.getGitDiff({ cwd: session.cwd || '~', filePath: nextEntry.path })
          setGitDiff((prev) => (areGitDiffResultsEqual(prev, nextDiff) ? prev : nextDiff))
        } catch {
          const nextDiff = { ok: false as const, diff: '', error: 'diff를 불러오지 못했습니다.' }
          setGitDiff((prev) => (areGitDiffResultsEqual(prev, nextDiff) ? prev : nextDiff))
        } finally {
          if (!gitDiff) {
            setGitDiffLoading(false)
          }
        }
      } else {
        setGitDiff(null)
      }
      return
    }

    if (selectedCommitHash) {
      const nextCommit = nextLogEntries?.find((entry) => entry.hash === selectedCommitHash) ?? null
      setSelectedGitCommit((prev) => (areGitLogEntriesEqual(prev, nextCommit) ? prev : nextCommit))
      selectedGitCommitHashRef.current = nextCommit?.hash ?? null
      if (!nextCommit) {
        setGitDiff(null)
        return
      }
      if (!silent) {
        if (!gitDiff) {
          setGitDiffLoading(true)
        }
        try {
          const nextDiff = await window.claude.getGitCommitDiff({ cwd: session.cwd || '~', commitHash: nextCommit.hash })
          setGitDiff((prev) => (areGitDiffResultsEqual(prev, nextDiff) ? prev : nextDiff))
        } catch {
          const nextDiff = { ok: false as const, diff: '', error: '커밋 diff를 불러오지 못했습니다.' }
          setGitDiff((prev) => (areGitDiffResultsEqual(prev, nextDiff) ? prev : nextDiff))
        } finally {
          if (!gitDiff) {
            setGitDiffLoading(false)
          }
        }
      }
    }
  }

  const refreshGitPanelPassive = async (throttleMs = 0) => {
    const now = Date.now()
    if (gitPanelRefreshInFlightRef.current) return
    if (throttleMs > 0 && now - gitPanelLastRefreshAtRef.current < throttleMs) return

    gitPanelRefreshInFlightRef.current = true
    gitPanelLastRefreshAtRef.current = now
    try {
      await Promise.all([
        refreshGitStatus(undefined, { silent: true }),
        refreshGitBranches(undefined, { silent: true }),
      ])
    } finally {
      gitPanelRefreshInFlightRef.current = false
    }
  }

  const handleGitPanelPointerDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (!gitPanelOpen) return
    if (!(event.target instanceof HTMLElement)) return
    if (event.target.closest('button, input, textarea, select, option, label, a, [data-git-resize="true"]')) return
    void refreshGitPanelPassive(350)
  }

  const handleToggleGitStage = async (entry: GitStatusEntry, staged?: boolean) => {
    const shouldStage = staged ?? shouldStageGitEntry(entry)
    setGitActionLoading(true)
    try {
      const result = await window.claude.setGitStaged({
        cwd: session.cwd || '~',
        filePath: entry.path,
        staged: shouldStage,
      })
      if (!result.ok) {
        window.alert(result.error ?? 'Git 상태를 바꾸지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleRestoreGitEntry = async (entry: GitStatusEntry) => {
    const actionLabel = entry.untracked
      ? `'${entry.relativePath}' 파일을 삭제`
      : `'${entry.relativePath}'의 변경을 되돌리기`
    if (!window.confirm(`${actionLabel}할까요?`)) return

    setGitActionLoading(true)
    try {
      const result = await window.claude.restoreGitFile({
        cwd: session.cwd || '~',
        filePath: entry.path,
      })
      if (!result.ok) {
        window.alert(result.error ?? '파일을 되돌리지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleRestoreGitEntries = async (entries: GitStatusEntry[]) => {
    if (entries.length === 0) return
    if (!window.confirm(`표시된 ${entries.length}개 파일의 변경을 모두 되돌릴까요?`)) return

    setGitActionLoading(true)
    try {
      for (const entry of entries) {
        const result = await window.claude.restoreGitFile({
          cwd: session.cwd || '~',
          filePath: entry.path,
        })
        if (!result.ok) {
          window.alert(result.error ?? `'${entry.relativePath}' 파일을 되돌리지 못했습니다.`)
          return
        }
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleStageGitEntries = async (entries: GitStatusEntry[]) => {
    if (entries.length === 0) return

    setGitActionLoading(true)
    try {
      for (const entry of entries) {
        if (!shouldStageGitEntry(entry)) continue
        const result = await window.claude.setGitStaged({
          cwd: session.cwd || '~',
          filePath: entry.path,
          staged: true,
        })
        if (!result.ok) {
          window.alert(result.error ?? `'${entry.relativePath}' 파일을 스테이징하지 못했습니다.`)
          return
        }
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleUnstageGitEntries = async (entries: GitStatusEntry[]) => {
    if (entries.length === 0) return

    setGitActionLoading(true)
    try {
      for (const entry of entries) {
        if (!entry.staged) continue
        const result = await window.claude.setGitStaged({
          cwd: session.cwd || '~',
          filePath: entry.path,
          staged: false,
        })
        if (!result.ok) {
          window.alert(result.error ?? `'${entry.relativePath}' 파일을 언스테이징하지 못했습니다.`)
          return
        }
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleCommitGit = async () => {
    const message = gitCommitMessage.trim()
    if (!message) return
    setGitActionLoading(true)
    try {
      const result = await window.claude.commitGit({ cwd: session.cwd || '~', message })
      if (!result.ok) {
        window.alert(result.error ?? '커밋하지 못했습니다.')
        return
      }
      setGitCommitMessage('')
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleSwitchGitBranch = async (name: string) => {
    if (!name || gitStatus?.branch === name) return
    setGitActionLoading(true)
    try {
      const result = await window.claude.switchGitBranch({ cwd: session.cwd || '~', name })
      if (!result.ok) {
        window.alert(result.error ?? '브랜치를 전환하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleCreateGitBranch = async () => {
    const name = gitNewBranchName.trim()
    if (!name) return
    setGitActionLoading(true)
    try {
      const result = await window.claude.createGitBranch({ cwd: session.cwd || '~', name })
      if (!result.ok) {
        window.alert(result.error ?? '브랜치를 생성하지 못했습니다.')
        return
      }
      setBranchCreateModalOpen(false)
      setGitNewBranchName('')
      setBranchMenuOpen(false)
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleOpenBranchCreateModal = () => {
    setBranchMenuOpen(false)
    setBranchQuery('')
    setBranchCreateModalOpen(true)
  }

  const handlePullGit = async () => {
    setGitActionLoading(true)
    try {
      const result = await window.claude.pullGit({ cwd: session.cwd || '~' })
      if (!result.ok) {
        window.alert(result.error ?? 'git pull을 실행하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handlePushGit = async () => {
    setGitActionLoading(true)
    try {
      const result = await window.claude.pushGit({ cwd: session.cwd || '~' })
      if (!result.ok) {
        window.alert(result.error ?? 'git push를 실행하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleDeleteGitBranch = async (name: string) => {
    if (!window.confirm(`브랜치 '${name}'를 삭제할까요?`)) return
    setGitActionLoading(true)
    try {
      const result = await window.claude.deleteGitBranch({ cwd: session.cwd || '~', name })
      if (!result.ok) {
        window.alert(result.error ?? '브랜치를 삭제하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleInitGitRepo = async () => {
    setGitActionLoading(true)
    try {
      const result = await window.claude.initGitRepo({ cwd: session.cwd || '~' })
      if (!result.ok) {
        window.alert(result.error ?? 'git init을 실행하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleFilePanelResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = filePanelWidth
    const minimumWidth = showPreviewPane || showGitPreviewPane ? Math.max(320, explorerWidth + 140) : explorerWidth

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

  const handleGitLogResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = gitLogPanelHeight
    const sidebarHeight = gitSidebarRef.current?.clientHeight ?? 0
    const maxHeight = Math.max(120, sidebarHeight - gitCommitPanelHeight - 180)

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = Math.min(maxHeight, Math.max(96, startHeight + (moveEvent.clientY - startY)))
      setGitLogPanelHeight(nextHeight)
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleGitCommitResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = gitCommitPanelHeight
    const sidebarHeight = gitSidebarRef.current?.clientHeight ?? 0
    const maxHeight = Math.max(108, sidebarHeight - gitLogPanelHeight - 180)

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = Math.min(maxHeight, Math.max(92, startHeight - (moveEvent.clientY - startY)))
      setGitCommitPanelHeight(nextHeight)
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
          className="draggable-region relative z-30 flex h-12 flex-shrink-0 items-center justify-between border-b border-claude-border bg-claude-panel pr-4"
          style={{ paddingLeft: sidebarCollapsed ? '76px' : '16px' }}
          onDoubleClick={handleHeaderDoubleClick}
        >
          <div
            className="flex min-w-0 flex-1 items-center gap-2 overflow-visible px-2 py-1.5 text-xs text-claude-muted"
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
            <span className="min-w-0 max-w-sm truncate font-mono text-[12px] text-claude-muted">
              {session.cwd || '~'}
            </span>
            {gitStatus?.isRepo && gitStatus.branch ? (
              <div ref={branchMenuRef} className="relative z-40 no-drag" data-no-drag="true">
                <button
                  type="button"
                  onClick={() => {
                    setBranchMenuOpen((open) => {
                      const nextOpen = !open
                      if (nextOpen) setBranchQuery('')
                      return nextOpen
                    })
                  }}
                  className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-claude-border bg-claude-surface px-2 py-1 font-mono text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2"
                  title="브랜치 선택"
                >
                  <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12-5a2 2 0 1 1 0 4 2 2 0 0 1 0-4M8 7h4a4 4 0 0 1 4 4M8 17h4a4 4 0 0 0 4-4" />
                  </svg>
                  <span className="min-w-0 truncate">{gitStatus.branch}</span>
                  {gitStatus.behind > 0 && (
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                  )}
                  {gitStatus.ahead > 0 && (
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                  )}
                  <svg className={`h-3.5 w-3.5 flex-shrink-0 text-claude-muted transition-transform ${branchMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {branchMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-[268px] rounded-[18px] border border-claude-border bg-claude-panel p-2 shadow-2xl">
                    <div className="flex items-center gap-1.5">
                      <div className="relative min-w-0 flex-1">
                        <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <circle cx="11" cy="11" r="7" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="m20 20-3.5-3.5" />
                        </svg>
                        <input
                          ref={branchSearchInputRef}
                          value={branchQuery}
                          onChange={(event) => setBranchQuery(event.target.value)}
                          placeholder="브랜치 검색"
                          className="w-full rounded-xl border border-claude-border bg-claude-surface py-1.5 pl-9 pr-3 text-[11px] text-claude-text outline-none placeholder:text-claude-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconTooltipButton
                          type="button"
                          onClick={() => void handlePullGit()}
                          disabled={gitActionLoading || gitLoading}
                          tooltip={gitStatus.behind > 0 ? `Pull(${gitStatus.behind})` : 'Pull'}
                          tooltipAlign="right"
                          className="flex h-6.5 w-6.5 items-center justify-center rounded-lg transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
                        >
                          <svg className={`h-3.5 w-3.5 ${gitStatus.behind > 0 ? 'text-amber-400' : 'text-claude-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="m7 11 5 5 5-5" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 20h14" />
                          </svg>
                        </IconTooltipButton>
                        <IconTooltipButton
                          type="button"
                          onClick={() => void handlePushGit()}
                          disabled={gitActionLoading || gitLoading}
                          tooltip={gitStatus.ahead > 0 ? `Push(${gitStatus.ahead})` : 'Push'}
                          tooltipAlign="right"
                          className="flex h-6.5 w-6.5 items-center justify-center rounded-lg transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
                        >
                          <svg className={`h-3.5 w-3.5 ${gitStatus.ahead > 0 ? 'text-blue-400' : 'text-claude-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V8" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="m7 13 5-5 5 5" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h14" />
                          </svg>
                        </IconTooltipButton>
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <p className="px-2 text-[11px] font-semibold tracking-wide text-claude-muted">브랜치</p>
                      <div className="mt-1.5 h-[144px] overflow-y-auto">
                        {gitBranchesLoading ? (
                          <div className="flex items-center justify-center px-3 py-10 text-claude-muted">
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                            </svg>
                          </div>
                        ) : filteredGitBranches.length === 0 ? (
                          <div className="px-3 py-8 text-sm text-claude-muted">
                            {branchQuery.trim() ? '검색 결과가 없습니다.' : '표시할 브랜치가 없습니다.'}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {filteredGitBranches.map((branch) => (
                              <div
                                key={branch.name}
                                className="flex items-start gap-1 rounded-xl px-1 py-0.5 transition-colors hover:bg-claude-surface"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBranchMenuOpen(false)
                                    void handleSwitchGitBranch(branch.name)
                                  }}
                                  disabled={gitActionLoading}
                                  className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-1.5 py-1 text-left disabled:opacity-50"
                                >
                                  <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12-5a2 2 0 1 1 0 4 2 2 0 0 1 0-4M8 7h4a4 4 0 0 1 4 4M8 17h4a4 4 0 0 0 4-4" />
                                  </svg>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[12px] font-medium leading-none text-claude-text">{branch.name}</p>
                                    <p className="mt-1 text-[10px] text-claude-muted">
                                      {branch.current
                                        ? gitStatus.clean
                                          ? '커밋하지 않음: 변경 없음'
                                          : `커밋하지 않음: ${gitStatus.entries.length}개의 파일`
                                        : '로컬 브랜치'}
                                    </p>
                                  </div>
                                  {branch.current && (
                                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-claude-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>

                                {!branch.current && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void handleDeleteGitBranch(branch.name)
                                    }}
                                    disabled={gitActionLoading}
                                    className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-50"
                                    title="브랜치 삭제"
                                  >
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4.75A1.75 1.75 0 0 1 9.75 3h4.5A1.75 1.75 0 0 1 16 4.75V6" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6l.9 12.15A2 2 0 0 0 9.39 20h5.22a2 2 0 0 0 1.99-1.85L17.5 6" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 10.5v5M14 10.5v5" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 border-t border-claude-border pt-2">
                      <button
                        type="button"
                        onClick={handleOpenBranchCreateModal}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12px] font-medium text-claude-text transition-colors hover:bg-claude-surface"
                      >
                        <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                        </svg>
                        새 브랜치 생성 및 체크아웃...
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : gitStatus?.gitAvailable === false ? (
              <div
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-claude-border bg-claude-surface px-2 py-1 font-mono text-[11px] text-claude-muted opacity-65"
                title="Git을 설치하세요"
              >
                <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12-5a2 2 0 1 1 0 4 2 2 0 0 1 0-4M8 7h4a4 4 0 0 1 4 4M8 17h4a4 4 0 0 0 4-4" />
                </svg>
                <span className="min-w-0 truncate">Git</span>
              </div>
            ) : gitStatus && !gitStatus.isRepo ? (
              <button
                type="button"
                onClick={() => void handleInitGitRepo()}
                disabled={gitActionLoading}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-claude-border bg-claude-surface px-2 py-1 font-mono text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
                title="현재 폴더에서 Git 초기화"
              >
                <span className="min-w-0 truncate">Git init</span>
              </button>
            ) : null}
          </div>

          <div className="no-drag flex flex-shrink-0 items-center gap-2" data-no-drag="true">
            <div ref={openWithMenuRef} className="relative" data-no-drag="true">
              <div className="flex overflow-hidden rounded-lg border border-claude-border bg-claude-surface">
                <button
                  onClick={() => void handleDefaultOpen()}
                  disabled={openWithApps.length === 0}
                  className="inline-flex items-center gap-1.5 bg-claude-surface px-2 py-1 font-mono text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-claude-surface"
                  title={defaultOpenWithApp ? `${defaultOpenWithApp.label}에서 열기` : '기본 앱으로 열기'}
                >
                  <OpenWithAppIcon app={defaultOpenWithApp} />
                  <span>열기</span>
                </button>
                <button
                  onClick={() => setOpenWithMenuOpen((open) => !open)}
                  disabled={openWithApps.length === 0}
                  className={`border-l border-claude-border px-2 py-1 text-claude-text transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-claude-surface ${
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
                <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-3xl border border-claude-border bg-claude-panel p-2">
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
                            <svg className="h-4 w-4 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
          {gitAvailable && (
            <button
              onClick={() => setRightPanel((open) => open === 'git' ? 'none' : 'git')}
              className={`flex items-center justify-center rounded-xl px-2.5 py-2 text-xs transition-colors ${
                gitPanelOpen
                  ? 'bg-claude-surface text-claude-text'
                  : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
              }`}
              title="git diff 보기"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 15h8" />
              </svg>
            </button>
          )}
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
        <div
          className="relative z-0 min-w-0 flex-1 overflow-y-auto px-6 py-7"
          style={{ background: 'linear-gradient(180deg, rgb(var(--claude-panel)) 0%, rgb(var(--claude-bg)) 100%)' }}
        >
          <div className={`mx-auto w-full max-w-[860px] ${isNewSession ? 'min-h-full' : ''}`}>
            {fileConflict && fileConflictLabel && (
              <div className="mb-4 rounded-2xl border border-red-900/35 bg-red-950/15 px-4 py-3 text-sm text-red-100">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-xl bg-red-950/30 text-red-200/80">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-red-100">같은 파일을 다른 세션에서도 수정 중입니다.</p>
                    <p className="mt-1 text-[13px] leading-5 text-red-100/75">
                      {fileConflictLabel} · {conflictSessionLabel}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {isNewSession
              ? <WelcomeScreen onSelectFolder={onSelectFolder} />
              : session.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isStreaming={session.isStreaming && msg.id === session.currentAssistantMsgId}
                    onAbort={session.isStreaming && msg.id === session.currentAssistantMsgId ? onAbort : undefined}
                    onAskAboutSelection={handleAskAboutSelection}
                  />
                ))
            }

            {showErrorCard && (
              <div className="mb-4 flex justify-start">
                <div className="flex max-w-[88%] gap-3.5">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-claude-border bg-claude-surface text-[11px] font-semibold text-claude-text">
                    C
                  </div>
                  <div className="rounded-[22px] rounded-tl-md border border-red-900/60 bg-red-950/30 px-4 py-3.5">
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
          permissionShortcutLabel={permissionShortcutLabel}
          bypassShortcutLabel={bypassShortcutLabel}
          externalDraft={externalDraft}
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
          onMouseDown={handleGitPanelPointerDown}
          className="flex min-w-0 flex-shrink-0 flex-col border-l border-claude-border bg-claude-panel"
          style={{ width: `${filePanelWidth}px` }}
        >
          <div className="flex h-12 items-center justify-between border-b border-claude-border px-4">
            <p className="text-sm font-semibold text-claude-text">
              {filePanelOpen ? '파일 탐색기' : gitPanelOpen ? 'Git' : '세션 정보'}
            </p>
            {(filePanelOpen || gitPanelOpen) && (
              <button
                onClick={() => void (filePanelOpen ? refreshExplorer(false) : refreshGitPanel())}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                title={filePanelOpen ? '파일 탐색기 새로고침' : 'Git 상태 새로고침'}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 3v6h-6" />
                </svg>
              </button>
            )}
          </div>

          {filePanelOpen ? (
            <div className="flex flex-1 min-h-0">
              {showPreviewPane && (
                <>
                  <div className="min-w-0 flex-1 overflow-y-auto bg-claude-bg">
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
          ) : gitPanelOpen ? (
            <div className="flex flex-1 min-h-0 flex-col">
              <div className="flex min-h-0 flex-1">
                {showGitPreviewPane && (
                  <>
                    <div className="min-w-0 flex-1 overflow-y-auto bg-claude-bg">
                      <GitDiffPanel
                        cwd={gitStatus?.rootPath ?? session.cwd ?? '~'}
                        entry={selectedGitEntry}
                        commit={selectedGitCommit}
                        gitDiff={gitDiff}
                        loading={gitDiffLoading}
                      />
                    </div>

                    <div
                      onMouseDown={handleExplorerResizeStart}
                      className="w-1.5 cursor-col-resize bg-transparent hover:bg-claude-border/80 transition-colors flex-shrink-0"
                    />
                  </>
                )}

                <div
                  ref={gitSidebarRef}
                  className={`min-w-0 flex h-full min-h-0 flex-col ${showGitPreviewPane ? 'border-l border-claude-border bg-claude-panel' : 'flex-1 bg-claude-panel'}`}
                  style={showGitPreviewPane ? { width: `${explorerWidth}px` } : undefined}
                >
                  {gitStatus?.isRepo ? (
                    <div className="flex h-full min-h-0 flex-col">
                      <div className="min-h-0 shrink-0 px-3 pt-3" style={{ height: `${gitLogPanelHeight}px` }}>
                        <GitLogPanel
                          status={gitStatus}
                          gitLog={gitLog}
                          loading={gitLogLoading}
                          actionLoading={gitActionLoading || gitLoading}
                          selectedCommitHash={selectedGitCommit?.hash ?? null}
                          onSelectCommit={handleSelectGitCommit}
                          onPull={handlePullGit}
                          onPush={handlePushGit}
                        />
                      </div>

                      <div
                        onMouseDown={handleGitLogResizeStart}
                        data-git-resize="true"
                        className="h-1.5 shrink-0 cursor-row-resize bg-transparent hover:bg-claude-border/80 transition-colors"
                      />

                      <div className="min-h-0 flex-1 overflow-y-auto border-t border-claude-border px-2 py-3">
                        <GitStatusPanel
                          status={gitStatus}
                          loading={gitLoading}
                          selectedPath={selectedGitEntry?.path ?? null}
                          actionLoading={gitActionLoading}
                          onSelectEntry={handleSelectGitEntry}
                          onToggleStage={handleToggleGitStage}
                          onRestoreEntry={handleRestoreGitEntry}
                          onRestoreEntries={handleRestoreGitEntries}
                          onStageEntries={handleStageGitEntries}
                          onUnstageEntries={handleUnstageGitEntries}
                        />
                      </div>

                      <div
                        onMouseDown={handleGitCommitResizeStart}
                        data-git-resize="true"
                        className="h-1.5 shrink-0 cursor-row-resize bg-transparent hover:bg-claude-border/80 transition-colors"
                      />

                      <div
                        className="shrink-0 border-t border-claude-border bg-claude-panel px-3 py-3"
                        style={{ height: `${gitCommitPanelHeight}px` }}
                      >
                        <div className="flex h-full min-h-0 flex-col">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-[11px] text-claude-muted">
                              <span>스테이징됨</span>
                              <span className="inline-flex h-[17px] min-w-[20px] items-center justify-center rounded-full border border-claude-border/70 bg-claude-surface px-1.5 text-[10px] font-semibold leading-none text-claude-text">
                                {stagedGitEntryCount}
                              </span>
                            </div>
                            {stagedGitEntryCount === 0 && (
                              <span className="text-[11px] text-claude-muted">커밋할 파일을 먼저 스테이징하세요</span>
                            )}
                          </div>

                          <div className="flex min-h-0 flex-1 items-end gap-2">
                            <textarea
                              ref={gitCommitTextareaRef}
                              value={gitCommitMessage}
                              onChange={(event) => setGitCommitMessage(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                  event.preventDefault()
                                  void handleCommitGit()
                                }
                              }}
                              rows={1}
                              disabled={gitActionLoading || stagedGitEntryCount === 0}
                              placeholder={stagedGitEntryCount > 0 ? '커밋 메시지 입력' : '스테이징된 파일이 없습니다'}
                              className="max-h-40 min-h-[36px] flex-1 resize-none overflow-hidden rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-[12px] text-claude-text outline-none placeholder:text-claude-muted disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <button
                              type="button"
                              onClick={() => void handleCommitGit()}
                              disabled={gitActionLoading || stagedGitEntryCount === 0 || gitCommitMessage.trim().length === 0}
                              title="커밋"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-claude-border bg-claude-surface text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M1.75 8h3.1m6.3 0h3.1" />
                                <circle cx="8" cy="8" r="3.15" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
                      <GitStatusPanel
                        status={gitStatus}
                        loading={gitLoading}
                        selectedPath={selectedGitEntry?.path ?? null}
                        actionLoading={gitActionLoading}
                        onSelectEntry={handleSelectGitEntry}
                        onToggleStage={handleToggleGitStage}
                        onRestoreEntry={handleRestoreGitEntry}
                        onRestoreEntries={handleRestoreGitEntries}
                        onStageEntries={handleStageGitEntries}
                        onUnstageEntries={handleUnstageGitEntries}
                      />
                    </div>
                  )}
                </div>
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

      {branchCreateModalOpen && (
        <div
          className="no-drag absolute inset-0 z-40 flex items-center justify-center bg-black/45 px-6 backdrop-blur-sm"
          data-no-drag="true"
          onMouseDown={() => setBranchCreateModalOpen(false)}
        >
          <div
            className="w-full max-w-[312px] rounded-[18px] border border-claude-border bg-claude-panel p-3"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[12px] font-semibold text-claude-text">새 브랜치 생성 및 체크아웃</h3>
                <p className="mt-1 text-[10px] leading-4.5 text-claude-muted">브랜치 이름을 입력하면 자동으로 체크아웃합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setBranchCreateModalOpen(false)}
                className="rounded-xl p-2 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                title="닫기"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-claude-muted">브랜치 이름</label>
              <input
                ref={branchCreateInputRef}
                value={gitNewBranchName}
                onChange={(event) => setGitNewBranchName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleCreateGitBranch()
                  }
                }}
                placeholder="예: feature/header-branch-menu"
                className="w-full rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-[12px] text-claude-text outline-none placeholder:text-claude-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
              />
            </div>

            <div className="mt-3.5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setBranchCreateModalOpen(false)}
                className="rounded-xl border border-claude-border bg-claude-surface px-3 py-1.5 text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleCreateGitBranch()}
                disabled={gitActionLoading || !gitNewBranchName.trim()}
                className="rounded-xl border border-claude-border bg-claude-surface px-3 py-1.5 text-[11px] font-medium text-claude-text transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
              >
                생성 후 전환
              </button>
            </div>
          </div>
        </div>
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
      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
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

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
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
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-claude-bg">
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

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
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
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
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
            ? 'bg-claude-surface-2 text-claude-text ring-1 ring-white/10'
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
            <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const encodedPath = encodeURI(normalized).replace(/\?/g, '%3F').replace(/#/g, '%23')

  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodedPath}`
  }

  return normalized.startsWith('/') ? `file://${encodedPath}` : `file:///${encodedPath}`
}

function joinPreviewPath(basePath: string, relativePath: string): string {
  if (!relativePath) return basePath
  if (/^[A-Za-z]:[\\/]/.test(relativePath) || relativePath.startsWith('/')) return relativePath

  const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '')
  return `${normalizedBase}/${normalizedRelative}`
}

function resolveMarkdownPreviewUrl(baseFilePath: string, url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return toFileUrl(trimmed)
  }

  if (
    trimmed.startsWith('#')
    || trimmed.startsWith('//')
    || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
  ) {
    return trimmed
  }

  try {
    return new URL(trimmed, toFileUrl(baseFilePath)).href
  } catch {
    return trimmed
  }
}

function fileUrlToPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'file:') return null

    const decodedPath = decodeURIComponent(parsed.pathname)
    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      return decodedPath.slice(1)
    }

    return decodedPath
  } catch {
    return null
  }
}

function normalizeMarkdownImageReference(reference: string): string {
  const trimmed = reference.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1)
  }

  const titleSeparated = trimmed.match(/^(\S+)\s+["'(]/)
  return titleSeparated ? titleSeparated[1] : trimmed
}

function extractMarkdownImageUrls(markdown: string): string[] {
  const urls = new Set<string>()

  for (const match of markdown.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1]?.trim()
    if (src) urls.add(src)
  }

  for (const match of markdown.matchAll(/!\[[^\]]*]\(([^)\n]+)\)/g)) {
    const src = normalizeMarkdownImageReference(match[1] ?? '')
    if (src) urls.add(src)
  }

  return [...urls]
}

function MarkdownPreviewBody({ filePath, content }: { filePath: string; content: string }) {
  const [markdownImageDataUrls, setMarkdownImageDataUrls] = useState<Record<string, string>>({})
  const markdownImageSources = useMemo(() => (
    extractMarkdownImageUrls(content)
      .map((url) => resolveMarkdownPreviewUrl(filePath, url))
      .filter((url, index, all) => url.startsWith('file://') && all.indexOf(url) === index)
  ), [content, filePath])

  useEffect(() => {
    let cancelled = false

    if (markdownImageSources.length === 0) {
      setMarkdownImageDataUrls({})
      return
    }

    void (async () => {
      const pairs = await Promise.all(
        markdownImageSources.map(async (sourceUrl) => {
          const resolvedPath = fileUrlToPath(sourceUrl)
          if (!resolvedPath) return null
          const dataUrl = await window.claude.readFileDataUrl(resolvedPath)
          return dataUrl ? [sourceUrl, dataUrl] as const : null
        })
      )

      if (cancelled) return

      setMarkdownImageDataUrls(
        Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair !== null))
      )
    })()

    return () => {
      cancelled = true
    }
  }, [markdownImageSources])

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => resolveMarkdownPreviewUrl(filePath, url)}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className
            if (isInline) {
              return (
                <code
                  className="rounded-md border border-claude-border bg-claude-surface-2 px-1.5 py-0.5 text-xs font-mono text-claude-text"
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
          img({ src = '', alt = '', ...props }) {
            const resolvedSrc = resolveMarkdownPreviewUrl(filePath, src)
            const imageSrc = resolvedSrc.startsWith('file://')
              ? markdownImageDataUrls[resolvedSrc] ?? undefined
              : resolvedSrc

            return (
              <img
                {...props}
                src={imageSrc}
                alt={alt}
              />
            )
          },
          pre({ children, ...props }) {
            return (
              <pre {...props} className="!bg-transparent !p-0 overflow-x-auto">
                {children}
              </pre>
            )
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
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
          <MarkdownPreviewBody filePath={entry.path} content={previewContent} />
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

function getGitEntryLabel(entry: GitStatusEntry): string {
  if (entry.untracked) return '새 파일'
  if (entry.deleted) return '삭제'
  if (entry.renamed) return '이름 변경'
  if (entry.staged && entry.unstaged) return '수정됨'
  if (entry.staged) return '스테이징'
  if (entry.unstaged) return '수정됨'
  return '변경'
}

function getGitEntryBadgeClass(entry: GitStatusEntry): string {
  if (entry.untracked) return 'border-emerald-500/30 bg-emerald-500/10 text-claude-text'
  if (entry.deleted) return 'border-red-500/30 bg-red-500/10 text-claude-text'
  if (entry.renamed) return 'border-sky-500/30 bg-sky-500/10 text-claude-text'
  if (entry.staged && entry.unstaged) return 'border-amber-500/30 bg-amber-500/10 text-claude-text'
  return 'border-claude-border bg-claude-surface text-claude-text'
}

function getGitEntryStatusDotClass(entry: GitStatusEntry): string | null {
  if (entry.deleted) return 'bg-red-400'
  if (entry.untracked || entry.renamed) return 'bg-sky-400'
  return null
}

function formatGitChangeCount(value: number | null): string {
  return value && value > 0 ? `+${value}` : '+0'
}

function formatGitDeletionCount(value: number | null): string {
  return value && value > 0 ? `-${value}` : '-0'
}

function shouldStageGitEntry(entry: GitStatusEntry) {
  return !entry.staged || entry.unstaged || entry.untracked
}

function getGitStageActionLabel(entry: GitStatusEntry) {
  return shouldStageGitEntry(entry) ? '스테이징' : '언스테이징'
}

function shouldStageGitEntryForFilter(entry: GitStatusEntry, filter: 'unstaged' | 'staged' | 'all') {
  if (filter === 'staged') return false
  if (filter === 'unstaged') return true
  return shouldStageGitEntry(entry)
}

function getGitStageActionLabelForFilter(entry: GitStatusEntry, filter: 'unstaged' | 'staged' | 'all') {
  return shouldStageGitEntryForFilter(entry, filter) ? '스테이징' : '언스테이징'
}

function getGitEntryCounts(entry: GitStatusEntry, filter: 'unstaged' | 'staged' | 'all') {
  if (filter === 'staged') {
    return {
      additions: entry.stagedAdditions,
      deletions: entry.stagedDeletions,
    }
  }

  if (filter === 'unstaged') {
    return {
      additions: entry.unstagedAdditions,
      deletions: entry.unstagedDeletions,
    }
  }

  return {
    additions: entry.totalAdditions,
    deletions: entry.totalDeletions,
  }
}

function safeParseGitDiff(diffText: string) {
  try {
    return parseDiff(diffText)
  } catch {
    return []
  }
}

function parseGitDecorations(decorations: string) {
  if (!decorations.trim()) return []

  return decorations
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      if (value.startsWith('HEAD -> ')) {
        return [{
          label: value.slice('HEAD -> '.length).trim(),
          kind: 'current' as const,
        }]
      }

      if (value === 'HEAD') {
        return [{ label: 'HEAD', kind: 'current' as const }]
      }

      if (value.startsWith('tag: ')) {
        return [{
          label: value.slice('tag: '.length).trim(),
          kind: 'tag' as const,
        }]
      }

      if (value.startsWith('origin/')) {
        return [{ label: value, kind: 'remote' as const }]
      }

      if (value.includes('/')) {
        return [{ label: value, kind: 'other' as const }]
      }

      return [{ label: value, kind: 'local' as const }]
    })
}

function getGitDecorationBadgeClass(kind: 'current' | 'local' | 'remote' | 'tag' | 'other') {
  switch (kind) {
    case 'current':
      return 'border-sky-500/40 bg-sky-500/12 text-sky-200'
    case 'local':
      return 'border-indigo-500/35 bg-indigo-500/12 text-indigo-200'
    case 'remote':
      return 'border-fuchsia-500/35 bg-fuchsia-500/12 text-fuchsia-200'
    case 'tag':
      return 'border-amber-500/35 bg-amber-500/12 text-amber-100'
    default:
      return 'border-claude-border bg-claude-surface text-claude-text'
  }
}

function isGitGraphActiveCommit(refs: Array<{ label: string; kind: 'current' | 'local' | 'remote' | 'tag' | 'other' }>) {
  const currentBranchNames = refs
    .filter((ref) => ref.kind === 'current')
    .map((ref) => ref.label)
    .filter((label) => label !== 'HEAD')

  if (currentBranchNames.length === 0) {
    return refs.some((ref) => ref.kind === 'current')
  }

  const hasMatchingRemote = currentBranchNames.some((branchName) => (
    refs.some((ref) => ref.kind === 'remote' && ref.label.endsWith(`/${branchName}`))
  ))

  return !hasMatchingRemote
}

function getGitGraphLane(graph: string) {
  const starIndex = graph.indexOf('*')
  if (starIndex >= 0) return starIndex
  const branchIndex = graph.search(/[|\\/]/)
  return branchIndex >= 0 ? branchIndex : 0
}

const GIT_GRAPH_LANE_WIDTH = 12
const GIT_GRAPH_MARKER_CENTER_Y = 12
const GIT_GRAPH_ACTIVE_MARKER_SIZE = 10
const GIT_GRAPH_DEFAULT_MARKER_SIZE = 8

function renderGitGraph(
  graph: string,
  previousGraph: string,
  nextGraph: string,
  active: boolean,
  previousActive: boolean,
) {
  const lane = getGitGraphLane(graph)
  const previousLane = previousGraph ? getGitGraphLane(previousGraph) : -1
  const nextLane = nextGraph ? getGitGraphLane(nextGraph) : -1
  const width = Math.max(
    28,
    Math.max(graph.length, previousGraph.length, nextGraph.length, lane + 1) * GIT_GRAPH_LANE_WIDTH + 8,
  )
  const markerLeft = lane * GIT_GRAPH_LANE_WIDTH + 8
  const markerSize = active ? GIT_GRAPH_ACTIVE_MARKER_SIZE : GIT_GRAPH_DEFAULT_MARKER_SIZE
  const markerRadius = markerSize / 2
  const markerTop = GIT_GRAPH_MARKER_CENTER_Y - markerRadius
  const lineColor = active ? 'rgba(105, 202, 255, 0.95)' : 'rgba(223, 157, 255, 0.88)'
  const previousLineColor = previousActive ? 'rgba(105, 202, 255, 0.95)' : 'rgba(223, 157, 255, 0.88)'
  const markerStyle = active
    ? {
        backgroundColor: 'rgb(31 34 46)',
        borderColor: lineColor,
        borderWidth: '2px',
      }
    : {
        backgroundColor: lineColor,
        borderColor: lineColor,
        borderWidth: '0px',
      }

  return (
    <span className="relative block h-full min-h-[24px]" style={{ width: `${width}px` }}>
      {previousLane === lane && (
        <span
          className="absolute w-[2px] rounded-full"
          style={{
            left: `${markerLeft}px`,
            top: 0,
            height: `${Math.max(0, GIT_GRAPH_MARKER_CENTER_Y - markerRadius)}px`,
            transform: 'translateX(-50%)',
            backgroundColor: previousLineColor,
          }}
        />
      )}
      {nextLane === lane && (
        <span
          className="absolute bottom-0 w-[2px] rounded-full"
          style={{
            left: `${markerLeft}px`,
            top: `${GIT_GRAPH_MARKER_CENTER_Y + markerRadius}px`,
            transform: 'translateX(-50%)',
            backgroundColor: lineColor,
          }}
        />
      )}
      <span
        className="absolute -translate-x-1/2 rounded-full border shadow-[0_0_0_1px_rgba(18,20,27,0.18)]"
        style={{
          left: `${markerLeft}px`,
          top: `${markerTop}px`,
          width: `${markerSize}px`,
          height: `${markerSize}px`,
          ...markerStyle,
        }}
      />
    </span>
  )
}

function IconTooltipButton({
  tooltip,
  tooltipAlign = 'center',
  tooltipSide = 'top',
  wrapperClassName,
  className,
  children,
  ...props
}: {
  tooltip: string
  tooltipAlign?: 'center' | 'left' | 'right'
  tooltipSide?: 'top' | 'bottom'
  wrapperClassName?: string
  className: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const tooltipPositionClass =
    tooltipAlign === 'right'
      ? 'right-0'
      : tooltipAlign === 'left'
        ? 'left-0'
        : 'left-1/2 -translate-x-1/2'
  const tooltipSideClass =
    tooltipSide === 'bottom'
      ? 'top-full mt-1.5'
      : 'bottom-full mb-1.5'

  return (
    <div className={`relative inline-flex group/tooltip ${wrapperClassName ?? ''}`}>
      <button {...props} className={className} title={tooltip} aria-label={tooltip}>
        {children}
      </button>
      <div className={`pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-claude-border bg-claude-panel px-2 py-1 text-[10px] font-medium text-claude-text opacity-0 transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${tooltipPositionClass} ${tooltipSideClass}`}>
        {tooltip}
      </div>
    </div>
  )
}

function GitLogPanel({
  status,
  gitLog,
  loading,
  actionLoading,
  selectedCommitHash,
  onSelectCommit,
  onPull,
  onPush,
}: {
  status: GitRepoStatus | null
  gitLog: GitLogEntry[]
  loading: boolean
  actionLoading: boolean
  selectedCommitHash: string | null
  onSelectCommit: (entry: GitLogEntry) => void
  onPull: () => Promise<void>
  onPush: () => Promise<void>
}) {
  const historyEntries = gitLog

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-semibold text-claude-text">최근 커밋</p>
          {status?.branch && (
            <span className="rounded-full border border-sky-500/35 bg-sky-500/12 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-200">
              {status.branch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconTooltipButton
            type="button"
            onClick={() => void onPull()}
            disabled={actionLoading}
            tooltip={status && status.behind > 0 ? `Pull(${status.behind})` : 'Pull'}
            tooltipAlign="right"
            className="flex h-6.5 w-6.5 items-center justify-center rounded-lg transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${status && status.behind > 0 ? 'text-amber-400' : 'text-claude-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m7 11 5 5 5-5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 20h14" />
            </svg>
          </IconTooltipButton>
          <IconTooltipButton
            type="button"
            onClick={() => void onPush()}
            disabled={actionLoading}
            tooltip={status && status.ahead > 0 ? `Push(${status.ahead})` : 'Push'}
            tooltipAlign="right"
            className="flex h-6.5 w-6.5 items-center justify-center rounded-lg transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${status && status.ahead > 0 ? 'text-blue-400' : 'text-claude-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m7 13 5-5 5 5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h14" />
            </svg>
          </IconTooltipButton>
          {loading && (
            <svg className="ml-1 h-3.5 w-3.5 animate-spin text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {historyEntries.length === 0 ? (
          <div className="px-2 py-6 text-center text-[12px] text-claude-muted">
            {loading ? '로그를 불러오는 중입니다.' : '표시할 커밋 로그가 없습니다.'}
          </div>
        ) : (
          <div className="flex flex-col pr-1">
            {historyEntries.map((entry, index) => {
              const refs = parseGitDecorations(entry.decorations)
              const isSelected = selectedCommitHash === entry.hash
              const isHeadCommit = isGitGraphActiveCommit(refs)
              const previousGraph = index > 0 ? historyEntries[index - 1]?.graph ?? '' : ''
              const nextGraph = index < historyEntries.length - 1 ? historyEntries[index + 1]?.graph ?? '' : ''
              const previousRefs = index > 0 ? parseGitDecorations(historyEntries[index - 1]?.decorations ?? '') : []
              const previousIsHeadCommit = isGitGraphActiveCommit(previousRefs)
              return (
                <button
                  key={entry.hash}
                  type="button"
                  onClick={() => void onSelectCommit(entry)}
                  className={`block w-full rounded-md px-2 text-left transition-colors ${
                    isSelected
                      ? 'bg-claude-surface-2'
                      : 'hover:bg-claude-panel'
                  }`}
                  title={`${entry.shortHash} ${entry.subject}`}
                >
                  <div className="flex items-stretch gap-1">
                    <div className="flex min-h-[24px] shrink-0 self-stretch items-stretch justify-center">
                      {renderGitGraph(entry.graph, previousGraph, nextGraph, isHeadCommit, previousIsHeadCommit)}
                    </div>
                    <div className="min-w-0 flex-1 py-0">
                      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                        <p className={`min-w-0 truncate text-[13px] leading-[15px] ${isSelected ? 'font-semibold text-claude-text' : 'font-medium text-claude-text'}`}>
                          {entry.subject}
                        </p>
                        <span className="shrink-0 text-[11px] text-claude-muted">{entry.author}</span>
                        {refs.map((ref) => (
                          <span
                            key={`${entry.hash}-${ref.kind}-${ref.label}`}
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${getGitDecorationBadgeClass(ref.kind)}`}
                          >
                            {ref.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function GitStatusPanel({
  status,
  loading,
  selectedPath,
  actionLoading,
  onSelectEntry,
  onToggleStage,
  onRestoreEntry,
  onRestoreEntries,
  onStageEntries,
  onUnstageEntries,
}: {
  status: GitRepoStatus | null
  loading: boolean
  selectedPath: string | null
  actionLoading: boolean
  onSelectEntry: (entry: GitStatusEntry) => void
  onToggleStage: (entry: GitStatusEntry, staged?: boolean) => void
  onRestoreEntry: (entry: GitStatusEntry) => void
  onRestoreEntries: (entries: GitStatusEntry[]) => void
  onStageEntries: (entries: GitStatusEntry[]) => void
  onUnstageEntries: (entries: GitStatusEntry[]) => void
}) {
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState<'unstaged' | 'staged' | 'all'>('unstaged')

  if (loading && !status) {
    return (
      <div className="flex h-full items-center justify-center text-claude-muted">
        <p className="text-sm">Git 상태를 불러오는 중입니다.</p>
      </div>
    )
  }

  if (!status?.isRepo) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center">
        <div>
          <p className="text-sm font-medium text-claude-text">Git 저장소가 아닙니다.</p>
          <p className="mt-2 text-xs leading-6 text-claude-muted">현재 세션 폴더에서 `git status`를 사용할 수 없습니다.</p>
        </div>
      </div>
    )
  }

  const unstagedEntries = status.entries.filter((entry) => entry.unstaged || entry.untracked || !entry.staged)
  const stagedEntries = status.entries.filter((entry) => entry.staged)
  const allEntries = status.entries

  const filteredEntries = filter === 'staged'
    ? stagedEntries
    : filter === 'all'
      ? allEntries
      : unstagedEntries

  const currentFilterLabel = filter === 'staged'
    ? '스테이징됨'
    : filter === 'all'
      ? '모든 변경 사항'
      : '스테이징되지 않음'
  const currentFilterCount = filteredEntries.length
  const showRestoreAll = filter === 'unstaged' || filter === 'staged' || filter === 'all'
  const showStageAll = filter === 'unstaged'
  const showUnstageAll = filter === 'staged'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-2xl px-2.5 text-[12px] font-medium text-claude-text transition-colors ${
              filterOpen ? 'bg-claude-surface hover:bg-claude-surface-2' : 'bg-transparent hover:bg-claude-surface/60'
            }`}
          >
            <span>{currentFilterLabel}</span>
            <span className="inline-flex h-[17px] min-w-[20px] items-center justify-center rounded-full border border-claude-border/70 bg-claude-panel px-1.5 text-[11px] font-semibold leading-none text-claude-text">
              {currentFilterCount}
            </span>
            <svg className={`h-3.5 w-3.5 text-claude-muted transition-transform ${filterOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {filterOpen && (
            <div className="absolute left-0 top-full z-10 mt-2 w-[238px] rounded-[20px] border border-claude-border bg-claude-panel p-1.5">
              {[
                { key: 'unstaged' as const, label: '스테이징되지 않음', count: unstagedEntries.length },
                { key: 'staged' as const, label: '스테이징됨', count: stagedEntries.length },
                { key: 'all' as const, label: '모든 변경 사항', count: allEntries.length },
              ].map((option) => {
                const active = filter === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setFilter(option.key)
                      setFilterOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors ${
                      active ? 'bg-claude-surface text-claude-text' : 'text-claude-text hover:bg-claude-surface'
                    }`}
                  >
                    <span className="text-[12px] font-medium">{option.label}</span>
                    <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full border border-claude-border/70 bg-claude-panel px-1.5 text-[10px] leading-none text-claude-muted">
                      {option.count}
                    </span>
                    {active && (
                      <svg className="ml-auto h-3.5 w-3.5 text-claude-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4 10-10" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {(showRestoreAll || showStageAll || showUnstageAll) && (
          <div className="flex shrink-0 items-center gap-1">
            {showRestoreAll && (
              <IconTooltipButton
                type="button"
                onClick={() => void onRestoreEntries(filteredEntries)}
                disabled={actionLoading || filteredEntries.length === 0}
                tooltip="모두 되돌리기"
                tooltipAlign="right"
                tooltipSide="bottom"
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-transparent text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 10H5V6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10a7 7 0 1 1 2.05 4.95" />
                </svg>
              </IconTooltipButton>
            )}
            {showStageAll && (
              <IconTooltipButton
                type="button"
                onClick={() => void onStageEntries(filteredEntries)}
                disabled={actionLoading || filteredEntries.length === 0}
                tooltip="모두 스테이징"
                tooltipAlign="right"
                tooltipSide="bottom"
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-transparent text-[14px] font-semibold text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                +
              </IconTooltipButton>
            )}
            {showUnstageAll && (
              <IconTooltipButton
                type="button"
                onClick={() => void onUnstageEntries(filteredEntries)}
                disabled={actionLoading || filteredEntries.length === 0}
                tooltip="모두 언스테이징"
                tooltipAlign="right"
                tooltipSide="bottom"
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-transparent text-[14px] font-semibold text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                -
              </IconTooltipButton>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4 text-claude-muted">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
        </div>
      )}

      {!loading && status.clean && (
        <div className="rounded-2xl border border-claude-border bg-claude-surface px-4 py-8 text-center text-sm text-claude-muted">
          작업 트리가 깨끗합니다.
        </div>
      )}

      {!loading && !status.clean && (
        <div className="space-y-1">
          {filteredEntries.length === 0 && (
            <div className="rounded-xl border border-claude-border bg-claude-surface px-3 py-6 text-center text-[12px] text-claude-muted">
              표시할 파일이 없습니다.
            </div>
          )}
          {filteredEntries.map((entry) => {
            const isSelected = selectedPath === entry.path
            const counts = getGitEntryCounts(entry, filter)
            const statusDotClass = getGitEntryStatusDotClass(entry)
            const stageActionLabel = getGitStageActionLabelForFilter(entry, filter)
            const shouldStageAction = shouldStageGitEntryForFilter(entry, filter)
            return (
              <div
                key={`${entry.path}:${entry.statusCode}`}
                className="group relative"
              >
                <button
                  type="button"
                  onClick={() => void onSelectEntry(entry)}
                  className={`w-full rounded-xl border px-2.5 py-2 pr-[142px] text-left transition-colors ${
                    isSelected
                      ? 'border-claude-border bg-claude-surface-2 text-claude-text'
                      : 'border-transparent bg-claude-panel text-claude-text hover:border-claude-border hover:bg-claude-surface'
                  }`}
                  title={entry.path}
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex flex-1 items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-claude-text">{entry.relativePath}</p>
                      <span className="flex-shrink-0 font-mono text-[11px] font-semibold text-emerald-400">{formatGitChangeCount(counts.additions)}</span>
                      <span className="flex-shrink-0 font-mono text-[11px] font-semibold text-red-400">{formatGitDeletionCount(counts.deletions)}</span>
                      {statusDotClass && <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDotClass}`} />}
                    </div>
                  </div>
                  {entry.originalPath && (
                    <p className="mt-1 truncate text-[11px] text-[rgb(var(--claude-text)/0.72)]">이전: {entry.originalPath}</p>
                  )}
                </button>

                <div className="pointer-events-none absolute inset-y-0 right-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <IconTooltipButton
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void onRestoreEntry(entry)
                    }}
                    disabled={actionLoading}
                    tooltip="파일 되돌리기"
                    tooltipAlign="right"
                    className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-lg bg-transparent text-claude-text transition-colors hover:bg-claude-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10H5V6" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10a7 7 0 1 1 2.05 4.95" />
                    </svg>
                  </IconTooltipButton>
                  <IconTooltipButton
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void onToggleStage(entry, shouldStageAction)
                    }}
                    disabled={actionLoading}
                    tooltip={stageActionLabel}
                    tooltipAlign="right"
                    className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-lg bg-transparent text-[14px] font-semibold text-claude-text transition-colors hover:bg-claude-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {shouldStageAction ? '+' : '-'}
                  </IconTooltipButton>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const GitDiffPanel = memo(function GitDiffPanel({
  cwd,
  entry,
  commit,
  gitDiff,
  loading,
}: {
  cwd: string
  entry: GitStatusEntry | null
  commit: GitLogEntry | null
  gitDiff: GitDiffResult | null
  loading: boolean
}) {
  const parsedFiles = useMemo(() => {
    if (!gitDiff?.diff.trim()) return []
    return safeParseGitDiff(gitDiff.diff)
  }, [gitDiff?.diff])
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({})
  const [markdownPreviewEnabled, setMarkdownPreviewEnabled] = useState(false)
  const [markdownPreviewState, setMarkdownPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [markdownPreviewContent, setMarkdownPreviewContent] = useState('')
  const [markdownPreviewError, setMarkdownPreviewError] = useState('')
  const commitHashRef = useRef<string | null>(commit?.hash ?? null)
  const [commitMarkdownPreviewOpen, setCommitMarkdownPreviewOpen] = useState<Record<string, boolean>>({})
  const [commitMarkdownPreviewCache, setCommitMarkdownPreviewCache] = useState<Record<string, {
    state: 'loading' | 'ready' | 'error'
    content: string
    error: string
  }>>({})
  const markdownPreviewAvailable = Boolean(entry && !entry.deleted && isMarkdownFile(entry.relativePath))

  useEffect(() => {
    commitHashRef.current = commit?.hash ?? null
  }, [commit?.hash])

  useEffect(() => {
    setCollapsedFiles({})
    setCommitMarkdownPreviewOpen({})
    setCommitMarkdownPreviewCache({})
  }, [gitDiff?.diff, entry?.path, commit?.hash])

  useEffect(() => {
    setMarkdownPreviewEnabled(false)
    setMarkdownPreviewState('idle')
    setMarkdownPreviewContent('')
    setMarkdownPreviewError('')
  }, [entry?.path, commit?.hash])

  useEffect(() => {
    if (!markdownPreviewEnabled || !entry || !markdownPreviewAvailable) return

    let cancelled = false
    setMarkdownPreviewState('loading')
    setMarkdownPreviewError('')

    void (async () => {
      const result = await window.claude.readFile(entry.path)
      if (cancelled) return

      if (!result || result.fileType !== 'text') {
        setMarkdownPreviewState('error')
        setMarkdownPreviewContent('')
        setMarkdownPreviewError('마크다운 미리보기를 불러오지 못했습니다.')
        return
      }

      setMarkdownPreviewState('ready')
      setMarkdownPreviewContent(result.content)
    })()

    return () => {
      cancelled = true
    }
  }, [entry?.path, markdownPreviewAvailable, markdownPreviewEnabled])

  const handleToggleCommitMarkdownPreview = async (fileKey: string, filePath: string) => {
    const nextOpen = !(commitMarkdownPreviewOpen[fileKey] ?? false)
    setCommitMarkdownPreviewOpen((current) => ({ ...current, [fileKey]: nextOpen }))

    if (!nextOpen || !commit?.hash) return

    const cached = commitMarkdownPreviewCache[fileKey]
    if (cached?.state === 'ready' || cached?.state === 'loading') return

    const requestCommitHash = commit.hash
    setCommitMarkdownPreviewCache((current) => ({
      ...current,
      [fileKey]: {
        state: 'loading',
        content: '',
        error: '',
      },
    }))

    try {
      const result = await window.claude.getGitCommitFileContent({
        cwd,
        commitHash: requestCommitHash,
        filePath,
      })

      if (commitHashRef.current !== requestCommitHash) return

      setCommitMarkdownPreviewCache((current) => ({
        ...current,
        [fileKey]: result.ok
          ? {
              state: 'ready',
              content: result.content,
              error: '',
            }
          : {
              state: 'error',
              content: '',
              error: result.error || '마크다운 미리보기를 불러오지 못했습니다.',
            },
      }))
    } catch (error) {
      if (commitHashRef.current !== requestCommitHash) return

      const message = error instanceof Error ? error.message : String(error)
      setCommitMarkdownPreviewCache((current) => ({
        ...current,
        [fileKey]: {
          state: 'error',
          content: '',
          error: message.includes('getGitCommitFileContent')
            ? '앱을 다시 시작한 뒤 다시 시도해 주세요.'
            : '마크다운 미리보기를 불러오지 못했습니다.',
        },
      }))
    }
  }

  if (!entry && !commit) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm font-medium text-claude-text">파일이나 커밋을 선택하세요.</p>
          <p className="mt-2 text-xs leading-6 text-claude-muted">오른쪽 목록에서 변경 파일이나 커밋 로그를 선택하면 diff를 여기에서 보여줍니다.</p>
        </div>
      </div>
    )
  }

  const commitRefs = commit ? parseGitDecorations(commit.decorations) : []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-claude-border bg-claude-surface px-4 py-3">
        {commit ? (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-100">
                커밋
              </span>
              <p className="min-w-0 truncate text-sm font-medium text-claude-text">{commit.subject}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md border border-claude-border bg-claude-panel px-1.5 py-0.5 font-mono text-[10px] text-claude-muted">
                {commit.shortHash}
              </span>
              <span className="text-[11px] text-claude-muted">{commit.author}</span>
              <span className="text-[11px] text-claude-muted">{commit.relativeDate}</span>
              {commitRefs.map((ref) => (
                <span
                  key={`${commit.hash}-${ref.kind}-${ref.label}`}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${getGitDecorationBadgeClass(ref.kind)}`}
                >
                  {ref.label}
                </span>
              ))}
            </div>
          </>
        ) : entry ? (
          <>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${getGitEntryBadgeClass(entry)}`}>
                {getGitEntryLabel(entry)}
              </span>
              <p className="min-w-0 truncate text-sm font-medium text-claude-text">{entry.relativePath}</p>
            </div>
            {entry.originalPath && (
              <p className="mt-1 truncate text-[11px] text-[rgb(var(--claude-text)/0.72)]">이전: {entry.originalPath}</p>
            )}
            {markdownPreviewAvailable && (
              <button
                type="button"
                onClick={() => setMarkdownPreviewEnabled((value) => !value)}
                className="mt-2 inline-flex rounded-xl border border-claude-border px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
              >
                {markdownPreviewEnabled ? 'diff' : '미리보기'}
              </button>
            )}
          </>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-claude-bg p-4">
        {markdownPreviewEnabled && markdownPreviewAvailable ? (
          markdownPreviewState === 'ready' ? (
            <div className="rounded-2xl border border-claude-border bg-claude-surface px-5 py-4">
              <MarkdownPreviewBody filePath={entry!.path} content={markdownPreviewContent} />
            </div>
          ) : markdownPreviewState === 'error' ? (
            <div className="rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-8 text-center text-sm text-red-100">
              {markdownPreviewError}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-claude-muted">
              <p className="text-sm">미리보기를 불러오는 중입니다.</p>
            </div>
          )
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-claude-muted">
            <p className="text-sm">diff를 불러오는 중입니다.</p>
          </div>
        ) : !gitDiff ? (
          <div className="rounded-2xl border border-claude-border bg-claude-surface px-4 py-8 text-center text-sm text-claude-muted">
            diff를 불러오는 중입니다.
          </div>
        ) : gitDiff.error && !gitDiff.diff.trim() ? (
          <div className="rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-8 text-center text-sm text-red-100">
            {gitDiff.error}
          </div>
        ) : !gitDiff.diff.trim() ? (
          <div className="rounded-2xl border border-claude-border bg-claude-surface px-4 py-8 text-center text-sm text-claude-muted">
            표시할 diff가 없습니다.
          </div>
        ) : parsedFiles.length > 0 ? (
          <div className="space-y-4">
            {parsedFiles.map((file, index) => {
              const fileKey = `${file.oldPath}-${file.newPath}-${index}`
              const isCollapsed = collapsedFiles[fileKey] ?? false
              const label = file.oldPath === file.newPath ? file.newPath : `${file.oldPath} → ${file.newPath}`
              const markdownFilePath = commit && file.newPath !== '/dev/null' ? file.newPath : null
              const markdownPreviewAvailableForFile = Boolean(markdownFilePath && isMarkdownFile(markdownFilePath))
              const markdownPreviewOpenForFile = commitMarkdownPreviewOpen[fileKey] ?? false
              const markdownPreviewDataForFile = commitMarkdownPreviewCache[fileKey]

              return (
                <div key={fileKey} className="overflow-hidden rounded-2xl border border-claude-border/70 bg-claude-surface">
                  <div className={`flex items-center gap-2 bg-claude-panel px-3 py-2 text-[11px] font-mono text-claude-muted ${isCollapsed ? '' : 'border-b border-claude-border/70'}`}>
                    <button
                      type="button"
                      onClick={() => setCollapsedFiles((current) => ({ ...current, [fileKey]: !isCollapsed }))}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-claude-text"
                    >
                      <svg
                        className={`h-3.5 w-3.5 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5 10 12.5 15 7.5" />
                      </svg>
                      <span className="truncate">{label}</span>
                    </button>
                    {markdownPreviewAvailableForFile && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleToggleCommitMarkdownPreview(fileKey, markdownFilePath!)
                        }}
                        className="inline-flex shrink-0 rounded-lg border border-claude-border px-2 py-0.5 text-[10px] font-medium text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
                      >
                        {markdownPreviewOpenForFile ? 'diff' : '미리보기'}
                      </button>
                    )}
                  </div>
                  {!isCollapsed && (
                    markdownPreviewOpenForFile && markdownPreviewAvailableForFile ? (
                      markdownPreviewDataForFile?.state === 'ready' ? (
                        <div className="px-5 py-4">
                          <MarkdownPreviewBody
                            filePath={joinPreviewPath(cwd, markdownFilePath!)}
                            content={markdownPreviewDataForFile.content}
                          />
                        </div>
                      ) : markdownPreviewDataForFile?.state === 'error' ? (
                        <div className="px-4 py-8 text-center text-sm text-red-100">
                          {markdownPreviewDataForFile.error}
                        </div>
                      ) : (
                        <div className="px-4 py-8 text-center text-sm text-claude-muted">
                          미리보기를 불러오는 중입니다.
                        </div>
                      )
                    ) : (
                      <div className="tool-diff-shell">
                        <Diff viewType="unified" diffType={file.type} hunks={file.hunks} className="tool-diff-view">
                          {(hunks) => hunks.map((hunk, hunkIndex) => (
                            <Hunk key={`${file.newPath}-${hunkIndex}-${hunk.content}`} hunk={hunk} />
                          ))}
                        </Diff>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-claude-border bg-claude-surface p-4 text-xs font-mono text-claude-text">
            {gitDiff.diff}
          </pre>
        )}
      </div>
    </div>
  )
}, (prevProps, nextProps) => (
  prevProps.cwd === nextProps.cwd &&
  prevProps.loading === nextProps.loading &&
  areGitStatusEntriesEqual(prevProps.entry, nextProps.entry) &&
  areGitLogEntriesEqual(prevProps.commit, nextProps.commit) &&
  areGitDiffResultsEqual(prevProps.gitDiff, nextProps.gitDiff)
))

function isMarkdownFile(name: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(name)
}

function isTextPreviewable(name: string): boolean {
  return /\.(txt|md|json|ya?ml|toml|xml|html|css|scss|ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|sh|zsh|env|sql|graphql|proto)$/i.test(name)
}

function WelcomeScreen({ onSelectFolder }: { onSelectFolder: () => void }) {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center px-8 pb-10 pt-10 text-center">
      <h2 className="mb-2 text-3xl font-semibold tracking-tight text-claude-text">Citto Code</h2>
      <p className="mb-10 max-w-sm text-[15px] leading-7 text-claude-muted">
        Claude Code CLI 기반 코드 어시스턴트입니다.
      </p>

      <div className="pointer-events-none mb-10 select-none">
        <div className="relative h-12 w-20 sm:h-14 sm:w-24">
          <img
            src={welcomeTypingGif}
            alt="노트북으로 작업 중인 캐릭터"
            className="relative h-full w-full object-contain"
            draggable={false}
            style={{
              imageRendering: 'pixelated',
            }}
          />
        </div>
      </div>

      <button
        onClick={onSelectFolder}
        className="mb-8 flex items-center gap-2 rounded-2xl border border-claude-border bg-claude-surface px-5 py-3 text-sm font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        프로젝트 폴더 선택
      </button>

      <div className="grid w-full max-w-md grid-cols-2 gap-3 text-left">
        {[
          { icon: '💡', label: '코드 설명해줘', desc: '특정 코드의 동작 방식 이해' },
          { icon: '🐛', label: '버그 찾아줘', desc: '오류 원인 파악 및 수정' },
          { icon: '✨', label: '기능 추가해줘', desc: '새로운 기능 구현 요청' },
          { icon: '📋', label: '먼저 계획 세워줘', desc: '플랜 모드로 안전하게 검토' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-claude-border bg-claude-surface p-4 text-sm">
            <div className="text-xl mb-1">{item.icon}</div>
            <div className="font-medium text-claude-text">{item.label}</div>
            <div className="text-xs text-claude-muted mt-0.5">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
