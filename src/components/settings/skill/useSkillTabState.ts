import { useEffect, useRef, useState } from 'react'
import type { PluginSkill } from '../../../../electron/preload'
import { useI18n } from '../../../hooks/useI18n'

export type Skill = {
  name: string
  path: string
  dir: string
  legacy: boolean
}

export type SkillFile = {
  name: string
  path: string
}

export function useSkillTabState() {
  const { t } = useI18n()
  const [skills, setSkills] = useState<Skill[]>([])
  const [pluginSkills, setPluginSkills] = useState<PluginSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [skillFiles, setSkillFiles] = useState<Record<string, SkillFile[]>>({})
  const [addFileFor, setAddFileFor] = useState<{ name: string; dir: string } | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [fileFormError, setFileFormError] = useState('')
  const [creatingFile, setCreatingFile] = useState(false)
  const [importingSkillName, setImportingSkillName] = useState<string | null>(null)
  const [importErrorBySkill, setImportErrorBySkill] = useState<Record<string, string>>({})
  const fileNameRef = useRef<HTMLInputElement>(null)

  const [editingFile, setEditingFile] = useState<SkillFile | null>(null)
  const [editContent, setEditContent] = useState('')
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const loadSkills = () => {
    setLoading(true)
    Promise.all([
      window.claude.listSkills().catch(() => []),
      window.claude.listPluginSkills().catch(() => []),
    ])
      .then(([loadedSkills, loadedPluginSkills]) => {
        setSkills(loadedSkills)
        setPluginSkills(loadedPluginSkills)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSkills()
  }, [])

  useEffect(() => {
    if (!showAdd) return
    const timer = window.setTimeout(() => nameRef.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [showAdd])

  useEffect(() => {
    if (!addFileFor) return
    const timer = window.setTimeout(() => fileNameRef.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [addFileFor])

  const loadSkillFiles = (skill: Skill) => {
    window.claude.listDirAbs(skill.dir)
      .then((files) => {
        setSkillFiles((previous) => ({ ...previous, [skill.name]: files }))
      })
      .catch(() => undefined)
  }

  const handleDelete = async (skill: Skill) => {
    const result = await window.claude.deletePath({ targetPath: skill.dir, recursive: true })
    if (!result.ok) return
    setConfirmDelete(null)
    if (expandedSkill === skill.name) setExpandedSkill(null)
    if (editingFile) setEditingFile(null)
    loadSkills()
  }

  const handleExpand = (skill: Skill) => {
    if (expandedSkill === skill.name) {
      setExpandedSkill(null)
      setAddFileFor(null)
      setEditingFile(null)
      return
    }

    setExpandedSkill(skill.name)
    setAddFileFor(null)
    setEditingFile(null)
    loadSkillFiles(skill)
  }

  const handleEditFile = async (file: SkillFile) => {
    setEditingFile({ name: file.name, path: file.path })
    setAddFileFor(null)
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
      setSaveError(result.error ?? t('settings.skill.saveFailed'))
      return
    }
    setEditingFile(null)
  }

  const handleCreate = async () => {
    const raw = newName.trim()
    if (!raw) {
      setFormError(t('settings.skill.enterName'))
      return
    }
    const skillName = raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64)
    const content = t('settings.skill.template', { name: skillName })
    setCreating(true)
    setFormError('')
    const result = await window.claude.writeClaudeFile({ subdir: `skills/${skillName}`, name: 'SKILL.md', content })
    setCreating(false)
    if (!result.ok) {
      setFormError(result.error ?? t('settings.skill.createFailed'))
      return
    }
    setShowAdd(false)
    setNewName('')
    loadSkills()
    if (result.path) window.claude.openFile(result.path)
  }

  const handleCreateFile = async () => {
    if (!addFileFor) return
    const fileName = newFileName.trim()
    if (!fileName) {
      setFileFormError(t('settings.skill.fileEnterName'))
      return
    }
    const filePath = `${addFileFor.dir}/${fileName}`
    const baseName = fileName.split('/').pop() ?? fileName
    const content = fileName.endsWith('.md')
      ? t('settings.skill.fileTemplate', { name: baseName.replace(/\.md$/, '') })
      : ''
    setCreatingFile(true)
    setFileFormError('')
    const result = await window.claude.writeFileAbs({ filePath, content })
    setCreatingFile(false)
    if (!result.ok) {
      setFileFormError(result.error ?? t('settings.skill.createFailed'))
      return
    }
    setAddFileFor(null)
    setNewFileName('')
    const skillForReload = skills.find((skill) => skill.name === addFileFor.name)
    if (skillForReload) loadSkillFiles(skillForReload)
    if (result.path) {
      await handleEditFile({ name: fileName, path: result.path })
    }
  }

  const handleImportFiles = async (skill: Skill, files: FileList | File[]) => {
    const entries = Array.from(files)
    if (entries.length === 0) return

    setImportingSkillName(skill.name)
    setImportErrorBySkill((current) => ({ ...current, [skill.name]: '' }))

    try {
      for (const file of entries) {
        const relativePath = file.webkitRelativePath || file.name
        const filePath = `${skill.dir}/${relativePath}`
        const content = await file.text()
        const result = await window.claude.writeFileAbs({ filePath, content })
        if (!result.ok) {
          throw new Error(result.error ?? t('settings.skill.importFailed'))
        }
      }

      loadSkillFiles(skill)
    } catch (error) {
      setImportErrorBySkill((current) => ({
        ...current,
        [skill.name]: error instanceof Error ? error.message : t('settings.skill.importFailed'),
      }))
    } finally {
      setImportingSkillName((current) => (current === skill.name ? null : current))
    }
  }

  return {
    skills,
    pluginSkills,
    loading,
    showAdd,
    newName,
    creating,
    formError,
    nameRef,
    confirmDelete,
    expandedSkill,
    skillFiles,
    addFileFor,
    newFileName,
    fileFormError,
    creatingFile,
    importingSkillName,
    importErrorBySkill,
    fileNameRef,
    editingFile,
    editContent,
    loadingEdit,
    saving,
    saveError,
    setShowAdd,
    setNewName,
    setFormError,
    setConfirmDelete,
    setAddFileFor,
    setNewFileName,
    setFileFormError,
    setEditingFile,
    setEditContent,
    loadSkills,
    handleDelete,
    handleExpand,
    handleEditFile,
    handleSaveFile,
    handleCreate,
    handleCreateFile,
    handleImportFiles,
  }
}
