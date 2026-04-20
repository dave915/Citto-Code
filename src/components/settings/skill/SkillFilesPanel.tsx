import { useRef, useState, type RefObject } from 'react'
import { useI18n } from '../../../hooks/useI18n'
import { AppButton, appFieldClassName } from '../../ui/appDesignSystem'
import type { Skill, SkillFile } from './useSkillTabState'
import { SkillFileEditor } from './SkillFileEditor'

type SkillFilesPanelProps = {
  addFileFor: { name: string; dir: string } | null
  creatingFile: boolean
  editContent: string
  editingFile: SkillFile | null
  fileFormError: string
  fileNameRef: RefObject<HTMLInputElement>
  files: SkillFile[]
  loadingEdit: boolean
  newFileName: string
  onChangeEditContent: (value: string) => void
  onChangeNewFileName: (value: string) => void
  onCreateFile: () => void | Promise<void>
  onEditFile: (file: SkillFile) => void | Promise<void>
  onOpenFile: (path: string) => void
  onImportFiles: (files: FileList | File[]) => void | Promise<void>
  onRequestAddFile: () => void
  onResetAddFile: () => void
  onResetEditingFile: () => void
  onSaveFile: () => void | Promise<void>
  importError: string
  importingFiles: boolean
  saveError: string
  saving: boolean
  skill: Skill
}

export function SkillFilesPanel({
  addFileFor,
  creatingFile,
  editContent,
  editingFile,
  fileFormError,
  fileNameRef,
  files,
  loadingEdit,
  newFileName,
  onChangeEditContent,
  onChangeNewFileName,
  onCreateFile,
  onEditFile,
  onOpenFile,
  onImportFiles,
  onRequestAddFile,
  onResetAddFile,
  onResetEditingFile,
  onSaveFile,
  importError,
  importingFiles,
  saveError,
  saving,
  skill,
}: SkillFilesPanelProps) {
  const { t } = useI18n()
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="border-t border-claude-border bg-claude-panel">
      <div className="px-4 py-2">
        {files.length === 0 ? (
          <p className="py-1 text-xs text-claude-muted">{t('common.noFiles')}</p>
        ) : (
          <div className="space-y-0.5">
            {files.map((file) => {
              const isEditing = editingFile?.path === file.path

              return (
                <div
                  key={file.path}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                    isEditing ? 'bg-claude-surface' : 'hover:bg-claude-bg'
                  }`}
                >
                  <svg className="h-3 w-3 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className={`flex-1 truncate text-xs font-mono ${isEditing ? 'font-semibold text-claude-text' : 'text-claude-text'}`}>
                    {file.name}
                  </span>
                  <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => void onEditFile(file)}
                      className="rounded p-1 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                      title={t('common.editInApp')}
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onOpenFile(file.path)}
                      className="rounded p-1 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                      title={t('common.openInExternalEditor')}
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editingFile ? (
        <SkillFileEditor
          editContent={editContent}
          editingFile={editingFile}
          loadingEdit={loadingEdit}
          onChangeContent={onChangeEditContent}
          onClose={onResetEditingFile}
          onSave={onSaveFile}
          saveError={saveError}
          saving={saving}
        />
      ) : (
        <div className="border-t border-claude-border/40 px-4 pb-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              if (!event.target.files) return
              void onImportFiles(event.target.files)
              event.currentTarget.value = ''
            }}
          />
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragOver(false)
              void onImportFiles(event.dataTransfer.files)
            }}
            className={`mt-3 rounded-lg border border-dashed px-3 py-3 transition-colors ${
              isDragOver ? 'border-claude-text/50 bg-claude-bg' : 'border-claude-border bg-claude-bg/60'
            }`}
          >
            <p className="text-xs font-medium text-claude-text">{t('settings.skill.importFiles')}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-claude-muted">{t('settings.skill.importHint')}</p>
            <AppButton
              onClick={() => fileInputRef.current?.click()}
              className="mt-2"
            >
              {importingFiles ? t('common.loading') : t('settings.skill.importFiles')}
            </AppButton>
            {importError && <p className="mt-2 text-xs text-red-400">{importError}</p>}
          </div>

          {addFileFor?.name === skill.name ? (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-claude-text">{t('settings.skill.addFile')}</p>
              <input
                ref={fileNameRef}
                value={newFileName}
                onChange={(event) => onChangeNewFileName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void onCreateFile()}
                placeholder={t('settings.skill.filePlaceholder')}
                className={`${appFieldClassName} font-mono text-xs`}
              />
              {fileFormError && <p className="text-xs text-red-500">{fileFormError}</p>}
              <div className="flex gap-2">
                <AppButton
                  onClick={() => void onCreateFile()}
                  disabled={creatingFile}
                >
                  {creatingFile ? t('common.creating') : t('common.create')}
                </AppButton>
                <AppButton
                  onClick={onResetAddFile}
                  tone="ghost"
                >
                  {t('common.cancel')}
                </AppButton>
              </div>
            </div>
          ) : (
            <button
              onClick={onRequestAddFile}
              className="mt-2 flex items-center gap-1 text-xs text-claude-muted transition-colors hover:text-claude-text"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t('settings.skill.addFile')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
