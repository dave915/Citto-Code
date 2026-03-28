import { useEffect, useRef, useState } from 'react'
import type { GitDiffResult, GitLogEntry, GitRepoStatus, GitStatusEntry } from '../../../electron/preload'
import { useI18n } from '../useI18n'
import {
  areGitDiffResultsEqual,
  areGitLogEntriesEqual,
  areGitStatusEntriesEqual,
} from '../../lib/gitUtils'

type RefreshSelectionDiffOptions = {
  cwd: string
  silent?: boolean
  status: GitRepoStatus
  logEntries: GitLogEntry[]
}

export function useGitPanelSelection() {
  const { t } = useI18n()
  const selectedGitEntryPathRef = useRef<string | null>(null)
  const selectedGitCommitHashRef = useRef<string | null>(null)
  const gitDiffRef = useRef<GitDiffResult | null>(null)

  const [selectedGitEntry, setSelectedGitEntry] = useState<GitStatusEntry | null>(null)
  const [selectedGitCommit, setSelectedGitCommit] = useState<GitLogEntry | null>(null)
  const [gitDiff, setGitDiff] = useState<GitDiffResult | null>(null)
  const [gitDiffLoading, setGitDiffLoading] = useState(false)

  useEffect(() => {
    gitDiffRef.current = gitDiff
  }, [gitDiff])

  const showGitPreviewPane = selectedGitEntry !== null || selectedGitCommit !== null

  const setSyncedGitDiff = (nextDiff: GitDiffResult | null) => {
    gitDiffRef.current = nextDiff
    setGitDiff((current) => (areGitDiffResultsEqual(current, nextDiff) ? current : nextDiff))
  }

  const syncSelectedEntry = (nextStatus: GitRepoStatus) => {
    const selectedPath = selectedGitEntryPathRef.current
    const nextSelectedEntry = selectedPath && nextStatus.isRepo
      ? nextStatus.entries.find((entry) => entry.path === selectedPath) ?? null
      : null

    setSelectedGitEntry((current) => (areGitStatusEntriesEqual(current, nextSelectedEntry) ? current : nextSelectedEntry))
    selectedGitEntryPathRef.current = nextSelectedEntry?.path ?? null

    if (!nextSelectedEntry && !selectedGitCommitHashRef.current) {
      setSyncedGitDiff(null)
    }

    return nextSelectedEntry
  }

  const syncSelectedCommit = (nextEntries: GitLogEntry[]) => {
    const selectedHash = selectedGitCommitHashRef.current
    const nextSelectedCommit = selectedHash
      ? nextEntries.find((entry) => entry.hash === selectedHash) ?? null
      : null

    setSelectedGitCommit((current) => (areGitLogEntriesEqual(current, nextSelectedCommit) ? current : nextSelectedCommit))
    selectedGitCommitHashRef.current = nextSelectedCommit?.hash ?? null

    if (!nextSelectedCommit && !selectedGitEntryPathRef.current) {
      setSyncedGitDiff(null)
    }

    return nextSelectedCommit
  }

  const loadEntryDiff = async (cwd: string, entry: GitStatusEntry, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    const hadExistingDiff = gitDiffRef.current !== null
    if (!silent && !hadExistingDiff) {
      setGitDiffLoading(true)
    }

    try {
      const nextDiff = await window.claude.getGitDiff({ cwd: cwd || '~', filePath: entry.path })
      setSyncedGitDiff(nextDiff)
    } catch {
      setSyncedGitDiff({ ok: false, diff: '', error: t('git.error.loadDiff') })
    } finally {
      if (!silent && !hadExistingDiff) {
        setGitDiffLoading(false)
      }
    }
  }

  const loadCommitDiff = async (cwd: string, entry: GitLogEntry, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    const hadExistingDiff = gitDiffRef.current !== null
    if (!silent && !hadExistingDiff) {
      setGitDiffLoading(true)
    }

    try {
      const nextDiff = await window.claude.getGitCommitDiff({ cwd: cwd || '~', commitHash: entry.hash })
      setSyncedGitDiff(nextDiff)
    } catch {
      setSyncedGitDiff({ ok: false, diff: '', error: t('git.error.loadCommitDiff') })
    } finally {
      if (!silent && !hadExistingDiff) {
        setGitDiffLoading(false)
      }
    }
  }

  const handleSelectGitEntry = async (cwd: string, entry: GitStatusEntry) => {
    if (selectedGitEntryPathRef.current === entry.path) {
      setSelectedGitEntry(null)
      selectedGitEntryPathRef.current = null
      setSyncedGitDiff(null)
      return
    }

    selectedGitEntryPathRef.current = entry.path
    selectedGitCommitHashRef.current = null
    setSelectedGitEntry(entry)
    setSelectedGitCommit(null)
    setGitDiffLoading(true)

    try {
      const nextDiff = await window.claude.getGitDiff({ cwd: cwd || '~', filePath: entry.path })
      setSyncedGitDiff(nextDiff)
    } catch {
      setSyncedGitDiff({ ok: false, diff: '', error: t('git.error.loadDiff') })
    } finally {
      setGitDiffLoading(false)
    }
  }

  const handleSelectGitCommit = async (cwd: string, entry: GitLogEntry) => {
    if (selectedGitCommitHashRef.current === entry.hash) {
      setSelectedGitCommit(null)
      selectedGitCommitHashRef.current = null
      setSyncedGitDiff(null)
      return
    }

    selectedGitCommitHashRef.current = entry.hash
    selectedGitEntryPathRef.current = null
    setSelectedGitCommit(entry)
    setSelectedGitEntry(null)
    setGitDiffLoading(true)

    try {
      const nextDiff = await window.claude.getGitCommitDiff({ cwd: cwd || '~', commitHash: entry.hash })
      setSyncedGitDiff(nextDiff)
    } catch {
      setSyncedGitDiff({ ok: false, diff: '', error: t('git.error.loadCommitDiff') })
    } finally {
      setGitDiffLoading(false)
    }
  }

  const refreshSelectedDiff = async ({
    cwd,
    logEntries,
    silent = false,
    status,
  }: RefreshSelectionDiffOptions) => {
    const selectedPath = selectedGitEntryPathRef.current
    if (selectedPath) {
      const nextEntry = syncSelectedEntry(status)
      if (!nextEntry) {
        setSyncedGitDiff(null)
        return
      }
      if (!silent) {
        await loadEntryDiff(cwd, nextEntry, { silent })
      }
      return
    }

    const selectedCommitHash = selectedGitCommitHashRef.current
    if (!selectedCommitHash) return

    const nextCommit = syncSelectedCommit(logEntries)
    if (!nextCommit) {
      setSyncedGitDiff(null)
      return
    }
    if (!silent) {
      await loadCommitDiff(cwd, nextCommit, { silent })
    }
  }

  const resetSelection = () => {
    selectedGitEntryPathRef.current = null
    selectedGitCommitHashRef.current = null
    setSelectedGitEntry(null)
    setSelectedGitCommit(null)
    setGitDiffLoading(false)
    setSyncedGitDiff(null)
  }

  return {
    gitDiff,
    gitDiffLoading,
    handleSelectGitCommit,
    handleSelectGitEntry,
    refreshSelectedDiff,
    resetSelection,
    selectedGitCommit,
    selectedGitEntry,
    showGitPreviewPane,
    syncSelectedCommit,
    syncSelectedEntry,
  }
}
