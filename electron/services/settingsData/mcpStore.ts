import { spawn } from 'child_process'
import { join } from 'path'
import type { McpConfigScope, McpHealthCheckResult, McpReadResult } from '../../preload'
import {
  isRecord,
  readJsonObjectAsync,
  sanitizeMcpServerConfig,
  sanitizeMcpServers,
  writeJsonObjectAsync,
} from './shared'

type CreateMcpStoreOptions = {
  getHomePath: () => string
}

export function createMcpStore({ getHomePath }: CreateMcpStoreOptions) {
  function normalizeMcpProjectPath(cwd?: string | null): string | null {
    if (typeof cwd !== 'string') return null
    const trimmed = cwd.trim()
    if (!trimmed || trimmed === '~') return null
    const home = getHomePath()
    if (trimmed === '~') return home || null
    if (trimmed.startsWith('~/')) return home ? join(home, trimmed.slice(2)) : trimmed
    return trimmed
  }

  function getClaudeJsonPath() {
    return join(getHomePath(), '.claude.json')
  }

  async function listProjectPaths(): Promise<string[]> {
    const root = await readJsonObjectAsync(getClaudeJsonPath())
    const projects = isRecord(root.projects) ? root.projects : {}
    return Array.from(new Set(
      Object.keys(projects)
        .map((value) => normalizeMcpProjectPath(value) ?? value)
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b))
  }

  async function readMcpServersForScope(scope: McpConfigScope, cwd?: string | null): Promise<McpReadResult> {
    const claudeJsonPath = getClaudeJsonPath()
    const projectPath = normalizeMcpProjectPath(cwd)

    if (scope === 'user') {
      const root = await readJsonObjectAsync(claudeJsonPath)
      return {
        scope,
        available: true,
        targetPath: claudeJsonPath,
        projectPath,
        mcpServers: sanitizeMcpServers(root.mcpServers),
      }
    }

    if (!projectPath) {
      return {
        scope,
        available: false,
        targetPath: scope === 'local' ? claudeJsonPath : '.mcp.json',
        projectPath: null,
        mcpServers: {},
        message: '현재 프로젝트 경로가 없어 이 범위를 편집할 수 없습니다.',
      }
    }

    if (scope === 'local') {
      const root = await readJsonObjectAsync(claudeJsonPath)
      const projects = isRecord(root.projects) ? root.projects : {}
      const projectEntry = isRecord(projects[projectPath]) ? projects[projectPath] : {}
      return {
        scope,
        available: true,
        targetPath: claudeJsonPath,
        projectPath,
        mcpServers: sanitizeMcpServers(projectEntry.mcpServers),
      }
    }

    const projectConfigPath = join(projectPath, '.mcp.json')
    const root = await readJsonObjectAsync(projectConfigPath)
    return {
      scope,
      available: true,
      targetPath: projectConfigPath,
      projectPath,
      mcpServers: sanitizeMcpServers(root.mcpServers),
    }
  }

  async function writeMcpServersForScope(
    scope: McpConfigScope,
    cwd: string | null | undefined,
    mcpServers: unknown,
  ): Promise<{ ok: boolean; error?: string }> {
    const servers = sanitizeMcpServers(mcpServers)
    const claudeJsonPath = getClaudeJsonPath()

    if (scope === 'user') {
      const root = await readJsonObjectAsync(claudeJsonPath)
      await writeJsonObjectAsync(claudeJsonPath, { ...root, mcpServers: servers })
      return { ok: true }
    }

    const projectPath = normalizeMcpProjectPath(cwd)
    if (!projectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 저장할 수 없습니다.' }
    }

    if (scope === 'local') {
      const root = await readJsonObjectAsync(claudeJsonPath)
      const projects = isRecord(root.projects) ? { ...root.projects } : {}
      const currentProject = isRecord(projects[projectPath]) ? { ...projects[projectPath] } : {}
      projects[projectPath] = { ...currentProject, mcpServers: servers }
      await writeJsonObjectAsync(claudeJsonPath, { ...root, projects })
      return { ok: true }
    }

    const projectConfigPath = join(projectPath, '.mcp.json')
    const root = await readJsonObjectAsync(projectConfigPath)
    await writeJsonObjectAsync(projectConfigPath, { ...root, mcpServers: servers })
    return { ok: true }
  }

  async function checkMcpServerHealth(_name: string, config: unknown): Promise<McpHealthCheckResult> {
    const normalizedConfig = sanitizeMcpServerConfig(config)
    const type = normalizedConfig.type === 'stdio' ? 'stdio' : 'http'

    if (type === 'stdio') {
      const command = typeof normalizedConfig.command === 'string' ? normalizedConfig.command.trim() : ''
      if (!command) {
        return { status: 'error', message: 'Missing command', checkedAt: Date.now() }
      }

      return await new Promise((resolve) => {
        let settled = false
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        const child = spawn(command, ['--version'], {
          stdio: 'ignore',
          windowsHide: true,
        })

        const finish = (result: Omit<McpHealthCheckResult, 'checkedAt'>) => {
          if (settled) return
          settled = true
          if (timeoutId) clearTimeout(timeoutId)
          resolve({
            ...result,
            checkedAt: Date.now(),
          })
        }

        child.once('error', (error) => {
          const code = 'code' in error ? error.code : undefined
          finish({
            status: code === 'ENOENT' ? 'missing-command' : 'error',
            message: error.message,
          })
        })

        child.once('spawn', () => {
          finish({
            status: 'ok',
            message: 'Command available',
          })
          child.kill()
        })

        timeoutId = setTimeout(() => {
          finish({
            status: 'error',
            message: 'Command check timed out',
          })
          child.kill()
        }, 3000)
      })
    }

    const rawUrl = typeof normalizedConfig.url === 'string' ? normalizedConfig.url.trim() : ''
    if (!rawUrl) {
      return { status: 'error', message: 'Missing URL', checkedAt: Date.now() }
    }

    const headers = isRecord(normalizedConfig.headers)
      ? Object.fromEntries(
          Object.entries(normalizedConfig.headers)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0),
        )
      : {}

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    try {
      const response = await fetch(rawUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/event-stream',
          ...headers,
        },
        signal: controller.signal,
      })

      if (response.status === 401 || response.status === 403) {
        return {
          status: 'auth-required',
          message: `HTTP ${response.status}`,
          checkedAt: Date.now(),
        }
      }

      return {
        status: response.ok ? 'ok' : 'error',
        message: `HTTP ${response.status}`,
        checkedAt: Date.now(),
      }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        checkedAt: Date.now(),
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async function readProjectMcpServers(projectPath: string): Promise<McpReadResult> {
    return readMcpServersForScope('local', projectPath)
  }

  async function writeProjectMcpServer(projectPath: string, name: string, config: unknown): Promise<{ ok: boolean; error?: string }> {
    const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
    if (!normalizedProjectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 저장할 수 없습니다.' }
    }

    const claudeJsonPath = getClaudeJsonPath()
    const root = await readJsonObjectAsync(claudeJsonPath)
    const projects = isRecord(root.projects) ? { ...root.projects } : {}
    const currentProject = isRecord(projects[normalizedProjectPath]) ? { ...projects[normalizedProjectPath] } : {}
    const currentServers = sanitizeMcpServers(currentProject.mcpServers)

    projects[normalizedProjectPath] = {
      ...currentProject,
      mcpServers: {
        ...currentServers,
        [name]: sanitizeMcpServerConfig(config),
      },
    }

    await writeJsonObjectAsync(claudeJsonPath, { ...root, projects })
    return { ok: true }
  }

  async function deleteProjectMcpServer(projectPath: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
    if (!normalizedProjectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 삭제할 수 없습니다.' }
    }

    const claudeJsonPath = getClaudeJsonPath()
    const root = await readJsonObjectAsync(claudeJsonPath)
    const projects = isRecord(root.projects) ? { ...root.projects } : {}
    const currentProject = isRecord(projects[normalizedProjectPath]) ? { ...projects[normalizedProjectPath] } : {}
    const currentServers = sanitizeMcpServers(currentProject.mcpServers)
    const { [name]: _removed, ...rest } = currentServers

    projects[normalizedProjectPath] = {
      ...currentProject,
      mcpServers: rest,
    }

    await writeJsonObjectAsync(claudeJsonPath, { ...root, projects })
    return { ok: true }
  }

  async function readDotMcpServers(projectPath: string): Promise<McpReadResult> {
    return readMcpServersForScope('project', projectPath)
  }

  async function writeDotMcpServer(projectPath: string, name: string, config: unknown): Promise<{ ok: boolean; error?: string }> {
    const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
    if (!normalizedProjectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 저장할 수 없습니다.' }
    }

    const projectConfigPath = join(normalizedProjectPath, '.mcp.json')
    const root = await readJsonObjectAsync(projectConfigPath)
    const currentServers = sanitizeMcpServers(root.mcpServers)
    await writeJsonObjectAsync(projectConfigPath, {
      ...root,
      mcpServers: {
        ...currentServers,
        [name]: sanitizeMcpServerConfig(config),
      },
    })
    return { ok: true }
  }

  async function deleteDotMcpServer(projectPath: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
    if (!normalizedProjectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 삭제할 수 없습니다.' }
    }

    const projectConfigPath = join(normalizedProjectPath, '.mcp.json')
    const root = await readJsonObjectAsync(projectConfigPath)
    const currentServers = sanitizeMcpServers(root.mcpServers)
    const { [name]: _removed, ...rest } = currentServers
    await writeJsonObjectAsync(projectConfigPath, { ...root, mcpServers: rest })
    return { ok: true }
  }

  return {
    deleteDotMcpServer,
    deleteProjectMcpServer,
    getClaudeJsonPath,
    checkMcpServerHealth,
    listProjectPaths,
    normalizeMcpProjectPath,
    readDotMcpServers,
    readMcpServersForScope,
    readProjectMcpServers,
    writeDotMcpServer,
    writeMcpServersForScope,
    writeProjectMcpServer,
  }
}
