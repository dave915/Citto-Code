import { useEffect } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { AppButton, appFieldClassName, cx } from '../ui/appDesignSystem'
import { AgentAddForm } from './agent/AgentAddForm'
import { AgentFileEditor } from './agent/AgentFileEditor'
import { useAgentTabState } from './agent/useAgentTabState'

export function AgentTab({ onCountUpdate }: { onCountUpdate?: (count: number) => void }) {
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

  useEffect(() => {
    onCountUpdate?.(files.length)
  }, [files.length, onCountUpdate])

  // Auto-select first agent on load
  useEffect(() => {
    if (!loading && files.length > 0 && !editingFile) {
      void handleEditFile(files[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, files.length])

  const selectedFile = editingFile ?? (files.length > 0 ? files[0] : null)

  return (
    <div className="flex h-full">
      {/* Middle: agent list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-claude-border bg-claude-sidebar/50">
        <div className="flex items-center justify-between border-b border-claude-border/50 px-4 py-3.5">
          <p className="text-sm font-semibold text-claude-text">{t('settings.tab.agent')}</p>
          <AppButton
            size="icon"
            tone="ghost"
            onClick={() => {
              setShowAdd(true)
              setNewName('')
              setFormError('')
              setEditingFile(null)
            }}
            title={t('common.add')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </AppButton>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {showAdd && (
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
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-claude-muted">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            </div>
          ) : files.length === 0 ? (
            <p className="px-3 py-3 text-xs text-claude-muted">{t('settings.agent.emptyTitle')}</p>
          ) : (
            <div>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">
                개인 에이전트
              </p>
              <div className="space-y-0.5">
                {files.map((file) => {
                  const isSelected = editingFile?.path === file.path
                  const agentName = file.name.replace(/\.md$/, '')
                  return (
                    <div key={file.path} className="group">
                      <button
                        onClick={() => void handleEditFile(file)}
                        className={cx(
                          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                          isSelected ? 'bg-claude-surface' : 'hover:bg-claude-panel',
                        )}
                      >
                        <svg className="h-3.5 w-3.5 shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="8" r="3" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18a6 6 0 0 1 12 0" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className={cx(
                            'truncate text-sm font-medium leading-none',
                            isSelected ? 'text-claude-text' : 'text-claude-text/80',
                          )}>
                            {agentName}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-claude-muted/70">{file.name}</p>
                        </div>
                        {confirmDelete === file.path ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => void handleDelete(file)}
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
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(file.path) }}
                            className="shrink-0 rounded p-0.5 text-claude-muted/40 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                            title={t('common.delete')}
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: agent detail */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-claude-bg">
        {selectedFile ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-claude-border/50 px-6 py-3.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">개인 에이전트</p>
                <p className="text-sm font-semibold text-claude-text">{selectedFile.name.replace(/\.md$/, '')}</p>
              </div>
              <div className="flex items-center gap-2">
                <AppButton
                  tone="ghost"
                  onClick={() => window.claude.openFile(selectedFile.path)}
                  title={t('common.openInExternalEditor')}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {selectedFile.name}
                </AppButton>
              </div>
            </div>

            {/* File editor */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {editingFile?.path === selectedFile.path ? (
                <AgentFileEditor
                  editContent={editContent}
                  editingFile={editingFile}
                  loadingEdit={loadingEdit}
                  onChangeContent={setEditContent}
                  onClose={() => setEditingFile(null)}
                  onSave={handleSaveFile}
                  saveError={saveError}
                  saving={saving}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-claude-muted">{t('settings.agent.registered')}</p>
                  <AppButton
                    onClick={() => void handleEditFile(selectedFile)}
                    tone="secondary"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {t('common.editInApp')}
                  </AppButton>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-claude-muted">
            <p className="text-sm">에이전트를 선택하세요</p>
          </div>
        )}
      </div>
    </div>
  )
}
