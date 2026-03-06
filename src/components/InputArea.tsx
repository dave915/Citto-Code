import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { SelectedFile, ModelInfo, FileEntry } from '../../electron/preload'
import type { PermissionMode } from '../store/sessions'
import { matchShortcut } from '../lib/shortcuts'

type SlashCommand = {
  name: string
  path: string
  dir: string
  legacy: boolean
  description?: string
  kind?: 'builtin' | 'custom'
}

const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  { name: 'add-dir', path: '', dir: '', legacy: false, kind: 'builtin', description: '작업 디렉토리 추가' },
  { name: 'agents', path: '', dir: '', legacy: false, kind: 'builtin', description: '에이전트 관리' },
  { name: 'bug', path: '', dir: '', legacy: false, kind: 'builtin', description: '버그 리포트 전송' },
  { name: 'clear', path: '', dir: '', legacy: false, kind: 'builtin', description: '대화 기록 지우기' },
  { name: 'compact', path: '', dir: '', legacy: false, kind: 'builtin', description: '대화 압축' },
  { name: 'config', path: '', dir: '', legacy: false, kind: 'builtin', description: '설정 보기/수정' },
  { name: 'cost', path: '', dir: '', legacy: false, kind: 'builtin', description: '토큰 사용량 보기' },
  { name: 'doctor', path: '', dir: '', legacy: false, kind: 'builtin', description: '설치 상태 점검' },
  { name: 'help', path: '', dir: '', legacy: false, kind: 'builtin', description: '도움말' },
  { name: 'init', path: '', dir: '', legacy: false, kind: 'builtin', description: 'CLAUDE.md 초기화' },
  { name: 'login', path: '', dir: '', legacy: false, kind: 'builtin', description: '계정 전환' },
  { name: 'logout', path: '', dir: '', legacy: false, kind: 'builtin', description: '로그아웃' },
  { name: 'mcp', path: '', dir: '', legacy: false, kind: 'builtin', description: 'MCP 연결 관리' },
  { name: 'memory', path: '', dir: '', legacy: false, kind: 'builtin', description: 'CLAUDE.md 메모리 편집' },
  { name: 'model', path: '', dir: '', legacy: false, kind: 'builtin', description: '모델 선택/변경' },
  { name: 'permissions', path: '', dir: '', legacy: false, kind: 'builtin', description: '권한 보기/수정' },
  { name: 'pr_comments', path: '', dir: '', legacy: false, kind: 'builtin', description: 'PR 댓글 보기' },
  { name: 'review', path: '', dir: '', legacy: false, kind: 'builtin', description: '코드 리뷰 요청' },
  { name: 'status', path: '', dir: '', legacy: false, kind: 'builtin', description: '상태 보기' },
  { name: 'terminal-setup', path: '', dir: '', legacy: false, kind: 'builtin', description: 'Shift+Enter 줄바꿈 설정' },
  { name: 'vim', path: '', dir: '', legacy: false, kind: 'builtin', description: 'vim 모드 전환' },
]

type Props = {
  cwd: string
  promptHistory: string[]
  onSend: (text: string, files: SelectedFile[]) => void
  onAbort: () => void
  isStreaming: boolean
  disabled?: boolean
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
}

