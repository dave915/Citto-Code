import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { access, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readJsonObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {}
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function writeJsonObject(filePath: string, value: Record<string, unknown>) {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

export async function readJsonObjectAsync(filePath: string): Promise<Record<string, unknown>> {
  try {
    await access(filePath)
  } catch {
    return {}
  }

  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8'))
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export async function writeJsonObjectAsync(filePath: string, value: Record<string, unknown>) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

export function sanitizeMcpServers(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

export function sanitizeMcpServerConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

export function parseJsonlFile(filePath: string): Array<Record<string, unknown>> {
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter((record): record is Record<string, unknown> => record !== null)
  } catch {
    return []
  }
}

export async function parseJsonlFileAsync(filePath: string): Promise<Array<Record<string, unknown>>> {
  try {
    return (await readFile(filePath, 'utf-8'))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter((record): record is Record<string, unknown> => record !== null)
  } catch {
    return []
  }
}

export function getRecordTimestamp(record: Record<string, unknown>): number {
  const value = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN
  return Number.isFinite(value) ? value : 0
}

export function extractTextBlocks(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  return content
    .flatMap((block) => {
      if (typeof block === 'string') return [block]
      if (!block || typeof block !== 'object') return []
      if ((block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
        return [(block as { text: string }).text]
      }
      return []
    })
    .join('\n')
    .trim()
}

export function getToolFileSnapshotBefore(toolName: string, toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== 'object') return null
  if (!['Edit', 'MultiEdit', 'Write'].includes(toolName)) return null

  const filePath = (toolInput as { file_path?: unknown }).file_path
  if (typeof filePath !== 'string' || !filePath.trim() || !existsSync(filePath)) return null

  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

export async function getToolFileSnapshotBeforeAsync(toolName: string, toolInput: unknown): Promise<string | null> {
  if (!toolInput || typeof toolInput !== 'object') return null
  if (!['Edit', 'MultiEdit', 'Write'].includes(toolName)) return null

  const filePath = (toolInput as { file_path?: unknown }).file_path
  if (typeof filePath !== 'string' || !filePath.trim()) return null

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return null
  } catch {
    return null
  }

  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

export function isDirectoryPath(targetPath: string): boolean {
  try {
    return statSync(targetPath).isDirectory()
  } catch {
    return false
  }
}

export function findSkillFile(dir: string): string | null {
  const skillMd = join(dir, 'SKILL.md')
  if (existsSync(skillMd)) return skillMd

  try {
    const markdown = readdirSync(dir).find((entry) => entry.endsWith('.md'))
    return markdown ? join(dir, markdown) : null
  } catch {
    return null
  }
}
