import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { EmptyState, LoadingPlaceholder } from './shared'

export function AgentTab() {
  const { t } = useI18n()
  const [files, setFiles] = useState<{ name: string; path: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const [editingFile, setEditingFile] = useState<{ name: string; path: string } | null>(null)
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
    if (showAdd) setTimeout(() => nameRef.current?.focus(), 50)
  }, [showAdd])

  const handleEditFile = async (file: { name: string; path: string }) => {
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

  const handleDelete = async (file: { name: string; path: string }) => {
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

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="p-4">
      <div className="mb-4 rounded-xl border border-claude-border bg-claude-surface p-4">
        <p className="mb-1 text-xs font-semibold text-claude-text">{t('settings.agent.introTitle')}</p>
        <p className="text-xs leading-relaxed text-claude-muted">
          {t('settings.agent.introDescription')}
        </p>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-claude-muted">{t('settings.agent.registered')}</p>
        <button
          onClick={() => {
            setShowAdd(true)
            setNewName('')
            setFormError('')
            setEditingFile(null)
          }}
          className="flex items-center gap-1 rounded-lg bg-claude-surface px-2.5 py-1 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t('common.add')}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 space-y-2 rounded-xl border border-claude-border bg-claude-surface p-3">
          <p className="text-xs font-semibold text-claude-text">{t('settings.agent.addNew')}</p>
          <input
            ref={nameRef}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void handleCreate()}
            placeholder={t('settings.agent.namePlaceholder')}
            className="w-full rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono focus:border-claude-border focus:outline-none focus:ring-1 focus:ring-white/10"
          />
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void handleCreate()}
              disabled={creating}
              className="rounded-lg bg-claude-surface-2 px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-[#44444a] disabled:opacity-50"
            >
              {creating ? t('common.creating') : t('common.create')}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <EmptyState
          icon="🤖"
          title={t('settings.agent.emptyTitle')}
          desc={<>{t('settings.agent.emptyDescription')}</>}
        />
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const isEditing = editingFile?.path === file.path
            return (
              <div key={file.path} className="overflow-hidden rounded-xl border border-claude-border bg-claude-bg">
                <div className="group flex items-center gap-3 p-3">
                  <span className="flex-shrink-0 text-base">🤖</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-claude-text">{file.name.replace(/\.md$/, '')}</p>
                    <p className="truncate font-mono text-xs text-claude-muted">{file.name}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {confirmDelete === file.path ? (
                      <>
                        <span className="mr-1 text-xs text-red-500">{t('settings.agent.deletePrompt')}</span>
                        <button
                          onClick={() => void handleDelete(file)}
                          className="rounded-lg bg-red-500 px-2 py-1 text-xs text-white transition-colors hover:bg-red-600"
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-lg border border-claude-border px-2 py-1 text-xs text-claude-muted transition-colors hover:text-claude-text"
                        >
                          {t('common.cancel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setConfirmDelete(file.path)}
                          className="rounded p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-red-500"
                          title={t('common.delete')}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <button
                          onClick={() => void handleEditFile(file)}
                          className={`rounded p-1.5 transition-colors ${
                            isEditing ? 'bg-claude-panel text-claude-text' : 'text-claude-muted hover:bg-claude-panel hover:text-claude-text'
                          }`}
                          title={t('common.editInApp')}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => window.claude.openFile(file.path)}
                          className="rounded p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                          title={t('common.openInExternalEditor')}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="border-t border-claude-border bg-claude-surface px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-mono font-semibold text-claude-text">{file.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-claude-muted">⌘S {t('common.save')}</span>
                        <button
                          onClick={() => setEditingFile(null)}
                          className="rounded p-0.5 text-claude-muted transition-colors hover:text-claude-text"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {loadingEdit ? (
                      <div className="flex h-24 items-center justify-center text-claude-muted">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                        </svg>
                      </div>
                    ) : (
                      <textarea
                        value={editContent}
                        onChange={(event) => setEditContent(event.target.value)}
                        onKeyDown={(event) => {
                          if ((event.metaKey || event.ctrlKey) && event.key === 's') {
                            event.preventDefault()
                            void handleSaveFile()
                          }
                        }}
                        className="h-56 w-full resize-y rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono leading-relaxed focus:border-claude-border focus:outline-none focus:ring-1 focus:ring-white/10"
                        spellCheck={false}
                      />
                    )}
                    {saveError && <p className="mt-1 text-xs text-red-500">{saveError}</p>}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => void handleSaveFile()}
                        disabled={saving || loadingEdit}
                        className="rounded-lg bg-claude-surface-2 px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-[#44444a] disabled:opacity-50"
                      >
                        {saving ? t('common.saving') : t('common.save')}
                      </button>
                      <button
                        onClick={() => setEditingFile(null)}
                        className="rounded-lg border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
