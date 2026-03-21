import { useState } from 'react'

import type { GitRepoStatus, GitStatusEntry } from '../../../electron/preload'
import { useI18n } from '../useI18n'
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
  const { t } = useI18n()
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
        window.alert(result.error ?? t('git.error.updateState'))
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleRestoreGitEntry = async (entry: GitStatusEntry) => {
    const confirmed = entry.untracked
      ? window.confirm(t('git.confirm.deleteFile', { path: entry.relativePath }))
      : window.confirm(t('git.confirm.restoreFile', { path: entry.relativePath }))
    if (!confirmed) return

    setGitActionLoading(true)
    try {
      const result = await window.claude.restoreGitFile({
        cwd: cwd || '~',
        filePath: entry.path,
      })
      if (!result.ok) {
        window.alert(result.error ?? t('git.error.restoreFile'))
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleRestoreGitEntries = async (entries: GitStatusEntry[]) => {
    if (entries.length === 0) return
    if (!window.confirm(t('git.confirm.restoreAllDisplayed', { count: entries.length }))) return

    setGitActionLoading(true)
    try {
      for (const entry of entries) {
        const result = await window.claude.restoreGitFile({
          cwd: cwd || '~',
          filePath: entry.path,
        })
        if (!result.ok) {
          window.alert(result.error ?? t('git.error.restoreNamedFile', { path: entry.relativePath }))
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
          window.alert(result.error ?? t('git.error.stageNamedFile', { path: entry.relativePath }))
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
          window.alert(result.error ?? t('git.error.unstageNamedFile', { path: entry.relativePath }))
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
        window.alert(result.error ?? t('git.error.commit'))
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
        window.alert(result.error ?? t('git.error.switchBranch'))
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
        window.alert(result.error ?? t('git.error.createBranch'))
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
        window.alert(result.error ?? t('git.error.pull'))
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
        window.alert(result.error ?? t('git.error.push'))
        return
      }
      await refreshGitPanel()
    } finally {
      setGitActionLoading(false)
    }
  }

  const handleDeleteGitBranch = async (name: string) => {
    if (!window.confirm(t('git.confirm.deleteBranch', { name }))) return

    setGitActionLoading(true)
    try {
      const result = await window.claude.deleteGitBranch({ cwd: cwd || '~', name })
      if (!result.ok) {
        window.alert(result.error ?? t('git.error.deleteBranch'))
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
        window.alert(result.error ?? t('git.error.init'))
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
