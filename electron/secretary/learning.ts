import { createHash } from 'crypto'
import type { SecretaryAction, SecretaryActionResult, SecretaryWorkflowDraftTrigger } from './actions'
import type {
  SecretaryLearningCandidate,
  SecretaryLearningCandidateKind,
  SecretaryLearningPromotionTarget,
  SecretaryProcessResult,
} from './types'

const MAX_CANDIDATES = 12
const MAX_TEXT_LENGTH = 220

const MEMORY_HINT_RE = /(기억|기억해|앞으로|항상|선호|취향|원칙|규칙|관례|remember|always|prefer|preference|rule|convention)/i
const WORKFLOW_HINT_RE = /(매일|매주|평일|매시간|정기|예약|스케줄|반복|자동화|워크플로우|daily|weekly|weekday|hourly|schedule|cron|routine|workflow|automation)/i
const SKILL_HINT_RE = /(스킬|자주|매번|절차|템플릿|방법|스타일|패턴|skill|template|playbook|procedure|style|pattern)/i
const GENERIC_CANDIDATE_SUMMARY_RE = /(후보로 보관|후보로 저장|일 수 있어)/i

function trimText(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

function stableId(kind: SecretaryLearningCandidateKind, text: string): string {
  const digest = createHash('sha256')
    .update(`${kind}:${text.toLowerCase()}`)
    .digest('hex')
    .slice(0, 12)
  return `secretary-learning-${kind}-${digest}`
}

function digestText(text: string): string {
  return createHash('sha256')
    .update(text.toLowerCase())
    .digest('hex')
    .slice(0, 8)
}

function slugify(text: string, fallbackPrefix: string) {
  const slug = text
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 48)
  return slug || `${fallbackPrefix}-${digestText(text || fallbackPrefix)}`
}

function parseScheduleTime(text: string) {
  const koreanMatch = text.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/i)
  if (koreanMatch) {
    const meridiem = koreanMatch[1]
    let hour = Number(koreanMatch[2])
    const minute = koreanMatch[3] ? Number(koreanMatch[3]) : 0
    if (meridiem === '오후' && hour < 12) hour += 12
    if (meridiem === '오전' && hour === 12) hour = 0
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute }
  }

  const englishMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (englishMatch) {
    const meridiem = englishMatch[3].toLowerCase()
    let hour = Number(englishMatch[1])
    const minute = englishMatch[2] ? Number(englishMatch[2]) : 0
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute }
  }

  return { hour: 9, minute: 0 }
}

function parseWeeklyDay(text: string) {
  const normalized = text.toLowerCase()
  const dayMap: Array<[RegExp, number]> = [
    [/(일요일|일曜|sunday|\bsun\b)/i, 0],
    [/(월요일|월曜|monday|\bmon\b)/i, 1],
    [/(화요일|화曜|tuesday|\btue\b)/i, 2],
    [/(수요일|수曜|wednesday|\bwed\b)/i, 3],
    [/(목요일|목曜|thursday|\bthu\b)/i, 4],
    [/(금요일|금曜|friday|\bfri\b)/i, 5],
    [/(토요일|토曜|saturday|\bsat\b)/i, 6],
  ]
  return dayMap.find(([pattern]) => pattern.test(normalized))?.[1] ?? 1
}

function inferScheduleTriggerFromText(text: string): SecretaryWorkflowDraftTrigger {
  const time = parseScheduleTime(text)
  if (/(매시간|매 시간|hourly|every hour)/i.test(text)) {
    return { type: 'schedule', frequency: 'hourly', minute: time.minute }
  }
  if (/(평일|주중|weekdays|weekday|business day)/i.test(text)) {
    return { type: 'schedule', frequency: 'weekdays', hour: time.hour, minute: time.minute }
  }
  if (/(매주|주간|weekly|every week)/i.test(text)) {
    return { type: 'schedule', frequency: 'weekly', hour: time.hour, minute: time.minute, dayOfWeek: parseWeeklyDay(text) }
  }
  if (/(매일|매일마다|하루마다|일간|daily|every day|each day)/i.test(text)) {
    return { type: 'schedule', frequency: 'daily', hour: time.hour, minute: time.minute }
  }
  return { type: 'manual' }
}

