export const GATEWAY_PROXY_PORT = 18317
export const GATEWAY_API_VERSION = 'v2'
export const GATEWAY_DEFAULT_MODEL_ID = 'gpt-54'
export const GATEWAY_BASE_URL = (
  process.env.CITTO_GATEWAY_BASE_URL
  ?? process.env.GATEWAY_BASE_URL
  ?? ''
).trim()

export const GATEWAY_MODELS = [
  {
    id: GATEWAY_DEFAULT_MODEL_ID,
    name: 'GPT-5.4',
    displayName: 'GPT-5.4 (Gateway)',
  },
] as const

export type GatewayModelId = (typeof GATEWAY_MODELS)[number]['id']

export function isGatewayModelId(modelId: string | null | undefined): modelId is GatewayModelId {
  if (typeof modelId !== 'string') return false
  const normalized = modelId.trim()
  return GATEWAY_MODELS.some((model) => model.id === normalized)
}

export function getGatewayProxyBaseUrl(): string {
  return `http://127.0.0.1:${GATEWAY_PROXY_PORT}`
}

export function getGatewayChatCompletionsUrl(): string | null {
  if (!GATEWAY_BASE_URL) return null
  const normalizedBase = /\/$/.test(GATEWAY_BASE_URL) ? GATEWAY_BASE_URL : `${GATEWAY_BASE_URL}/`
  return new URL(`${GATEWAY_API_VERSION}/chat/completions`, normalizedBase).toString()
}
