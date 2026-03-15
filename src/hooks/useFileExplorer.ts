import { useEffect, useState } from 'react'

import type { DirEntry } from '../../electron/preload'
import { isTextPreviewable } from '../lib/markdownPreview'

type PreviewState = 'idle' | 'loading' | 'ready' | 'unsupported'

export function useFileExplorer({
  cwd,
  filePanelOpen,
}: {
  cwd: string
  filePanelOpen: boolean
}) {
  const [rootEntries, setRootEntries] = useState<DirEntry[]>([])
  const [childEntries, setChildEntries] = useState<Record<string, DirEntry[]>>({})
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({})
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({})
  const [selectedEntry, setSelectedEntry] = useState<DirEntry | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const [previewState, setPreviewState] = useState<PreviewState>('idle')
  const [markdownPreviewEnabled, setMarkdownPreviewEnabled] = useState(true)

  const toggleDirectory = async (entry: DirEntry) => {
    if (entry.type !== 'directory') return

    const isExpanded = expandedDirs[entry.path]
    if (isExpanded) {
      setExpandedDirs((current) => ({ ...current, [entry.path]: false }))
      return
    }

    if (!(entry.path in childEntries)) {
      setLoadingPaths((current) => ({ ...current, [entry.path]: true }))
      try {
        const children = await window.claude.listCurrentDir(entry.path)
        setChildEntries((current) => ({ ...current, [entry.path]: children }))
      } catch {
        setChildEntries((current) => ({ ...current, [entry.path]: [] }))
      } finally {
        setLoadingPaths((current) => ({ ...current, [entry.path]: false }))
      }
    }

    setExpandedDirs((current) => ({ ...current, [entry.path]: true }))
  }

  const handleSelectEntry = async (entry: DirEntry) => {
    if (entry.type === 'directory') return

    if (selectedEntry?.path === entry.path) {
      setSelectedEntry(null)
      setPreviewContent('')
      setPreviewState('idle')
      setMarkdownPreviewEnabled(true)
      return
    }

    setSelectedEntry(entry)
    setMarkdownPreviewEnabled(true)

    if (!isTextPreviewable(entry.name)) {
      setPreviewContent('')
      setPreviewState('unsupported')
      return
    }

    setPreviewState('loading')
    const result = await window.claude.readFile(entry.path)
    if (!result) {
      setPreviewContent('')
      setPreviewState('unsupported')
      return
    }

    setPreviewContent(result.content)
    setPreviewState('ready')
  }

  const refreshExplorer = async (resetExpanded: boolean, isCancelled?: () => boolean) => {
    setLoadingPaths((current) => ({ ...current, __root__: true }))

    try {
      const entries = await window.claude.listCurrentDir(cwd || '~')
      if (isCancelled?.()) return

      setRootEntries(entries)

      if (resetExpanded) {
        setChildEntries({})
        setExpandedDirs({})
        return
      }

      const expandedPaths = Object.entries(expandedDirs)
        .filter(([, expanded]) => expanded)
        .map(([path]) => path)

      if (expandedPaths.length === 0) return

      const refreshedChildren = await Promise.all(
        expandedPaths.map(async (path) => {
          try {
            const children = await window.claude.listCurrentDir(path)
            return [path, children] as const
          } catch {
            return [path, []] as const
          }
        })
      )

      if (isCancelled?.()) return
      setChildEntries(Object.fromEntries(refreshedChildren))
    } catch {
      if (isCancelled?.()) return
      setRootEntries([])
      if (resetExpanded) {
        setChildEntries({})
        setExpandedDirs({})
      }
    } finally {
      if (!isCancelled?.()) {
        setLoadingPaths((current) => ({ ...current, __root__: false }))
      }
    }
  }

  useEffect(() => {
    if (!filePanelOpen) return

    let cancelled = false
    void refreshExplorer(true, () => cancelled)

    return () => {
      cancelled = true
    }
  }, [filePanelOpen, cwd])

  useEffect(() => {
    setSelectedEntry(null)
    setPreviewContent('')
    setPreviewState('idle')
    setMarkdownPreviewEnabled(true)
  }, [cwd])

  return {
    rootEntries,
    childEntries,
    expandedDirs,
    loadingPaths,
    selectedEntry,
    previewContent,
    previewState,
    markdownPreviewEnabled,
    setMarkdownPreviewEnabled,
    toggleDirectory,
    handleSelectEntry,
    refreshExplorer,
  }
}
