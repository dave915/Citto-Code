import { useEffect, useState } from 'react'
import type { ModelInfo, PluginSkill } from '../../electron/preload'
import type { AppLanguage } from '../lib/i18n'
import { getBuiltinSlashCommands, type SlashCommand } from '../components/input/inputUtils'

const MODEL_CACHE = new Map<string, ModelInfo[]>()
const MODEL_PROMISE_CACHE = new Map<string, Promise<ModelInfo[]>>()

type CachedSlashCommandSources = {
  customCommands: SlashCommand[]
  pluginCommands: SlashCommand[]
}

let slashCommandSourcesCache: CachedSlashCommandSources | null = null
let slashCommandSourcesPromise: Promise<CachedSlashCommandSources> | null = null

function buildModelCacheKey(envVars?: Record<string, string>) {
  return JSON.stringify(
    Object.entries(envVars ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function loadModelsCached(modelEnvVars?: Record<string, string>): Promise<ModelInfo[]> {
  const cacheKey = buildModelCacheKey(modelEnvVars)
  const cached = MODEL_CACHE.get(cacheKey)
  if (cached) return Promise.resolve(cached)

  const inFlight = MODEL_PROMISE_CACHE.get(cacheKey)
  if (inFlight) return inFlight

  const promise = window.claude.getModels(modelEnvVars)
    .catch(() => [])
    .then((models) => {
      MODEL_CACHE.set(cacheKey, models)
      return models
    })
    .finally(() => {
      MODEL_PROMISE_CACHE.delete(cacheKey)
    })

  MODEL_PROMISE_CACHE.set(cacheKey, promise)
  return promise
}

function loadSlashCommandSourcesCached(): Promise<CachedSlashCommandSources> {
  if (slashCommandSourcesCache) return Promise.resolve(slashCommandSourcesCache)
  if (slashCommandSourcesPromise) return slashCommandSourcesPromise

  const promise = Promise.all([
    window.claude.listSkills().catch(() => []),
    window.claude.listPluginSkills().catch(() => []),
  ])
    .then(([commands, pluginSkills]) => {
      const customCommands = commands.map((command) => ({ ...command, kind: 'custom' as const }))
      const pluginCommands = pluginSkills.map((skill: PluginSkill) => ({
        name: skill.name,
        path: skill.path,
        dir: skill.dir,
        legacy: false,
        pluginName: skill.pluginName,
        kind: 'plugin' as const,
        description: `${skill.pluginName} plugin`,
      }))
      const next = {
        customCommands,
        pluginCommands,
      }
      slashCommandSourcesCache = next
      return next
    })
    .catch(() => {
      const next = {
        customCommands: [],
        pluginCommands: [],
      }
      slashCommandSourcesCache = next
      return next
    })
    .finally(() => {
      slashCommandSourcesPromise = null
    })

  slashCommandSourcesPromise = promise
  return promise
}

export function useInputModelData(sanitizedEnvVars: Record<string, string>, language: AppLanguage) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const builtinSlashCommands = getBuiltinSlashCommands(language)
    const modelEnvVars = Object.keys(sanitizedEnvVars).length > 0 ? sanitizedEnvVars : undefined
    const modelCacheKey = buildModelCacheKey(modelEnvVars)
    const cachedModels = MODEL_CACHE.get(modelCacheKey)

    if (cachedModels) {
      setModels(cachedModels)
      setModelsLoading(false)
    } else {
      setModelsLoading(true)
    }

    if (slashCommandSourcesCache) {
      setSlashCommands([
        ...builtinSlashCommands,
        ...slashCommandSourcesCache.customCommands,
        ...slashCommandSourcesCache.pluginCommands,
      ])
    } else {
      setSlashCommands(builtinSlashCommands)
    }

    void loadModelsCached(modelEnvVars)
      .then((loadedModels) => {
        if (cancelled) return
        setModels(loadedModels)
      })
      .catch(() => {
        if (cancelled) return
        setModels([])
      })
      .finally(() => {
        if (cancelled) return
        setModelsLoading(false)
      })

    void loadSlashCommandSourcesCached()
      .then((sources) => {
        if (cancelled) return
        setSlashCommands([
          ...builtinSlashCommands,
          ...sources.customCommands,
          ...sources.pluginCommands,
        ])
      })
      .catch(() => {
        if (cancelled) return
        setSlashCommands(builtinSlashCommands)
      })

    return () => {
      cancelled = true
    }
  }, [language, sanitizedEnvVars])

  return {
    models,
    modelsLoading,
    slashCommands,
  }
}
