import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../hooks/useI18n'

export type AgentFile = {
  name: string
  path: string
}

export function useAgentTabState() {
  const { t } = useI18n()
  const [files, setFiles] = useState<AgentFile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const [editingFile, setEditingFile] = useState<AgentFile | null>(null)
  const [editContent, setEditContent] = useState('')
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const loadFiles = async () => {
    setLoading(true)
    try {
      const nextFiles = await window.claude.listClaudeDir('agents')
      setFiles(nextFiles)
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFiles()
  }, [])

  useEffect(() => {
    if (!showAdd) return
    const timer = window.setTimeout(() => nameRef.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [showAdd])

  const handleEditFile = async (file: AgentFile) => {
    if (editingFile?.path === file.path) {
      setEditingFile(null)
      return
    }
    setShowAdd(false)
    setEditingFile({ name: file.name, path: file.path })
    setSaveError('')
    setLoadingEdit(true)
    const result = await window.claude.readFile(file.path)
    setLoadingEdit(false)
    setEditContent(result?.content ?? '')
  }

  const handleSaveFile = async () => {
    if (!editingFile) return
    setSaving(true)
    setSaveError('')
    const result = await window.claude.writeFileAbs({ filePath: editingFile.path, content: editContent })
    setSaving(false)
    if (!result.ok) {
      setSaveError(result.error ?? t('settings.agent.saveFailed'))
      return
    }
    setEditingFile(null)
  }

  const handleDelete = async (file: AgentFile) => {
    const result = await window.claude.deletePath({ targetPath: file.path })
    if (!result.ok) return
    setConfirmDelete(null)
    if (editingFile?.path === file.path) setEditingFile(null)
    await loadFiles()
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      setFormError(t('settings.agent.enterName'))
      return
    }
    const fileName = name.endsWith('.md') ? name : `${name}.md`
    const agentName = fileName.replace(/\.md$/, '')
    const content = t('settings.agent.template', { name: agentName })

    setCreating(true)
    setFormError('')
    const result = await window.claude.writeClaudeFile({ subdir: 'agents', name: fileName, content })
    setCreating(false)
    if (!result.ok) {
      setFormError(result.error ?? t('settings.agent.createFailed'))
      return
    }

    setShowAdd(false)
    setNewName('')
    await loadFiles()
    if (result.path) {
      await handleEditFile({ name: fileName, path: result.path })
    }
  }

  return {
    files,
    loading,
    showAdd,
    newName,
    creating,
    formError,
    nameRef,
    editingFile,
    editContent,
    loadingEdit,
    saving,
    saveError,
    confirmDelete,
    setShowAdd,
    setNewName,
    setFormError,
    setEditingFile,
    setEditContent,
    setConfirmDelete,
    handleEditFile,
    handleSaveFile,
    handleDelete,
    handleCreate,
  }
}
