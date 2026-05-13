import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnClaudeProcess } from '../services/claude-spawn'
import { buildCapabilityManifest } from './actions'
import {
  COMPUTER_USE_EXECUTION_POLICY,
  COMPUTER_USE_OBSERVATION_POLICY,
} from './computer-use-policy'
import { createSecretaryExecutionGuardrail } from './execution-guardrail'
import { extractJsonObject, normalizeSecretaryResult } from './intent-router'
import type { SecretaryMemory } from './memory'
import type {
  SecretaryActiveContext,
  SecretaryProcessResult,
  SecretaryRuntimeConfig,
  SecretarySearchResult,
} from './types'
import type { PermissionMode } from '../persistence-types'

type SecretaryServiceOptions = {
  memory: SecretaryMemory
  getUserHomePath: (env?: NodeJS.ProcessEnv) => string
  resolveTargetPath: (targetPath: string) => string
  getComputerUseMcpConfig?: () => Record<string, unknown> | null
  getComputerUseAllowedAllTools?: () => string[]
  getComputerUseStatus?: () => { available: boolean; detail: string; setupCommand?: string }
  installComputerUse?: () => Promise<{ available: boolean; detail: string; setupCommand?: string }>
}

type SecretaryRunClaudeCodeHooks = {
  onComputerUseEvent?: (event: unknown) => void
}

const SECRETARY_PROCESS_TIMEOUT_MS = 180_000
const SECRETARY_EXECUTE_TIMEOUT_MS = 90_000
const SECRETARY_TITLE_TIMEOUT_MS = 30_000
const EMPTY_MCP_CONFIG = { mcpServers: {} } as const
const COMPUTER_USE_EVENT_POLL_MS = 120

const DEFAULT_SECRETARY_CONTEXT: SecretaryActiveContext = {
  activeRoute: 'home',
  currentSessionId: null,
  currentProjectId: null,
  isTaskRunning: false,
  recentSessions: [],
  recentArtifacts: [],
}

