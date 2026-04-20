import { buildAttachmentCopyText } from '../../lib/attachmentPrompts'
import { translate, type AppLanguage } from '../../lib/i18n'
import type { AttachedFile } from '../../store/sessionTypes'
import { formatBytes } from '../input/inputUtils'
import { TeamOverlayPortal, useCopyFeedback, useEscapeToClose } from './teamOverlayShared'

type Props = {
  task?: string
  attachedFiles: AttachedFile[]
  language: AppLanguage
  onClose: () => void
}

export function TeamTaskPopover({ task, attachedFiles, language, onClose }: Props) {
  const copyText = buildAttachmentCopyText(task ?? '', attachedFiles, language)
  const { copied, copy } = useCopyFeedback(copyText)
  const copyLabel = copied ? translate(language, 'common.copied') : translate(language, 'common.copy')
  const closeLabel = translate(language, 'team.taskPopover.close')

  useEscapeToClose(onClose)

  if (!task?.trim() && attachedFiles.length === 0) return null

  return (
    <TeamOverlayPortal
      backdropClassName="bg-black/30 backdrop-blur-[1px]"
      closeLabel={closeLabel}
      onClose={onClose}
      overlayClassName="z-[140]"
    >
      <div className="relative z-10 flex max-h-[min(76vh,48rem)] w-[min(44rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-lg border-2 border-[#96a3b0] bg-[linear-gradient(180deg,#ffffff,#edf2f6)] shadow-[0_18px_42px_rgba(38,52,68,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#d3dbe3] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#607080]">
              {translate(language, 'team.taskPopover.title')}
            </p>
            <p className="mt-1 text-xs text-[#6f8090]">
              {translate(language, 'team.taskPopover.description')}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-[#607080] transition-colors hover:bg-[#dfe7ef] hover:text-[#41515e]"
            aria-label={closeLabel}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="group/task relative min-h-0 flex-1 overflow-hidden">
          <button
            type="button"
            onClick={copy}
            className="invisible absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-[#c8d2dc] bg-white/95 text-[#41515e] opacity-0 shadow-sm transition-all hover:bg-[#f4f7fa] group-hover/task:visible group-hover/task:opacity-100 group-focus-within/task:visible group-focus-within/task:opacity-100"
            title={copyLabel}
            aria-label={copyLabel}
          >
            {copied ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <rect x="9" y="9" width="10" height="10" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 9V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2h2" />
              </svg>
            )}
          </button>

          <div className="h-full overflow-y-auto px-5 py-4">
            {attachedFiles.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-1.5 rounded-lg border border-[#c8d2dc] bg-white/85 px-3 py-1.5 text-xs text-[#41515e]"
                  >
                    <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#607080]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="max-w-[240px] truncate font-medium">{file.name}</span>
                    <span className="text-[#6f8090]">{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            )}

            {task?.trim() ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#41515e]">
                {task}
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-[#6f8090]">
                {translate(language, 'team.taskPopover.filesOnly')}
              </p>
            )}
          </div>
        </div>
      </div>
    </TeamOverlayPortal>
  )
}
