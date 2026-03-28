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
  getGitEntryNumstat,
  isGitAvailable,
  parseBranchSummary,
  parsePorcelainPaths,
  resolveGitRepoRoot,
  NULL_DEVICE,
  runGit,
} from './gitCore'

export async function getGitStatus(cwd: string): Promise<GitRepoStatus> {
  const gitAvailable = await isGitAvailable()
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

  const repoRoot = await resolveGitRepoRoot(cwd)
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

  const result = await runGit(['status', '--porcelain=v1', '--branch'], repoRoot)
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

  const entries: GitStatusEntry[] = []
  for (const line of lines) {
    if (line.startsWith('##')) continue

    if (line.startsWith('?? ')) {
      const { relativePath } = parsePorcelainPaths(line.slice(3))
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
      entries.push({
        ...entryBase,
        ...await getGitEntryNumstat(repoRoot, entryBase),
      })
      continue
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
    entries.push({
      ...entryBase,
      ...await getGitEntryNumstat(repoRoot, entryBase),
    })
  }

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

export async function getGitDiff(cwd: string, filePath: string): Promise<GitDiffResult> {
  const repoRoot = await resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, diff: '', error: 'Git 저장소가 아닙니다.' }
  }

  const status = await getGitStatus(cwd)
  const entry = status.entries.find((item) => item.path === filePath || item.originalPath === filePath)
  const relativePath = relative(repoRoot, filePath)

  try {
    if (entry?.untracked) {
      const result = await runGit(['diff', '--no-color', '--no-index', '--', NULL_DEVICE, filePath], repoRoot)
      const diff = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
      return { ok: result.status === 0 || result.status === 1, diff }
    }

    const result = await runGit(['diff', '--no-color', '--find-renames', 'HEAD', '--', relativePath], repoRoot)
    const diff = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    if (result.status !== 0 && !diff) {
      return { ok: false, diff: '', error: result.stderr.trim() || 'diff를 불러오지 못했습니다.' }
    }

    return { ok: true, diff }
  } catch (error) {
    return { ok: false, diff: '', error: String(error) }
  }
}

export async function getGitBranches(cwd: string): Promise<{ ok: boolean; branches: GitBranchInfo[]; error?: string }> {
  const repoRoot = await resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, branches: [], error: 'Git 저장소가 아닙니다.' }
  }

  const result = await runGit(['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(HEAD)', 'refs/heads'], repoRoot)
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

export async function getGitLog(cwd: string, limit?: number): Promise<GitLogResult> {
  const repoRoot = await resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, entries: [], error: 'Git 저장소가 아닙니다.' }
  }

  const format = '%x1f%H%x1f%P%x1f%h%x1f%s%x1f%an%x1f%cr%x1f%D'
  const args = [
    'log',
    '--graph',
    '--decorate=short',
    '--topo-order',
    `--pretty=format:${format}`,
  ]
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    args.splice(4, 0, `--max-count=${Math.max(1, Math.round(limit))}`)
  }
  const result = await runGit(args, repoRoot)

  if (result.status !== 0) {
    return { ok: false, entries: [], error: result.stderr.trim() || 'Git 로그를 불러오지 못했습니다.' }
  }

  const entries: GitLogEntry[] = []

  result.stdout
    .split('\n')
    .forEach((line) => {
      const parts = line.split('\x1f')
      if (parts.length < 7) {
        const bridgeLine = line.replace(/\s+$/, '')
        if (bridgeLine && entries.length > 0) {
          entries[entries.length - 1]?.bridgeToNext.push(bridgeLine)
        }
        return
      }

      const [graph, hash, parents, shortHash, subject, author, relativeDate, decorations] = parts
      entries.push({
        hash: hash.trim(),
        parents: parents.trim() ? parents.trim().split(/\s+/) : [],
        shortHash: shortHash.trim(),
        subject: subject.trim(),
        author: author.trim(),
        relativeDate: relativeDate.trim(),
        decorations: decorations.trim(),
        graph: graph.replace(/\s+$/, ''),
        bridgeToNext: [],
      } satisfies GitLogEntry)
    })

  return { ok: true, entries }
}

export async function getGitCommitDiff(cwd: string, commitHash: string): Promise<GitDiffResult> {
  const repoRoot = await resolveGitRepoRoot(cwd)
  if (!repoRoot) {
    return { ok: false, diff: '', error: 'Git 저장소가 아닙니다.' }
  }

  const trimmedCommitHash = commitHash.trim()
  if (!trimmedCommitHash) {
    return { ok: false, diff: '', error: '커밋 해시가 필요합니다.' }
  }

  try {
    const result = await runGit(['show', '--no-color', '--find-renames', '--format=', trimmedCommitHash], repoRoot)
    const diff = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    if (result.status !== 0 && !diff) {
      return { ok: false, diff: '', error: result.stderr.trim() || '커밋 diff를 불러오지 못했습니다.' }
    }

    return { ok: true, diff }
  } catch (error) {
    return { ok: false, diff: '', error: String(error) }
  }
}

export async function getGitFileContent(cwd: string, commitHash: string, filePath: string): Promise<GitFileContentResult> {
  const repoRoot = await resolveGitRepoRoot(cwd)
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
    const result = await runGit(['show', `${trimmedCommitHash}:${relativePath}`], repoRoot)
    if (result.status !== 0) {
      return { ok: false, content: '', error: result.stderr.trim() || '커밋 파일 내용을 불러오지 못했습니다.' }
    }

    return { ok: true, content: result.stdout ?? '' }
  } catch (error) {
    return { ok: false, content: '', error: String(error) }
  }
}

export async function getGitCommitFileContent(cwd: string, commitHash: string, filePath: string): Promise<GitFileContentResult> {
  return await getGitFileContent(cwd, commitHash, filePath)
}