type NormalizedSecretaryRuntimeConfig = {
  claudePath?: string
  envVars?: Record<string, string>
  defaultModel: string | null
  permissionMode: PermissionMode
  planMode: boolean
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  return {
    controller,
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function attachMcpServerEnv(config: Record<string, unknown>, envPatch: Record<string, string>): Record<string, unknown> {
  const servers = isRecord(config.mcpServers) ? config.mcpServers : {}
  return {
    ...config,
    mcpServers: Object.fromEntries(
      Object.entries(servers).map(([name, server]) => {
        if (!isRecord(server)) return [name, server]
        const env = isRecord(server.env) ? server.env : {}
        return [name, {
          ...server,
          env: {
            ...env,
            ...envPatch,
          },
        }]
      }),
    ),
  }
}

async function createComputerUseEventReader(onEvent?: (event: unknown) => void) {
  if (!onEvent) return null

  const dir = await mkdtemp(join(tmpdir(), 'citto-computer-use-events-'))
  const eventFilePath = join(dir, 'events.ndjson')
  await writeFile(eventFilePath, '', 'utf-8')

  let offset = 0
  let disposed = false
  let reading = false

  const drain = async () => {
    if (disposed || reading) return
    reading = true
    try {
      const text = await readFile(eventFilePath, 'utf-8').catch(() => '')
      if (text.length <= offset) return
      const chunk = text.slice(offset)
      offset = text.length
      for (const line of chunk.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          onEvent(JSON.parse(trimmed))
        } catch {
          // Ignore malformed event lines. The MCP result remains authoritative.
        }
      }
    } finally {
      reading = false
    }
  }

  const timer = setInterval(() => {
    void drain()
  }, COMPUTER_USE_EVENT_POLL_MS)

  return {
    eventFilePath,
    async dispose() {
      clearInterval(timer)
      await drain()
      disposed = true
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    },
  }
}

function buildProcessFallbackReply(error: unknown, timedOut: boolean) {
  if (timedOut) {
    return 'Claude 응답이 너무 오래 걸려서 이번 요청은 중단했어요. 다시 짧게 요청하면 바로 이어서 도와드릴게요.'
  }

  if (error instanceof Error && error.message.trim()) {
    if (/not logged in|authentication_failed|please run \/login/i.test(error.message)) {
      return 'Claude 로그인이 필요해서 비서 응답을 만들지 못했어요. Claude Code에서 /login을 먼저 실행해 주세요.'
    }
    return `지금은 비서 응답을 만들지 못했어요. ${error.message}`
  }

  return '지금은 비서 응답을 만들지 못했어요.'
}

function buildSystemPrompt(context: SecretaryActiveContext, memory: {
  profile: Record<string, string>
  recentHistory: unknown[]
  patterns: unknown[]
  learningCandidates: unknown[]
  conversationSearchResults: SecretarySearchResult[]
}, computerUseStatus: { available: boolean; detail: string; setupCommand?: string }) {
  return [
    '당신은 Citto의 비서 "기본 씨토"입니다.',
    '당신은 사용자의 실제 마우스를 빼앗지 않고, 플로팅 비서 UI와 가상 포인터 상태로 다음 실행 지점을 보여주는 데스크탑 AI 비서입니다.',
    'Citto의 세션, 결과물, 워크플로우를 참조해 다음 작업을 제안하고 안전한 실행 경로로 연결하는 조율자입니다.',
    '당신의 핵심 역할은 직접 긴 프로젝트 작업을 수행하는 것이 아니라, 관련 맥락을 찾고 사용자가 기존 흐름에서 이어서 일하도록 안내하는 것입니다.',
    '비서 자체는 특정 프로젝트 디렉토리에 종속되지 않습니다. 프로젝트 경로가 보이더라도 참고 정보로만 사용하세요.',
    '현재 비서 채팅의 기록만 대화 컨텍스트로 사용하세요. 다른 비서 채팅의 내용을 아는 척하지 마세요.',
    '추상적인 장기 기억을 아는 척하지 말고, 제공된 컨텍스트와 실제 참조만 사용하세요.',
    '실행 원칙:',
    '- 기본은 Level 2 관전 모드입니다. 사용자가 언제든 중단할 수 있다는 전제로 말하세요.',
    `- 현재 computer-use 실행기 상태: ${computerUseStatus.available ? '사용 가능' : '사용 불가'}. ${computerUseStatus.detail}`,
    computerUseStatus.available
      ? '- OS UI 접근이 필요한 요청은 runClaudeCode 액션으로 제안할 수 있습니다.'
      : '- OS UI 접근이 필요한 요청은 runClaudeCode 액션을 제안하지 말고, installComputerUse 액션으로 Cua Driver 설치 승인을 먼저 받으세요.',
    COMPUTER_USE_OBSERVATION_POLICY,
    '- 액션이 필요하면 먼저 이유와 다음 위치를 짧게 설명하고, action은 하나만 제안하세요.',
    '- 발송, 삭제, 저장, 업로드, 설정 변경, 장시간 실행처럼 위험하거나 되돌리기 어려운 일은 사용자 확인 전에는 절대 완료했다고 말하지 마세요.',
    '- 도구 선택을 설명해야 할 때는 공식 API, DOM/브라우저 자동화, 접근성 트리, 화면 분석, OS 입력 순서로 안정적인 경로를 선호한다고 말하세요.',
    '',
    '반드시 JSON 객체 하나만 응답하세요. 마크다운 코드블록과 설명 문장은 금지입니다.',
    '',
    '응답 형식:',
    '{',
    '  "reply": "사용자에게 보여줄 짧은 한국어 메시지",',
    '  "intent": "chat" | "navigate" | "execute" | "recall",',
    '  "action": SecretaryAction | null,',
    '  "searchResults": []',
    '}',
    '',
    '사용 가능한 액션. 이 외의 action.type은 절대 만들지 마세요.',
    buildCapabilityManifest(),
    '',
    '통합 대화 기록 검색 결과는 저장된 비서 대화와 프로젝트 세션 대화를 함께 검색한 결과입니다.',
    '사용자가 이전 대화, 과거 세션, 특정 주제 언급 여부를 찾으라고 요청하면 이 검색 결과를 우선 근거로 답하세요.',
    '검색 결과의 type이 "비서 대화"면 씨토 비서와 나눈 대화이고, "세션 대화"면 프로젝트 세션에서 나눈 대화입니다.',
    '검색 결과가 비어 있는데 사용자가 과거 대화 검색을 요청했다면, 저장된 비서/세션 대화에서 찾지 못했다고 분명히 말하세요.',
    '검색 결과를 근거로 답할 때는 관련 항목을 searchResults에 포함하세요.',
    '',
    '장기 기억/학습 처리 원칙:',
    '- 사용자가 "기억해", "앞으로는", "항상", "내 선호는"처럼 명시적으로 저장 의도를 말하면 saveMemory 액션을 제안하세요.',
    '- saveMemory.key는 memory.<짧은-영어-slug> 형식으로 만들고, value에는 확인 가능한 사용자 선호/규칙/사실만 한 문장으로 저장하세요.',
    '- 저장된 profile 값은 이미 승인된 기억이지만, learningCandidates는 자동 감지된 후보일 뿐입니다. 후보를 사실처럼 단정하지 말고, 필요할 때 저장/스킬/워크플로우 제안 근거로만 쓰세요.',
    '- 반복 작업 후보가 보이면 draftWorkflow/createWorkflow, 절차나 스타일 후보가 보이면 draftSkill/createSkill, 사용자 선호 후보가 보이면 saveMemory를 제안하세요.',
    '',
    '프로젝트 진행 요청 처리 원칙:',
    '- 구현, 수정, 디자인 반영, 디버깅, 리팩터링, 문서화처럼 프로젝트 작업을 진행하려는 요청이면 비서 대화 안에서 길게 처리하지 말고 프로젝트 세션에서 이어가도록 안내하세요.',
    '- 현재 컨텍스트에 currentSessionId가 있고 그 세션이 요청과 관련 있어 보이면, 현재 프로젝트 세션에서 이어서 진행하라고 짧게 안내하고 action은 null로 둘 수 있습니다.',
    '- 통합 대화 기록 검색 결과나 recentSessions에 관련 기존 프로젝트 세션이 있으면 새 채팅을 만들기보다 openSession 액션으로 그 세션을 여는 제안을 우선하세요.',
    '- 세션 대화 검색 결과의 sessionId는 openSession 액션의 sessionId로 사용할 수 있습니다.',
    '- 관련 기존 세션을 찾지 못했지만 프로젝트 작업이 분명하면 startChat 액션을 제안하고, initialPrompt에는 사용자의 요청과 필요한 맥락을 짧게 담아 새 프로젝트 세션에서 시작하게 하세요.',
    '- 단발성 질문, 간단한 요약, 과거 대화 검색 요청은 비서가 직접 답해도 됩니다.',
    '- runClaudeCode는 사용자가 비서에게 즉시 실행을 명확히 요청한 짧은 작업에만 제안하세요. 일반적인 프로젝트 진행은 세션으로 넘기는 쪽을 우선하세요.',
    '- reply에는 "기존 세션에서 이어가면 이전 대화/프로젝트 맥락을 쓸 수 있다"는 이유를 자연스럽게 포함하세요.',
    '',
    '워크플로우/스킬 제안 처리 원칙:',
    '- 사용자가 반복 작업, 정해진 절차, 자주 쓰는 프롬프트, 프로젝트 관례를 말하면 워크플로우나 스킬로 만들 수 있는지 먼저 짧게 제안하세요.',
    '- 1차는 초안 생성과 새 프로젝트 세션 handoff입니다. 사용자가 구체화부터 하자고 하거나 요구사항이 아직 모호하면 draftWorkflow 또는 draftSkill 액션을 사용하세요.',
    '- draftWorkflow는 워크플로우 이름, 요약, 단계별 prompt를 담아 새 세션에서 단계/검증/구현을 다듬게 합니다.',
    '- draftSkill은 스킬 이름, description, instructions 초안을 담아 새 세션에서 SKILL.md 품질을 다듬게 합니다.',
    '- 2차는 실제 생성입니다. 사용자가 바로 만들라고 하거나 1차 초안이 충분히 구체적이면 createWorkflow 또는 createSkill 액션을 사용하세요.',
    '- createWorkflow의 name은 사람이 읽는 워크플로우 이름, steps는 실행 가능한 단계 배열입니다. 단순 작업은 agent step, 조건부 분기는 condition step, 반복은 loop step으로 표현하세요.',
    '- 사용자가 "매일", "평일", "매주", "매시간"처럼 주기를 말하면 createWorkflow.trigger를 schedule로 채우세요. hour/minute가 없으면 오전 9시 기준을 사용하세요.',
    '- 사용자가 "반복", "여러 번", "될 때까지"처럼 반복을 말하면 loop step을 쓰고, bodySteps에 반복할 agent step을 넣으세요. 최대 반복 횟수가 없으면 3회로 두세요.',
    '- 사용자가 "조건", "~이면", "실패하면", "포함하면"처럼 분기를 말하면 condition step을 쓰고 operator/value를 채우세요. 분기 대상이 명확하면 trueBranchStepIndex/falseBranchStepIndex를 0 기반 steps 인덱스로 지정하세요.',
    '- createSkill의 name은 가능하면 소문자 영어 slug로 쓰고, description은 스킬 사용 시점이 드러나게 한 문장으로 쓰며, instructions는 SKILL.md 본문에 들어갈 실제 절차만 작성하세요.',
    '- 워크플로우/스킬 생성 액션도 사용자 확인 버튼을 누르기 전에는 실행되지 않습니다. reply는 "만들 수 있다/저장하겠다"가 아니라 "이렇게 제안하겠다/저장 버튼을 제안한다"처럼 말하세요.',
    '',
    '한 번에 하나의 action만 제안하세요. 실제 실행은 앱 UI가 사용자 확인을 받은 뒤 처리합니다. 실행했다고 말하지 말고 제안으로 말하세요.',
    '진행 중 작업이 있을 때 새 작업을 제안한다면 reply에 진행 중 작업이 있다는 점을 명시하세요.',
    '',
    '현재 컨텍스트:',
    JSON.stringify(context, null, 2),
    '',
    '저장된 Citto 참조:',
    JSON.stringify(memory, null, 2),
  ].join('\n')
}

function buildTitlePrompt(input: string, reply: string) {
  return [
    '아래 사용자와 씨토 비서의 첫 대화를 5단어 이내 한국어 제목으로 요약하세요.',
    '따옴표, 마침표, 설명 없이 제목만 출력하세요.',
    '',
    `사용자: ${input}`,
    `씨토: ${reply}`,
  ].join('\n')
}

function buildUserPrompt(input: string) {
  return [
    '사용자 입력:',
    input,
    '',
    '위 입력에 대해 Citto 비서로 응답하세요.',
  ].join('\n')
}

function buildDelegatedExecutionSystemPrompt() {
  return [
    'Citto 비서가 사용자 확인 후 위임한 작업입니다.',
    '특정 프로젝트 디렉토리를 자동으로 가정하지 말고, 필요한 대상이 불명확하면 결과에서 명확히 알려 주세요.',
    COMPUTER_USE_EXECUTION_POLICY,
  ].join('\n')
}

function normalizePermissionMode(value: unknown): PermissionMode {
  return value === 'acceptEdits' || value === 'bypassPermissions' ? value : 'default'
}

function normalizeRuntimeConfig(config: SecretaryRuntimeConfig = {}): NormalizedSecretaryRuntimeConfig {
  return {
    claudePath: typeof config.claudePath === 'string' && config.claudePath.trim()
      ? config.claudePath.trim()
      : undefined,
    envVars: config.envVars && typeof config.envVars === 'object'
      ? { ...config.envVars }
      : undefined,
    defaultModel: typeof config.defaultModel === 'string' && config.defaultModel.trim()
      ? config.defaultModel.trim()
      : null,
    permissionMode: normalizePermissionMode(config.permissionMode),
    planMode: Boolean(config.planMode),
  }
}

function sanitizeTitle(text: string) {
  const title = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’.,!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!title) return null
  return title.length > 36 ? title.slice(0, 36).trim() : title
}