function buildSkillInstructions(candidate: SecretaryLearningCandidate) {
  return [
    `# ${candidate.title}`,
    '',
    '## Purpose',
    candidate.summary,
    '',
    '## When To Use',
    'Use this when the user asks for the same preference, procedure, or output style captured by this learning candidate.',
    '',
    '## Workflow',
    '1. Restate the target outcome and any constraints from the current request.',
    '2. Apply the remembered procedure or style below.',
    '3. Verify the result against the current repository or app surface before responding.',
    '',
    '## Learned Context',
    candidate.source,
  ].join('\n')
}

function buildWorkflowSteps(candidate: SecretaryLearningCandidate) {
  return [
    {
      type: 'agent' as const,
      label: '요구사항 정리',
      prompt: [
        candidate.summary,
        '',
        `원본 요청: ${candidate.source}`,
        '목표, 입력값, 산출물, 검증 기준을 짧게 정리하세요.',
      ].join('\n'),
    },
    {
      type: 'agent' as const,
      label: '실행 및 검증',
      prompt: '정리된 기준에 맞춰 작업을 수행하고, 변경 내용과 검증 결과와 남은 리스크를 보고하세요.',
    },
  ]
}

function createCandidate(
  kind: SecretaryLearningCandidateKind,
  title: string,
  summary: string,
  source: string,
  now = Date.now(),
): SecretaryLearningCandidate | null {
  const normalizedTitle = trimText(title, 80)
  const normalizedSummary = trimText(summary)
  const normalizedSource = trimText(source)
  if (!normalizedTitle || !normalizedSummary || !normalizedSource) return null

  return {
    id: stableId(kind, `${normalizedTitle}:${normalizedSummary}`),
    kind,
    title: normalizedTitle,
    summary: normalizedSummary,
    source: normalizedSource,
    count: 1,
    createdAt: now,
    lastSeenAt: now,
  }
}

export function normalizeLearningCandidates(value: unknown): SecretaryLearningCandidate[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry): SecretaryLearningCandidate | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const record = entry as Record<string, unknown>
      const kind = record.kind === 'memory' || record.kind === 'skill' || record.kind === 'workflow'
        ? record.kind
        : null
      const title = trimText(record.title, 80)
      const summary = trimText(record.summary)
      const source = trimText(record.source)
      if (!kind || !title || !summary || !source) return null
      const id = typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : stableId(kind, `${title}:${summary}`)
      const count = typeof record.count === 'number' && Number.isFinite(record.count)
        ? Math.max(1, Math.floor(record.count))
        : 1
      const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : Date.now()
      const lastSeenAt = typeof record.lastSeenAt === 'number' && Number.isFinite(record.lastSeenAt)
        ? record.lastSeenAt
        : createdAt

      return { id, kind, title, summary, source, count, createdAt, lastSeenAt }
    })
    .filter((entry): entry is SecretaryLearningCandidate => Boolean(entry))
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    .slice(0, MAX_CANDIDATES)
}

export function serializeLearningCandidates(candidates: SecretaryLearningCandidate[]): string {
  return JSON.stringify(normalizeLearningCandidates(candidates))
}

export function upsertLearningCandidate(
  existing: SecretaryLearningCandidate[],
  candidate: SecretaryLearningCandidate,
): SecretaryLearningCandidate[] {
  const normalized = normalizeLearningCandidates(existing)
  const index = normalized.findIndex((entry) => entry.id === candidate.id)
  if (index >= 0) {
    const current = normalized[index]
    normalized[index] = {
      ...current,
      title: candidate.title,
      summary: candidate.summary,
      source: candidate.source,
      count: current.count + 1,
      lastSeenAt: candidate.lastSeenAt,
    }
  } else {
    normalized.unshift(candidate)
  }

  return normalizeLearningCandidates(normalized)
}

export function removeLearningCandidate(
  existing: SecretaryLearningCandidate[],
  id: string,
): SecretaryLearningCandidate[] {
  const normalizedId = id.trim()
  if (!normalizedId) return normalizeLearningCandidates(existing)
  return normalizeLearningCandidates(existing).filter((entry) => entry.id !== normalizedId)
}

