import { useI18n } from '../../hooks/useI18n'
import { AppButton } from '../ui/appDesignSystem'
import { EmptyState, LoadingPlaceholder } from './shared'
import { AgentAddForm } from './agent/AgentAddForm'
import { AgentFileCard } from './agent/AgentFileCard'
import { AgentIntroCard } from './agent/AgentIntroCard'
import { useAgentTabState } from './agent/useAgentTabState'

export function AgentTab() {
  const { t } = useI18n()
  const {
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
  } = useAgentTabState()

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="p-4">
      <AgentIntroCard />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-claude-muted">{t('settings.agent.registered')}</p>
        <AppButton
          onClick={() => {
            setShowAdd(true)
            setNewName('')
            setFormError('')
            setEditingFile(null)
          }}
          tone="accent"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t('common.add')}
        </AppButton>
      </div>

      <AgentAddForm
        open={showAdd}
        name={newName}
        creating={creating}
        error={formError}
        nameRef={nameRef}
        onNameChange={setNewName}
        onCreate={handleCreate}
        onCancel={() => setShowAdd(false)}
      />

      {files.length === 0 ? (
        <EmptyState
          icon="🤖"
          title={t('settings.agent.emptyTitle')}
          desc={<>{t('settings.agent.emptyDescription')}</>}
        />
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <AgentFileCard
              key={file.path}
              confirmDelete={confirmDelete === file.path}
              editContent={editContent}
              editingFile={editingFile}
              file={file}
              loadingEdit={loadingEdit}
              onChangeEditContent={setEditContent}
              onConfirmDelete={() => handleDelete(file)}
              onEditFile={handleEditFile}
              onOpenFile={(path) => window.claude.openFile(path)}
              onRequestDelete={() => setConfirmDelete(file.path)}
              onResetConfirmDelete={() => setConfirmDelete(null)}
              onResetEditingFile={() => setEditingFile(null)}
              onSaveFile={handleSaveFile}
              saveError={saveError}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  )
}