const PERMISSION_OPTIONS: { value: PermissionMode; label: string; title: string }[] = [
  { value: 'default',           label: '🔒 기본',    title: '파일 수정 전 확인 요청' },
  { value: 'acceptEdits',       label: '✅ 자동승인', title: '파일 편집 자동 수락' },
  { value: 'bypassPermissions', label: '⚡ 전체허용', title: '모든 권한 확인 건너뜀' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function cycleClaudeCodeMode(
  permissionMode: PermissionMode,
  planMode: boolean,
  onPermissionModeChange: (mode: PermissionMode) => void,
  onPlanModeChange: (value: boolean) => void,
) {
  if (planMode) {
    onPlanModeChange(false)
    onPermissionModeChange('default')
    return
  }

  if (permissionMode === 'default') {
    onPermissionModeChange('acceptEdits')
    return
  }

  if (permissionMode === 'acceptEdits') {
    onPermissionModeChange('default')
    onPlanModeChange(true)
    return
  }

  onPermissionModeChange('default')
  onPlanModeChange(false)
}

function ModelPicker({
  model, models, onChange, disabled,
}: {
  model: string | null
  models: ModelInfo[]
  onChange: (model: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.top, right: window.innerWidth - rect.right })
    }
    setOpen((v) => !v)
  }

  const current = models.find((m) => m.id === model)
  const label = current ? current.displayName : '기본 모델'

  const familyColor = (family: string) => {
    if (family === 'opus')   return 'text-purple-600'
    if (family === 'haiku')  return 'text-green-600'
    return 'text-blue-600'
  }

  const dropdown = open && dropdownPos && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        right: dropdownPos.right,
        transform: 'translateY(-100%) translateY(-6px)',
        zIndex: 9999,
      }}
      className="w-52 bg-white border border-claude-border rounded-xl shadow-lg overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-claude-border">
        <p className="text-xs font-semibold text-claude-muted uppercase tracking-wide">모델 선택</p>
      </div>
      <div className="py-1 max-h-64 overflow-y-auto">
        <button
          onClick={() => { onChange(null); setOpen(false) }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-claude-bg transition-colors ${!model ? 'bg-claude-bg' : ''}`}
        >
          <span className="w-4 text-center text-base">🤖</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-claude-text">기본 모델</p>
            <p className="text-xs text-claude-muted">Claude Code 기본값</p>
          </div>
          {!model && <svg className="w-3.5 h-3.5 text-claude-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </button>

        {models.length > 0 && <div className="mx-3 my-1 border-t border-claude-border/50" />}

        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => { onChange(m.id); setOpen(false) }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-claude-bg transition-colors ${model === m.id ? 'bg-claude-bg' : ''}`}
          >
            <span className={`w-4 text-center font-bold text-sm ${familyColor(m.family)}`}>
              {m.family === 'opus' ? 'O' : m.family === 'haiku' ? 'H' : 'S'}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`font-medium ${familyColor(m.family)}`}>{m.displayName}</p>
              <p className="text-xs text-claude-muted truncate">{m.id}</p>
            </div>
            {model === m.id && <svg className="w-3.5 h-3.5 text-claude-orange flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </button>
        ))}

        {models.length === 0 && (
          <div className="px-3 py-3 text-xs text-claude-muted text-center">
            모델 목록을 불러오는 중...
          </div>
        )}
      </div>
    </div>,
    document.body
  )

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        disabled={disabled}
        title="모델 선택"
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
          model
            ? `${familyColor(current?.family ?? 'sonnet')} bg-white border border-claude-border shadow-sm`
            : 'text-claude-muted hover:text-claude-text hover:bg-white/60'
        }`}
      >
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
        </svg>
        <span>{label}</span>
        <svg className={`w-2.5 h-2.5 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  )
}

