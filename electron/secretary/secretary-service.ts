import { spawnClaudeProcess } from '../services/claude-spawn'
import { buildCapabilityManifest } from './actions'
import { extractJsonObject, normalizeSecretaryResult } from './intent-router'
import type { SecretaryMemory } from './memory'
import type {
  SecretaryActiveContext,
  SecretaryProcessResult,
  SecretaryRuntimeConfig,
} from './types'
import type { PermissionMode } from '../persistence-types'

type SecretaryServiceOptions = {
  memory: SecretaryMemory
  getUserHomePath: (env?: NodeJS.ProcessEnv) => string
  resolveTargetPath: (targetPath: string) => string
}

const SECRETARY_PROCESS_TIMEOUT_MS = 60_000
const SECRETARY_EXECUTE_TIMEOUT_MS = 60_000
const SECRETARY_TITLE_TIMEOUT_MS = 20_000

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
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
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
}) {
  return [
    '당신은 Citto의 비서 "기본 씨토"입니다.',
    'Citto의 세션, 결과물, 워크플로우를 참조해 다음 작업을 제안하는 얇은 대화 레이어입니다.',
    '비서 자체는 특정 프로젝트 디렉토리에 종속되지 않습니다. 프로젝트 경로가 보이더라도 참고 정보로만 사용하세요.',
    '현재 비서 채팅의 기록만 대화 컨텍스트로 사용하세요. 다른 비서 채팅의 내용을 아는 척하지 마세요.',
    '추상적인 장기 기억을 아는 척하지 말고, 제공된 컨텍스트와 실제 참조만 사용하세요.',
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

export class SecretaryService {
  private runtimeConfig: SecretaryRuntimeConfig = {}

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

    this.options.memory.addHistory({
      conversationId,
      role: 'user',
      content: trimmedInput,
      intent: null,
    })

    try {
      const runtime = this.resolveRuntimeConfig(runtimeOverride)
      const timeout = createTimeoutSignal(SECRETARY_PROCESS_TIMEOUT_MS)
      const result = await spawnClaudeProcess({
        prompt: buildUserPrompt(trimmedInput),
        cwd: '~',
        model: runtime.defaultModel,
        permissionMode: runtime.permissionMode,
        planMode: runtime.planMode,
        systemPrompt: buildSystemPrompt(context, {
          profile: this.options.memory.getProfile(),
          recentHistory: this.options.memory.loadRecentHistory(conversationId, 20),
          patterns: this.options.memory.loadPatterns(8),
        }),
        claudePath: runtime.claudePath,
        envVars: runtime.envVars,
        abortSignal: timeout.signal,
        getUserHomePath: this.options.getUserHomePath,
        resolveTargetPath: this.options.resolveTargetPath,
      }).finally(timeout.clear)

      if (result.isError) {
        if (timeout.signal.aborted && result.output.trim()) {
          const parsed = normalizeAssistantTextOutput(result.output)
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

      const parsed = normalizeAssistantTextOutput(result.output)
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

  async runClaudeCode(prompt: string, conversationId?: string) {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      return { ok: false, error: '실행할 내용이 없습니다.' }
    }

    try {
      const runtime = this.resolveRuntimeConfig()
      const timeout = createTimeoutSignal(SECRETARY_EXECUTE_TIMEOUT_MS)
      const result = await spawnClaudeProcess({
        prompt: trimmedPrompt,
        cwd: '~',
        model: runtime.defaultModel,
        permissionMode: runtime.permissionMode,
        planMode: runtime.planMode,
        systemPrompt: 'Citto 비서가 사용자 확인 후 위임한 작업입니다. 특정 프로젝트 디렉토리를 자동으로 가정하지 말고, 필요한 대상이 불명확하면 결과에서 명확히 알려 주세요.',
        claudePath: runtime.claudePath,
        envVars: runtime.envVars,
        abortSignal: timeout.signal,
        getUserHomePath: this.options.getUserHomePath,
        resolveTargetPath: this.options.resolveTargetPath,
      }).finally(timeout.clear)

      if (result.isError) {
        if (timeout.signal.aborted) {
          return {
            ok: false,
            output: result.output,
            error: '응답 시간이 너무 오래 걸려 실행을 중단했어요. 다시 시도해 주세요.',
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
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
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
