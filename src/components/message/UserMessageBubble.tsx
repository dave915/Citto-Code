import type { ClipboardEventHandler, ReactNode } from 'react'
import type { Message } from '../../store/sessions'
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
  return (
    <div className="flex justify-end mb-3">
      <div className="group/message max-w-[78%] flex flex-col gap-2.5 items-end">
        {message.attachedFiles && message.attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {message.attachedFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => window.claude.openFile(file.path)}
                className="flex items-center gap-1.5 rounded-xl border border-claude-border bg-claude-surface px-3 py-1.5 text-xs text-claude-muted hover:bg-claude-surface-2 transition-colors group"
                title={file.path}
              >
                <svg className="w-3.5 h-3.5 text-claude-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-claude-text font-medium max-w-[120px] truncate">{file.name}</span>
                <span className="text-claude-muted">{formatBytes(file.size)}</span>
              </button>
            ))}
          </div>
        )}

        {message.text ? (
          <div className="relative">
            <div className="rounded-[18px] rounded-tr-md border border-claude-user-bubble-border bg-claude-user-bubble px-3 py-1.5">
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