export function InputArea({
  cwd, promptHistory, onSend, onAbort, isStreaming, disabled,
  permissionMode, planMode, model,
  onPermissionModeChange, onPlanModeChange, onModelChange,
  permissionShortcutLabel, bypassShortcutLabel,
}: Props) {
  const [text, setText] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<SelectedFile[]>([])
  const [isAttaching, setIsAttaching] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const compositionEndedAtRef = useRef(0)
  const escapePressedAtRef = useRef(0)

  // @ 파일 참조 상태
  const [atMention, setAtMention] = useState<{ query: string; startPos: number } | null>(null)
  const [atResults, setAtResults] = useState<FileEntry[]>([])
  const [atSelectedIndex, setAtSelectedIndex] = useState(0)
  const atQueryRef = useRef<string | null>(null)
  const atItemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [slashMention, setSlashMention] = useState<{ query: string; startPos: number } | null>(null)
  const [slashResults, setSlashResults] = useState<SlashCommand[]>([])
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const slashItemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const draftTextRef = useRef('')

  // 앱 시작 시 모델 목록 로드 (5분 캐시는 main process에서 처리)
  useEffect(() => {
    window.claude.getModels().then(setModels).catch(() => {})
    window.claude.listSkills()
      .then((commands) => {
        const customCommands = commands.map((command) => ({ ...command, kind: 'custom' as const }))
        setSlashCommands([...BUILTIN_SLASH_COMMANDS, ...customCommands])
      })
      .catch(() => setSlashCommands(BUILTIN_SLASH_COMMANDS))
  }, [])

  useEffect(() => {
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (matchShortcut(event, permissionShortcutLabel)) {
        event.preventDefault()
        event.stopPropagation()
        cycleClaudeCodeMode(permissionMode, planMode, onPermissionModeChange, onPlanModeChange)
        return
      }

      if (bypassShortcutLabel && matchShortcut(event, bypassShortcutLabel)) {
        event.preventDefault()
        event.stopPropagation()
        if (!planMode) {
          onPermissionModeChange(permissionMode === 'bypassPermissions' ? 'default' : 'bypassPermissions')
        }
      }
    }

    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => window.removeEventListener('keydown', onKeyDownCapture, true)
  }, [permissionMode, permissionShortcutLabel, planMode, bypassShortcutLabel, onPermissionModeChange, onPlanModeChange])

  const closeAtMention = useCallback(() => {
    setAtMention(null)
    setAtResults([])
    atQueryRef.current = null
  }, [])

  const closeSlashMention = useCallback(() => {
    setSlashMention(null)
    setSlashResults([])
  }, [])

  const handleAtSelect = useCallback(async (file: FileEntry) => {
    if (!atMention) return
    const cursor = textareaRef.current?.selectionStart ?? (atMention.startPos + atMention.query.length + 1)
    const newText = text.slice(0, atMention.startPos) + text.slice(cursor)
    setText(newText)
    closeAtMention()

    const selectedFile = await window.claude.readFile(file.path)
    if (selectedFile) {
      setAttachedFiles((prev) => {
        const existing = new Set(prev.map((f) => f.path))
        if (existing.has(file.path)) return prev
        return [...prev, selectedFile]
      })
    }
    textareaRef.current?.focus()
  }, [atMention, text, closeAtMention])

  // 선택된 @ 드롭다운 아이템을 뷰에 보이게 스크롤
  useEffect(() => {
    atItemRefs.current[atSelectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [atSelectedIndex])

  useEffect(() => {
    slashItemRefs.current[slashSelectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [slashSelectedIndex])

  const handleSlashSelect = useCallback((command: SlashCommand) => {
    if (!slashMention) return
    const cursor = textareaRef.current?.selectionStart ?? (slashMention.startPos + slashMention.query.length + 1)
    const newText = `${text.slice(0, slashMention.startPos)}/${command.name} ${text.slice(cursor)}`
    setText(newText)
    closeSlashMention()
    requestAnimationFrame(() => {
      const nextCursor = slashMention.startPos + command.name.length + 2
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }, [slashMention, text, closeSlashMention])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if ((!trimmed && attachedFiles.length === 0) || isStreaming || disabled) return
    onSend(trimmed, attachedFiles)
    setText('')
    setAttachedFiles([])
    closeAtMention()
    closeSlashMention()
    setHistoryIndex(null)
    draftTextRef.current = ''
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [text, attachedFiles, isStreaming, disabled, onSend, closeAtMention, closeSlashMention])

  useEffect(() => {
    setHistoryIndex(null)
    draftTextRef.current = ''
  }, [promptHistory])

  const syncTextareaHeight = (value: string) => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    if (value.length === 0) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const applyHistoryText = (value: string) => {
    setText(value)
    requestAnimationFrame(() => {
      syncTextareaHeight(value)
      const end = value.length
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(end, end)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget
    const cursor = textarea.selectionStart
    const hasSelection = textarea.selectionStart !== textarea.selectionEnd
    const beforeCursor = textarea.value.slice(0, cursor)
    const afterCursor = textarea.value.slice(cursor)
    const isAtFirstLine = !beforeCursor.includes('\n')
    const isAtLastLine = !afterCursor.includes('\n')

    if (e.key === 'Escape') {
      const now = Date.now()

      if (slashResults.length > 0) {
        e.preventDefault()
        closeSlashMention()
        escapePressedAtRef.current = 0
        return
      }

      if (atResults.length > 0) {
        e.preventDefault()
        closeAtMention()
        escapePressedAtRef.current = 0
        return
      }

      if (isStreaming) {
        e.preventDefault()
        if (now - escapePressedAtRef.current < 600) {
          escapePressedAtRef.current = 0
          onAbort()
        } else {
          escapePressedAtRef.current = now
        }
        return
      }

      escapePressedAtRef.current = 0
      return
    }

    escapePressedAtRef.current = 0

    if (!hasSelection && slashResults.length === 0 && atResults.length === 0 && promptHistory.length > 0) {
      if (e.key === 'ArrowUp' && isAtFirstLine) {
        e.preventDefault()
        const uniqueHistory = [...new Set(promptHistory)].reverse()
        if (uniqueHistory.length === 0) return
        const nextIndex = historyIndex === null ? 0 : Math.min(historyIndex + 1, uniqueHistory.length - 1)
        if (historyIndex === null) {
          draftTextRef.current = text
        }
        setHistoryIndex(nextIndex)
        applyHistoryText(uniqueHistory[nextIndex])
        return
      }

      if (e.key === 'ArrowDown' && historyIndex !== null && isAtLastLine) {
        e.preventDefault()
        const uniqueHistory = [...new Set(promptHistory)].reverse()
        if (historyIndex <= 0) {
          setHistoryIndex(null)
          applyHistoryText(draftTextRef.current)
        } else {
          const nextIndex = historyIndex - 1
          setHistoryIndex(nextIndex)
          applyHistoryText(uniqueHistory[nextIndex])
        }
        return
      }
    }

    if (slashResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashSelectedIndex((i) => (i + 1) % slashResults.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashSelectedIndex((i) => (i - 1 + slashResults.length) % slashResults.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const native = e.nativeEvent as KeyboardEvent
        const isIme = isComposingRef.current || native.isComposing || (native.keyCode || native.which) === 229
        if (!isIme) {
          e.preventDefault()
          handleSlashSelect(slashResults[slashSelectedIndex])
          return
        }
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        handleSlashSelect(slashResults[slashSelectedIndex])
        return
      }
    }

    // @ 드롭다운 키보드 탐색
    if (atResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAtSelectedIndex((i) => (i + 1) % atResults.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAtSelectedIndex((i) => (i - 1 + atResults.length) % atResults.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const native = e.nativeEvent as KeyboardEvent
        const isIme = isComposingRef.current || native.isComposing || (native.keyCode || native.which) === 229
        if (!isIme) {
          e.preventDefault()
          handleAtSelect(atResults[atSelectedIndex])
          return
        }
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        handleAtSelect(atResults[atSelectedIndex])
        return
      }
    }

    if (e.key !== 'Enter' || e.shiftKey) return

    const native = e.nativeEvent as KeyboardEvent
    const keyCode = native.keyCode || native.which
    const withinImeCommitWindow = Date.now() - compositionEndedAtRef.current < 40
    const isImeComposing = isComposingRef.current || native.isComposing || keyCode === 229

    // 한글/일본어 IME 조합 종료 직후 Enter 이벤트에서 마지막 글자가 중복 전송되는 케이스 방지
    if (isImeComposing || withinImeCommitWindow) {
      e.preventDefault()
      return
    }

    e.preventDefault()
    handleSend()
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)
    if (historyIndex === null) {
      draftTextRef.current = val
    }
    if (historyIndex !== null) {
      setHistoryIndex(null)
      draftTextRef.current = val
    }
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'

    // @ 파일 참조 감지
    const cursor = ta.selectionStart
    const match = val.slice(0, cursor).match(/@([^\s@]*)$/)
    const slashMatch = val.slice(0, cursor).match(/(^|\s)\/([^\s/]*)$/)

    if (match && cwd) {
      const query = match[1]
      const startPos = cursor - match[0].length
      setAtMention({ query, startPos })
      setAtSelectedIndex(0)
      atQueryRef.current = query
      closeSlashMention()
      window.claude.listFiles(cwd, query).then((files) => {
        if (atQueryRef.current === query) setAtResults(files)
      }).catch(() => { if (atQueryRef.current === query) setAtResults([]) })
    } else if (slashMatch) {
      const query = slashMatch[2].toLowerCase()
      const startPos = cursor - query.length - 1
      const filtered = slashCommands.filter((command) => command.name.toLowerCase().includes(query))
      setSlashMention({ query, startPos })
      setSlashResults(filtered)
      setSlashSelectedIndex(0)
      closeAtMention()
    } else {
      closeAtMention()
      closeSlashMention()
    }
  }

  // 커서 이동 시 @ 드롭다운 닫기 (방향키, 마우스 클릭 등)
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    if (!atMention) return
    const cursor = (e.target as HTMLTextAreaElement).selectionStart
    const textBefore = text.slice(0, cursor)
    if (!textBefore.match(/@([^\s@]*)$/)) {
      closeAtMention()
    }
    if (!textBefore.match(/(^|\s)\/([^\s/]*)$/)) {
      closeSlashMention()
    }
  }

  const handleAttachFiles = async () => {
    if (isAttaching || isStreaming) return
    setIsAttaching(true)
    try {
      const files = await window.claude.selectFiles()
      if (files?.length > 0) {
        setAttachedFiles((prev) => {
          const existing = new Set(prev.map((f) => f.path))
          return [...prev, ...files.filter((f) => !existing.has(f.path))]
        })
      }
    } finally {
      setIsAttaching(false)
    }
  }

  const canSend = (text.trim().length > 0 || attachedFiles.length > 0) && !isStreaming && !disabled

  return (
    <div className="border-t border-claude-border bg-white px-4 pt-3 pb-4">
      {/* 첨부파일 칩 */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachedFiles.map((file) => (
            <div key={file.path} className="flex items-center gap-1.5 bg-claude-bg border border-claude-border rounded-lg px-2.5 py-1 text-xs">
              <svg className="w-3.5 h-3.5 text-claude-orange flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-claude-text font-medium max-w-[120px] truncate">{file.name}</span>
              <span className="text-claude-muted">{formatBytes(file.size)}</span>
              <button
                onClick={() => setAttachedFiles((p) => p.filter((f) => f.path !== file.path))}
                className="ml-0.5 text-claude-muted hover:text-red-500 transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 입력 컨테이너 (@ 드롭다운 포함) */}
      <div className="relative">
        {/* @ 파일 참조 드롭다운 */}
        {(slashResults.length > 0 || atResults.length > 0) && (
          <div className="absolute bottom-full left-0 right-0 mb-1.5 z-50 bg-white border border-claude-border rounded-xl shadow-lg overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-claude-border/50 bg-claude-bg/50">
              {slashResults.length > 0 ? (
                <svg className="w-3 h-3 text-claude-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 3L8 21M8 3h8" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-claude-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              )}
              <span className="text-xs font-medium text-claude-muted">
                {slashResults.length > 0 ? '슬래시 명령어' : '파일 참조'}
              </span>
              <span className="text-xs text-claude-muted/60 ml-auto">↑↓ 탐색 · Enter 선택 · Esc 닫기</span>
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {slashResults.length > 0 ? (
                slashResults.map((command, i) => (
                  <button
                    key={command.path}
                    ref={(el) => { slashItemRefs.current[i] = el }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSlashSelect(command)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                      i === slashSelectedIndex ? 'bg-claude-orange/10 text-claude-text' : 'hover:bg-claude-bg text-claude-text'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-claude-orange flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3L8 21M8 3h8" />
                    </svg>
                    <span className="font-medium truncate">/{command.name}</span>
                    <span className="text-xs text-claude-muted truncate ml-auto max-w-[40%]">
                      {command.kind === 'builtin'
                        ? (command.description ?? '내장 명령어')
                        : command.legacy
                          ? `commands/${command.name}`
                          : `skills/${command.name}`}
                    </span>
                  </button>
                ))
              ) : atResults.map((file, i) => (
                <button
                  key={file.path}
                  ref={(el) => { atItemRefs.current[i] = el }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleAtSelect(file)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                    i === atSelectedIndex ? 'bg-claude-orange/10 text-claude-text' : 'hover:bg-claude-bg text-claude-text'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 text-claude-orange flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-medium truncate">{file.name}</span>
                  <span className="text-xs text-claude-muted truncate ml-auto max-w-[40%]">{file.relativePath}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-claude-bg border border-claude-border rounded-2xl focus-within:border-claude-orange/50 focus-within:ring-1 focus-within:ring-claude-orange/20 transition-all overflow-hidden">

        {/* Textarea */}
        <div className="px-4 pt-3 pb-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onBlur={() => setTimeout(() => { closeAtMention(); closeSlashMention() }, 150)}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              compositionEndedAtRef.current = Date.now()
            }}
            placeholder={
              isStreaming ? '응답을 기다리는 중...'
              : attachedFiles.length > 0 ? '파일에 대해 질문하거나 지시사항을 입력하세요...'
              : '@로 파일참조 · /로 명령어 · Shift+Enter: 줄바꿈 · Enter: 전송'
            }
            rows={1}
            disabled={isStreaming || disabled}
            className="w-full bg-transparent resize-none outline-none text-sm text-claude-text placeholder-claude-muted leading-relaxed disabled:opacity-50 min-h-[24px] max-h-[200px]"
          />
        </div>

        {/* 하단 툴바 */}
        <div className="flex items-center gap-1.5 px-3 pb-2.5 border-t border-claude-border/50 pt-2">
          {/* 파일 첨부 */}
          <button
            onClick={handleAttachFiles}
            disabled={isStreaming || disabled || isAttaching}
            title="파일 첨부"
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-claude-muted hover:text-claude-orange hover:bg-white transition-colors disabled:opacity-30"
          >
            {isAttaching
              ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" /></svg>
              : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            }
          </button>

          <div className="w-px h-4 bg-claude-border flex-shrink-0" />

          {/* 편집 권한 */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {PERMISSION_OPTIONS.filter((opt) => opt.value !== 'bypassPermissions').map((opt) => {
              const isActive = !planMode && permissionMode === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => onPermissionModeChange(opt.value)}
                  disabled={isStreaming}
                  title={`${opt.title}${permissionShortcutLabel ? ` (${permissionShortcutLabel})` : ''}`}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
                    isActive
                      ? 'bg-white text-claude-text shadow-sm border border-claude-border'
                      : 'text-claude-muted hover:text-claude-text hover:bg-white/60'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
            <button
              onClick={() => {
                const nextPlanMode = !planMode
                onPlanModeChange(nextPlanMode)
                if (nextPlanMode) onPermissionModeChange('default')
              }}
              disabled={isStreaming}
              title={
                `${planMode ? '플랜 모드 OFF' : '플랜 모드 ON: 읽기·분석만'}${
                  permissionShortcutLabel ? ` (${permissionShortcutLabel})` : ''
                }`
              }
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 flex-shrink-0 ${
                planMode
                  ? 'bg-white text-claude-text shadow-sm border border-claude-border'
                  : 'text-claude-muted hover:text-claude-text hover:bg-white/60'
              }`}
            >
              <span>📋</span>
              <span>플랜 모드</span>
            </button>

            <button
              onClick={() => onPermissionModeChange('bypassPermissions')}
              disabled={isStreaming || planMode}
              title={
                planMode
                  ? '플랜 모드에서는 전체허용을 사용할 수 없음'
                  : `${PERMISSION_OPTIONS.find((opt) => opt.value === 'bypassPermissions')?.title ?? '전체허용'}${bypassShortcutLabel ? ` (${bypassShortcutLabel})` : ''}`
              }
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
                permissionMode === 'bypassPermissions'
                  ? 'bg-white text-claude-text shadow-sm border border-claude-border'
                  : 'text-claude-muted hover:text-claude-text hover:bg-white/60'
              }`}
            >
              {PERMISSION_OPTIONS.find((opt) => opt.value === 'bypassPermissions')?.label ?? '⚡ 전체허용'}
            </button>
          </div>

          <div className="flex-1" />

          {/* 모델 선택 */}
          <ModelPicker
            model={model}
            models={models}
            onChange={onModelChange}
            disabled={isStreaming}
          />

          <div className="w-px h-4 bg-claude-border flex-shrink-0" />

          {/* 전송 / 중단 */}
          {isStreaming ? (
            <button
              onClick={onAbort}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
              title="중단"
            >
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-claude-orange hover:bg-claude-orange/90 disabled:opacity-30 flex items-center justify-center transition-colors"
              title="전송 (Enter)"
            >
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
