import { type AppLanguage, translate, type TranslationKey } from '../../lib/i18n'
import {
  buildSessionJsonExport,
  buildSessionMarkdownExport,
  calculateContextUsagePercentFromTokens,
  estimateContextUsagePercent,
  type SessionExportFormat,
} from '../../lib/sessionExport'
import { extractHtmlPreviewCandidates } from '../../lib/toolCallUtils'
import type { Message, Session } from '../../store/sessions'
import type { HtmlPreviewCandidate, HtmlPreviewElementSelection } from '../../lib/toolcalls/types'

export type FileConflict = {
  paths: string[]
  sessionNames: string[]
}

export type AskAboutSelectionPayload = {
  kind: 'diff' | 'code'
  path: string
  startLine: number
  endLine: number
  code: string
  prompt?: string
}

export type PreviewElementSelectionPayload = HtmlPreviewElementSelection
export type HtmlPreviewSource = {
  id: string
  kind: 'url' | 'file'
  candidate: HtmlPreviewCandidate
  messageId: string
}
export type ExternalDraft = {
  id: number
  kind: 'text'
  text: string
} | {
  id: number
  kind: 'preview-selection'
  text: string
  selection: PreviewElementSelectionPayload
}

type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string

const PERMISSION_CONTINUATION_TEXTS = new Set([
  translate('en', 'claudeStream.permissionContinue'),
  translate('en', 'claudeStream.permissionContinueOnce'),
  translate('ko', 'claudeStream.permissionContinue'),
  translate('ko', 'claudeStream.permissionContinueOnce'),
])

function findLastMessage(messages: Message[], role: Message['role']) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) {
      return messages[index]
    }
  }

  return null
}

function buildHtmlPreviewSourceId(candidate: HtmlPreviewCandidate) {
  return candidate.kind === 'url'
    ? `url:${candidate.url}`
    : `file:${candidate.path}`
}

function findLatestHtmlPreviewState(messages: Message[]) {
  let latestHtmlPreviewActivityId: string | null = null
  let latestUrlSource: HtmlPreviewSource | null = null
  let latestFileSource: HtmlPreviewSource | null = null

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue

    const previewCandidates = extractHtmlPreviewCandidates(message.toolCalls, message.text)
    if (!latestHtmlPreviewActivityId && (previewCandidates.url || previewCandidates.file)) {
      latestHtmlPreviewActivityId = message.id
    }

    if (!latestUrlSource && previewCandidates.url) {
      latestUrlSource = {
        id: buildHtmlPreviewSourceId(previewCandidates.url),
        kind: 'url',
        candidate: previewCandidates.url,
        messageId: message.id,
      }
    }

    if (!latestFileSource && previewCandidates.file) {
      latestFileSource = {
        id: buildHtmlPreviewSourceId(previewCandidates.file),
        kind: 'file',
        candidate: previewCandidates.file,
        messageId: message.id,
      }
    }

    if (latestHtmlPreviewActivityId && latestUrlSource && latestFileSource) {
      break
    }
  }

  return {
    latestHtmlPreviewActivityId,
    htmlPreviewSources: [latestUrlSource, latestFileSource].filter((value): value is HtmlPreviewSource => value !== null),
  }
}

function isMeaningfulMessage(message: Message) {
  return (
    Boolean(message.text.trim())
    || Boolean(message.thinking?.trim())
    || message.toolCalls.length > 0
    || (message.attachedFiles?.length ?? 0) > 0
    || (message.btwCards?.length ?? 0) > 0
  )
}

