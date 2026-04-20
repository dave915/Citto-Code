import { useEffect } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { AppButton, appFieldClassName, cx } from '../ui/appDesignSystem'
import { SkillAddForm } from './skill/SkillAddForm'
import { SkillFileEditor } from './skill/SkillFileEditor'
import { useSkillTabState } from './skill/useSkillTabState'

export function SkillTab({ onCountUpdate }: { onCountUpdate?: (count: number) => void }) {
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

  const selectedSkill = skills.find((s) => s.name === expandedSkill) ?? null
  const selectedFiles = expandedSkill ? (skillFiles[expandedSkill] ?? []) : []

  useEffect(() => {
    onCountUpdate?.(skills.length + pluginSkills.length)
  }, [skills.length, pluginSkills.length, onCountUpdate])

  // Auto-select first skill on load
  useEffect(() => {
    if (!loading && skills.length > 0 && !expandedSkill) {
      handleExpand(skills[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, skills.length])

  const handleSelectSkill = (skillName: string) => {
    const skill = skills.find((s) => s.name === skillName)
    if (skill) handleExpand(skill)
  }

  return (
    <div className="flex h-full">
      {/* Middle: skill list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-claude-border bg-claude-sidebar/50">
        <div className="flex items-center justify-between border-b border-claude-border/50 px-4 py-3.5">
          <p className="text-sm font-semibold text-claude-text">{t('settings.tab.skill')}</p>
          <div className="flex items-center gap-1">
            <AppButton
              size="icon"
              tone="ghost"
              onClick={() => {
                setShowAdd(true)
                setNewName('')
                setFormError('')
              }}
              title={t('common.add')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </AppButton>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {showAdd && (
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
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-claude-muted">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            </div>
          ) : (
            <>
              {/* Personal skills */}
              <div className="mb-3">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">
                  개인 스킬
                </p>
                <div className="space-y-0.5">
                  {skills.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-claude-muted">{t('settings.skill.emptyTitle')}</p>
                  ) : (
                    skills.map((skill) => {
                      const isSelected = expandedSkill === skill.name
                      const files = skillFiles[skill.name] ?? []
                      return (
                        <div key={skill.name}>
                          <button
                            onClick={() => handleSelectSkill(skill.name)}
                            className={cx(
                              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                              isSelected ? 'bg-claude-surface' : 'hover:bg-claude-panel',
                            )}
                          >
                            <svg className="h-3.5 w-3.5 shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h7l2 2h7v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
                            </svg>
                            <span className={cx(
                              'min-w-0 flex-1 truncate text-sm font-medium',
                              isSelected ? 'text-claude-text' : 'text-claude-text/80',
                            )}>
                              {skill.name}
                            </span>
                            {confirmDelete === skill.name ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => void handleDelete(skill)}
                                  className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300"
                                >
                                  삭제
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="text-[10px] text-claude-muted hover:text-claude-text"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDelete(skill.name) }}
                                className="shrink-0 rounded p-0.5 text-claude-muted/50 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                                title={t('common.delete')}
                              >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </button>

                          {/* File tree when selected */}
                          {isSelected && files.length > 0 && (
                            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-claude-border/40 pl-3">
                              {files.map((file) => (
                                <button
                                  key={file.path}
                                  onClick={() => void handleEditFile(file)}
                                  className={cx(
                                    'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left transition-colors',
                                    editingFile?.path === file.path
                                      ? 'bg-claude-surface/80 text-claude-text'
                                      : 'text-claude-muted hover:bg-claude-panel/70 hover:text-claude-text',
                                  )}
                                >
                                  <svg className="h-3 w-3 shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="truncate font-mono text-[11px]">{file.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Plugin skills */}
              {pluginSkills.length > 0 && (
                <div>
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">
                    플러그인 스킬
                  </p>
                  <div className="space-y-0.5">
                    {pluginSkills.map((skill) => (
                      <div key={skill.name} className="flex items-center gap-2 rounded-lg px-3 py-2">
                        <svg className="h-3.5 w-3.5 shrink-0 text-claude-muted/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                        </svg>
                        <span className="min-w-0 flex-1 truncate text-sm text-claude-muted">{skill.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: skill detail */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-claude-bg">
        {selectedSkill ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-claude-border/50 px-6 py-3.5">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">개인 스킬</p>
                  <p className="text-sm font-semibold text-claude-text">{selectedSkill.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AppButton
                  tone="ghost"
                  onClick={() => window.claude.openFile(selectedSkill.path)}
                  title={t('common.openInExternalEditor')}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  SKILL.md
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={() => window.claude.openFile(selectedSkill.dir)}
                  title={t('settings.skill.openFolder')}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z" />
                  </svg>
                </AppButton>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* File path */}
              <div className="border-b border-claude-border/40 px-6 py-3">
                <p className="font-mono text-xs text-claude-muted">
                  {selectedSkill.legacy ? `commands/${selectedSkill.name}` : `skills/${selectedSkill.name}/SKILL.md`}
                </p>
              </div>

              {/* File editor */}
              {editingFile ? (
                <div className="px-6 py-4">
                  <SkillFileEditor
                    editContent={editContent}
                    editingFile={editingFile}
                    loadingEdit={loadingEdit}
                    onChangeContent={setEditContent}
                    onClose={() => setEditingFile(null)}
                    onSave={handleSaveFile}
                    saveError={saveError}
                    saving={saving}
                  />
                </div>
              ) : (
                <div className="px-6 py-4">
                  {selectedFiles.length === 0 ? (
                    <p className="text-xs text-claude-muted">{t('common.noFiles')}</p>
                  ) : (
                    <div className="space-y-1">
                      <p className="mb-2 text-xs font-medium text-claude-muted">{t('common.files')}</p>
                      {selectedFiles.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => void handleEditFile(file)}
                          className="flex w-full items-center gap-2 rounded-lg border border-claude-border bg-claude-panel/60 px-3 py-2 text-left transition-colors hover:bg-claude-surface"
                        >
                          <svg className="h-3.5 w-3.5 shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="flex-1 truncate font-mono text-xs text-claude-text">{file.name}</span>
                          <svg className="h-3 w-3 text-claude-muted/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Add file */}
                  {addFileFor?.name === selectedSkill.name ? (
                    <div className="mt-4 space-y-2 rounded-lg border border-claude-border bg-claude-panel/60 p-3">
                      <p className="text-xs font-medium text-claude-text">{t('settings.skill.addFile')}</p>
                      <input
                        ref={fileNameRef}
                        value={newFileName}
                        onChange={(event) => setNewFileName(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && void handleCreateFile()}
                        placeholder={t('settings.skill.filePlaceholder')}
                        className={`${appFieldClassName} font-mono text-xs`}
                      />
                      {fileFormError && <p className="text-xs text-red-500">{fileFormError}</p>}
                      <div className="flex gap-2">
                        <AppButton onClick={() => void handleCreateFile()} disabled={creatingFile}>
                          {creatingFile ? t('common.creating') : t('common.create')}
                        </AppButton>
                        <AppButton onClick={() => setAddFileFor(null)} tone="ghost">
                          {t('common.cancel')}
                        </AppButton>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAddFileFor({ name: selectedSkill.name, dir: selectedSkill.dir })
                        setNewFileName('')
                        setFileFormError('')
                      }}
                      className="mt-3 flex items-center gap-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      {t('settings.skill.addFile')}
                    </button>
                  )}
                  {importErrorBySkill[selectedSkill.name] && (
                    <p className="mt-2 text-xs text-red-400">{importErrorBySkill[selectedSkill.name]}</p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-claude-muted">
            <p className="text-sm">스킬을 선택하세요</p>
          </div>
        )}
      </div>
    </div>
  )
}
