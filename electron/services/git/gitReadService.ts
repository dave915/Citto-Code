import { spawnSync } from 'child_process'
import { join, posix, relative } from 'path'
import type {
  GitBranchInfo,
  GitDiffResult,
  GitFileContentResult,
  GitLogEntry,
  GitLogResult,
  GitRepoStatus,
  GitStatusEntry,
} from '../../preload'
import {
  decodePorcelainPath,
  getGitEntryNumstat,
  isGitAvailable,
  parseBranchSummary,
  parsePorcelainPaths,
  resolveGitRepoRoot,
  runGit,
} from './gitCore'

export function getGitStatus(cwd: string): GitRepoStatus {
  const gitAvailable = isGitAvailable()
  if (!gitAvailable) {
    return {
      gitAvailable: false,
      isRepo: false,
      rootPath: null,
      branch: null,
      ahead: 0,
      behind: 0,
      clean: true,
      entries: [],
    }
  }

  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return {
      gitAvailable: true,
      isRepo: false,
      rootPath: null,
      branch: null,
      ahead: 0,
      behind: 0,
      clean: true,
      entries: [],
    }
  }

  const result = runGit(['status', '--porcelain=v1', '--branch'], repoRoot)
  if (result.status !== 0) {
    return {
      gitAvailable: true,
      isRepo: false,
      rootPath: null,
      branch: null,
      ahead: 0,
      behind: 0,
      clean: true,
      entries: [],
    }
  }

  const lines = result.stdout.split('\n').filter(Boolean)
  const branchLine = lines.find((line) => line.startsWith('##')) ?? '## detached HEAD'
  const { branch, ahead, behind } = parseBranchSummary(branchLine)

  const entries: GitStatusEntry[] = lines
    .filter((line) => !line.startsWith('##'))
    .map((line) => {
      if (line.startsWith('?? ')) {
        const relativePath = decodePorcelainPath(line.slice(3))
        const entryBase = {
          path: join(repoRoot, relativePath),
          relativePath,
          originalPath: null,
          statusCode: '??',
          staged: false,
          unstaged: true,
          untracked: true,
          deleted: false,
          renamed: false,
        }
        return {
          ...entryBase,
          ...getGitEntryNumstat(repoRoot, entryBase),
        }
      }

      const x = line[0] ?? ' '
      const y = line[1] ?? ' '
      const rest = line.slice(3).trim()
      const { renamed, relativePath, originalPath } = parsePorcelainPaths(rest)
      const staged = x !== ' '
      const unstaged = y !== ' '
      const untracked = x === '?' || y === '?'
      const deleted = x === 'D' || y === 'D'

      const entryBase = {
        path: join(repoRoot, relativePath),
        relativePath,
        originalPath: originalPath ? join(repoRoot, originalPath) : null,
        statusCode: `${x}${y}`.trim() || 'M',
        staged,
        unstaged,
        untracked,
        deleted,
        renamed: x === 'R' || y === 'R' || renamed,
      }
      return {
        ...entryBase,
        ...getGitEntryNumstat(repoRoot, entryBase),
      }
    })

  return {
    gitAvailable: true,
    isRepo: true,
    rootPath: repoRoot,
    branch,
    ahead,
    behind,
    clean: entries.length === 0,
    entries,
  }
}

export function getGitDiff(cwd: string, filePath: string): GitDiffResult {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, diff: '', error: 'Git 저장소가 아닙니다.' }
  }

  const status = getGitStatus(cwd)
  const entry = status.entries.find((item) => item.path === filePath || item.originalPath === filePath)
  const relativePath = relative(repoRoot, filePath)

  try {
    if (entry?.untracked) {
      const result = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--no-color', '--no-index', '--', '/dev/null', filePath], {
        encoding: 'utf-8',
        timeout: 5000,
      })
      const diff = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
      return { ok: result.status === 0 || result.status === 1, diff }
    }

    const result = runGit(['diff', '--no-color', '--find-renames', 'HEAD', '--', relativePath], repoRoot)
    const diff = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    if (result.status !== 0 && !diff) {
      return { ok: false, diff: '', error: result.stderr.trim() || 'diff를 불러오지 못했습니다.' }
    }

    return { ok: true, diff }
  } catch (error) {
    return { ok: false, diff: '', error: String(error) }
  }
}

