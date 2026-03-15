import { useState } from 'react'

import type { GitRepoStatus, GitStatusEntry } from '../../../electron/preload'
import { shouldStageGitEntry } from '../../lib/gitUtils'

export function useGitPanelActions({
  cwd,
  gitCommitMessage,
  gitNewBranchName,
  gitStatus,
  refreshGitPanel,
  setBranchCreateModalOpen,
  setBranchMenuOpen,
  setBranchQuery,
  setGitCommitMessage,
  setGitNewBranchName,
}: {
  cwd: string
  gitCommitMessage: string
  gitNewBranchName: string
  gitStatus: GitRepoStatus | null
  refreshGitPanel: (options?: { silent?: boolean }) => Promise<void>
  setBranchCreateModalOpen: (open: boolean) => void
  setBranchMenuOpen: (open: boolean) => void
  setBranchQuery: (query: string) => void
  setGitCommitMessage: (value: string) => void
  setGitNewBranchName: (value: string) => void
}) {
  const [gitActionLoading, setGitActionLoading] = useState(false)

  const handleToggleGitStage = async (entry: GitStatusEntry, staged?: boolean) => {
    const shouldStage = staged ?? shouldStageGitEntry(entry)
    setGitActionLoading(true)

    try {
      const result = await window.claude.setGitStaged({
        cwd: cwd || '~',
        filePath: entry.path,
        staged: shouldStage,
      })
      if (!result.ok) {
        window.alert(result.error ?? 'Git 상태를 바꾸지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleRestoreGitEntry = async (entry: GitStatusEntry) => {
    const actionLabel = entry.untracked
      ? `'${entry.relativePath}' 파일을 삭제`
      : `'${entry.relativePath}'의 변경을 되돌리기`
    if (!window.confirm(`${actionLabel}할까요?`)) return

    setGitActionLoading(true)
    try {
      const result = await window.claude.restoreGitFile({
        cwd: cwd || '~',
        filePath: entry.path,
      })
      if (!result.ok) {
        window.alert(result.error ?? '파일을 되돌리지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleRestoreGitEntries = async (entries: GitStatusEntry[]) => {
    if (entries.length === 0) return
    if (!window.confirm(`표시된 ${entries.length}개 파일의 변경을 모두 되돌릴까요?`)) return

    setGitActionLoading(true)
    try {
      for (const entry of entries) {
        const result = await window.claude.restoreGitFile({
          cwd: cwd || '~',
          filePath: entry.path,
        })
        if (!result.ok) {
          window.alert(result.error ?? `'${entry.relativePath}' 파일을 되돌리지 못했습니다.`)
          return
        }
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleStageGitEntries = async (entries: GitStatusEntry[]) => {
    if (entries.length === 0) return

    setGitActionLoading(true)
    try {
      for (const entry of entries) {
        if (!shouldStageGitEntry(entry)) continue
        const result = await window.claude.setGitStaged({
          cwd: cwd || '~',
          filePath: entry.path,
          staged: true,
        })
        if (!result.ok) {
          window.alert(result.error ?? `'${entry.relativePath}' 파일을 스테이징하지 못했습니다.`)
          return
        }
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleUnstageGitEntries = async (entries: GitStatusEntry[]) => {
    if (entries.length === 0) return

    setGitActionLoading(true)
    try {
      for (const entry of entries) {
        if (!entry.staged) continue
        const result = await window.claude.setGitStaged({
          cwd: cwd || '~',
          filePath: entry.path,
          staged: false,
        })
        if (!result.ok) {
          window.alert(result.error ?? `'${entry.relativePath}' 파일을 언스테이징하지 못했습니다.`)
          return
        }
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleCommitGit = async () => {
    const message = gitCommitMessage.trim()
    if (!message) return

    setGitActionLoading(true)
    try {
      const result = await window.claude.commitGit({ cwd: cwd || '~', message })
      if (!result.ok) {
        window.alert(result.error ?? '커밋하지 못했습니다.')
        return
      }
      setGitCommitMessage('')
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleSwitchGitBranch = async (name: string) => {
    if (!name || gitStatus?.branch === name) return

    setGitActionLoading(true)
    try {
      const result = await window.claude.switchGitBranch({ cwd: cwd || '~', name })
      if (!result.ok) {
        window.alert(result.error ?? '브랜치를 전환하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleCreateGitBranch = async () => {
    const name = gitNewBranchName.trim()
    if (!name) return

    setGitActionLoading(true)
    try {
      const result = await window.claude.createGitBranch({ cwd: cwd || '~', name })
      if (!result.ok) {
        window.alert(result.error ?? '브랜치를 생성하지 못했습니다.')
        return
      }
      setBranchCreateModalOpen(false)
      setGitNewBranchName('')
      setBranchMenuOpen(false)
      setBranchQuery('')
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handlePullGit = async () => {
    setGitActionLoading(true)
    try {
      const result = await window.claude.pullGit({ cwd: cwd || '~' })
      if (!result.ok) {
        window.alert(result.error ?? 'git pull을 실행하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handlePushGit = async () => {
    setGitActionLoading(true)
    try {
      const result = await window.claude.pushGit({ cwd: cwd || '~' })
      if (!result.ok) {
        window.alert(result.error ?? 'git push를 실행하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleDeleteGitBranch = async (name: string) => {
    if (!window.confirm(`브랜치 '${name}'를 삭제할까요?`)) return

    setGitActionLoading(true)
    try {
      const result = await window.claude.deleteGitBranch({ cwd: cwd || '~', name })
      if (!result.ok) {
        window.alert(result.error ?? '브랜치를 삭제하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleInitGitRepo = async () => {
    setGitActionLoading(true)
    try {
      const result = await window.claude.initGitRepo({ cwd: cwd || '~' })
      if (!result.ok) {
        window.alert(result.error ?? 'git init을 실행하지 못했습니다.')
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  return {
    gitActionLoading,
    handleCommitGit,
    handleCreateGitBranch,
    handleDeleteGitBranch,
    handleInitGitRepo,
    handlePullGit,
    handlePushGit,
    handleRestoreGitEntries,
    handleRestoreGitEntry,
    handleStageGitEntries,
    handleSwitchGitBranch,
    handleToggleGitStage,
    handleUnstageGitEntries,
  }
}
