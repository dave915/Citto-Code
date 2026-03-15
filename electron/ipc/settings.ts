import { ipcMain } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { CliHistoryEntry, ImportedCliSession, McpConfigScope, McpReadResult, PluginSkill } from '../preload'

type RegisterSettingsIpcHandlersOptions = {
  readMcpServersForScope: (scope: McpConfigScope, cwd?: string | null) => McpReadResult
  writeMcpServersForScope: (scope: McpConfigScope, cwd: string | null | undefined, mcpServers: unknown) => { ok: boolean; path?: string; error?: string }
  listProjectPaths: () => string[]
  readProjectMcpServers: (projectPath: string) => McpReadResult
  writeProjectMcpServer: (projectPath: string, name: string, config: unknown) => { ok: boolean; error?: string }
  deleteProjectMcpServer: (projectPath: string, name: string) => { ok: boolean; error?: string }
  readDotMcpServers: (projectPath: string) => McpReadResult
  writeDotMcpServer: (projectPath: string, name: string, config: unknown) => { ok: boolean; error?: string }
  deleteDotMcpServer: (projectPath: string, name: string) => { ok: boolean; error?: string }
  listPluginSkills: () => PluginSkill[]
  listCliSessions: (query?: string) => CliHistoryEntry[]
  loadCliSession: (filePath: string) => ImportedCliSession | null
  getClaudeJsonPath: () => string
  normalizeMcpProjectPath: (projectPath: string | null | undefined) => string | null
}

export function registerSettingsIpcHandlers({
  readMcpServersForScope,
  writeMcpServersForScope,
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
  ipcMain.handle('claude:read-settings', async () => {
    try {
      const settingsPath = join(process.env.HOME ?? '', '.claude', 'settings.json')
      return JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch {
      return {}
    }
  })

  ipcMain.handle('claude:list-claude-dir', (_event, { subdir }: { subdir: string }) => {
    try {
      const dir = join(process.env.HOME ?? '', '.claude', subdir)
      if (!existsSync(dir)) return []
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => ({ name: entry.name, path: join(dir, entry.name) }))
    } catch {
      return []
    }
  })

  ipcMain.handle('claude:list-skills', () => {
    const results: Array<{ name: string; path: string; dir?: string; legacy: boolean }> = []

    function isDir(filePath: string): boolean {
      try {
        return statSync(filePath).isDirectory()
      } catch {
        return false
      }
    }

    function findSkillFile(dir: string): string | null {
      const skillMd = join(dir, 'SKILL.md')
      if (existsSync(skillMd)) return skillMd
      try {
        const markdownFile = readdirSync(dir).find((fileName) => fileName.endsWith('.md'))
        return markdownFile ? join(dir, markdownFile) : null
      } catch {
        return null
      }
    }

    try {
      const skillsDir = join(process.env.HOME ?? '', '.claude', 'skills')
      if (existsSync(skillsDir)) {
        for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
          const entryPath = join(skillsDir, entry.name)
          if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(entryPath))) {
            const skillFile = findSkillFile(entryPath)
            if (skillFile) results.push({ name: entry.name, path: skillFile, dir: entryPath, legacy: false })
          }
        }
      }
    } catch {
      // Ignore skill discovery failures.
    }

    try {
      const commandsDir = join(process.env.HOME ?? '', '.claude', 'commands')
      if (existsSync(commandsDir)) {
        for (const entry of readdirSync(commandsDir, { withFileTypes: true })) {
          const entryPath = join(commandsDir, entry.name)
          if (entry.isFile() && entry.name.endsWith('.md')) {
            results.push({ name: entry.name.replace(/\.md$/, ''), path: entryPath, legacy: true })
          } else if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(entryPath))) {
            const skillFile = findSkillFile(entryPath)
            if (skillFile) results.push({ name: entry.name, path: skillFile, dir: entryPath, legacy: true })
          }
        }
      }
    } catch {
      // Ignore legacy skill discovery failures.
    }

    return results
  })

  ipcMain.handle('claude:list-plugin-skills', () => {
    return listPluginSkills()
  })

  ipcMain.handle('claude:list-dir-abs', (_event, { dirPath }: { dirPath: string }) => {
    try {
      if (!existsSync(dirPath)) return []
      const results: { name: string; path: string }[] = []
      for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(dirPath, entry.name)
        const entryIsDir = entry.isDirectory() || (entry.isSymbolicLink() && (() => {
          try {
            return statSync(fullPath).isDirectory()
          } catch {
            return false
          }
        })())
        if (!entryIsDir) {
          results.push({ name: entry.name, path: fullPath })
        } else {
          try {
            for (const subEntry of readdirSync(fullPath, { withFileTypes: true })) {
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

  ipcMain.handle('claude:read-mcp-servers', (_event, payload?: { scope?: McpConfigScope; cwd?: string | null }) => {
    try {
      return readMcpServersForScope(payload?.scope ?? 'user', payload?.cwd)
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
    (_event, payload: { scope?: McpConfigScope; cwd?: string | null; mcpServers: unknown }) => {
      try {
        return writeMcpServersForScope(payload?.scope ?? 'user', payload?.cwd, payload?.mcpServers)
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    },
  )

  ipcMain.handle('claude:list-project-paths', () => {
    try {
      return listProjectPaths()
    } catch {
      return []
    }
  })

  ipcMain.handle('claude:read-project-mcp-servers', (_event, payload: { projectPath: string }) => {
    try {
      return readProjectMcpServers(payload.projectPath)
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

  ipcMain.handle('claude:write-project-mcp-server', (_event, payload: { projectPath: string; name: string; config: unknown }) => {
    try {
      return writeProjectMcpServer(payload.projectPath, payload.name, payload.config)
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:delete-project-mcp-server', (_event, payload: { projectPath: string; name: string }) => {
    try {
      return deleteProjectMcpServer(payload.projectPath, payload.name)
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:read-dotmcp-servers', (_event, payload: { projectPath: string }) => {
    try {
      return readDotMcpServers(payload.projectPath)
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

  ipcMain.handle('claude:write-dotmcp-server', (_event, payload: { projectPath: string; name: string; config: unknown }) => {
    try {
      return writeDotMcpServer(payload.projectPath, payload.name, payload.config)
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:delete-dotmcp-server', (_event, payload: { projectPath: string; name: string }) => {
    try {
      return deleteDotMcpServer(payload.projectPath, payload.name)
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:write-settings', (_event, { settings }: { settings: unknown }) => {
    try {
      const claudeDir = join(process.env.HOME ?? '', '.claude')
      if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true })
      const settingsPath = join(claudeDir, 'settings.json')
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:write-claude-file', (_event, { subdir, name, content }: { subdir: string; name: string; content: string }) => {
    try {
      const dir = join(process.env.HOME ?? '', '.claude', subdir)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const filePath = join(dir, name)
      writeFileSync(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('claude:list-cli-sessions', (_event, { query }: { query?: string }) => {
    return listCliSessions(query)
  })

  ipcMain.handle('claude:load-cli-session', (_event, { filePath }: { filePath: string }) => {
    return loadCliSession(filePath)
  })
}
