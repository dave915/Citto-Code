import type { SelectedFile } from '../../../electron/preload'
import type { PendingPermissionRequest, PermissionMode } from '../../store/sessions'
import { translate, type AppLanguage, type TranslationKey } from '../../lib/i18n'

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

const BUILTIN_SLASH_COMMAND_KEYS = {
  'add-dir': 'input.slash.addDir',
  agents: 'input.slash.agents',
  bug: 'input.slash.bug',
  clear: 'input.slash.clear',
  compact: 'input.slash.compact',
  config: 'input.slash.config',
  cost: 'input.slash.cost',
  doctor: 'input.slash.doctor',
  help: 'input.slash.help',
  init: 'input.slash.init',
  login: 'input.slash.login',
  logout: 'input.slash.logout',
  mcp: 'input.slash.mcp',
  memory: 'input.slash.memory',
  model: 'input.slash.model',
  permissions: 'input.slash.permissions',
  pr_comments: 'input.slash.prComments',
  review: 'input.slash.review',
  status: 'input.slash.status',
  'terminal-setup': 'input.slash.terminalSetup',
  vim: 'input.slash.vim',
} as const satisfies Record<string, TranslationKey>

export function getBuiltinSlashCommands(language: AppLanguage = 'ko'): SlashCommand[] {
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
    description: translate(language, BUILTIN_SLASH_COMMAND_KEYS[name]),
  }))
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'heic', 'heif'])
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
}

function createSyntheticAttachmentName(file: File, source: 'drop' | 'clipboard', ext: string, isImage: boolean): string {
  const rawName = file.name.trim()
  if (rawName) return rawName

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const prefix = source === 'clipboard'
    ? (isImage ? 'pasted-image' : 'pasted-file')
    : (isImage ? 'attached-image' : 'attached-file')
  return ext ? `${prefix}-${suffix}.${ext}` : `${prefix}-${suffix}`
}

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

function getFileExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (fromName) return fromName
  return IMAGE_MIME_EXTENSIONS[file.type] ?? ''
}

async function readBrowserFiles(files: File[], source: 'drop' | 'clipboard'): Promise<SelectedFile[]> {
  const selectedFiles: Array<SelectedFile | null> = await Promise.all(
    files.map(async (file) => {
      try {
        const ext = getFileExtension(file)
        const isImage = IMAGE_EXTENSIONS.has(ext) || file.type.startsWith('image/')
        const fallbackName = createSyntheticAttachmentName(file, source, ext, isImage)
        const filePath = window.claude.getPathForFile(file)
        const resolvedPath = filePath.trim().length > 0
          ? filePath
          : `${source}://${fallbackName}`

        if (isImage) {
          const buffer = await file.arrayBuffer()
          const base64 = toBase64(new Uint8Array(buffer))
          return {
            name: fallbackName,
            path: resolvedPath,
            content: '',
            size: file.size,
            fileType: 'image' as const,
            dataUrl: `data:${file.type || 'application/octet-stream'};base64,${base64}`,
          }
        }

        const content = await file.text()
        return {
          name: fallbackName,
          path: resolvedPath,
          content,
          size: file.size,
          fileType: 'text' as const,
        }
      } catch (error) {
        console.warn(`[readBrowserFiles] Failed to read ${source} file:`, file.name, error)
        return null
      }
    }),
  )

  return selectedFiles.filter((file): file is SelectedFile => file !== null)
}

export function getPermissionOptions(language: AppLanguage = 'ko'): { value: PermissionMode; label: string; title: string }[] {
  return [
    {
      value: 'default',
      label: `🔒 ${translate(language, 'input.permission.default.label')}`,
      title: translate(language, 'input.permission.default.title'),
    },
    {
      value: 'acceptEdits',
      label: `✅ ${translate(language, 'input.permission.acceptEdits.label')}`,
      title: translate(language, 'input.permission.acceptEdits.title'),
    },
    {
      value: 'bypassPermissions',
      label: `⚡ ${translate(language, 'input.permission.bypass.label')}`,
      title: translate(language, 'input.permission.bypass.title'),
    },
  ]
}

export function getPermissionActions(language: AppLanguage = 'ko'): PermissionAction[] {
  return [
    {
      action: 'once',
      title: translate(language, 'input.permission.once.title'),
      description: translate(language, 'input.permission.once.description'),
      badge: translate(language, 'input.permission.once.badge'),
    },
    {
      action: 'always',
      title: translate(language, 'input.permission.always.title'),
      description: translate(language, 'input.permission.always.description'),
      badge: translate(language, 'input.permission.always.badge'),
    },
    {
      action: 'deny',
      title: translate(language, 'input.permission.deny.title'),
      description: translate(language, 'input.permission.deny.description'),
      badge: translate(language, 'input.permission.deny.badge'),
    },
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
  return readBrowserFiles(Array.from(dataTransfer.files), 'drop')
}

export async function readPastedFiles(dataTransfer: DataTransfer): Promise<SelectedFile[]> {
  const itemFiles = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)

  const files = itemFiles.length > 0 ? itemFiles : Array.from(dataTransfer.files)
  return readBrowserFiles(files, 'clipboard')
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

  return translate(language, 'input.permission.request')
}
