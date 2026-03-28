import { ipcMain } from 'electron'
import { access, mkdir, readdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  CliHistoryEntry,
  ImportedCliSession,
  McpConfigScope,
  McpHealthCheckResult,
  McpReadResult,
  PluginSkill,
} from '../preload'

type RegisterSettingsIpcHandlersOptions = {
  readMcpServersForScope: (scope: McpConfigScope, cwd?: string | null) => Promise<McpReadResult>
  writeMcpServersForScope: (
    scope: McpConfigScope,
    cwd: string | null | undefined,
    mcpServers: unknown,
  ) => Promise<{ ok: boolean; path?: string; error?: string }>
  checkMcpServerHealth: (name: string, config: unknown) => Promise<McpHealthCheckResult>
  listProjectPaths: () => Promise<string[]>
  readProjectMcpServers: (projectPath: string) => Promise<McpReadResult>
  writeProjectMcpServer: (projectPath: string, name: string, config: unknown) => Promise<{ ok: boolean; error?: string }>
  deleteProjectMcpServer: (projectPath: string, name: string) => Promise<{ ok: boolean; error?: string }>
  readDotMcpServers: (projectPath: string) => Promise<McpReadResult>
  writeDotMcpServer: (projectPath: string, name: string, config: unknown) => Promise<{ ok: boolean; error?: string }>
  deleteDotMcpServer: (projectPath: string, name: string) => Promise<{ ok: boolean; error?: string }>
  listPluginSkills: () => Promise<PluginSkill[]>
  listCliSessions: (query?: string) => Promise<CliHistoryEntry[]>
  loadCliSession: (filePath: string) => Promise<ImportedCliSession | null>
  getClaudeJsonPath: () => string
  normalizeMcpProjectPath: (projectPath: string | null | undefined) => string | null
}

