import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { PluginSkill } from '../../preload'
import { findSkillFile, isDirectoryPath, readJsonObject } from './shared'

type CreatePluginSkillServiceOptions = {
  getHomePath: () => string
}

export function createPluginSkillService({ getHomePath }: CreatePluginSkillServiceOptions) {
  function listPluginSkills(): PluginSkill[] {
    const pluginRoots: string[] = []
    const results: PluginSkill[] = []
    const seen = new Set<string>()
    const pluginsDir = join(getHomePath(), '.claude', 'plugins')

    try {
      const marketplacesDir = join(pluginsDir, 'marketplaces')
      if (existsSync(marketplacesDir)) {
        for (const marketplace of readdirSync(marketplacesDir, { withFileTypes: true })) {
          if (!marketplace.isDirectory()) continue
          const marketplacePath = join(marketplacesDir, marketplace.name)
          pluginRoots.push(join(marketplacePath, 'plugins'))
          pluginRoots.push(join(marketplacePath, 'external_plugins'))
        }
      }
    } catch {
      // Ignore plugin discovery failures.
    }

    pluginRoots.push(join(pluginsDir, 'repos'))

    for (const root of pluginRoots) {
      if (!existsSync(root)) continue

      try {
        for (const pluginEntry of readdirSync(root, { withFileTypes: true })) {
          const pluginPath = join(root, pluginEntry.name)
          if (!(pluginEntry.isDirectory() || (pluginEntry.isSymbolicLink() && isDirectoryPath(pluginPath)))) continue

          const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json')
          if (!existsSync(manifestPath)) continue

          const manifest = readJsonObject(manifestPath)
          const pluginName = typeof manifest.name === 'string' && manifest.name.trim()
            ? manifest.name.trim()
            : pluginEntry.name
          const skillsDir = join(pluginPath, 'skills')
          if (!existsSync(skillsDir)) continue

          for (const skillEntry of readdirSync(skillsDir, { withFileTypes: true })) {
            const skillDir = join(skillsDir, skillEntry.name)
            if (!(skillEntry.isDirectory() || (skillEntry.isSymbolicLink() && isDirectoryPath(skillDir)))) continue
            const skillFile = findSkillFile(skillDir)
            if (!skillFile || seen.has(skillFile)) continue
            seen.add(skillFile)
            results.push({
              name: skillEntry.name,
              path: skillFile,
              dir: skillDir,
              pluginName,
              pluginPath,
            })
          }
        }
      } catch {
        // Ignore plugin discovery failures.
      }
    }

    return results.sort((a, b) => {
      if (a.pluginName === b.pluginName) return a.name.localeCompare(b.name)
      return a.pluginName.localeCompare(b.pluginName)
    })
  }

  return { listPluginSkills }
}
