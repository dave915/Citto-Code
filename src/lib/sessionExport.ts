import type { Session, PermissionMode } from '../store/sessions'
import { getIntlLocale, translate, type AppLanguage } from './i18n'

export type SessionExportFormat = 'markdown' | 'json'

export function formatPermissionMode(mode: PermissionMode, language: AppLanguage = 'ko'): string {
  if (mode === 'acceptEdits') return translate(language, 'input.permission.acceptEdits.label')
  if (mode === 'bypassPermissions') return translate(language, 'input.permission.bypass.label')
  return translate(language, 'input.permission.default.label')
}

export function formatDateTime(timestamp: number, language: AppLanguage = 'ko'): string {
  return new Intl.DateTimeFormat(getIntlLocale(language), {
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
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(language, key, params)
  const lines: string[] = [
    `# ${session.name}`,
    '',
    `- ${t('sessionExport.exportedAt')}: ${formatDateTime(Date.now(), language)}`,
    `- ${t('sessionExport.workingPath')}: ${session.cwd || '~'}`,
    `- ${t('sessionExport.sessionId')}: ${session.sessionId ?? t('sessionExport.none')}`,
    `- ${t('sessionInfo.model')}: ${session.model ?? t('input.modelPicker.defaultModel')}`,
    `- ${t('sessionInfo.permission')}: ${formatPermissionMode(session.permissionMode, language)}`,
    `- ${t('sessionInfo.planMode')}: ${session.planMode ? t('sessionExport.on') : t('sessionExport.off')}`,
    `- ${t('sessionInfo.lastCost')}: ${session.lastCost !== undefined ? `$${session.lastCost.toFixed(4)}` : '-'}`,
  ]

  for (const message of session.messages) {
    lines.push('', `## ${message.role === 'user' ? t('sessionExport.user') : 'Claude'} · ${formatDateTime(message.createdAt, language)}`, '')
    lines.push(message.text.trim() || `_${t('sessionExport.noContent')}_`)

    if (message.attachedFiles?.length) {
      lines.push('', `### ${t('sessionExport.attachments')}`)
      for (const file of message.attachedFiles) {
        lines.push(`- ${file.name} (${file.path})`)
      }
    }

    if (message.btwCards?.length) {
      lines.push('', '### /btw')
      for (const card of message.btwCards) {
        lines.push(`- Q: ${card.question}`)
        lines.push(`  A: ${card.answer.trim() || t('sessionExport.noContent')}`)
      }
    }

    if (message.thinking?.trim()) {
      lines.push('', `### ${t('chat.message.thinking')}`, '```text', message.thinking.trim(), '```')
    }

    if (message.toolCalls.length) {
      lines.push('', `### ${t('sessionExport.toolCalls')}`)
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

export function calculateContextUsagePercentFromTokens(inputTokens: number): number {
  const maxContextTokens = 200000
  return Math.min(100, Math.max(0, Math.round((Math.max(0, inputTokens) / maxContextTokens) * 100)))
}

export function lastMessageSummary(session: Session, language: AppLanguage = 'ko'): string {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(language, key, params)
  const message = session.messages[session.messages.length - 1]
  if (!message) return t('sessionExport.noMessages')
  const prefix = message.role === 'user' ? t('sessionExport.user') : 'Claude'
  const body = message.text.trim()
    || (message.attachedFiles?.length
      ? t('sessionExport.attachedFiles', { count: message.attachedFiles.length })
      : t('sessionExport.noContent'))
  return `${prefix} · ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`
}
