import { useI18n } from '../../../hooks/useI18n'
import type { AgentFile } from './useAgentTabState'
import { AgentFileEditor } from './AgentFileEditor'

type AgentFileCardProps = {
  confirmDelete: boolean
  editContent: string
  editingFile: AgentFile | null
  file: AgentFile
  loadingEdit: boolean
  onChangeEditContent: (value: string) => void
  onConfirmDelete: () => void | Promise<void>
  onEditFile: (file: AgentFile) => void | Promise<void>
  onOpenFile: (path: string) => void
  onRequestDelete: () => void
  onResetConfirmDelete: () => void
  onResetEditingFile: () => void
  onSaveFile: () => void | Promise<void>
  saveError: string
  saving: boolean
}

export function AgentFileCard({
  confirmDelete,
  editContent,
  editingFile,
  file,
  loadingEdit,
  onChangeEditContent,
  onConfirmDelete,
  onEditFile,
  onOpenFile,
  onRequestDelete,
  onResetConfirmDelete,
  onResetEditingFile,
  onSaveFile,
  saveError,
  saving,
}: AgentFileCardProps) {
  const { t } = useI18n()
  const isEditing = editingFile?.path === file.path

  return (
    <div className="overflow-hidden rounded-xl border border-claude-border bg-claude-bg">
      <div className="group flex items-center gap-3 p-3">
        <span className="flex-shrink-0 text-base">🤖</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-claude-text">{file.name.replace(/\.md$/, '')}</p>
          <p className="truncate font-mono text-xs text-claude-muted">{file.name}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {confirmDelete ? (
            <>
              <span className="mr-1 text-xs text-red-500">{t('settings.agent.deletePrompt')}</span>
              <button
                onClick={() => void onConfirmDelete()}
                className="rounded-lg bg-red-500 px-2 py-1 text-xs text-white transition-colors hover:bg-red-600"
              >
                {t('common.confirm')}
              </button>
              <button
                onClick={onResetConfirmDelete}
                className="rounded-lg border border-claude-border px-2 py-1 text-xs text-claude-muted transition-colors hover:text-claude-text"
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onRequestDelete}
                className="rounded p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-red-500"
                title={t('common.delete')}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                onClick={() => void onEditFile(file)}
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
                onClick={() => onOpenFile(file.path)}
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
        <AgentFileEditor
          editContent={editContent}
          editingFile={editingFile}
          loadingEdit={loadingEdit}
          onChangeContent={onChangeEditContent}
          onClose={onResetEditingFile}
          onSave={onSaveFile}
          saveError={saveError}
          saving={saving}
        />
      )}
    </div>
  )
}