export function getGitBranches(cwd: string): { ok: boolean; branches: GitBranchInfo[]; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, branches: [], error: 'Git 저장소가 아닙니다.' }
  }

  const result = runGit(['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(HEAD)', 'refs/heads'], repoRoot)
  if (result.status !== 0) {
    return { ok: false, branches: [], error: result.stderr.trim() || '브랜치 목록을 불러오지 못했습니다.' }
  }

  const branches = result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, currentMark] = line.split('\t')
      return {
        name: name.trim(),
        current: currentMark?.trim() === '*',
      }
    })

  return { ok: true, branches }
}

export function getGitLog(cwd: string, limit?: number): GitLogResult {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, entries: [], error: 'Git 저장소가 아닙니다.' }
  }

  const format = '%x1f%H%x1f%h%x1f%s%x1f%an%x1f%cr%x1f%D'
  const args = [
    'log',
    '--graph',
    '--decorate=short',
    '--date-order',
    `--pretty=format:${format}`,
  ]
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    args.splice(4, 0, `--max-count=${Math.max(1, Math.round(limit))}`)
  }
  const result = runGit(args, repoRoot)

  if (result.status !== 0) {
    return { ok: false, entries: [], error: result.stderr.trim() || 'Git 로그를 불러오지 못했습니다.' }
  }

  const entries = result.stdout
    .split('\n')
    .flatMap((line) => {
      const parts = line.split('\x1f')
      if (parts.length < 7) return []
      const [graph, hash, shortHash, subject, author, relativeDate, decorations] = parts
      return [{
        hash: hash.trim(),
        shortHash: shortHash.trim(),
        subject: subject.trim(),
        author: author.trim(),
        relativeDate: relativeDate.trim(),
        decorations: decorations.trim(),
        graph: graph.replace(/\s+$/, ''),
      } satisfies GitLogEntry]
    })

  return { ok: true, entries }
}

export function getGitCommitDiff(cwd: string, commitHash: string): GitDiffResult {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, diff: '', error: 'Git 저장소가 아닙니다.' }
  }

  const trimmedCommitHash = commitHash.trim()
  if (!trimmedCommitHash) {
    return { ok: false, diff: '', error: '커밋 해시가 필요합니다.' }
  }

  try {
    const result = runGit(['show', '--no-color', '--find-renames', '--format=', trimmedCommitHash], repoRoot)
    const diff = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    if (result.status !== 0 && !diff) {
      return { ok: false, diff: '', error: result.stderr.trim() || '커밋 diff를 불러오지 못했습니다.' }
    }

    return { ok: true, diff }
  } catch (error) {
    return { ok: false, diff: '', error: String(error) }
  }
}

export function getGitFileContent(cwd: string, commitHash: string, filePath: string): GitFileContentResult {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, content: '', error: 'Git 저장소가 아닙니다.' }
  }

  const trimmedCommitHash = commitHash.trim()
  if (!trimmedCommitHash) {
    return { ok: false, content: '', error: '커밋 해시가 필요합니다.' }
  }

  const trimmedFilePath = filePath.trim()
  if (!trimmedFilePath) {
    return { ok: false, content: '', error: '파일 경로가 필요합니다.' }
  }

  const relativePath = posix.normalize(
    (trimmedFilePath.startsWith(repoRoot) ? relative(repoRoot, trimmedFilePath) : trimmedFilePath)
      .replace(/\\/g, '/')
      .replace(/^\.\//, ''),
  )

  if (!relativePath || relativePath === '.' || relativePath.startsWith('../')) {
    return { ok: false, content: '', error: '유효한 저장소 내부 파일 경로가 아닙니다.' }
  }

  try {
    const result = runGit(['show', `${trimmedCommitHash}:${relativePath}`], repoRoot)
    if (result.status !== 0) {
      return { ok: false, content: '', error: result.stderr.trim() || '커밋 파일 내용을 불러오지 못했습니다.' }
    }

    return { ok: true, content: result.stdout ?? '' }
  } catch (error) {
    return { ok: false, content: '', error: String(error) }
  }
}

export function getGitCommitFileContent(cwd: string, commitHash: string, filePath: string): GitFileContentResult {
  return getGitFileContent(cwd, commitHash, filePath)
}
