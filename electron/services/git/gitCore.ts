import { spawn, spawnSync } from 'child_process'
import { homedir } from 'os'
import { join, relative } from 'path'
import type { GitStatusEntry } from '../../preload'

export const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null'

export function resolveTargetPath(targetPath: string): string {
  const homePath = process.env.HOME ?? process.env.USERPROFILE ?? homedir()
  if (targetPath === '~') return homePath
  if (targetPath.startsWith('~/') || targetPath.startsWith('~\\')) {
    return join(homePath, targetPath.slice(2))
  }
  return targetPath
}

export function runGit(args: string[], cwd: string) {
  return spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 5000,
  })
}

export function runGitAsync(args: string[], cwd: string, timeoutMs = 60_000): Promise<{
  status: number
  stdout: string
  stderr: string
}> {
  return new Promise((resolve) => {
    const proc = spawn('git', ['-c', 'core.quotepath=false', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (status: number, nextStderr = stderr) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ status, stdout, stderr: nextStderr })
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('error', (error) => {
      finish(1, stderr || String(error))
    })

    proc.on('close', (code) => {
      finish(code ?? 1)
    })

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        // Ignore timeout cleanup failures.
      }
      finish(1, stderr || 'git 명령 실행 시간이 초과되었습니다.')
    }, timeoutMs)
  })
}

export function isGitAvailable() {
  const result = spawnSync('git', ['--version'], {
    encoding: 'utf-8',
    timeout: 3000,
  })
  return result.status === 0
}

export function resolveGitRepoRoot(cwd: string): string | null {
  const resolvedPath = resolveTargetPath(cwd)
  if (!resolvedPath) return null

  const result = runGit(['rev-parse', '--show-toplevel'], resolvedPath)
  if (result.status !== 0) return null
  return result.stdout.trim() || null
}

export function parseBranchSummary(branchLine: string) {
  const clean = branchLine.replace(/^##\s*/, '')
  const [headPart] = clean.split('...')
  let branch = headPart.trim()
  if (!branch || branch === 'HEAD') branch = 'detached HEAD'

  const aheadMatch = clean.match(/ahead (\d+)/)
  const behindMatch = clean.match(/behind (\d+)/)
  return {
    branch,
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
  }
}

export function parseNumstat(output: string): { additions: number | null; deletions: number | null } {
  const line = output.split('\n').find(Boolean)?.trim()
  if (!line) return { additions: null, deletions: null }
  const [additionsText, deletionsText] = line.split('\t')
  const additions = /^\d+$/.test(additionsText ?? '') ? Number(additionsText) : null
  const deletions = /^\d+$/.test(deletionsText ?? '') ? Number(deletionsText) : null
  return { additions, deletions }
}

export function decodePorcelainPath(pathText: string): string {
  const trimmed = pathText.trim()
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) return trimmed
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

export function parsePorcelainPaths(pathText: string) {
  const trimmed = pathText.trim()
  const quotedRenameMatch = trimmed.match(/^"((?:\\.|[^"])*)" -> "((?:\\.|[^"])*)"$/)
  if (quotedRenameMatch) {
    return {
      renamed: true,
      originalPath: decodePorcelainPath(`"${quotedRenameMatch[1]}"`),
      relativePath: decodePorcelainPath(`"${quotedRenameMatch[2]}"`),
    }
  }

  const renameParts = trimmed.split(' -> ')
  if (renameParts.length === 2) {
    return {
      renamed: true,
      originalPath: decodePorcelainPath(renameParts[0]),
      relativePath: decodePorcelainPath(renameParts[1]),
    }
  }

  return {
    renamed: false,
    originalPath: null,
    relativePath: decodePorcelainPath(trimmed),
  }
}

export function getGitEntryNumstat(
  repoRoot: string,
  entry: Omit<GitStatusEntry, 'stagedAdditions' | 'stagedDeletions' | 'unstagedAdditions' | 'unstagedDeletions' | 'totalAdditions' | 'totalDeletions'>,
) {
  try {
    if (entry.untracked) {
      const result = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--no-color', '--numstat', '--no-index', '--', NULL_DEVICE, entry.path], {
        encoding: 'utf-8',
        timeout: 5000,
      })
      const counts = parseNumstat(`${result.stdout ?? ''}${result.stderr ?? ''}`)
      return {
        stagedAdditions: 0,
        stagedDeletions: 0,
        unstagedAdditions: counts.additions,
        unstagedDeletions: counts.deletions,
        totalAdditions: counts.additions,
        totalDeletions: counts.deletions,
      }
    }

    const relativePath = relative(repoRoot, entry.path)
    const stagedResult = runGit(['diff', '--cached', '--numstat', '--', relativePath], repoRoot)
    const unstagedResult = runGit(['diff', '--numstat', '--', relativePath], repoRoot)
    const totalResult = runGit(['diff', '--numstat', 'HEAD', '--', relativePath], repoRoot)
    const stagedCounts = parseNumstat(`${stagedResult.stdout ?? ''}${stagedResult.stderr ?? ''}`)
    const unstagedCounts = parseNumstat(`${unstagedResult.stdout ?? ''}${unstagedResult.stderr ?? ''}`)
    const totalCounts = parseNumstat(`${totalResult.stdout ?? ''}${totalResult.stderr ?? ''}`)
    return {
      stagedAdditions: stagedCounts.additions,
      stagedDeletions: stagedCounts.deletions,
      unstagedAdditions: unstagedCounts.additions,
      unstagedDeletions: unstagedCounts.deletions,
      totalAdditions: totalCounts.additions,
      totalDeletions: totalCounts.deletions,
    }
  } catch {
    return {
      stagedAdditions: null,
      stagedDeletions: null,
      unstagedAdditions: null,
      unstagedDeletions: null,
      totalAdditions: null,
      totalDeletions: null,
    }
  }
}
