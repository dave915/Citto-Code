import { useEffect, useState } from 'react'
import type { ModelInfo, PluginSkill } from '../../electron/preload'
import type { AppLanguage } from '../lib/i18n'
import { getBuiltinSlashCommands, type SlashCommand } from '../components/input/inputUtils'

export function useInputModelData(sanitizedEnvVars: Record<string, string>, language: AppLanguage) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)

  useEffect(() => {
    const builtinSlashCommands = getBuiltinSlashCommands(language)
    const modelEnvVars = Object.keys(sanitizedEnvVars).length > 0 ? sanitizedEnvVars : undefined

    setModelsLoading(true)
    window.claude.getModels(modelEnvVars).then(setModels).catch(() => setModels([])).finally(() => setModelsLoading(false))

    Promise.all([
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
        setSlashCommands([...builtinSlashCommands, ...customCommands, ...pluginCommands])
      })
      .catch(() => setSlashCommands(builtinSlashCommands))
  }, [language, sanitizedEnvVars])

  return {
    models,
    modelsLoading,
    slashCommands,
  }
}
