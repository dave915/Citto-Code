import { useEffect, useRef, useState } from 'react'

import type { GitBranchInfo, GitLogEntry, GitRepoStatus, GitStatusEntry } from '../../../electron/preload'
import { useGitPanelSelection } from './useGitPanelSelection'

function buildFallbackGitStatus(): GitRepoStatus {
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

export function useGitPanelData({
  cwd,
  gitPanelOpen,
}: {
  cwd: string
  gitPanelOpen: boolean
}) {
  const gitPanelRefreshInFlightRef = useRef(false)
  const gitPanelLastRefreshAtRef = useRef(0)
  const gitStatusRef = useRef<GitRepoStatus | null>(null)
  const gitLogRef = useRef<GitLogEntry[]>([])
  const gitBranchesRef = useRef<GitBranchInfo[]>([])

  const [gitStatus, setGitStatus] = useState<GitRepoStatus | null>(null)
  const [gitLoading, setGitLoading] = useState(false)
  const [gitLog, setGitLog] = useState<GitLogEntry[]>([])
  const [gitLogLoading, setGitLogLoading] = useState(false)
  const [gitBranches, setGitBranches] = useState<GitBranchInfo[]>([])
  const [gitBranchesLoading, setGitBranchesLoading] = useState(false)
  const {
    gitDiff,
    gitDiffLoading,
    handleSelectGitCommit: selectGitCommit,
    handleSelectGitEntry: selectGitEntry,
    refreshSelectedDiff,
    resetSelection,
    selectedGitCommit,
    selectedGitEntry,
    showGitPreviewPane,
    syncSelectedCommit,
    syncSelectedEntry,
  } = useGitPanelSelection()

  const gitAvailable = gitStatus?.gitAvailable ?? true
  const stagedGitEntryCount = gitStatus?.entries.filter((entry) => entry.staged).length ?? 0

  useEffect(() => {
    gitStatusRef.current = gitStatus
  }, [gitStatus])

  useEffect(() => {
    gitLogRef.current = gitLog
  }, [gitLog])

  useEffect(() => {
    gitBranchesRef.current = gitBranches
  }, [gitBranches])

  const refreshGitStatus = async (isCancelled?: () => boolean, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent || !gitStatusRef.current) {
      setGitLoading(true)
    }

    try {
      const nextStatus = await window.claude.getGitStatus(cwd || '~')
      if (isCancelled?.()) return

      setGitStatus(nextStatus)
      syncSelectedEntry(nextStatus)

      return nextStatus
    } catch {
      if (isCancelled?.()) return
      const fallbackStatus = buildFallbackGitStatus()

      setGitStatus(fallbackStatus)
      syncSelectedEntry(fallbackStatus)
      return fallbackStatus
    } finally {
      if (!isCancelled?.() && (!silent || !gitStatusRef.current)) {
        setGitLoading(false)
      }
    }
  }

  const refreshGitLog = async (isCancelled?: () => boolean, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent || gitLogRef.current.length === 0) {
      setGitLogLoading(true)
    }

    try {
      const result = await window.claude.getGitLog({ cwd: cwd || '~' })
      if (isCancelled?.()) return

      const nextEntries = result.ok ? result.entries : []
      setGitLog(nextEntries)
      syncSelectedCommit(nextEntries)

      return nextEntries
    } catch {
      if (isCancelled?.()) return

      setGitLog([])
      syncSelectedCommit([])
      return []
    } finally {
      if (!isCancelled?.() && (!silent || gitLogRef.current.length === 0)) {
        setGitLogLoading(false)
      }
    }
  }

  const refreshGitBranches = async (isCancelled?: () => boolean, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent || gitBranchesRef.current.length === 0) {
      setGitBranchesLoading(true)
    }

    try {
      const result = await window.claude.getGitBranches(cwd || '~')
      if (isCancelled?.()) return
      setGitBranches(result.ok ? result.branches : [])
    } catch {
      if (isCancelled?.()) return
      setGitBranches([])
    } finally {
      if (!isCancelled?.() && (!silent || gitBranchesRef.current.length === 0)) {
        setGitBranchesLoading(false)
      }
    }
  }

  const handleSelectGitEntry = async (entry: GitStatusEntry) => {
    await selectGitEntry(cwd, entry)
  }

  const handleSelectGitCommit = async (entry: GitLogEntry) => {
    await selectGitCommit(cwd, entry)
  }

  const refreshGitPanel = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    const [nextStatus, nextLogEntries] = await Promise.all([
      refreshGitStatus(undefined, { silent }),
      refreshGitLog(undefined, { silent }),
      refreshGitBranches(undefined, { silent }),
    ])

    if (!nextStatus) return
    await refreshSelectedDiff({
      cwd,
      logEntries: nextLogEntries ?? [],
      silent,
      status: nextStatus,
    })
  }

  const refreshGitPanelPassive = async (throttleMs = 0) => {
    const now = Date.now()
    if (gitPanelRefreshInFlightRef.current) return
    if (throttleMs > 0 && now - gitPanelLastRefreshAtRef.current < throttleMs) return

    gitPanelRefreshInFlightRef.current = true
    gitPanelLastRefreshAtRef.current = now

    try {
      await Promise.all([
        refreshGitStatus(undefined, { silent: true }),
        refreshGitBranches(undefined, { silent: true }),
      ])
    } finally {
      gitPanelRefreshInFlightRef.current = false
    }
  }

  useEffect(() => {
    if (!gitPanelOpen) return

    void refreshGitPanel()

    const intervalId = window.setInterval(() => {
      void refreshGitPanelPassive()
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [gitPanelOpen, cwd])

  useEffect(() => {
    let cancelled = false
    void refreshGitStatus(() => cancelled)

    if (gitPanelOpen) {
      void refreshGitLog(() => cancelled)
      void refreshGitBranches(() => cancelled)
    }

    return () => {
      cancelled = true
    }
  }, [cwd, gitPanelOpen])

  useEffect(() => {
    const normalizedCwd = cwd.trim()
    if (!normalizedCwd) return

    let watchId: string | null = null
    let cancelled = false

    const cleanupEvent = window.claude.onGitHeadChanged((event) => {
      if (event.cwd !== normalizedCwd) return
      if (gitPanelOpen) {
        void refreshGitPanel({ silent: true })
        return
      }
      void refreshGitStatus(undefined, { silent: true })
    })

    void window.claude.watchGitHead({ cwd: normalizedCwd })
      .then((result) => {
        if (cancelled) {
          if (result.watchId) {
            void window.claude.unwatchGitHead({ watchId: result.watchId }).catch(() => undefined)
          }
          return
        }
        watchId = result.watchId
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      cleanupEvent()
      if (watchId) {
        void window.claude.unwatchGitHead({ watchId }).catch(() => undefined)
      }
    }
  }, [cwd, gitPanelOpen])

  useEffect(() => {
    setGitLog([])
    setGitBranches([])
    resetSelection()
  }, [cwd])

  return {
    gitBranches,
    gitBranchesLoading,
    gitDiff,
    gitDiffLoading,
    gitLoading,
    gitLog,
    gitLogLoading,
    gitStatus,
    gitAvailable,
    handleSelectGitCommit,
    handleSelectGitEntry,
    refreshGitBranches,
    refreshGitPanel,
    refreshGitPanelPassive,
    refreshGitStatus,
    selectedGitCommit,
    selectedGitEntry,
    showGitPreviewPane,
    stagedGitEntryCount,
  }
}
