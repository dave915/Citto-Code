import { exec } from 'child_process'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { existsSync, readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { GATEWAY_MODELS } from '../gateway-constants'
import { getUserHomePath } from './shellEnvironmentService'

export type ModelInfo = {
  id: string
  displayName: string
  family: string
  provider: 'anthropic' | 'ollama' | 'custom' | 'gateway'
  isLocal: boolean
  isGateway?: boolean
}

type ApiConfig = {
  apiKey: string
  authToken: string
  baseUrl: string
}

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-6', displayName: 'Opus 4.6', family: 'opus', provider: 'anthropic', isLocal: false, isGateway: false },
  { id: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6', family: 'sonnet', provider: 'anthropic', isLocal: false, isGateway: false },
  { id: 'claude-opus-4-5', displayName: 'Opus 4.5', family: 'opus', provider: 'anthropic', isLocal: false, isGateway: false },
  { id: 'claude-sonnet-4-5', displayName: 'Sonnet 4.5', family: 'sonnet', provider: 'anthropic', isLocal: false, isGateway: false },
  { id: 'claude-haiku-4-5', displayName: 'Haiku 4.5', family: 'haiku', provider: 'anthropic', isLocal: false, isGateway: false },
]
const GATEWAY_MODEL_INFOS: ModelInfo[] = GATEWAY_MODELS.map((model) => ({
  id: model.id,
  displayName: model.displayName,
  family: 'gateway',
  provider: 'gateway',
  isLocal: false,
  isGateway: true,
}))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readEnvVar(envVars: Record<string, string> | undefined, key: string): string {
  const value = envVars?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function modelDisplayName(id: string): string {
  const match = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/)
  if (!match) return id
  const [, family, major, minor] = match
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return minor ? `${name} ${major}.${minor}` : `${name} ${major}`
}

function normalizeBaseUrl(baseUrl: string): string {
  return /\/$/.test(baseUrl) ? baseUrl : `${baseUrl}/`
}

function buildApiUrl(baseUrl: string, path: string): URL {
  return new URL(path.replace(/^\/+/, ''), normalizeBaseUrl(baseUrl))
}

function isOfficialAnthropicBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    return url.protocol === 'https:' && url.hostname === 'api.anthropic.com'
  } catch {
    return false
  }
}

function isLikelyOllamaBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '0.0.0.0' ||
      /(^|\.)ollama\.com$/i.test(url.hostname)
    )
  } catch {
    return false
  }
}

function isLocalOllamaBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    return (
      url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '0.0.0.0'
    )
  } catch {
    return false
  }
}

function inferModelFamily(modelId: string, familyHint?: string): string {
  const lowered = (familyHint || modelId).toLowerCase()
  if (lowered.includes('opus')) return 'opus'
  if (lowered.includes('haiku')) return 'haiku'
  if (lowered.includes('sonnet')) return 'sonnet'
  if (lowered.includes('llama')) return 'llama'
  if (lowered.includes('qwen')) return 'qwen'
  if (lowered.includes('deepseek')) return 'deepseek'
  if (lowered.includes('gemma')) return 'gemma'
  if (lowered.includes('mistral')) return 'mistral'
  if (lowered.includes('phi')) return 'phi'
  const match = lowered.match(/[a-z0-9]+/)
  return match?.[0] ?? 'model'
}

function createModelInfo(
  id: string,
  displayName: string | undefined,
  familyHint: string | undefined,
  provider: ModelInfo['provider'],
  isLocal: boolean,
): ModelInfo {
  const normalizedId = id.trim()
  const normalizedDisplayName = displayName?.trim()

  return {
    id: normalizedId,
    displayName: normalizedDisplayName || (/^claude-/i.test(normalizedId) ? modelDisplayName(normalizedId) : normalizedId),
    family: inferModelFamily(normalizedId, familyHint),
    provider,
    isLocal,
    isGateway: provider === 'gateway',
  }
}

function uniqueModels(models: ModelInfo[]): ModelInfo[] {
  const deduped = new Map<string, ModelInfo>()

  for (const model of models) {
    if (!model.id) continue
    const existing = deduped.get(model.id)
    if (!existing || model.isGateway || (model.isLocal && !existing.isLocal)) {
      deduped.set(model.id, model)
    }
  }

  return Array.from(deduped.values())
}

function parseV1ModelsPayload(payload: unknown, provider: ModelInfo['provider']): ModelInfo[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []

  return uniqueModels(
    payload.data.flatMap((entry) => {
      if (!isRecord(entry)) return []
      const id = typeof entry.id === 'string' ? entry.id : ''
      if (!id) return []

      const displayName = typeof entry.display_name === 'string'
        ? entry.display_name
        : typeof entry.name === 'string'
          ? entry.name
          : undefined
      const family = typeof entry.family === 'string' ? entry.family : undefined
      return [createModelInfo(id, displayName, family, provider, false)]
    }),
  )
}

