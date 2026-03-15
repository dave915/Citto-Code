import { useEffect, useRef, useState } from 'react'

import type { GitBranchInfo, GitDiffResult, GitLogEntry, GitRepoStatus, GitStatusEntry } from '../../../electron/preload'
import { useI18n } from '../useI18n'
import {
  areGitDiffResultsEqual,
  areGitLogEntriesEqual,
  areGitStatusEntriesEqual,
} from '../../lib/gitUtils'

export function useGitPanelData({
  cwd,
  gitPanelOpen,
}: {
  cwd: string
  gitPanelOpen: boolean
}) {
  const { language } = useI18n()
  const selectedGitEntryPathRef = useRef<string | null>(null)
  const selectedGitCommitHashRef = useRef<string | null>(null)
  const gitPanelRefreshInFlightRef = useRef(false)
  const gitPanelLastRefreshAtRef = useRef(0)

  const [gitStatus, setGitStatus] = useState<GitRepoStatus | null>(null)
  const [gitLoading, setGitLoading] = useState(false)
  const [gitLog, setGitLog] = useState<GitLogEntry[]>([])
  const [gitLogLoading, setGitLogLoading] = useState(false)
  const [gitBranches, setGitBranches] = useState<GitBranchInfo[]>([])
  const [gitBranchesLoading, setGitBranchesLoading] = useState(false)
  const [selectedGitEntry, setSelectedGitEntry] = useState<GitStatusEntry | null>(null)
  const [selectedGitCommit, setSelectedGitCommit] = useState<GitLogEntry | null>(null)
  const [gitDiff, setGitDiff] = useState<GitDiffResult | null>(null)
  const [gitDiffLoading, setGitDiffLoading] = useState(false)

  const showGitPreviewPane = selectedGitEntry !== null || selectedGitCommit !== null
  const gitAvailable = gitStatus?.gitAvailable ?? true
  const stagedGitEntryCount = gitStatus?.entries.filter((entry) => entry.staged).length ?? 0

  const refreshGitStatus = async (isCancelled?: () => boolean, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent || !gitStatus) {
      setGitLoading(true)
    }

    try {
      const nextStatus = await window.claude.getGitStatus(cwd || '~')
      if (isCancelled?.()) return

      setGitStatus(nextStatus)
      const selectedPath = selectedGitEntryPathRef.current
      const nextSelectedEntry = selectedPath && nextStatus.isRepo
        ? nextStatus.entries.find((entry) => entry.path === selectedPath) ?? null
        : null

      setSelectedGitEntry((current) => (areGitStatusEntriesEqual(current, nextSelectedEntry) ? current : nextSelectedEntry))
      selectedGitEntryPathRef.current = nextSelectedEntry?.path ?? null

      if (!nextSelectedEntry && !selectedGitCommitHashRef.current) {
        setGitDiff(null)
      }

      return nextStatus
    } catch {
      if (isCancelled?.()) return

      const fallbackStatus: GitRepoStatus = {
        gitAvailable: false,
        isRepo: false,
        rootPath: null,
        branch: null,
        ahead: 0,
        behind: 0,
        clean: true,
        entries: [],
      }

      setGitStatus(fallbackStatus)
      setSelectedGitEntry(null)
      selectedGitEntryPathRef.current = null
      if (!selectedGitCommitHashRef.current) {
        setGitDiff(null)
      }
      return fallbackStatus
    } finally {
      if (!isCancelled?.() && (!silent || !gitStatus)) {
        setGitLoading(false)
      }
    }
  }

  const refreshGitLog = async (isCancelled?: () => boolean, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent || gitLog.length === 0) {
      setGitLogLoading(true)
    }

    try {
      const result = await window.claude.getGitLog({ cwd: cwd || '~' })
      if (isCancelled?.()) return

      const nextEntries = result.ok ? result.entries : []
      setGitLog(nextEntries)
      const selectedHash = selectedGitCommitHashRef.current
      const nextSelectedCommit = selectedHash
        ? nextEntries.find((entry) => entry.hash === selectedHash) ?? null
        : null

      setSelectedGitCommit((current) => (areGitLogEntriesEqual(current, nextSelectedCommit) ? current : nextSelectedCommit))
      selectedGitCommitHashRef.current = nextSelectedCommit?.hash ?? null

      if (!nextSelectedCommit && !selectedGitEntryPathRef.current) {
        setGitDiff(null)
      }

      return nextEntries
    } catch {
      if (isCancelled?.()) return

      setGitLog([])
      setSelectedGitCommit(null)
      selectedGitCommitHashRef.current = null
      if (!selectedGitEntryPathRef.current) {
        setGitDiff(null)
      }
      return []
    } finally {
      if (!isCancelled?.() && (!silent || gitLog.length === 0)) {
        setGitLogLoading(false)
      }
    }
  }

  const refreshGitBranches = async (isCancelled?: () => boolean, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent || gitBranches.length === 0) {
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
      if (!isCancelled?.() && (!silent || gitBranches.length === 0)) {
        setGitBranchesLoading(false)
      }
    }
  }

  const handleSelectGitEntry = async (entry: GitStatusEntry) => {
    if (selectedGitEntry?.path === entry.path) {
      setSelectedGitEntry(null)
      selectedGitEntryPathRef.current = null
      setGitDiff(null)
      return
    }

    selectedGitEntryPathRef.current = entry.path
    selectedGitCommitHashRef.current = null
    setSelectedGitEntry(entry)
    setSelectedGitCommit(null)
    setGitDiffLoading(true)

    try {
      const nextDiff = await window.claude.getGitDiff({ cwd: cwd || '~', filePath: entry.path })
      setGitDiff(nextDiff)
    } catch {
      setGitDiff({ ok: false, diff: '', error: language === 'en' ? 'Failed to load the diff.' : 'diff를 불러오지 못했습니다.' })
    } finally {
      setGitDiffLoading(false)
    }
  }

  const handleSelectGitCommit = async (entry: GitLogEntry) => {
    if (selectedGitCommit?.hash === entry.hash) {
      setSelectedGitCommit(null)
      selectedGitCommitHashRef.current = null
      setGitDiff(null)
      return
    }

    selectedGitCommitHashRef.current = entry.hash
    selectedGitEntryPathRef.current = null
    setSelectedGitCommit(entry)
    setSelectedGitEntry(null)
    setGitDiffLoading(true)

    try {
      const nextDiff = await window.claude.getGitCommitDiff({ cwd: cwd || '~', commitHash: entry.hash })
      setGitDiff(nextDiff)
    } catch {
      setGitDiff({ ok: false, diff: '', error: language === 'en' ? 'Failed to load the commit diff.' : '커밋 diff를 불러오지 못했습니다.' })
    } finally {
      setGitDiffLoading(false)
    }
  }

  const refreshGitPanel = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    const [nextStatus, nextLogEntries] = await Promise.all([
      refreshGitStatus(undefined, { silent }),
      refreshGitLog(undefined, { silent }),
      refreshGitBranches(undefined, { silent }),
    ])

    if (!nextStatus) return

    const selectedPath = selectedGitEntryPathRef.current
    const selectedCommitHash = selectedGitCommitHashRef.current

    if (selectedPath) {
      const nextEntry = nextStatus.isRepo
        ? nextStatus.entries.find((entry) => entry.path === selectedPath) ?? null
        : null
      setSelectedGitEntry((current) => (areGitStatusEntriesEqual(current, nextEntry) ? current : nextEntry))
      selectedGitEntryPathRef.current = nextEntry?.path ?? null

      if (nextEntry) {
        if (silent) return

        if (!gitDiff) {
          setGitDiffLoading(true)
        }

        try {
          const nextDiff = await window.claude.getGitDiff({ cwd: cwd || '~', filePath: nextEntry.path })
          setGitDiff((current) => (areGitDiffResultsEqual(current, nextDiff) ? current : nextDiff))
        } catch {
          const nextDiff = {
            ok: false as const,
            diff: '',
            error: language === 'en' ? 'Failed to load the diff.' : 'diff를 불러오지 못했습니다.',
          }
          setGitDiff((current) => (areGitDiffResultsEqual(current, nextDiff) ? current : nextDiff))
        } finally {
          if (!gitDiff) {
            setGitDiffLoading(false)
          }
        }
      } else {
        setGitDiff(null)
      }
      return
    }

    if (selectedCommitHash) {
      const nextCommit = nextLogEntries?.find((entry) => entry.hash === selectedCommitHash) ?? null
      setSelectedGitCommit((current) => (areGitLogEntriesEqual(current, nextCommit) ? current : nextCommit))
      selectedGitCommitHashRef.current = nextCommit?.hash ?? null

      if (!nextCommit) {
        setGitDiff(null)
        return
      }

      if (!silent) {
        if (!gitDiff) {
          setGitDiffLoading(true)
        }

        try {
          const nextDiff = await window.claude.getGitCommitDiff({ cwd: cwd || '~', commitHash: nextCommit.hash })
          setGitDiff((current) => (areGitDiffResultsEqual(current, nextDiff) ? current : nextDiff))
        } catch {
          const nextDiff = {
            ok: false as const,
            diff: '',
            error: language === 'en' ? 'Failed to load the commit diff.' : '커밋 diff를 불러오지 못했습니다.',
          }
          setGitDiff((current) => (areGitDiffResultsEqual(current, nextDiff) ? current : nextDiff))
        } finally {
          if (!gitDiff) {
            setGitDiffLoading(false)
          }
        }
      }
    }
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
    const intervalId = window.setInterval(() => {
      if (gitPanelOpen) return
      void refreshGitPanelPassive()
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [gitPanelOpen, cwd])

  useEffect(() => {
    let cancelled = false
    void refreshGitStatus(() => cancelled)
    void refreshGitLog(() => cancelled)
    void refreshGitBranches(() => cancelled)

    return () => {
      cancelled = true
    }
  }, [cwd])

  useEffect(() => {
    setSelectedGitEntry(null)
    setSelectedGitCommit(null)
    setGitLog([])
    setGitDiff(null)
    selectedGitEntryPathRef.current = null
    selectedGitCommitHashRef.current = null
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
