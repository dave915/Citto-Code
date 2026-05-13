type GuardrailOptions = {
  abort: (reason: string) => void
  onWarning?: (event: unknown) => void
  noProgressTimeoutMs?: number
  repeatedEventWarnAfter?: number
  repeatedEventBlockAfter?: number
}

const DEFAULT_NO_PROGRESS_TIMEOUT_MS = 45_000
const DEFAULT_REPEATED_EVENT_WARN_AFTER = 3
const DEFAULT_REPEATED_EVENT_BLOCK_AFTER = 6
const CHECK_INTERVAL_MS = 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildEventSignature(event: unknown) {
  const record = isRecord(event) ? event : {}
  const cursor = isRecord(record.cursor) ? record.cursor : {}
  const screen = isRecord(record.screen) ? record.screen : {}
  const type = getText(record.type) || 'unknown'
  const target = getText(cursor.targetLabel)
  const label = getText(cursor.label)
  const screenX = getNumber(screen.x)
  const screenY = getNumber(screen.y)
  const x = screenX == null ? '' : Math.round(screenX / 4) * 4
  const y = screenY == null ? '' : Math.round(screenY / 4) * 4
  return [type, target, label, x, y].join('|')
}

function buildGuardrailEvent(message: string) {
  return {
    type: 'guardrail_warning',
    message,
    cursor: {
      visible: true,
      x: 50,
      y: 50,
      label: '반복 감지',
      targetLabel: '실행 경로',
      mode: 'waiting',
    },
  }
}

export function createSecretaryExecutionGuardrail(options: GuardrailOptions) {
  const noProgressTimeoutMs = options.noProgressTimeoutMs ?? DEFAULT_NO_PROGRESS_TIMEOUT_MS
  const repeatedEventWarnAfter = options.repeatedEventWarnAfter ?? DEFAULT_REPEATED_EVENT_WARN_AFTER
  const repeatedEventBlockAfter = options.repeatedEventBlockAfter ?? DEFAULT_REPEATED_EVENT_BLOCK_AFTER
  let lastProgressAt = Date.now()
  let timer: ReturnType<typeof setInterval> | null = null
  let disposed = false
  let aborted = false
  let lastSignature = ''
  let repeatedSignatureCount = 0

  const abortOnce = (reason: string) => {
    if (aborted || disposed) return
    aborted = true
    options.abort(reason)
  }

  const start = () => {
    if (timer) return
    timer = setInterval(() => {
      if (disposed || aborted) return
      const idleMs = Date.now() - lastProgressAt
      if (idleMs < noProgressTimeoutMs) return
      abortOnce(
        `화면/접근성 조작 도구가 ${Math.round(noProgressTimeoutMs / 1000)}초 동안 진행 이벤트를 내지 않아 중단했어요. 요청을 더 작은 단계로 나누거나 대상 앱/창 이름을 명확히 적어 다시 시도해 주세요.`,
      )
    }, CHECK_INTERVAL_MS)
  }

  return {
    start,
    record(event: unknown) {
      if (disposed || aborted) return
      lastProgressAt = Date.now()
      const signature = buildEventSignature(event)
      if (signature === lastSignature) {
        repeatedSignatureCount += 1
      } else {
        lastSignature = signature
        repeatedSignatureCount = 1
      }

      if (repeatedSignatureCount === repeatedEventWarnAfter) {
        options.onWarning?.(buildGuardrailEvent('같은 화면 조작이 반복되고 있어요. 다른 경로를 고르지 않으면 자동으로 중단합니다.'))
      }

      if (repeatedSignatureCount >= repeatedEventBlockAfter) {
        abortOnce('같은 화면/접근성 조작이 반복되어 실행을 중단했어요. 화면을 다시 읽고 다른 element나 다른 도구 경로로 시도해 주세요.')
      }
    },
    dispose() {
      disposed = true
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}
