import { createCliHistoryService } from './settingsData/cliHistory'
import { createMcpStore } from './settingsData/mcpStore'
import { createPluginSkillService } from './settingsData/pluginSkills'

type CreateSettingsDataServiceOptions = {
  getHomePath: () => string
  getProjectNameFromPath: (path: string) => string
  defaultProjectPath: string
}

export function createSettingsDataService({
  getHomePath,
  getProjectNameFromPath,
  defaultProjectPath,
}: CreateSettingsDataServiceOptions) {
  const mcpStore = createMcpStore({ getHomePath })
  const cliHistoryService = createCliHistoryService({
    defaultProjectPath,
    getHomePath,
    getProjectNameFromPath,
  })
  const pluginSkillService = createPluginSkillService({ getHomePath })

  return {
    ...mcpStore,
    ...cliHistoryService,
    ...pluginSkillService,
  }
}