function normalizeMemoryKey(key: string) {
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/^secretary\./, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80)
  if (!normalized) return 'memory.note'
  return normalized.startsWith('memory.') ? normalized : `memory.${normalized}`
}

function normalizeMemoryValue(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500)
}

function buildPromptProfile(profile: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(profile).filter(([key]) => !key.startsWith('secretary.')),
  )
}

function normalizeAssistantTextOutput(text: string): SecretaryProcessResult {
  const trimmed = text.trim()
  const parsed = normalizeSecretaryResult(extractJsonObject(trimmed))
  if (parsed.reply !== '응답을 읽지 못했어요. 다시 말해 주세요.') {
    return parsed
  }
  return {
    reply: trimmed || parsed.reply,
    intent: 'chat',
    action: null,
  }
}

function isConversationRecallRequest(input: string) {
  const normalized = input.toLowerCase()
  const hasHistoryTarget = /(이전|예전|과거|지난번|전에|아까|대화|대화내역|기록|채팅|세션|history|conversation|chat|session)/i
    .test(normalized)
  const hasRecallAction = /(찾|검색|기억|말했|언급|나눴|있었|어디|언제|뭐였|무엇|find|search|remember|mentioned)/i
    .test(normalized)
  return hasHistoryTarget && hasRecallAction
}

