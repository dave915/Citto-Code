import type { SelectedFile } from '../../../electron/preload'

import { translate, type AppLanguage } from '../../lib/i18n'
import { formatBytes } from './inputUtils'

export function AttachmentList({
  attachedFiles,
  skippedFiles,
  language,
  onRemoveFile,
}: {
  attachedFiles: SelectedFile[]
  skippedFiles: Array<{ name: string; reason: string }>
  language: AppLanguage
  onRemoveFile: (path: string) => void
}) {
  return (
    <>
      {attachedFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {attachedFiles.map((file) => (
            <div key={file.path} className="flex items-center gap-1.5 rounded-xl border border-claude-border bg-claude-surface px-3 py-1.5 text-xs">
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="max-w-[120px] truncate font-medium text-claude-text">{file.name}</span>
              <span className="text-claude-muted">{formatBytes(file.size)}</span>
              <button
                type="button"
                onClick={() => onRemoveFile(file.path)}
                className="ml-0.5 text-claude-muted transition-colors hover:text-red-500"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {skippedFiles.length > 0 && (
        <div className="mb-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          <span className="font-medium">{translate(language, 'input.attachment.skippedFiles', { count: skippedFiles.length })}</span>
          <ul className="mt-1 space-y-0.5">
            {skippedFiles.map((file) => (
              <li key={file.name} className="flex gap-1.5">
                <span className="max-w-[180px] truncate font-medium">{file.name}</span>
                <span className="text-yellow-600/70 dark:text-yellow-500/70">- {file.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
