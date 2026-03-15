import { ipcMain } from 'electron'
import type { GitBranchInfo, GitDiffResult, GitFileContentResult, GitLogResult, GitRepoStatus } from '../preload'

type RegisterGitIpcHandlersOptions = {
  getGitStatus: (cwd: string) => GitRepoStatus
  getGitDiff: (cwd: string, filePath: string) => GitDiffResult
  getGitLog: (cwd: string, limit?: number) => GitLogResult
  getGitCommitDiff: (cwd: string, commitHash: string) => GitDiffResult
  getGitFileContent: (cwd: string, commitHash: string, filePath: string) => GitFileContentResult
  getGitCommitFileContent: (cwd: string, commitHash: string, filePath: string) => GitFileContentResult
  getGitBranches: (cwd: string) => { ok: boolean; branches: GitBranchInfo[]; error?: string }
  setGitStaged: (cwd: string, filePath: string, staged: boolean) => { ok: boolean; error?: string }
  restoreGitFile: (cwd: string, filePath: string) => { ok: boolean; error?: string }
  commitGit: (cwd: string, message: string) => { ok: boolean; commitHash?: string; error?: string }
  createGitBranch: (cwd: string, name: string) => { ok: boolean; branchName?: string; error?: string }
  switchGitBranch: (cwd: string, name: string) => { ok: boolean; error?: string }
  pullGit: (cwd: string) => { ok: boolean; error?: string }
  pushGit: (cwd: string) => { ok: boolean; error?: string }
  deleteGitBranch: (cwd: string, name: string) => { ok: boolean; error?: string }
  initGitRepo: (cwd: string) => { ok: boolean; error?: string }
}

export function registerGitIpcHandlers({
  getGitStatus,
  getGitDiff,
  getGitLog,
  getGitCommitDiff,
  getGitFileContent,
  getGitCommitFileContent,
  getGitBranches,
  setGitStaged,
  restoreGitFile,
  commitGit,
  createGitBranch,
  switchGitBranch,
  pullGit,
  pushGit,
  deleteGitBranch,
  initGitRepo,
}: RegisterGitIpcHandlersOptions) {
  ipcMain.handle('claude:get-git-status', (_event, { cwd }: { cwd: string }) => {
    return getGitStatus(cwd)
  })

  ipcMain.handle('claude:get-git-diff', (_event, { cwd, filePath }: { cwd: string; filePath: string }) => {
    return getGitDiff(cwd, filePath)
  })

  ipcMain.handle('claude:get-git-log', (_event, { cwd, limit }: { cwd: string; limit?: number }) => {
    return getGitLog(cwd, limit)
  })

  ipcMain.handle('claude:get-git-commit-diff', (_event, { cwd, commitHash }: { cwd: string; commitHash: string }) => {
    return getGitCommitDiff(cwd, commitHash)
  })

  ipcMain.handle(
    'claude:get-git-file-content',
    (_event, { cwd, commitHash, filePath }: { cwd: string; commitHash: string; filePath: string }) => {
      return getGitFileContent(cwd, commitHash, filePath)
    },
  )

  ipcMain.handle(
    'claude:get-git-commit-file-content',
    (_event, { cwd, commitHash, filePath }: { cwd: string; commitHash: string; filePath: string }) => {
      return getGitCommitFileContent(cwd, commitHash, filePath)
    },
  )

  ipcMain.handle('claude:get-git-branches', (_event, { cwd }: { cwd: string }) => {
    return getGitBranches(cwd)
  })

  ipcMain.handle('claude:set-git-staged', (_event, { cwd, filePath, staged }: { cwd: string; filePath: string; staged: boolean }) => {
    return setGitStaged(cwd, filePath, staged)
  })

  ipcMain.handle('claude:restore-git-file', (_event, { cwd, filePath }: { cwd: string; filePath: string }) => {
    return restoreGitFile(cwd, filePath)
  })

  ipcMain.handle('claude:commit-git', (_event, { cwd, message }: { cwd: string; message: string }) => {
    return commitGit(cwd, message)
  })

  ipcMain.handle('claude:create-git-branch', (_event, { cwd, name }: { cwd: string; name: string }) => {
    return createGitBranch(cwd, name)
  })

  ipcMain.handle('claude:switch-git-branch', (_event, { cwd, name }: { cwd: string; name: string }) => {
    return switchGitBranch(cwd, name)
  })

  ipcMain.handle('claude:pull-git', (_event, { cwd }: { cwd: string }) => {
    return pullGit(cwd)
  })

  ipcMain.handle('claude:push-git', (_event, { cwd }: { cwd: string }) => {
    return pushGit(cwd)
  })

  ipcMain.handle('claude:delete-git-branch', (_event, { cwd, name }: { cwd: string; name: string }) => {
    return deleteGitBranch(cwd, name)
  })

  ipcMain.handle('claude:init-git-repo', (_event, { cwd }: { cwd: string }) => {
    return initGitRepo(cwd)
  })
}
