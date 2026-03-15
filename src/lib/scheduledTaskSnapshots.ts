import type { Session } from '../store/sessions'
import type { AppLanguage } from './i18n'

const SCHEDULED_TASK_WRITE_TOOL_NAMES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateSummary(value: string, maxLength = 180): string {
  const normalized = normalizeSummaryText(value)
  if (!normalized) return ''
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function extractScheduledTaskChangedPaths(
  toolCall: Session['messages'][number]['toolCalls'][number],
): string[] {
  if (!SCHEDULED_TASK_WRITE_TOOL_NAMES.has(toolCall.toolName)) return []
  if (!toolCall.toolInput || typeof toolCall.toolInput !== 'object') return []

  const input = toolCall.toolInput as {
    file_path?: unknown
    notebook_path?: unknown
    path?: unknown
  }

  const candidate = input.file_path ?? input.notebook_path ?? input.path
  return typeof candidate === 'string' && candidate.trim() ? [candidate.trim()] : []
}

export function getScheduledTaskChangedPaths(session: Session): string[] {
  const seen = new Set<string>()
  const paths: string[] = []

  for (const message of session.messages) {
    for (const toolCall of message.toolCalls) {
      for (const path of extractScheduledTaskChangedPaths(toolCall)) {
        const normalized = path.replace(/\\/g, '/').toLowerCase()
        if (seen.has(normalized)) continue
        seen.add(normalized)
        paths.push(path)
      }
    }
  }

  return paths
}

export function getScheduledTaskSnapshotStatus(session: Session): 'running' | 'approval' | 'completed' | 'failed' {
  if (session.pendingPermission || session.pendingQuestion) return 'approval'
  if (session.isStreaming) return 'running'
  if (session.error?.trim()) return 'failed'
  return 'completed'
}

export function getScheduledTaskSnapshotSummary(session: Session, language: AppLanguage = 'ko'): string | null {
  if (session.pendingPermission?.toolName) {
    return language === 'en'
      ? `Waiting for ${session.pendingPermission.toolName} permission approval.`
      : `${session.pendingPermission.toolName} 권한 승인 대기 중입니다.`
  }

  if (session.pendingQuestion?.question) {
    return truncateSummary(session.pendingQuestion.question)
  }

  if (session.error?.trim()) {
    return truncateSummary(session.error) || (language === 'en'
      ? 'The automated run did not complete because of an error.'
      : '오류로 인해 자동 실행이 완료되지 않았습니다.')
  }

  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index]
    if (message.role !== 'assistant') continue
    const text = truncateSummary(message.text)
    if (text) return text
  }

  return session.isStreaming
    ? (language === 'en' ? 'Claude is generating the result.' : 'Claude가 결과를 생성하는 중입니다.')
    : null
}