function parseOllamaTagsPayload(payload: unknown, isLocal: boolean): ModelInfo[] {
  if (!isRecord(payload) || !Array.isArray(payload.models)) return []

  return uniqueModels(
    payload.models.flatMap((entry) => {
      if (!isRecord(entry)) return []

      const id = typeof entry.name === 'string'
        ? entry.name
        : typeof entry.model === 'string'
          ? entry.model
          : ''
      if (!id) return []

      const details = isRecord(entry.details) ? entry.details : null
      const family = typeof details?.family === 'string'
        ? details.family
        : Array.isArray(details?.families)
          ? details.families.find((value): value is string => typeof value === 'string')
          : undefined

      return [createModelInfo(id, id, family, 'ollama', isLocal)]
    }),
  )
}

async function requestJson(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  envVars?: Record<string, string>,
): Promise<unknown | null> {
  return new Promise((resolve) => {
    let url: URL
    try {
      url = buildApiUrl(baseUrl, path)
    } catch {
      resolve(null)
      return
    }

    const isHttps = url.protocol === 'https:'
    const requester = isHttps ? httpsRequest : httpRequest
    const extraCaCertPath = readEnvVar(envVars, 'NODE_EXTRA_CA_CERTS') || (process.env.NODE_EXTRA_CA_CERTS ?? '')

    const req = requester(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'GET',
        headers,
        ca: extraCaCertPath && existsSync(extraCaCertPath) ? readFileSync(extraCaCertPath) : undefined,
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if ((res.statusCode ?? 500) >= 400 || !data.trim()) {
            resolve(null)
            return
          }

          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(null)
          }
        })
      },
    )

    req.on('error', () => resolve(null))
    req.setTimeout(5000, () => {
      req.destroy()
      resolve(null)
    })
    req.end()
  })
}

function mergeFallbackModels(models: ModelInfo[]): ModelInfo[] {
  return uniqueModels([...models, ...FALLBACK_MODELS])
}

async function fetchOllamaModels(
  baseUrl: string,
  envVars?: Record<string, string>,
  authToken?: string,
  apiKey?: string,
): Promise<ModelInfo[]> {
  const headers: Record<string, string> = {}
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  const payload = await requestJson(baseUrl, '/api/tags', headers, envVars)
  return parseOllamaTagsPayload(payload, isLocalOllamaBaseUrl(baseUrl))
}

function runApiKeyHelper(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, {
      encoding: 'utf-8',
      timeout: 5000,
    }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout.trim())
    })
  })
}

async function getApiConfig(envVars?: Record<string, string>): Promise<ApiConfig> {
  const envApiKey = readEnvVar(envVars, 'ANTHROPIC_API_KEY')
  const envAuthToken = readEnvVar(envVars, 'ANTHROPIC_AUTH_TOKEN')
  const envBaseUrl = readEnvVar(envVars, 'ANTHROPIC_BASE_URL')
  let apiKey = envApiKey || (process.env.ANTHROPIC_API_KEY ?? '')
  let authToken = envAuthToken || (process.env.ANTHROPIC_AUTH_TOKEN ?? '')
  let baseUrl = envBaseUrl || (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com')

  try {
    const settingsPath = join(getUserHomePath(), '.claude', 'settings.json')
    const settings = JSON.parse(await readFile(settingsPath, 'utf-8'))
    if (!envBaseUrl && settings.baseURL) baseUrl = settings.baseURL
    if (!apiKey && settings.apiKeyHelper) {
      apiKey = await runApiKeyHelper(settings.apiKeyHelper)
    }
  } catch {
    // Ignore local Claude settings read failures.
  }

  return { apiKey, authToken, baseUrl }
}

export async function fetchModelsFromApi(envVars?: Record<string, string>): Promise<ModelInfo[]> {
  const { apiKey, authToken, baseUrl } = await getApiConfig(envVars)
  const usingOfficialAnthropic = isOfficialAnthropicBaseUrl(baseUrl)
  const usingOllama = isLikelyOllamaBaseUrl(baseUrl)
  const remoteHeaders: Record<string, string> = {}
  if (apiKey) remoteHeaders['x-api-key'] = apiKey
  if (authToken) remoteHeaders.Authorization = `Bearer ${authToken}`
  if (!usingOllama) remoteHeaders['anthropic-version'] = '2023-06-01'

  let configuredModels: ModelInfo[] = []

  if (usingOllama) {
    configuredModels = await fetchOllamaModels(baseUrl, envVars, authToken, apiKey)
  } else if (apiKey || authToken) {
    const modelsPayload = await requestJson(baseUrl, '/v1/models', remoteHeaders, envVars)
    configuredModels = parseV1ModelsPayload(modelsPayload, usingOfficialAnthropic ? 'anthropic' : 'custom')
  } else if (usingOfficialAnthropic) {
    configuredModels = FALLBACK_MODELS
  }

  const localOllamaModels = usingOllama
    ? configuredModels
    : await fetchOllamaModels(DEFAULT_OLLAMA_BASE_URL, envVars)

  const mergedConfiguredModels = usingOfficialAnthropic
    ? mergeFallbackModels(configuredModels)
    : configuredModels
  const mergedModels = uniqueModels([
    ...GATEWAY_MODEL_INFOS,
    ...localOllamaModels,
    ...mergedConfiguredModels,
  ])

  if (mergedModels.length > 0) return mergedModels
  return usingOfficialAnthropic ? FALLBACK_MODELS : []
}
