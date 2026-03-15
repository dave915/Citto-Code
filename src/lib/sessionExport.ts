import type { Session, PermissionMode } from '../store/sessions'
import type { AppLanguage } from './i18n'

export type SessionExportFormat = 'markdown' | 'json'

export function formatPermissionMode(mode: PermissionMode, language: AppLanguage = 'ko'): string {
  if (language === 'en') {
    if (mode === 'acceptEdits') return 'Auto approve'
    if (mode === 'bypassPermissions') return 'Bypass permissions'
    return 'Default'
  }

  if (mode === 'acceptEdits') return '자동승인'
  if (mode === 'bypassPermissions') return '전체허용'
  return '기본'
}

export function formatDateTime(timestamp: number, language: AppLanguage = 'ko'): string {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function formatExportTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}-${hour}${minute}`
}

export function sanitizeFileNameSegment(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized || 'session'
}

export function buildSessionExportFileName(session: Session, format: SessionExportFormat): string {
  const baseName = sanitizeFileNameSegment(session.name)
  const timestamp = formatExportTimestamp(session.messages[0]?.createdAt ?? Date.now())
  return `${baseName}-${timestamp}.${format === 'markdown' ? 'md' : 'json'}`
}

export function buildDefaultSavePath(cwd: string, fileName: string): string | undefined {
  const trimmed = cwd.trim()
  if (!trimmed || trimmed === '~') return undefined
  const normalized = trimmed.replace(/[\\/]+$/, '')
  const separator = normalized.includes('\\') ? '\\' : '/'
  return `${normalized}${separator}${fileName}`
}

export function safeJsonStringify(value: unknown, space = 2): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(
    value,
    (_key, currentValue) => {
      if (typeof currentValue === 'bigint') return currentValue.toString()
      if (typeof currentValue === 'object' && currentValue !== null) {
        if (seen.has(currentValue)) return '[Circular]'
        seen.add(currentValue)
      }
      return currentValue
    },
    space,
  ) ?? 'null'
}

export function buildSessionMarkdownExport(session: Session, language: AppLanguage = 'ko'): string {
  const isEnglish = language === 'en'
  const lines: string[] = [
    `# ${session.name}`,
    '',
    `- ${isEnglish ? 'Exported at' : '내보낸 시각'}: ${formatDateTime(Date.now(), language)}`,
    `- ${isEnglish ? 'Working path' : '작업 경로'}: ${session.cwd || '~'}`,
    `- ${isEnglish ? 'Session ID' : '세션 ID'}: ${session.sessionId ?? (isEnglish ? 'None' : '없음')}`,
    `- ${isEnglish ? 'Model' : '모델'}: ${session.model ?? (isEnglish ? 'Default model' : '기본 모델')}`,
    `- ${isEnglish ? 'Permission' : '권한'}: ${formatPermissionMode(session.permissionMode, language)}`,
    `- ${isEnglish ? 'Plan mode' : '플랜 모드'}: ${session.planMode ? (isEnglish ? 'On' : '켜짐') : (isEnglish ? 'Off' : '꺼짐')}`,
    `- ${isEnglish ? 'Last cost' : '마지막 비용'}: ${session.lastCost !== undefined ? `$${session.lastCost.toFixed(4)}` : '-'}`,
  ]

  for (const message of session.messages) {
    lines.push('', `## ${message.role === 'user' ? (isEnglish ? 'User' : '사용자') : 'Claude'} · ${formatDateTime(message.createdAt, language)}`, '')
    lines.push(message.text.trim() || (isEnglish ? '_No content_' : '_내용 없음_'))

    if (message.attachedFiles?.length) {
      lines.push('', `### ${isEnglish ? 'Attachments' : '첨부 파일'}`)
      for (const file of message.attachedFiles) {
        lines.push(`- ${file.name} (${file.path})`)
      }
    }

    if (message.thinking?.trim()) {
      lines.push('', '### Thinking', '```text', message.thinking.trim(), '```')
    }

    if (message.toolCalls.length) {
      lines.push('', '### Tool Calls')
      for (const toolCall of message.toolCalls) {
        lines.push(`- ${toolCall.toolName} · ${toolCall.status}`)
      }
    }
  }

  return `${lines.join('\n')}\n`
}

export function buildSessionJsonExport(session: Session): string {
  return `${safeJsonStringify({
    exportedAt: new Date().toISOString(),
    session,
  }, 2)}\n`
}

export function estimateContextUsagePercent(totalCharacters: number, totalToolCalls: number, totalAttachments: number): number {
  const weightedSize = totalCharacters + (totalToolCalls * 1200) + (totalAttachments * 4000)
  const maxContextEstimate = 160000
  return Math.min(100, Math.max(0, Math.round((weightedSize / maxContextEstimate) * 100)))
}

export function lastMessageSummary(session: Session, language: AppLanguage = 'ko'): string {
  const message = session.messages[session.messages.length - 1]
  if (!message) return language === 'en' ? 'No messages' : '메시지 없음'
  const prefix = message.role === 'user' ? (language === 'en' ? 'User' : '사용자') : 'Claude'
  const body = message.text.trim()
    || (message.attachedFiles?.length
      ? language === 'en'
        ? `${message.attachedFiles.length} attached files`
        : `파일 ${message.attachedFiles.length}개 첨부`
      : language === 'en'
        ? 'No content'
        : '내용 없음')
  return `${prefix} · ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`
}