export function buildLearningCandidateAction(
  candidate: SecretaryLearningCandidate,
  target: SecretaryLearningPromotionTarget,
): SecretaryAction {
  const sourceText = `${candidate.title} ${candidate.summary} ${candidate.source}`
  if (target === 'memory') {
    const value = GENERIC_CANDIDATE_SUMMARY_RE.test(candidate.summary)
      ? candidate.source
      : candidate.summary
    return {
      type: 'saveMemory',
      key: `memory.${slugify(candidate.title || candidate.source, 'learned-memory')}`,
      value: trimText(value, 500),
      label: candidate.title,
    }
  }

  if (target === 'skill') {
    return {
      type: 'draftSkill',
      name: slugify(candidate.title || candidate.source, 'learned-skill'),
      description: candidate.summary,
      instructions: buildSkillInstructions(candidate),
    }
  }

  return {
    type: 'draftWorkflow',
    name: slugify(candidate.title || candidate.source, 'learned-workflow'),
    summary: candidate.summary,
    trigger: inferScheduleTriggerFromText(sourceText),
    steps: buildWorkflowSteps(candidate),
    initialPrompt: [
      '이 학습 후보를 재사용 가능한 워크플로우로 구체화해 주세요.',
      '',
      `후보: ${candidate.title}`,
      `요약: ${candidate.summary}`,
      `원본: ${candidate.source}`,
    ].join('\n'),
  }
}

export function inferLearningCandidateFromTurn(
  input: string,
  _result: SecretaryProcessResult,
): SecretaryLearningCandidate | null {
  const source = trimText(input)
  if (!source) return null

  if (WORKFLOW_HINT_RE.test(input)) {
    return createCandidate(
      'workflow',
      '반복 작업 후보',
      '반복되거나 예약 가능한 작업일 수 있어 워크플로우 초안 후보로 보관합니다.',
      source,
    )
  }

  if (SKILL_HINT_RE.test(input)) {
    return createCandidate(
      'skill',
      '작업 절차 후보',
      '자주 쓰는 절차나 스타일일 수 있어 스킬 초안 후보로 보관합니다.',
      source,
    )
  }

  if (MEMORY_HINT_RE.test(input)) {
    return createCandidate(
      'memory',
      '장기 기억 후보',
      '사용자 선호나 규칙일 수 있어 승인 후 저장할 기억 후보로 보관합니다.',
      source,
    )
  }

  return null
}

export function inferLearningCandidateFromCompletedAction(
  action: SecretaryAction,
  result: SecretaryActionResult,
): SecretaryLearningCandidate | null {
  if (!result.ok) return null

  if (action.type === 'draftWorkflow') {
    return createCandidate(
      'workflow',
      action.name,
      action.summary ?? action.initialPrompt ?? result.message ?? '워크플로우 초안으로 재사용할 수 있는 완료 작업입니다.',
      result.message ?? action.initialPrompt ?? action.summary ?? action.name,
    )
  }

  if (action.type === 'createWorkflow') {
    return createCandidate(
      'workflow',
      action.name,
      action.description ?? action.prompt ?? result.message ?? '저장된 워크플로우로 재사용할 수 있는 완료 작업입니다.',
      result.message ?? action.prompt ?? action.description ?? action.name,
    )
  }

  if (action.type === 'draftSkill') {
    return createCandidate(
      'skill',
      action.name,
      action.description ?? action.instructions ?? action.initialPrompt ?? result.message ?? '스킬 초안으로 재사용할 수 있는 완료 작업입니다.',
      result.message ?? action.instructions ?? action.initialPrompt ?? action.description ?? action.name,
    )
  }

  if (action.type === 'createSkill') {
    return createCandidate(
      'skill',
      action.name,
      action.description ?? action.instructions ?? result.message ?? '저장된 스킬로 재사용할 수 있는 완료 작업입니다.',
      result.message ?? action.instructions ?? action.description ?? action.name,
    )
  }

  if (action.type === 'runClaudeCode' && WORKFLOW_HINT_RE.test(action.prompt)) {
    const title = trimText(action.prompt, 48) || `완료된 반복 작업 ${digestText(action.prompt)}`
    return createCandidate(
      'workflow',
      title,
      `성공한 실행 "${title}"이 반복 가능한 자동화 절차일 수 있어 워크플로우 후보로 보관합니다.`,
      action.prompt,
    )
  }

  if (action.type === 'runClaudeCode' && SKILL_HINT_RE.test(action.prompt)) {
    const title = trimText(action.prompt, 48) || `완료된 작업 절차 ${digestText(action.prompt)}`
    return createCandidate(
      'skill',
      title,
      `성공한 실행 "${title}"이 재사용 가능한 작업 절차일 수 있어 스킬 후보로 보관합니다.`,
      action.prompt,
    )
  }

  return null
}
