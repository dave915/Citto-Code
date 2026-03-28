import type { RecentProject, SelectedFile } from '../../electron/preload'
import { translate, type AppLanguage } from './i18n'
import type {
  NotificationMode,
  PendingPermissionRequest,
  PendingQuestionRequest,
  PermissionMode,
  Session,
} from '../store/sessions'
import { getProjectNameFromPath } from '../store/sessions'

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
const AUTO_HTML_PREVIEW_TRIGGER_PATTERNS = [
  /보여줘/,
  /보여주세요/,
  /시각화/,
  /데모/,
  /예시/,
  /애니메이션/,
  /인터랙티브/,
  /움직/,
  /화면/,
  /미리보기/,
  /목업/,
  /프로토타입/,
  /템플릿/,
  /\bui\b/i,
  /\bux\b/i,
  /\bdemo\b/i,
  /\bshow\b/i,
  /\bvisual/i,
  /\bpreview\b/i,
  /\binteractive\b/i,
  /\banimat(?:e|ion)\b/i,
  /\bprototype\b/i,
  /\bmockup\b/i,
  /\bsimulat(?:e|ion)\b/i,
]
const AUTO_HTML_PREVIEW_EXPLICIT_PATTERNS = [
  /\bhtml\b.*\bpreview\b/i,
  /\bpreview\b.*\bhtml\b/i,
  /\blive\s+preview\b/i,
  /\binteractive\s+demo\b/i,
  /html\s*미리보기/i,
  /미리보기\s*(를|로)?\s*(만들|생성|보여)/,
  /데모\s*(를|로)?\s*(만들|생성|보여)/,
]
const AUTO_HTML_PREVIEW_SKIP_PATTERNS = [
  /설명만/,
  /텍스트만/,
  /코드\s*말고/,
  /html\s*말고/i,
  /미리보기\s*없이/,
  /preview\s*없이/i,
  /text\s*only/i,
]
const AUTO_HTML_PREVIEW_PATH_MARKER = '/.citto-code/previews/'

function formatAutoPreviewTimestamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

function joinPromptPath(basePath: string, child: string): string {
  const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/+$/, '')
  return `${normalizedBase}/${child.replace(/^\/+/, '')}`
}

function normalizePathKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').trim().toLowerCase()
}

function extractToolReferencedFilePaths(toolName: string, toolInput: unknown): string[] {
  if (!toolInput || typeof toolInput !== 'object') return []
  if (toolName !== 'Read' && !isWriteLikeTool(toolName)) return []

  const record = toolInput as {
    file_path?: unknown
    notebook_path?: unknown
    path?: unknown
  }

  const candidate = record.file_path ?? record.notebook_path ?? record.path
  if (typeof candidate !== 'string' || !candidate.trim()) return []
  return [candidate.trim()]
}

function getAutoPreviewDirectoryFromPath(path: string): string | null {
  const normalizedPath = path.replace(/\\/g, '/').replace(/\/+/g, '/').trim()
  const normalizedKey = normalizedPath.toLowerCase()
  const markerIndex = normalizedKey.indexOf(AUTO_HTML_PREVIEW_PATH_MARKER)
  if (markerIndex < 0) return null

  const suffix = normalizedPath.slice(markerIndex + AUTO_HTML_PREVIEW_PATH_MARKER.length)
  const folderName = suffix.split('/').filter(Boolean)[0]
  if (!folderName) return null

  return normalizedPath.slice(0, markerIndex + AUTO_HTML_PREVIEW_PATH_MARKER.length + folderName.length)
}

function isAppInBackground(): boolean {
  return document.visibilityState !== 'visible' || !document.hasFocus()
}

function resolveAppLanguage(language?: AppLanguage): AppLanguage {
  if (language) return language
  if (typeof document !== 'undefined' && document.documentElement.lang.startsWith('en')) {
    return 'en'
  }
  return 'ko'
}

