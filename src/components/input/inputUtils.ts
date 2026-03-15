import type { SelectedFile } from '../../../electron/preload'
import type { PendingPermissionRequest, PermissionMode } from '../../store/sessions'
import type { AppLanguage } from '../../lib/i18n'

export type SlashCommand = {
  name: string
  path: string
  dir: string
  legacy: boolean
  description?: string
  pluginName?: string
  kind?: 'builtin' | 'custom' | 'plugin'
}

export type PermissionAction = {
  action: 'once' | 'always' | 'deny'
  title: string
  description: string
  badge: string
}

export function getBuiltinSlashCommands(language: AppLanguage = 'ko'): SlashCommand[] {
  const descriptions = language === 'en'
    ? {
        'add-dir': 'Add working directory',
        agents: 'Manage agents',
        bug: 'Send bug report',
        clear: 'Clear conversation history',
        compact: 'Compact conversation',
        config: 'View or edit config',
        cost: 'Show token usage',
        doctor: 'Check installation status',
        help: 'Help',
        init: 'Initialize CLAUDE.md',
        login: 'Switch account',
        logout: 'Log out',
        mcp: 'Manage MCP connections',
        memory: 'Edit CLAUDE.md memory',
        model: 'Select or change model',
        permissions: 'View or edit permissions',
        pr_comments: 'Show PR comments',
        review: 'Request code review',
        status: 'Show status',
        'terminal-setup': 'Configure Shift+Enter newline',
        vim: 'Toggle vim mode',
      }
    : {
        'add-dir': '작업 디렉토리 추가',
        agents: '에이전트 관리',
        bug: '버그 리포트 전송',
        clear: '대화 기록 지우기',
        compact: '대화 압축',
        config: '설정 보기/수정',
        cost: '토큰 사용량 보기',
        doctor: '설치 상태 점검',
        help: '도움말',
        init: 'CLAUDE.md 초기화',
        login: '계정 전환',
        logout: '로그아웃',
        mcp: 'MCP 연결 관리',
        memory: 'CLAUDE.md 메모리 편집',
        model: '모델 선택/변경',
        permissions: '권한 보기/수정',
        pr_comments: 'PR 댓글 보기',
        review: '코드 리뷰 요청',
        status: '상태 보기',
        'terminal-setup': 'Shift+Enter 줄바꿈 설정',
        vim: 'vim 모드 전환',
      }

  return [
    'add-dir',
    'agents',
    'bug',
    'clear',
    'compact',
    'config',
    'cost',
    'doctor',
    'help',
    'init',
    'login',
    'logout',
    'mcp',
    'memory',
    'model',
    'permissions',
    'pr_comments',
    'review',
    'status',
    'terminal-setup',
    'vim',
  ].map((name) => ({
    name,
    path: '',
    dir: '',
    legacy: false,
    kind: 'builtin' as const,
    description: descriptions[name as keyof typeof descriptions],
  }))
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'heic', 'heif'])

export function getPermissionOptions(language: AppLanguage = 'ko'): { value: PermissionMode; label: string; title: string }[] {
  return language === 'en'
    ? [
        { value: 'default', label: '🔒 Default', title: 'Ask before editing files' },
        { value: 'acceptEdits', label: '✅ Auto-approve', title: 'Automatically accept file edits' },
        { value: 'bypassPermissions', label: '⚡ Bypass', title: 'Skip all permission confirmations' },
      ]
    : [
        { value: 'default', label: '🔒 기본', title: '파일 수정 전 확인 요청' },
        { value: 'acceptEdits', label: '✅ 자동승인', title: '파일 편집 자동 수락' },
        { value: 'bypassPermissions', label: '⚡ 전체허용', title: '모든 권한 확인 건너뜀' },
      ]
}

export function getPermissionActions(language: AppLanguage = 'ko'): PermissionAction[] {
  return language === 'en'
    ? [
        { action: 'once', title: 'Allow once and continue', description: 'Approve only this request and resume the task', badge: '1x' },
        { action: 'always', title: 'Always allow in this session', description: 'Raise session permissions and resume the interrupted task', badge: 'Session' },
        { action: 'deny', title: 'Close permission request', description: 'Stop this request without approving it', badge: 'Cancel' },
      ]
    : [
        { action: 'once', title: '이번만 허용 후 계속', description: '현재 요청만 승인하고 작업 이어서 진행', badge: '1회' },
        { action: 'always', title: '이 세션에서 계속 허용', description: '현재 세션 권한을 올리고 중단된 작업 계속', badge: '세션' },
        { action: 'deny', title: '권한 요청 닫기', description: '승인하지 않고 현재 요청 종료', badge: '취소' },
      ]
}

export function sanitizeEnvVars(envVars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(envVars).filter(([key, value]) => {
      const trimmed = value.trim()
      if (!trimmed) return false
      if (key === 'ANTHROPIC_API_KEY' && trimmed === 'your-key') return false
      if (key === 'ANTHROPIC_BASE_URL' && trimmed === 'https://api.example.com') return false
      return true
    })
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export async function readDroppedFiles(dataTransfer: DataTransfer): Promise<SelectedFile[]> {
  const files = Array.from(dataTransfer.files)
  const selectedFiles: Array<SelectedFile | null> = await Promise.all(
    files.map(async (file) => {
      try {
        const filePath = window.claude.getPathForFile(file)
        const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

        if (IMAGE_EXTENSIONS.has(ext)) {
          const buffer = await file.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          const chunkSize = 0x8000
          let binary = ''

          for (let index = 0; index < bytes.length; index += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
          }

          const base64 = btoa(binary)
          return {
            name: file.name,
            path: filePath.trim().length > 0 ? filePath : file.name,
            content: '',
            size: file.size,
            fileType: 'image' as const,
            dataUrl: `data:${file.type || 'application/octet-stream'};base64,${base64}`,
          }
        }

        const content = await file.text()
        return {
          name: file.name,
          path: filePath.trim().length > 0 ? filePath : file.name,
          content,
          size: file.size,
          fileType: 'text' as const,
        }
      } catch (error) {
        console.warn('[readDroppedFiles] Failed to read file:', file.name, error)
        return null
      }
    })
  )

  return selectedFiles.filter((file): file is SelectedFile => file !== null)
}

export function cycleClaudeCodeMode(
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

export function formatPermissionPreview(request: PendingPermissionRequest | null, language: AppLanguage = 'ko'): string {
  if (!request) return ''

  const input = request.toolInput
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>
    const pathValue = record.file_path ?? record.path ?? record.notebook_path
    if (typeof pathValue === 'string' && pathValue.trim()) {
      return pathValue
    }

    const commandValue = record.command
    if (typeof commandValue === 'string' && commandValue.trim()) {
      return commandValue
    }
  }

  return language === 'en' ? 'Permission request' : '권한 요청'
}
