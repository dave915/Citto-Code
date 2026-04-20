import { useMemo, type ClipboardEventHandler, type ReactNode } from 'react'
import type { Message } from '../../store/sessions'
import { canOpenAttachmentPath, useAttachmentImageDataUrls } from '../../hooks/useAttachmentImageDataUrls'
import { MessageMarkdown } from './messageMarkdown'

type Props = {
  message: Message
  copyButton: ReactNode
  onMarkdownCopy: ClipboardEventHandler<HTMLDivElement>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function UserMessageBubble({
  message,
  copyButton,
  onMarkdownCopy,
}: Props) {
  const attachedFiles = message.attachedFiles ?? []
  const imageDataUrls = useAttachmentImageDataUrls(attachedFiles)
  const imageAttachments = useMemo(
    () => attachedFiles.filter((file) => file.fileType === 'image' && imageDataUrls[file.path]),
    [attachedFiles, imageDataUrls],
  )
  const fileAttachments = useMemo(
    () => attachedFiles.filter((file) => file.fileType !== 'image' || !imageDataUrls[file.path]),
    [attachedFiles, imageDataUrls],
  )

  return (
    <div className="flex justify-end mb-3">
      <div className="group/message max-w-[78%] flex flex-col gap-2.5 items-end">
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {imageAttachments.map((file) => {
              const dataUrl = imageDataUrls[file.path]
              const isOpenable = canOpenAttachmentPath(file.path)

              return isOpenable ? (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => window.claude.openFile(file.path)}
                  className="overflow-hidden rounded-lg text-left transition-opacity hover:opacity-95"
                  title={file.path}
                >
                  <div className="h-[52px] w-[52px] overflow-hidden rounded-lg border border-claude-border bg-claude-panel">
                    <img
                      src={dataUrl}
                      alt={file.name}
                      className="block h-full w-full object-cover"
                    />
                  </div>
                </button>
              ) : (
                <div
                  key={file.path}
                  className="overflow-hidden rounded-lg"
                  title={file.name}
                >
                  <div className="h-[52px] w-[52px] overflow-hidden rounded-lg border border-claude-border bg-claude-panel">
                    <img
                      src={dataUrl}
                      alt={file.name}
                      className="block h-full w-full object-cover"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {fileAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {fileAttachments.map((file) => {
              const isOpenable = canOpenAttachmentPath(file.path)
              const content = (
                <>
                  <svg className="w-3.5 h-3.5 text-claude-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-claude-text font-medium max-w-[120px] truncate">{file.name}</span>
                  <span className="text-claude-muted">{formatBytes(file.size)}</span>
                </>
              )

              return isOpenable ? (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => window.claude.openFile(file.path)}
                  className="flex items-center gap-1.5 rounded-lg border border-claude-border bg-claude-surface px-3 py-1.5 text-xs text-claude-muted hover:bg-claude-surface-2 transition-colors group"
                  title={file.path}
                >
                  {content}
                </button>
              ) : (
                <div
                  key={file.path}
                  className="flex items-center gap-1.5 rounded-lg border border-claude-border bg-claude-surface px-3 py-1.5 text-xs text-claude-muted"
                  title={file.name}
                >
                  {content}
                </div>
              )
            })}
          </div>
        )}

        {message.text ? (
          <div className="relative">
            <div className="rounded-lg rounded-tr-sm border border-claude-user-bubble-border bg-claude-user-bubble px-3 py-1.5">
              <MessageMarkdown
                text={message.text}
                role="user"
                className="prose max-w-none overflow-x-auto break-words text-left text-[14px] leading-6 [overflow-wrap:anywhere]"
                onCopy={onMarkdownCopy}
              />
            </div>
            <div className="absolute -bottom-9 right-1 z-10">
              {copyButton}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