export function sanitizeEnvVars(envVars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(envVars).filter(([key, value]) => {
      const trimmed = value.trim()
      if (!trimmed) return false
      if (key === 'ANTHROPIC_API_KEY' && trimmed === 'your-key') return false
      if (key === 'ANTHROPIC_BASE_URL' && trimmed === 'https://api.example.com') return false
      return true
    }),
  )
}

export function isLocalModelSelection(model: string | null | undefined): boolean {
  if (!model) return false
  const normalized = model.trim().toLowerCase()
  if (!normalized) return false
  if (/^claude-/i.test(normalized)) return false
  if (normalized === 'sonnet' || normalized === 'opus' || normalized === 'haiku') return false
  return true
}

export function isThinkingSignatureError(error: string | null | undefined): boolean {
  return (error?.toLowerCase() ?? '').includes('invalid signature in thinking block')
}

export function resolveEnvVarsForModel(
  model: string | null | undefined,
  envVars: Record<string, string>,
): Record<string, string> | undefined {
  const resolved = { ...envVars }

  if (isLocalModelSelection(model)) {
    if (!resolved.ANTHROPIC_BASE_URL) resolved.ANTHROPIC_BASE_URL = DEFAULT_OLLAMA_BASE_URL
    if (!resolved.ANTHROPIC_AUTH_TOKEN) resolved.ANTHROPIC_AUTH_TOKEN = 'ollama'
    resolved.ANTHROPIC_API_KEY = ''
    resolved.CLAUDE_CODE_USE_BEDROCK = ''
    resolved.ANTHROPIC_BEDROCK_BASE_URL = ''
    resolved.CLAUDE_CODE_SKIP_BEDROCK_AUTH = ''
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined
}

export function normalizeSelectedFolder(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const firstString = value.find((item): item is string => typeof item === 'string')
    return firstString ?? null
  }

  if (value && typeof value === 'object') {
    const candidate = (value as { path?: unknown; filePath?: unknown; filePaths?: unknown }).path
      ?? (value as { path?: unknown; filePath?: unknown; filePaths?: unknown }).filePath

    if (typeof candidate === 'string') {
      return candidate
    }

    const filePaths = (value as { filePaths?: unknown }).filePaths
    if (Array.isArray(filePaths)) {
      const firstString = filePaths.find((item): item is string => typeof item === 'string')
      return firstString ?? null
    }
  }

  return null
}

export function shouldAutoGenerateHtmlPreview(
  text: string,
  files: SelectedFile[],
  autoPreviewEnabled = true,
): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  if (normalized.length > 3000) return false
  if (files.some((file) => file.fileType === 'image')) return false
  if (AUTO_HTML_PREVIEW_SKIP_PATTERNS.some((pattern) => pattern.test(normalized))) return false
  if (AUTO_HTML_PREVIEW_EXPLICIT_PATTERNS.some((pattern) => pattern.test(normalized))) return true
  if (!autoPreviewEnabled) return false
  return AUTO_HTML_PREVIEW_TRIGGER_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function buildAutoHtmlPreviewInstruction(userText: string, cwd: string, language?: AppLanguage): string {
  const resolvedLanguage = resolveAppLanguage(language)
  const previewRoot = joinPromptPath(cwd || '~', `.citto-code/previews/visual-demo-${formatAutoPreviewTimestamp()}`)
  const indexPath = joinPromptPath(previewRoot, 'index.html')

  return [
    '<system-reminder>',
    translate(resolvedLanguage, 'runtime.autoPreview.answerAsDemo'),
    translate(resolvedLanguage, 'runtime.autoPreview.outputPath', { path: indexPath }),
    translate(resolvedLanguage, 'runtime.autoPreview.useWriteTools'),
    translate(resolvedLanguage, 'runtime.autoPreview.requestPermissionViaTool'),
    translate(resolvedLanguage, 'runtime.autoPreview.afterPermission'),
    translate(resolvedLanguage, 'runtime.autoPreview.noFullCode'),
    translate(resolvedLanguage, 'runtime.autoPreview.noFrameworks'),
    translate(resolvedLanguage, 'runtime.autoPreview.selfContained'),
    translate(resolvedLanguage, 'runtime.autoPreview.keepTone'),
    translate(resolvedLanguage, 'runtime.autoPreview.visualQuality'),
    translate(resolvedLanguage, 'runtime.autoPreview.readFileAfter', { path: indexPath }),
    translate(resolvedLanguage, 'runtime.autoPreview.assumeMissingInfo'),
    translate(resolvedLanguage, 'runtime.autoPreview.keepFinalShort'),
    translate(resolvedLanguage, 'runtime.autoPreview.userRequest', { request: userText.trim() }),
    '</system-reminder>',
  ].join('\n')
}

