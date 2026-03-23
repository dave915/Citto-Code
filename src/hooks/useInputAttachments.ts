import { useCallback, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from 'react'
import type { SelectedFile } from '../../electron/preload'
import { readDroppedFiles, readPastedFiles } from '../components/input/inputUtils'

type Params = {
  disabled?: boolean
  isStreaming: boolean
}

export function useInputAttachments({ disabled, isStreaming }: Params) {
  const [attachedFiles, setAttachedFiles] = useState<SelectedFile[]>([])
  const [isAttaching, setIsAttaching] = useState(false)
  const [skippedFiles, setSkippedFiles] = useState<{ name: string; reason: string }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const dragDepthRef = useRef(0)

  const mergeAttachedFiles = useCallback((nextFiles: SelectedFile[]) => {
    if (nextFiles.length === 0) return

    setAttachedFiles((prev) => {
      const existing = new Set(prev.map((file) => file.path))
      return [...prev, ...nextFiles.filter((file) => !existing.has(file.path))]
    })
  }, [])

  const handleAttachFiles = useCallback(async () => {
    if (isAttaching || isStreaming) return
    setIsAttaching(true)
    try {
      const result = await window.claude.selectFiles()
      if (result?.files?.length > 0) {
        mergeAttachedFiles(result.files)
      }
      if (result?.skipped?.length > 0) {
        setSkippedFiles(result.skipped)
        setTimeout(() => setSkippedFiles([]), 5000)
      }
    } finally {
      setIsAttaching(false)
    }
  }, [isAttaching, isStreaming, mergeAttachedFiles])

  const attachDroppedFiles = useCallback(async (dataTransfer: DataTransfer) => {
    setIsAttaching(true)
    try {
      const nextFiles = await readDroppedFiles(dataTransfer)
      mergeAttachedFiles(nextFiles)
    } finally {
      setIsAttaching(false)
    }
  }, [mergeAttachedFiles])

  const handlePaste = useCallback(async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (isStreaming || disabled || isAttaching) return

    const hasFileItem = Array.from(event.clipboardData.items).some((item) => item.kind === 'file')
    if (!hasFileItem) return

    event.preventDefault()
    setIsAttaching(true)
    try {
      const nextFiles = await readPastedFiles(event.clipboardData)
      mergeAttachedFiles(nextFiles)
    } finally {
      setIsAttaching(false)
    }
  }, [disabled, isAttaching, isStreaming, mergeAttachedFiles])

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (isStreaming || disabled) return
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDragOver(true)
  }, [disabled, isStreaming])

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (isStreaming || disabled) return
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (!isDragOver) setIsDragOver(true)
  }, [disabled, isDragOver, isStreaming])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    if (isStreaming || disabled) return
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragOver(false)
    await attachDroppedFiles(event.dataTransfer)
  }, [attachDroppedFiles, disabled, isStreaming])

  return {
    attachedFiles,
    isAttaching,
    isDragOver,
    setAttachedFiles,
    skippedFiles,
    handleAttachFiles,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
  }
}
