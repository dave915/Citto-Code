import { useEffect, useState } from 'react'
import type { ModelInfo, PluginSkill } from '../../electron/preload'
import { BUILTIN_SLASH_COMMANDS, type SlashCommand } from '../components/input/inputUtils'

export function useInputModelData(sanitizedEnvVars: Record<string, string>) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)

  useEffect(() => {
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
        setSlashCommands([...BUILTIN_SLASH_COMMANDS, ...customCommands, ...pluginCommands])
      })
      .catch(() => setSlashCommands(BUILTIN_SLASH_COMMANDS))
  }, [sanitizedEnvVars])

  return {
    models,
    modelsLoading,
    slashCommands,
  }
}