export function summarizeNotificationBody(text: string | null | undefined, language?: AppLanguage): string {
  const resolvedLanguage = resolveAppLanguage(language)
  const normalized = text?.replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized) return translate(resolvedLanguage, 'notification.defaultBody')
  if (normalized.length <= 120) return normalized
  return `${normalized.slice(0, 117)}...`
}

export function shouldDeliverNotification(mode: NotificationMode): boolean {
  if (mode === 'off') return false
  if (mode === 'all') return true
  return isAppInBackground()
}

export function mapPendingQuestionRequest(denial: {
  toolName: string
  toolUseId: string
  toolInput: unknown
}): PendingQuestionRequest | null {
  if (denial.toolName !== 'AskUserQuestion' || !denial.toolInput || typeof denial.toolInput !== 'object') {
    return null
  }

  const questions = (denial.toolInput as { questions?: unknown }).questions
  if (!Array.isArray(questions) || questions.length === 0) return null

  const first = questions[0]
  if (!first || typeof first !== 'object') return null

  const question = typeof (first as { question?: unknown }).question === 'string'
    ? (first as { question: string }).question
    : ''
  if (!question.trim()) return null

  const optionsRaw = Array.isArray((first as { options?: unknown }).options)
    ? (first as { options: unknown[] }).options
    : []

  return {
    toolUseId: denial.toolUseId,
    question,
    header: typeof (first as { header?: unknown }).header === 'string'
      ? (first as { header: string }).header
      : undefined,
    multiSelect: Boolean((first as { multiSelect?: unknown }).multiSelect),
    options: optionsRaw
      .filter((option): option is Record<string, unknown> => typeof option === 'object' && option !== null)
      .map((option) => ({
        label: String(option.label ?? ''),
        description: typeof option.description === 'string' ? option.description : undefined,
      }))
      .filter((option) => option.label.trim().length > 0),
  }
}

export function isWriteLikeTool(toolName: string): boolean {
  return ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)
}

export function getPermissionApprovalMode(request: PendingPermissionRequest): PermissionMode {
  if (isWriteLikeTool(request.toolName)) {
    return 'acceptEdits'
  }
  return 'bypassPermissions'
}

export function getSessionAutoPreviewDirectories(session: Session): string[] {
  const directories = new Map<string, string>()
  const collect = (toolName: string, toolInput: unknown) => {
    for (const path of extractToolReferencedFilePaths(toolName, toolInput)) {
      const previewDirectory = getAutoPreviewDirectoryFromPath(path)
      if (!previewDirectory) continue
      directories.set(normalizePathKey(previewDirectory), previewDirectory)
    }
  }

  if (session.pendingPermission) {
    collect(session.pendingPermission.toolName, session.pendingPermission.toolInput)
  }

  for (const message of session.messages) {
    for (const toolCall of message.toolCalls) {
      collect(toolCall.toolName, toolCall.toolInput)
    }
  }

  return Array.from(directories.values())
}

export function buildQuickPanelProjects(sessions: Session[]): RecentProject[] {
  const seen = new Set<string>()
  const projects: RecentProject[] = []

  for (const session of sessions) {
    const cwd = session.cwd.trim()
    if (!cwd || seen.has(cwd)) continue
    seen.add(cwd)
    projects.push({
      path: cwd,
      name: getProjectNameFromPath(cwd),
      lastUsedAt: 0,
    })
  }

  return projects
}
