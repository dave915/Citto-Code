import type { RefObject } from 'react'
import { useI18n } from '../../../hooks/useI18n'
import { AppButton, AppPanel } from '../../ui/appDesignSystem'
import type { Skill, SkillFile } from './useSkillTabState'
import { SkillFilesPanel } from './SkillFilesPanel'

type SkillCardProps = {
  addFileFor: { name: string; dir: string } | null
  confirmDelete: boolean
  creatingFile: boolean
  editContent: string
  editingFile: SkillFile | null
  expanded: boolean
  fileFormError: string
  fileNameRef: RefObject<HTMLInputElement>
  files: SkillFile[]
  loadingEdit: boolean
  newFileName: string
  onChangeEditContent: (value: string) => void
  onChangeNewFileName: (value: string) => void
  onConfirmDelete: () => void | Promise<void>
  onCreateFile: () => void | Promise<void>
  onEditFile: (file: SkillFile) => void | Promise<void>
  onOpenFile: (path: string) => void
  onOpenFolder: () => void
  onImportFiles: (files: FileList | File[]) => void | Promise<void>
  onRequestAddFile: () => void
  onRequestDelete: () => void
  onResetAddFile: () => void
  onResetConfirmDelete: () => void
  onResetEditingFile: () => void
  onSaveFile: () => void | Promise<void>
  onToggleExpand: () => void
  importError: string
  importingFiles: boolean
  saveError: string
  saving: boolean
  skill: Skill
}

export function SkillCard({
  addFileFor,
  confirmDelete,
  creatingFile,
  editContent,
  editingFile,
  expanded,
  fileFormError,
  fileNameRef,
  files,
  loadingEdit,
  newFileName,
  onChangeEditContent,
  onChangeNewFileName,
  onConfirmDelete,
  onCreateFile,
  onEditFile,
  onOpenFile,
  onOpenFolder,
  onImportFiles,
  onRequestAddFile,
  onRequestDelete,
  onResetAddFile,
  onResetConfirmDelete,
  onResetEditingFile,
  onSaveFile,
  onToggleExpand,
  importError,
  importingFiles,
  saveError,
  saving,
  skill,
}: SkillCardProps) {
  const { t } = useI18n()

  return (
    <AppPanel className="overflow-hidden bg-claude-bg shadow-none">
      <div className="flex items-center gap-3 p-3">
        <span className="flex-shrink-0 text-base">⚡</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-claude-text">/{skill.name}</p>
            {skill.legacy && (
              <span className="flex-shrink-0 rounded border border-claude-border bg-claude-panel px-1.5 py-0.5 text-xs text-claude-muted">
                {t('settings.skill.legacy')}
              </span>
            )}
          </div>
          <p className="truncate font-mono text-xs text-claude-muted">
            {skill.legacy ? `commands/${skill.name}` : `skills/${skill.name}/SKILL.md`}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {confirmDelete ? (
            <>
              <span className="mr-1 text-xs text-red-500">{t('settings.skill.deletePrompt')}</span>
              <button
                onClick={() => void onConfirmDelete()}
                className="rounded-md bg-red-500 px-2 py-1 text-xs text-white transition-colors hover:bg-red-600"
              >
                {t('common.confirm')}
              </button>
              <button
                onClick={onResetConfirmDelete}
                className="rounded-md border border-claude-border px-2 py-1 text-xs text-claude-muted transition-colors hover:text-claude-text"
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
                onClick={onOpenFolder}
                className="rounded p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                title={t('settings.skill.openFolder')}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z" />
                </svg>
              </button>
              <button
                onClick={() => onOpenFile(skill.path)}
                className="rounded p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                title={t('common.openInExternalEditor')}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
              <button
                onClick={onToggleExpand}
                className="rounded p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                title={t('common.files')}
              >
                <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <SkillFilesPanel
          addFileFor={addFileFor}
          creatingFile={creatingFile}
          editContent={editContent}
          editingFile={editingFile}
          fileFormError={fileFormError}
          fileNameRef={fileNameRef}
          files={files}
          loadingEdit={loadingEdit}
          newFileName={newFileName}
          onChangeEditContent={onChangeEditContent}
          onChangeNewFileName={onChangeNewFileName}
          onCreateFile={onCreateFile}
          onEditFile={onEditFile}
          onOpenFile={onOpenFile}
          onImportFiles={onImportFiles}
          onRequestAddFile={onRequestAddFile}
          onResetAddFile={onResetAddFile}
          onResetEditingFile={onResetEditingFile}
          onSaveFile={onSaveFile}
          importError={importError}
          importingFiles={importingFiles}
          saveError={saveError}
          saving={saving}
          skill={skill}
        />
      )}
    </AppPanel>
  )
}
