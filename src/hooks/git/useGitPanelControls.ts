import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

import type { GitBranchInfo } from '../../../electron/preload'

export function useGitPanelControls({
  cwd,
  gitBranches,
  gitPanelOpen,
  refreshGitBranches,
  refreshGitPanelPassive,
  refreshGitStatus,
  stagedGitEntryCount,
}: {
  cwd: string
  gitBranches: GitBranchInfo[]
  gitPanelOpen: boolean
  refreshGitBranches: (isCancelled?: () => boolean) => Promise<void>
  refreshGitPanelPassive: (throttleMs?: number) => Promise<void>
  refreshGitStatus: (isCancelled?: () => boolean) => Promise<unknown>
  stagedGitEntryCount: number
}) {
  const branchMenuRef = useRef<HTMLDivElement>(null)
  const branchSearchInputRef = useRef<HTMLInputElement>(null)
  const branchCreateInputRef = useRef<HTMLInputElement>(null)
  const gitCommitTextareaRef = useRef<HTMLTextAreaElement>(null)
  const gitSidebarRef = useRef<HTMLDivElement>(null)

  const [gitCommitMessage, setGitCommitMessage] = useState('')
  const [gitNewBranchName, setGitNewBranchName] = useState('')
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [branchQuery, setBranchQuery] = useState('')
  const [branchCreateModalOpen, setBranchCreateModalOpen] = useState(false)

  const filteredGitBranches = useMemo(() => {
    const query = branchQuery.trim().toLowerCase()
    const branches = [...gitBranches].sort((a, b) => {
      if (a.current === b.current) return a.name.localeCompare(b.name)
      return a.current ? -1 : 1
    })
    if (!query) return branches
    return branches.filter((branch) => branch.name.toLowerCase().includes(query))
  }, [branchQuery, gitBranches])

  const handleGitPanelPointerDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (!gitPanelOpen) return
    if (!(event.target instanceof HTMLElement)) return
    if (event.target.closest('button, input, textarea, select, option, label, a, [data-git-resize="true"]')) return
    void refreshGitPanelPassive(350)
  }

  const handleOpenBranchCreateModal = () => {
    setBranchMenuOpen(false)
    setBranchQuery('')
    setBranchCreateModalOpen(true)
  }

  useEffect(() => {
    const textarea = gitCommitTextareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [gitCommitMessage, stagedGitEntryCount])

  useEffect(() => {
    if (!branchMenuOpen) return

    let cancelled = false
    void refreshGitStatus(() => cancelled)
    void refreshGitBranches(() => cancelled)

    const focusTimer = window.setTimeout(() => {
      branchSearchInputRef.current?.focus()
      branchSearchInputRef.current?.select()
    }, 0)

    const handleMouseDown = (event: MouseEvent) => {
      if (branchMenuRef.current && event.target instanceof Node && !branchMenuRef.current.contains(event.target)) {
        setBranchMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBranchMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelled = true
      window.clearTimeout(focusTimer)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [branchMenuOpen])

  useEffect(() => {
    if (!branchCreateModalOpen) return

    const focusTimer = window.setTimeout(() => {
      branchCreateInputRef.current?.focus()
      branchCreateInputRef.current?.select()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBranchCreateModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [branchCreateModalOpen])

  useEffect(() => {
    setGitCommitMessage('')
    setGitNewBranchName('')
    setBranchMenuOpen(false)
    setBranchQuery('')
    setBranchCreateModalOpen(false)
  }, [cwd])

  return {
    branchCreateInputRef,
    branchCreateModalOpen,
    branchMenuOpen,
    branchMenuRef,
    branchQuery,
    branchSearchInputRef,
    filteredGitBranches,
    gitCommitMessage,
    gitCommitTextareaRef,
    gitNewBranchName,
    gitSidebarRef,
    handleGitPanelPointerDown,
    handleOpenBranchCreateModal,
    setBranchCreateModalOpen,
    setBranchMenuOpen,
    setBranchQuery,
    setGitCommitMessage,
    setGitNewBranchName,
  }
}
