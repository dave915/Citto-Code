import { useI18n } from '../../hooks/useI18n'
import { EmptyState, LoadingPlaceholder } from './shared'
import { PluginSkillList } from './skill/PluginSkillList'
import { SkillAddForm } from './skill/SkillAddForm'
import { SkillCard } from './skill/SkillCard'
import { SkillIntroCard } from './skill/SkillIntroCard'
import { useSkillTabState } from './skill/useSkillTabState'

export function SkillTab() {
  const { t } = useI18n()
  const {
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
    handleDelete,
    handleExpand,
    handleEditFile,
    handleSaveFile,
    handleCreate,
    handleCreateFile,
    handleImportFiles,
  } = useSkillTabState()

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="p-4">
      <SkillIntroCard />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-claude-muted">{t('settings.skill.registered')}</p>
        <button
          onClick={() => {
            setShowAdd(true)
            setNewName('')
            setFormError('')
          }}
          className="flex items-center gap-1 rounded-lg bg-claude-surface px-2.5 py-1 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t('common.add')}
        </button>
      </div>

      <SkillAddForm
        open={showAdd}
        name={newName}
        creating={creating}
        error={formError}
        nameRef={nameRef}
        onNameChange={setNewName}
        onCreate={handleCreate}
        onCancel={() => setShowAdd(false)}
      />

      {skills.length === 0 ? (
        <EmptyState icon="⚡" title={t('settings.skill.emptyTitle')} desc={<>{t('settings.skill.emptyDescription')}</>} />
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => {
            const isExpanded = expandedSkill === skill.name
            const files = skillFiles[skill.name] ?? []
            return (
              <SkillCard
                key={skill.path}
                addFileFor={addFileFor}
                confirmDelete={confirmDelete === skill.name}
                creatingFile={creatingFile}
                editContent={editContent}
                editingFile={editingFile}
                expanded={isExpanded}
                fileFormError={fileFormError}
                fileNameRef={fileNameRef}
                files={files}
                loadingEdit={loadingEdit}
                newFileName={newFileName}
                onChangeEditContent={setEditContent}
                onChangeNewFileName={setNewFileName}
                onConfirmDelete={() => handleDelete(skill)}
                onCreateFile={handleCreateFile}
                onEditFile={handleEditFile}
                onOpenFile={(path) => window.claude.openFile(path)}
                onOpenFolder={() => window.claude.openFile(skill.dir)}
                onRequestAddFile={() => {
                  setAddFileFor({ name: skill.name, dir: skill.dir })
                  setNewFileName('')
                  setFileFormError('')
                }}
                onRequestDelete={() => setConfirmDelete(skill.name)}
                onResetAddFile={() => setAddFileFor(null)}
                onResetConfirmDelete={() => setConfirmDelete(null)}
                onResetEditingFile={() => setEditingFile(null)}
                onSaveFile={handleSaveFile}
                onImportFiles={(files) => handleImportFiles(skill, files)}
                onToggleExpand={() => handleExpand(skill)}
                importError={importErrorBySkill[skill.name] ?? ''}
                importingFiles={importingSkillName === skill.name}
                saveError={saveError}
                saving={saving}
                skill={skill}
              />
            )
          })}
        </div>
      )}

      <PluginSkillList skills={pluginSkills} />
    </div>
  )
}
