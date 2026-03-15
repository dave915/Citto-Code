import { join } from 'path'
import type { McpConfigScope, McpReadResult } from '../../preload'
import {
  isRecord,
  readJsonObject,
  sanitizeMcpServerConfig,
  sanitizeMcpServers,
  writeJsonObject,
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

  function listProjectPaths() {
    const root = readJsonObject(getClaudeJsonPath())
    const projects = isRecord(root.projects) ? root.projects : {}
    return Array.from(new Set(
      Object.keys(projects)
        .map((value) => normalizeMcpProjectPath(value) ?? value)
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b))
  }

  function readMcpServersForScope(scope: McpConfigScope, cwd?: string | null): McpReadResult {
    const claudeJsonPath = getClaudeJsonPath()
    const projectPath = normalizeMcpProjectPath(cwd)

    if (scope === 'user') {
      const root = readJsonObject(claudeJsonPath)
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
      const root = readJsonObject(claudeJsonPath)
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
    const root = readJsonObject(projectConfigPath)
    return {
      scope,
      available: true,
      targetPath: projectConfigPath,
      projectPath,
      mcpServers: sanitizeMcpServers(root.mcpServers),
    }
  }

  function writeMcpServersForScope(scope: McpConfigScope, cwd: string | null | undefined, mcpServers: unknown) {
    const servers = sanitizeMcpServers(mcpServers)
    const claudeJsonPath = getClaudeJsonPath()

    if (scope === 'user') {
      const root = readJsonObject(claudeJsonPath)
      writeJsonObject(claudeJsonPath, { ...root, mcpServers: servers })
      return { ok: true }
    }

    const projectPath = normalizeMcpProjectPath(cwd)
    if (!projectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 저장할 수 없습니다.' }
    }

    if (scope === 'local') {
      const root = readJsonObject(claudeJsonPath)
      const projects = isRecord(root.projects) ? { ...root.projects } : {}
      const currentProject = isRecord(projects[projectPath]) ? { ...projects[projectPath] } : {}
      projects[projectPath] = { ...currentProject, mcpServers: servers }
      writeJsonObject(claudeJsonPath, { ...root, projects })
      return { ok: true }
    }

    const projectConfigPath = join(projectPath, '.mcp.json')
    const root = readJsonObject(projectConfigPath)
    writeJsonObject(projectConfigPath, { ...root, mcpServers: servers })
    return { ok: true }
  }

  function readProjectMcpServers(projectPath: string): McpReadResult {
    return readMcpServersForScope('local', projectPath)
  }

  function writeProjectMcpServer(projectPath: string, name: string, config: unknown) {
    const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
    if (!normalizedProjectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 저장할 수 없습니다.' }
    }

    const claudeJsonPath = getClaudeJsonPath()
    const root = readJsonObject(claudeJsonPath)
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

    writeJsonObject(claudeJsonPath, { ...root, projects })
    return { ok: true }
  }

  function deleteProjectMcpServer(projectPath: string, name: string) {
    const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
    if (!normalizedProjectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 삭제할 수 없습니다.' }
    }

    const claudeJsonPath = getClaudeJsonPath()
    const root = readJsonObject(claudeJsonPath)
    const projects = isRecord(root.projects) ? { ...root.projects } : {}
    const currentProject = isRecord(projects[normalizedProjectPath]) ? { ...projects[normalizedProjectPath] } : {}
    const currentServers = sanitizeMcpServers(currentProject.mcpServers)
    const { [name]: _removed, ...rest } = currentServers

    projects[normalizedProjectPath] = {
      ...currentProject,
      mcpServers: rest,
    }

    writeJsonObject(claudeJsonPath, { ...root, projects })
    return { ok: true }
  }

  function readDotMcpServers(projectPath: string): McpReadResult {
    return readMcpServersForScope('project', projectPath)
  }

  function writeDotMcpServer(projectPath: string, name: string, config: unknown) {
    const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
    if (!normalizedProjectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 저장할 수 없습니다.' }
    }

    const projectConfigPath = join(normalizedProjectPath, '.mcp.json')
    const root = readJsonObject(projectConfigPath)
    const currentServers = sanitizeMcpServers(root.mcpServers)
    writeJsonObject(projectConfigPath, {
      ...root,
      mcpServers: {
        ...currentServers,
        [name]: sanitizeMcpServerConfig(config),
      },
    })
    return { ok: true }
  }

  function deleteDotMcpServer(projectPath: string, name: string) {
    const normalizedProjectPath = normalizeMcpProjectPath(projectPath)
    if (!normalizedProjectPath) {
      return { ok: false, error: '현재 프로젝트 경로가 없어 삭제할 수 없습니다.' }
    }

    const projectConfigPath = join(normalizedProjectPath, '.mcp.json')
    const root = readJsonObject(projectConfigPath)
    const currentServers = sanitizeMcpServers(root.mcpServers)
    const { [name]: _removed, ...rest } = currentServers
    writeJsonObject(projectConfigPath, { ...root, mcpServers: rest })
    return { ok: true }
  }

  return {
    deleteDotMcpServer,
    deleteProjectMcpServer,
    getClaudeJsonPath,
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
