import { rmSync } from 'fs'
import { relative } from 'path'
import { getGitStatus } from './gitReadService'
import { isGitAvailable, resolveGitRepoRoot, resolveTargetPath, runGit } from './gitCore'

export function setGitStaged(cwd: string, filePath: string, staged: boolean): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const relativePath = relative(repoRoot, filePath)
  const args = staged
    ? ['add', '--', relativePath]
    : ['restore', '--staged', '--', relativePath]
  const result = runGit(args, repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || 'Git 상태를 바꾸지 못했습니다.' }
  }
  return { ok: true }
}

export function restoreGitFile(cwd: string, filePath: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const status = getGitStatus(cwd)
  const entry = status.entries.find((item) => item.path === filePath || item.originalPath === filePath)
  if (!entry) return { ok: false, error: '되돌릴 파일 상태를 찾지 못했습니다.' }

  if (entry.untracked) {
    try {
      rmSync(entry.path, { force: true, recursive: true })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  }

  const restoreTargets = Array.from(
    new Set(
      [entry.path, entry.originalPath]
        .filter((value): value is string => Boolean(value))
        .map((value) => relative(repoRoot, value)),
    ),
  )

  const result = runGit(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...restoreTargets], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '파일을 되돌리지 못했습니다.' }
  }

  return { ok: true }
}

export function commitGit(cwd: string, message: string): { ok: boolean; commitHash?: string; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const trimmedMessage = message.trim()
  if (!trimmedMessage) return { ok: false, error: '커밋 메시지를 입력하세요.' }

  const result = runGit(['commit', '-m', trimmedMessage], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '커밋하지 못했습니다.' }
  }

  const hashResult = runGit(['rev-parse', '--short', 'HEAD'], repoRoot)
  return {
    ok: true,
    commitHash: hashResult.status === 0 ? hashResult.stdout.trim() : undefined,
  }
}

function normalizeCodexBranchName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, '-').replace(/^\/+/, '')
  if (!trimmed) return ''
  return trimmed
}

export function createGitBranch(cwd: string, name: string): { ok: boolean; branchName?: string; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const branchName = normalizeCodexBranchName(name)
  if (!branchName) return { ok: false, error: '브랜치 이름을 입력하세요.' }

  const result = runGit(['switch', '-c', branchName], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '브랜치를 생성하지 못했습니다.' }
  }

  return { ok: true, branchName }
}

export function switchGitBranch(cwd: string, name: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, error: '브랜치 이름이 비어 있습니다.' }

  const result = runGit(['switch', trimmedName], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '브랜치를 전환하지 못했습니다.' }
  }

  return { ok: true }
}

export function pullGit(cwd: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const result = runGit(['pull', '--ff-only'], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || 'git pull을 실행하지 못했습니다.' }
  }

  return { ok: true }
}

export function pushGit(cwd: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const result = runGit(['push'], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || 'git push를 실행하지 못했습니다.' }
  }

  return { ok: true }
}

export function deleteGitBranch(cwd: string, name: string): { ok: boolean; error?: string } {
  const repoRoot = resolveGitRepoRoot(cwd)
  if (!repoRoot) return { ok: false, error: 'Git 저장소가 아닙니다.' }

  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, error: '브랜치 이름이 비어 있습니다.' }

  const status = getGitStatus(cwd)
  if (status.branch === trimmedName) {
    return { ok: false, error: '현재 브랜치는 삭제할 수 없습니다.' }
  }

  const result = runGit(['branch', '-d', trimmedName], repoRoot)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || '브랜치를 삭제하지 못했습니다.' }
  }

  return { ok: true }
}

export function initGitRepo(cwd: string): { ok: boolean; error?: string } {
  if (!isGitAvailable()) return { ok: false, error: 'Git이 설치되지 않았습니다.' }

  const targetPath = resolveTargetPath(cwd)
  if (!targetPath) return { ok: false, error: '경로를 확인할 수 없습니다.' }

  const result = runGit(['init'], targetPath)
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() || 'git init을 실행하지 못했습니다.' }
  }

  return { ok: true }
}
