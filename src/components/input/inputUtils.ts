import type { SelectedFile } from '../../../electron/preload'
import type { PendingPermissionRequest, PermissionMode } from '../../store/sessions'

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

export const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
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

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'heic', 'heif'])

export const PERMISSION_OPTIONS: { value: PermissionMode; label: string; title: string }[] = [
  { value: 'default',           label: '🔒 기본',    title: '파일 수정 전 확인 요청' },
  { value: 'acceptEdits',       label: '✅ 자동승인', title: '파일 편집 자동 수락' },
  { value: 'bypassPermissions', label: '⚡ 전체허용', title: '모든 권한 확인 건너뜀' },
]

export const PERMISSION_ACTIONS: PermissionAction[] = [
  { action: 'once', title: '이번만 허용 후 계속', description: '현재 요청만 승인하고 작업 이어서 진행', badge: '1회' },
  { action: 'always', title: '이 세션에서 계속 허용', description: '현재 세션 권한을 올리고 중단된 작업 계속', badge: '세션' },
  { action: 'deny', title: '권한 요청 닫기', description: '승인하지 않고 현재 요청 종료', badge: '취소' },
]

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

export function formatPermissionPreview(request: PendingPermissionRequest | null): string {
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

  return '권한 요청'
}