function buildFileConflictLabel(fileConflict: FileConflict | null | undefined, t: TranslateFn) {
  if (!fileConflict || fileConflict.paths.length === 0) return null

  const labels = fileConflict.paths.map((path) => path.split('/').filter(Boolean).pop() || path)
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]}, ${labels[1]}`

  return `${labels[0]}, ${labels[1]}, ${t('chatView.otherSessions', { count: labels.length - 2 })}`
}

function buildConflictSessionLabel(fileConflict: FileConflict | null | undefined, t: TranslateFn) {
  if (!fileConflict || fileConflict.sessionNames.length === 0) {
    return t('app.anotherSession')
  }

  if (fileConflict.sessionNames.length === 1) {
    return fileConflict.sessionNames[0]
  }

  return `${fileConflict.sessionNames[0]}, ${t('chatView.otherSessionCount', { count: fileConflict.sessionNames.length - 1 })}`
}

export function buildChatViewDerivedState({
  session,
  fileConflict,
  t,
}: {
  session: Session
  fileConflict?: FileConflict | null
  t: TranslateFn
}) {
  const lastUserMessage = findLastMessage(session.messages, 'user')
  const lastAssistantMessage = findLastMessage(session.messages, 'assistant')

  let userMessageCount = 0
  let assistantMessageCount = 0
  let totalCharacters = 0
  let totalToolCalls = 0
  let totalAttachments = 0
  const promptHistory: string[] = []

  for (const message of session.messages) {
    totalCharacters += message.text.length
    totalToolCalls += message.toolCalls.length
    totalAttachments += message.attachedFiles?.length ?? 0

    if (message.role === 'user') {
      userMessageCount += 1
      if (message.text.trim().length > 0) {
        promptHistory.push(message.text)
      }
      continue
    }

    assistantMessageCount += 1
  }

  const {
    latestHtmlPreviewActivityId,
    htmlPreviewSources,
  } = findLatestHtmlPreviewState(session.messages)

  return {
    isNewSession: !session.messages.some(isMeaningfulMessage),
    promptHistory,
    latestHtmlPreviewActivityId,
    htmlPreviewSources,
    hideHtmlPreview: Boolean(
      session.pendingPermission
      || (session.isStreaming && lastUserMessage && PERMISSION_CONTINUATION_TEXTS.has(lastUserMessage.text.trim()))
    ),
    showErrorCard: Boolean(
      session.error
      && session.error.trim()
      && session.error.trim() !== (lastAssistantMessage?.text.trim() ?? '')
    ),
    userMessageCount,
    assistantMessageCount,
    contextUsagePercent: session.tokenUsage !== null
      ? calculateContextUsagePercentFromTokens(session.tokenUsage)
      : estimateContextUsagePercent(totalCharacters, totalToolCalls, totalAttachments),
    fileConflictLabel: buildFileConflictLabel(fileConflict, t),
    conflictSessionLabel: buildConflictSessionLabel(fileConflict, t),
  }
}

export function buildAskAboutSelectionDraft(payload: AskAboutSelectionPayload, t: TranslateFn) {
  const { kind, path, startLine, endLine, code, prompt } = payload
  const lineLabel = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`

  return [
    prompt?.trim()
      ? kind === 'diff'
        ? t('chatView.askAboutDiffWithPrompt')
        : t('chatView.askAboutCodeWithPrompt')
      : kind === 'diff'
        ? t('chatView.askAboutDiff')
        : t('chatView.askAboutCode'),
    '',
    `${t('chatView.file')}: ${path}`,
    `${t('chatView.line')}: ${lineLabel}`,
    '```',
    code,
    '```',
    ...(prompt?.trim() ? ['', `${t('chatView.request')}: ${prompt.trim()}`] : []),
  ].join('\n')
}

export function buildPreviewSelectionKey(payload: PreviewElementSelectionPayload) {
  return [
    payload.previewPath ?? '',
    payload.pathHint ?? '',
    payload.selector,
    payload.tagName,
    payload.id ?? '',
    payload.href ?? '',
  ].join('::')
}

export function buildPreviewSelectionSummary(payload: PreviewElementSelectionPayload, t: TranslateFn) {
  const { tagName, className, text, ariaLabel } = payload
  const classSummary = className
    ? className.split(/\s+/).filter(Boolean).join('.')
    : ''
  if (text) return `${tagName} "${text}"`
  if (ariaLabel) return `${tagName} (${t('chatView.previewSelectionAriaLabel')}: "${ariaLabel}")`
  if (classSummary) return `${tagName}.${classSummary}`
  return tagName
}

function buildPreviewSelectionSection(
  payload: PreviewElementSelectionPayload,
  t: TranslateFn,
  prefix = '',
) {
  const { previewPath, selector, className, text, href, ariaLabel } = payload
  const classSummary = className
    ? className.split(/\s+/).filter(Boolean).join('.')
    : ''
  const targetSummary = buildPreviewSelectionSummary(payload, t)

  return [
    `${prefix}${t('chatView.previewSelectionTarget')}: ${targetSummary}`,
    ...(previewPath ? [`${t('chatView.file')}: ${previewPath}`] : []),
    `${t('chatView.previewSelectionReference')}: ${selector}`,
    ...(className && !targetSummary.includes(`.${classSummary}`) ? [`${t('chatView.previewSelectionClass')}: ${className}`] : []),
    ...(text ? [] : ariaLabel ? [`${t('chatView.previewSelectionAriaLabel')}: "${ariaLabel}"`] : []),
    ...(href ? [`${t('chatView.previewSelectionHref')}: ${href}`] : []),
  ]
}

export function buildPreviewSelectionDraft(payload: PreviewElementSelectionPayload, t: TranslateFn) {
  return [
    t('chatView.previewSelectionIntro'),
    '',
    ...buildPreviewSelectionSection(payload, t),
    '',
    t('chatView.previewSelectionRequest'),
  ].join('\n')
}

export function buildPreviewSelectionsDraft(payloads: PreviewElementSelectionPayload[], t: TranslateFn) {
  if (payloads.length === 0) return ''
  if (payloads.length === 1) return buildPreviewSelectionDraft(payloads[0], t)

  return [
    t('chatView.previewSelectionsIntro'),
    '',
    ...payloads.flatMap((payload, index) => {
      const section = buildPreviewSelectionSection(payload, t, `${index + 1}. `)
      return index < payloads.length - 1 ? [...section, ''] : section
    }),
    '',
    t('chatView.previewSelectionsRequest'),
  ].join('\n')
}

export function buildSessionExportContent(
  format: SessionExportFormat,
  session: Session,
  language: AppLanguage,
) {
  return format === 'markdown'
    ? buildSessionMarkdownExport(session, language)
    : buildSessionJsonExport(session)
}
