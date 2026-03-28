import { ipcMain } from 'electron'
import type { GitBranchInfo, GitDiffResult, GitFileContentResult, GitLogResult, GitRepoStatus } from '../preload'

type RegisterGitIpcHandlersOptions = {
  getGitStatus: (cwd: string) => Promise<GitRepoStatus>
  getGitDiff: (cwd: string, filePath: string) => Promise<GitDiffResult>
  getGitLog: (cwd: string, limit?: number) => Promise<GitLogResult>
  getGitCommitDiff: (cwd: string, commitHash: string) => Promise<GitDiffResult>
  getGitFileContent: (cwd: string, commitHash: string, filePath: string) => Promise<GitFileContentResult>
  getGitCommitFileContent: (cwd: string, commitHash: string, filePath: string) => Promise<GitFileContentResult>
  getGitBranches: (cwd: string) => Promise<{ ok: boolean; branches: GitBranchInfo[]; error?: string }>
  setGitStaged: (cwd: string, filePath: string, staged: boolean) => Promise<{ ok: boolean; error?: string }>
  restoreGitFile: (cwd: string, filePath: string) => Promise<{ ok: boolean; error?: string }>
  commitGit: (cwd: string, message: string) => Promise<{ ok: boolean; commitHash?: string; error?: string }>
  createGitBranch: (cwd: string, name: string) => Promise<{ ok: boolean; branchName?: string; error?: string }>
  switchGitBranch: (cwd: string, name: string) => Promise<{ ok: boolean; error?: string }>
  pullGit: (cwd: string) => Promise<{ ok: boolean; error?: string }>
  pushGit: (cwd: string) => Promise<{ ok: boolean; error?: string }>
  deleteGitBranch: (cwd: string, name: string) => Promise<{ ok: boolean; error?: string }>
  initGitRepo: (cwd: string) => Promise<{ ok: boolean; error?: string }>
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
  ipcMain.handle('claude:get-git-status', async (_event, { cwd }: { cwd: string }) => {
    return await getGitStatus(cwd)
  })

  ipcMain.handle('claude:get-git-diff', async (_event, { cwd, filePath }: { cwd: string; filePath: string }) => {
    return await getGitDiff(cwd, filePath)
  })

  ipcMain.handle('claude:get-git-log', async (_event, { cwd, limit }: { cwd: string; limit?: number }) => {
    return await getGitLog(cwd, limit)
  })

  ipcMain.handle('claude:get-git-commit-diff', async (_event, { cwd, commitHash }: { cwd: string; commitHash: string }) => {
    return await getGitCommitDiff(cwd, commitHash)
  })

  ipcMain.handle(
    'claude:get-git-file-content',
    async (_event, { cwd, commitHash, filePath }: { cwd: string; commitHash: string; filePath: string }) => {
      return await getGitFileContent(cwd, commitHash, filePath)
    },
  )

  ipcMain.handle(
    'claude:get-git-commit-file-content',
    async (_event, { cwd, commitHash, filePath }: { cwd: string; commitHash: string; filePath: string }) => {
      return await getGitCommitFileContent(cwd, commitHash, filePath)
    },
  )

  ipcMain.handle('claude:get-git-branches', async (_event, { cwd }: { cwd: string }) => {
    return await getGitBranches(cwd)
  })

  ipcMain.handle('claude:set-git-staged', async (_event, { cwd, filePath, staged }: { cwd: string; filePath: string; staged: boolean }) => {
    return await setGitStaged(cwd, filePath, staged)
  })

  ipcMain.handle('claude:restore-git-file', async (_event, { cwd, filePath }: { cwd: string; filePath: string }) => {
    return await restoreGitFile(cwd, filePath)
  })

  ipcMain.handle('claude:commit-git', async (_event, { cwd, message }: { cwd: string; message: string }) => {
    return await commitGit(cwd, message)
  })

  ipcMain.handle('claude:create-git-branch', async (_event, { cwd, name }: { cwd: string; name: string }) => {
    return await createGitBranch(cwd, name)
  })

  ipcMain.handle('claude:switch-git-branch', async (_event, { cwd, name }: { cwd: string; name: string }) => {
    return await switchGitBranch(cwd, name)
  })

  ipcMain.handle('claude:pull-git', async (_event, { cwd }: { cwd: string }) => {
    return pullGit(cwd)
  })

  ipcMain.handle('claude:push-git', async (_event, { cwd }: { cwd: string }) => {
    return pushGit(cwd)
  })

  ipcMain.handle('claude:delete-git-branch', async (_event, { cwd, name }: { cwd: string; name: string }) => {
    return await deleteGitBranch(cwd, name)
  })

  ipcMain.handle('claude:init-git-repo', async (_event, { cwd }: { cwd: string }) => {
    return await initGitRepo(cwd)
  })
}
