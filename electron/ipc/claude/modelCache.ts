import { readEnvVar } from '../../services/claude/installation'

type ModelInfo = {
  id: string
  displayName: string
  family: string
  provider: 'anthropic' | 'ollama' | 'custom' | 'gateway'
  isLocal: boolean
  isGateway?: boolean
}

const CACHE_TTL = 5 * 60 * 1000

let modelsCache: { list: ModelInfo[]; fetchedAt: number; cacheKey: string } | null = null
let modelsInFlight: { promise: Promise<ModelInfo[]>; cacheKey: string } | null = null

function buildModelsCacheKey(envVars?: Record<string, string>) {
  return JSON.stringify({
    anthropicApiKey: readEnvVar(envVars, 'ANTHROPIC_API_KEY'),
    anthropicAuthToken: readEnvVar(envVars, 'ANTHROPIC_AUTH_TOKEN'),
    anthropicBaseUrl: readEnvVar(envVars, 'ANTHROPIC_BASE_URL'),
    nodeExtraCaCerts: readEnvVar(envVars, 'NODE_EXTRA_CA_CERTS'),
    processApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    processAuthToken: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
    processBaseUrl: process.env.ANTHROPIC_BASE_URL ?? '',
    processNodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS ?? '',
  })
}

export async function getCachedClaudeModels(
  fetchModelsFromApi: (envVars?: Record<string, string>) => Promise<ModelInfo[]>,
  envVars?: Record<string, string>,
): Promise<ModelInfo[]> {
  const now = Date.now()
  const cacheKey = buildModelsCacheKey(envVars)

  if (modelsCache && modelsCache.cacheKey === cacheKey && now - modelsCache.fetchedAt < CACHE_TTL) {
    return modelsCache.list
  }

  if (modelsInFlight && modelsInFlight.cacheKey === cacheKey) {
    return modelsInFlight.promise
  }

  const promise = fetchModelsFromApi(envVars)
    .then((list) => {
      modelsCache = { list, fetchedAt: Date.now(), cacheKey }
      return list
    })
    .finally(() => {
      if (modelsInFlight?.promise === promise) {
        modelsInFlight = null
      }
    })

  modelsInFlight = { promise, cacheKey }
  return promise
}
