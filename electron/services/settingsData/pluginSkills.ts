import { access, readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import type { PluginSkill } from '../../preload'
import { isRecord } from './shared'

type CreatePluginSkillServiceOptions = {
  getHomePath: () => string
}

export function createPluginSkillService({ getHomePath }: CreatePluginSkillServiceOptions) {
  async function pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath)
      return true
    } catch {
      return false
    }
  }

  async function isDirectoryPath(targetPath: string): Promise<boolean> {
    try {
      return (await stat(targetPath)).isDirectory()
    } catch {
      return false
    }
  }

  async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
    try {
      const content = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(content)
      return isRecord(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  async function findSkillFile(dir: string): Promise<string | null> {
    const skillMd = join(dir, 'SKILL.md')
    if (await pathExists(skillMd)) return skillMd

    try {
      const entries = await readdir(dir)
      const markdown = entries.find((entry) => entry.endsWith('.md'))
      return markdown ? join(dir, markdown) : null
    } catch {
      return null
    }
  }

  async function listPluginSkills(): Promise<PluginSkill[]> {
    const pluginRoots: string[] = []
    const results: PluginSkill[] = []
    const seen = new Set<string>()
    const pluginsDir = join(getHomePath(), '.claude', 'plugins')

    try {
      const marketplacesDir = join(pluginsDir, 'marketplaces')
      if (await pathExists(marketplacesDir)) {
        for (const marketplace of await readdir(marketplacesDir, { withFileTypes: true })) {
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
      if (!(await pathExists(root))) continue

      try {
        for (const pluginEntry of await readdir(root, { withFileTypes: true })) {
          const pluginPath = join(root, pluginEntry.name)
          if (!(pluginEntry.isDirectory() || (pluginEntry.isSymbolicLink() && await isDirectoryPath(pluginPath)))) continue

          const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json')
          if (!(await pathExists(manifestPath))) continue

          const manifest = await readJsonObject(manifestPath)
          const pluginName = typeof manifest.name === 'string' && manifest.name.trim()
            ? manifest.name.trim()
            : pluginEntry.name
          const skillsDir = join(pluginPath, 'skills')
          if (!(await pathExists(skillsDir))) continue

          for (const skillEntry of await readdir(skillsDir, { withFileTypes: true })) {
            const skillDir = join(skillsDir, skillEntry.name)
            if (!(skillEntry.isDirectory() || (skillEntry.isSymbolicLink() && await isDirectoryPath(skillDir)))) continue
            const skillFile = await findSkillFile(skillDir)
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