export function registerSettingsIpcHandlers({
  readMcpServersForScope,
  writeMcpServersForScope,
  checkMcpServerHealth,
  listProjectPaths,
  readProjectMcpServers,
  writeProjectMcpServer,
  deleteProjectMcpServer,
  readDotMcpServers,
  writeDotMcpServer,
  deleteDotMcpServer,
  listPluginSkills,
  listCliSessions,
  loadCliSession,
  getClaudeJsonPath,
  normalizeMcpProjectPath,
}: RegisterSettingsIpcHandlersOptions) {
  let skillsListInFlight: Promise<Array<{ name: string; path: string; dir?: string; legacy: boolean }>> | null = null

  async function pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath)
      return true
    } catch {
      return false
    }
  }

  async function isDirAsync(filePath: string): Promise<boolean> {
    try {
      return (await stat(filePath)).isDirectory()
    } catch {
      return false
    }
  }

  async function findSkillFileAsync(dir: string): Promise<string | null> {
    const skillMd = join(dir, 'SKILL.md')
    if (await pathExists(skillMd)) return skillMd

    try {
      const markdownFile = (await readdir(dir)).find((fileName) => fileName.endsWith('.md'))
      return markdownFile ? join(dir, markdownFile) : null
    } catch {
      return null
    }
  }

  async function loadSkillsList() {
    const results: Array<{ name: string; path: string; dir?: string; legacy: boolean }> = []

    try {
      const skillsDir = join(process.env.HOME ?? '', '.claude', 'skills')
      if (await pathExists(skillsDir)) {
        for (const entry of await readdir(skillsDir, { withFileTypes: true })) {
          const entryPath = join(skillsDir, entry.name)
          if (entry.isDirectory() || (entry.isSymbolicLink() && await isDirAsync(entryPath))) {
            const skillFile = await findSkillFileAsync(entryPath)
            if (skillFile) results.push({ name: entry.name, path: skillFile, dir: entryPath, legacy: false })
          }
        }
      }
    } catch {
      // Ignore skill discovery failures.
    }

    try {
      const commandsDir = join(process.env.HOME ?? '', '.claude', 'commands')
      if (await pathExists(commandsDir)) {
        for (const entry of await readdir(commandsDir, { withFileTypes: true })) {
          const entryPath = join(commandsDir, entry.name)
          if (entry.isFile() && entry.name.endsWith('.md')) {
            results.push({ name: entry.name.replace(/\.md$/, ''), path: entryPath, legacy: true })
          } else if (entry.isDirectory() || (entry.isSymbolicLink() && await isDirAsync(entryPath))) {
            const skillFile = await findSkillFileAsync(entryPath)
            if (skillFile) results.push({ name: entry.name, path: skillFile, dir: entryPath, legacy: true })
          }
        }
      }
    } catch {
      // Ignore legacy skill discovery failures.
    }

    return results
  }

  ipcMain.handle('claude:read-settings', async () => {
    try {
      const settingsPath = join(process.env.HOME ?? '', '.claude', 'settings.json')
      return JSON.parse(await readFile(settingsPath, 'utf-8'))
    } catch {
      return {}
    }
  })

  ipcMain.handle('claude:list-claude-dir', async (_event, { subdir }: { subdir: string }) => {
    try {
      const dir = join(process.env.HOME ?? '', '.claude', subdir)
      if (!await pathExists(dir)) return []
      return (await readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => ({ name: entry.name, path: join(dir, entry.name) }))
    } catch {
      return []
    }
  })

  ipcMain.handle('claude:list-skills', async () => {
    if (skillsListInFlight) return skillsListInFlight

    skillsListInFlight = loadSkillsList()
      .finally(() => {
        skillsListInFlight = null
      })

    return skillsListInFlight
  })

  ipcMain.handle('claude:list-plugin-skills', async () => {
    return await listPluginSkills()
  })

  ipcMain.handle('claude:list-dir-abs', async (_event, { dirPath }: { dirPath: string }) => {
    try {
      if (!await pathExists(dirPath)) return []
      const results: { name: string; path: string }[] = []
      for (const entry of await readdir(dirPath, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(dirPath, entry.name)
        const entryIsDir = entry.isDirectory() || (entry.isSymbolicLink() && await isDirAsync(fullPath))
        if (!entryIsDir) {
          results.push({ name: entry.name, path: fullPath })
        } else {
          try {
            for (const subEntry of await readdir(fullPath, { withFileTypes: true })) {
              if (!subEntry.name.startsWith('.') && !subEntry.isDirectory()) {
                results.push({ name: `${entry.name}/${subEntry.name}`, path: join(fullPath, subEntry.name) })
              }
            }
          } catch {
            // Ignore unreadable nested directories.
          }
        }
      }
      return results
    } catch {
      return []
    }
  })

  ipcMain.handle('claude:read-mcp-servers', async (_event, payload?: { scope?: McpConfigScope; cwd?: string | null }) => {
    try {
      return await readMcpServersForScope(payload?.scope ?? 'user', payload?.cwd)
    } catch {
      return {
        scope: payload?.scope ?? 'user',
        available: false,
        targetPath: getClaudeJsonPath(),
        projectPath: normalizeMcpProjectPath(payload?.cwd),
        mcpServers: {},
        message: 'MCP 설정을 읽는 중 오류가 발생했습니다.',
      } satisfies McpReadResult
    }
  })

  ipcMain.handle(
    'claude:write-mcp-servers',
    async (_event, payload: { scope?: McpConfigScope; cwd?: string | null; mcpServers: unknown }) => {
      try {
        return await writeMcpServersForScope(payload?.scope ?? 'user', payload?.cwd, payload?.mcpServers)
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    },
  )

  ipcMain.handle('claude:check-mcp-server-health', async (_event, payload: { name: string; config: unknown }) => {
    try {
      return await checkMcpServerHealth(payload.name, payload.config)
    } catch (error) {
      return {
        status: 'error',
        message: String(error),
        checkedAt: Date.now(),
      } satisfies McpHealthCheckResult
    }
  })

  ipcMain.handle('claude:list-project-paths', async () => {
    try {
      return await listProjectPaths()
    } catch {
      return []
    }
  })

  ipcMain.handle('claude:read-project-mcp-servers', async (_event, payload: { projectPath: string }) => {
    try {
      return await readProjectMcpServers(payload.projectPath)
    } catch {
      return {
        scope: 'local',
        available: false,
        targetPath: getClaudeJsonPath(),
        projectPath: normalizeMcpProjectPath(payload.projectPath),
        mcpServers: {},
        message: '프로젝트별 MCP 설정을 읽는 중 오류가 발생했습니다.',
      } satisfies McpReadResult
    }
  })

  ipcMain.handle('claude:write-project-mcp-server', async (_event, payload: { projectPath: string; name: string; config: unknown }) => {
    try {
      return await writeProjectMcpServer(payload.projectPath, payload.name, payload.config)
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:delete-project-mcp-server', async (_event, payload: { projectPath: string; name: string }) => {
    try {
      return await deleteProjectMcpServer(payload.projectPath, payload.name)
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:read-dotmcp-servers', async (_event, payload: { projectPath: string }) => {
    try {
      return await readDotMcpServers(payload.projectPath)
    } catch {
      return {
        scope: 'project',
        available: false,
        targetPath: '.mcp.json',
        projectPath: normalizeMcpProjectPath(payload.projectPath),
        mcpServers: {},
        message: '공유 MCP 설정을 읽는 중 오류가 발생했습니다.',
      } satisfies McpReadResult
    }
  })

  ipcMain.handle('claude:write-dotmcp-server', async (_event, payload: { projectPath: string; name: string; config: unknown }) => {
    try {
      return await writeDotMcpServer(payload.projectPath, payload.name, payload.config)
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:delete-dotmcp-server', async (_event, payload: { projectPath: string; name: string }) => {
    try {
      return await deleteDotMcpServer(payload.projectPath, payload.name)
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:write-settings', async (_event, { settings }: { settings: unknown }) => {
    try {
      const claudeDir = join(process.env.HOME ?? '', '.claude')
      await mkdir(claudeDir, { recursive: true })
      const settingsPath = join(claudeDir, 'settings.json')
      await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:write-claude-file', async (_event, { subdir, name, content }: { subdir: string; name: string; content: string }) => {
    try {
      const dir = join(process.env.HOME ?? '', '.claude', subdir)
      await mkdir(dir, { recursive: true })
      const filePath = join(dir, name)
      await writeFile(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:list-cli-sessions', async (_event, { query }: { query?: string }) => {
    return await listCliSessions(query)
  })

  ipcMain.handle('claude:load-cli-session', async (_event, { filePath }: { filePath: string }) => {
    return await loadCliSession(filePath)
  })
}