function mergeSearchResults(
  existing: SecretarySearchResult[] | undefined,
  conversationResults: SecretarySearchResult[],
) {
  const merged: SecretarySearchResult[] = []
  const seen = new Set<string>()

  for (const result of [...(existing ?? []), ...conversationResults]) {
    const key = `${result.type}:${result.id}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(result)
    if (merged.length >= 6) break
  }

  return merged
}

function attachConversationSearchResults(
  result: SecretaryProcessResult,
  input: string,
  conversationResults: SecretarySearchResult[],
): SecretaryProcessResult {
  if (conversationResults.length === 0) return result
  if (result.intent !== 'recall' && !isConversationRecallRequest(input)) return result
  return {
    ...result,
    intent: result.intent === 'chat' ? 'recall' : result.intent,
    searchResults: mergeSearchResults(result.searchResults, conversationResults),
  }
}

export class SecretaryService {
  private runtimeConfig: SecretaryRuntimeConfig = {}
  private activeProcessControllers = new Map<string, Set<AbortController>>()
  private cancelledProcessCounts = new Map<string, number>()

  constructor(private readonly options: SecretaryServiceOptions) {}

  syncClaudeRuntime(config: SecretaryRuntimeConfig): void {
    this.runtimeConfig = normalizeRuntimeConfig(config)
  }

  private resolveRuntimeConfig(override?: SecretaryRuntimeConfig | null): NormalizedSecretaryRuntimeConfig {
    if (!override) return normalizeRuntimeConfig(this.runtimeConfig)
    return normalizeRuntimeConfig({
      ...this.runtimeConfig,
      ...override,
      envVars: override.envVars ?? this.runtimeConfig.envVars,
    })
  }

  private getComputerUseMcpConfig(): Record<string, unknown> | null {
    return this.options.getComputerUseMcpConfig?.() ?? null
  }

  private getComputerUseAllowedAllTools(): string[] | undefined {
    const tools = this.options.getComputerUseAllowedAllTools?.() ?? []
    return tools.length > 0 ? tools : undefined
  }

  private getComputerUseStatus(): { available: boolean; detail: string; setupCommand?: string } {
    return this.options.getComputerUseStatus?.() ?? {
      available: false,
      detail: 'computer-use 실행기 상태를 확인할 수 없습니다.',
    }
  }

  async installComputerUse() {
    if (!this.options.installComputerUse) {
      return {
        ok: false,
        error: 'Cua Driver 설치 기능이 연결되어 있지 않습니다.',
      }
    }

    try {
      const status = await this.options.installComputerUse()
      return status.available
        ? {
            ok: true,
            output: `${status.detail}\n\n이제 macOS 권한 팝업에서 Accessibility와 Screen Recording을 허용한 뒤 다시 computer-use 작업을 요청해 주세요.`,
          }
        : {
            ok: false,
            error: status.setupCommand
              ? `${status.detail}\n설치 명령: ${status.setupCommand}`
              : status.detail,
          }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async saveMemory(key: string, value: string, label?: string) {
    const normalizedKey = normalizeMemoryKey(key)
    const normalizedValue = normalizeMemoryValue(value)
    if (!normalizedValue) {
      return {
        ok: false,
        error: '저장할 기억 내용이 비어 있습니다.',
      }
    }

    this.options.memory.updateProfile(normalizedKey, normalizedValue)
    return {
      ok: true,
      output: `${label?.trim() || normalizedKey} 기억을 저장했어요.`,
    }
  }

  private addActiveProcessController(conversationId: string, controller: AbortController): void {
    const controllers = this.activeProcessControllers.get(conversationId) ?? new Set<AbortController>()
    controllers.add(controller)
    this.activeProcessControllers.set(conversationId, controllers)
  }

  private removeActiveProcessController(conversationId: string, controller: AbortController): void {
    const controllers = this.activeProcessControllers.get(conversationId)
    if (!controllers) return
    controllers.delete(controller)
    if (controllers.size === 0) {
      this.activeProcessControllers.delete(conversationId)
    }
  }

  private markCancelledProcess(conversationId: string, count: number): void {
    if (count <= 0) return
    this.cancelledProcessCounts.set(
      conversationId,
      (this.cancelledProcessCounts.get(conversationId) ?? 0) + count,
    )
  }

  private consumeCancelledProcess(conversationId: string): boolean {
    const count = this.cancelledProcessCounts.get(conversationId) ?? 0
    if (count <= 0) return false
    if (count === 1) {
      this.cancelledProcessCounts.delete(conversationId)
    } else {
      this.cancelledProcessCounts.set(conversationId, count - 1)
    }
    return true
  }

  cancelActiveProcess(conversationId?: string | null): boolean {
    if (conversationId) {
      const controllers = this.activeProcessControllers.get(conversationId)
      if (!controllers?.size) return false
      this.markCancelledProcess(conversationId, controllers.size)
      for (const controller of controllers) {
        controller.abort()
      }
      this.activeProcessControllers.delete(conversationId)
      return true
    }

    if (this.activeProcessControllers.size === 0) return false
    for (const [id, controllers] of this.activeProcessControllers) {
      this.markCancelledProcess(id, controllers.size)
      for (const controller of controllers) {
        controller.abort()
      }
    }
    this.activeProcessControllers.clear()
    return true
  }

  async process(
    input: string,
    conversationId: string,
    context = DEFAULT_SECRETARY_CONTEXT,
    runtimeOverride?: SecretaryRuntimeConfig | null,
  ): Promise<SecretaryProcessResult> {
    const trimmedInput = input.trim()
    if (!trimmedInput) {
      return {
        reply: '무엇을 도와드릴까요?',
        intent: 'chat',
        action: null,
      }
    }

    const conversationSearchResults = this.options.memory.searchConversationHistory(trimmedInput, 10)

    this.options.memory.addHistory({
      conversationId,
      role: 'user',
      content: trimmedInput,
      intent: null,
    })

    try {
      const runtime = this.resolveRuntimeConfig(runtimeOverride)
      const timeout = createTimeoutSignal(SECRETARY_PROCESS_TIMEOUT_MS)
      this.addActiveProcessController(conversationId, timeout.controller)
      const result = await spawnClaudeProcess({
        prompt: buildUserPrompt(trimmedInput),
        cwd: '~',
        model: runtime.defaultModel,
        permissionMode: runtime.permissionMode,
        planMode: runtime.planMode,
        systemPrompt: buildSystemPrompt(context, {
          profile: buildPromptProfile(this.options.memory.getProfile()),
          recentHistory: this.options.memory.loadRecentHistory(conversationId, 8),
          patterns: this.options.memory.loadPatterns(4),
          learningCandidates: this.options.memory.loadLearningCandidates(6),
          conversationSearchResults: conversationSearchResults.slice(0, 4),
        }, this.getComputerUseStatus()),
        systemPromptMode: 'system',
        effort: 'low',
        tools: 'none',
        settingSources: ['local'],
        claudePath: runtime.claudePath,
        envVars: runtime.envVars,
        mcpConfig: EMPTY_MCP_CONFIG,
        strictMcpConfig: true,
        abortSignal: timeout.signal,
        getUserHomePath: this.options.getUserHomePath,
        resolveTargetPath: this.options.resolveTargetPath,
      }).finally(() => {
        timeout.clear()
        this.removeActiveProcessController(conversationId, timeout.controller)
      })

      if (this.consumeCancelledProcess(conversationId)) {
        return {
          reply: '이번 요청은 중단했어요. 필요하면 이어서 다시 요청해 주세요.',
          intent: 'chat',
          action: null,
        }
      }

      if (result.isError) {
        if (timeout.signal.aborted && result.output.trim()) {
          const parsed = attachConversationSearchResults(
            normalizeAssistantTextOutput(result.output),
            trimmedInput,
            conversationSearchResults,
          )
          this.options.memory.recordLearningCandidateFromTurn(trimmedInput, parsed)
          this.options.memory.addHistory({
            conversationId,
            role: 'secretary',
            content: parsed.reply,
            intent: parsed.intent,
            action: parsed.action,
            searchResults: parsed.searchResults,
          })
          return parsed
        }
        if (timeout.signal.aborted) {
          if (result.error && result.error !== 'Workflow execution aborted') {
            throw new Error(result.error)
          }
          throw new Error('Secretary LLM request timed out.')
        }
        throw new Error(result.error || result.output || 'Secretary LLM request failed.')
      }

      const parsed = attachConversationSearchResults(
        normalizeAssistantTextOutput(result.output),
        trimmedInput,
        conversationSearchResults,
      )
      this.options.memory.recordLearningCandidateFromTurn(trimmedInput, parsed)
      this.options.memory.addHistory({
        conversationId,
        role: 'secretary',
        content: parsed.reply,
        intent: parsed.intent,
        action: parsed.action,
        searchResults: parsed.searchResults,
      })

      if (parsed.action?.type === 'navigate') {
        this.options.memory.recordPatternUse({
          patternType: 'route',
          refId: parsed.action.route,
          label: parsed.action.route,
        })
      }

      if (this.options.memory.countHistory(conversationId) <= 2) {
        this.options.memory.maybeSetFallbackTitle(conversationId, trimmedInput)
        void this.generateConversationTitle(conversationId, trimmedInput, parsed.reply)
      }

      return parsed
    } catch (error) {
      if (this.consumeCancelledProcess(conversationId)) {
        return {
          reply: '이번 요청은 중단했어요. 필요하면 이어서 다시 요청해 주세요.',
          intent: 'chat',
          action: null,
        }
      }
      const timedOut = error instanceof Error && error.message === 'Secretary LLM request timed out.'
      const reply = buildProcessFallbackReply(error, timedOut)
      const fallback: SecretaryProcessResult = {
        reply,
        intent: 'chat',
        action: null,
      }
      this.options.memory.addHistory({
        conversationId,
        role: 'secretary',
        content: fallback.reply,
        intent: fallback.intent,
      })
      return fallback
    }
  }

  async runClaudeCode(prompt: string, conversationId?: string, hooks: SecretaryRunClaudeCodeHooks = {}) {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      return { ok: false, error: '실행할 내용이 없습니다.' }
    }
    const processId = conversationId ?? `secretary-execution-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let guardrailAbortReason: string | null = null

    try {
      const runtime = this.resolveRuntimeConfig()
      const computerUseMcpConfig = this.getComputerUseMcpConfig()
      if (!computerUseMcpConfig) {
        const status = this.getComputerUseStatus()
        return {
          ok: false,
          error: status.setupCommand
            ? `computer-use를 실행하려면 Cua Driver 설치가 필요합니다. 설치 명령: ${status.setupCommand}`
            : status.detail,
        }
      }

      const timeout = createTimeoutSignal(SECRETARY_EXECUTE_TIMEOUT_MS)
      const guardrail = createSecretaryExecutionGuardrail({
        abort: (reason) => {
          guardrailAbortReason = reason
          timeout.controller.abort()
        },
        onWarning: hooks.onComputerUseEvent,
      })
      const eventReader = await createComputerUseEventReader((event) => {
        guardrail.record(event)
        hooks.onComputerUseEvent?.(event)
      })
      const computerUseMcpConfigWithEvents = eventReader
        ? attachMcpServerEnv(computerUseMcpConfig, { CITTO_VISUAL_EVENT_FILE: eventReader.eventFilePath })
        : computerUseMcpConfig
      guardrail.start()
      this.addActiveProcessController(processId, timeout.controller)
      const result = await spawnClaudeProcess({
        prompt: trimmedPrompt,
        cwd: '~',
        model: runtime.defaultModel,
        permissionMode: computerUseMcpConfig ? 'bypassPermissions' : runtime.permissionMode,
        planMode: runtime.planMode,
        systemPrompt: buildDelegatedExecutionSystemPrompt(),
        systemPromptMode: 'system',
        effort: 'low',
        tools: 'none',
        settingSources: ['local'],
        claudePath: runtime.claudePath,
        envVars: runtime.envVars,
        mcpConfig: computerUseMcpConfigWithEvents ?? EMPTY_MCP_CONFIG,
        strictMcpConfig: true,
        allowedTools: computerUseMcpConfig ? this.getComputerUseAllowedAllTools() : undefined,
        abortSignal: timeout.signal,
        getUserHomePath: this.options.getUserHomePath,
        resolveTargetPath: this.options.resolveTargetPath,
      }).finally(() => {
        timeout.clear()
        guardrail.dispose()
        this.removeActiveProcessController(processId, timeout.controller)
        void eventReader?.dispose()
      })

      if (this.consumeCancelledProcess(processId)) {
        return {
          ok: false,
          output: result.output,
          error: '사용자가 작업을 중단했어요.',
        }
      }

      if (result.isError) {
        if (timeout.signal.aborted) {
          return {
            ok: false,
            output: result.output,
            error: guardrailAbortReason ?? '응답 시간이 너무 오래 걸려 실행을 중단했어요. 다시 시도해 주세요.',
          }
        }
        return {
          ok: false,
          output: result.output,
          error: result.error || result.output || 'Claude Code 실행이 실패했습니다.',
        }
      }

      const output = result.output.trim() || '실행이 완료되었습니다.'
      if (conversationId) {
        this.options.memory.addHistory({
          conversationId,
          role: 'secretary',
          content: output,
          intent: 'execute',
        })
      }

      return { ok: true, output }
    } catch (error) {
      if (this.consumeCancelledProcess(processId)) {
        return {
          ok: false,
          error: '사용자가 작업을 중단했어요.',
        }
      }
      return {
        ok: false,
        error: guardrailAbortReason ?? (error instanceof Error ? error.message : String(error)),
      }
    }
  }

  private async generateConversationTitle(conversationId: string, input: string, reply: string): Promise<void> {
    try {
      const runtime = this.resolveRuntimeConfig()
      const timeout = createTimeoutSignal(SECRETARY_TITLE_TIMEOUT_MS)
      const result = await spawnClaudeProcess({
        prompt: buildTitlePrompt(input, reply),
        cwd: '~',
        model: runtime.defaultModel,
        permissionMode: 'default',
        claudePath: runtime.claudePath,
        envVars: runtime.envVars,
        effort: 'low',
        tools: 'none',
        settingSources: ['local'],
        mcpConfig: EMPTY_MCP_CONFIG,
        strictMcpConfig: true,
        abortSignal: timeout.signal,
        getUserHomePath: this.options.getUserHomePath,
        resolveTargetPath: this.options.resolveTargetPath,
      }).finally(timeout.clear)

      if (result.isError) return
      const title = sanitizeTitle(result.output)
      if (title) {
        this.options.memory.setGeneratedTitle(conversationId, title)
      }
    } catch {
      // Fallback title is already stored synchronously.
    }
  }
}
