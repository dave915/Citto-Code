import type { MutableRefObject } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { Message, Session } from '../../store/sessions'
import { MessageBubble } from '../MessageBubble'
import { WelcomeScreen } from './WelcomeScreen'

type Props = {
  session: Session
  isNewSession: boolean
  fileConflict?: {
    paths: string[]
    sessionNames: string[]
  } | null
  fileConflictLabel: string | null
  conflictSessionLabel: string
  highlightedMessageId: string | null
  activeHtmlPreviewMessageId: string | null
  hideHtmlPreview: boolean
  showErrorCard: boolean
  messageRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
  bottomRef: MutableRefObject<HTMLDivElement | null>
  onSend: (text: string, files: []) => void
  onAbort: () => void
  onAskAboutSelection: (payload: {
    kind: 'diff' | 'code'
    path: string
    startLine: number
    endLine: number
    code: string
    prompt?: string
  }) => void
}

function MessageList({
  messages,
  messageRefs,
  highlightedMessageId,
  activeHtmlPreviewMessageId,
  hideHtmlPreview,
  isStreaming,
  currentAssistantMsgId,
  onAbort,
  onAskAboutSelection,
}: {
  messages: Message[]
  messageRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
  highlightedMessageId: string | null
  activeHtmlPreviewMessageId: string | null
  hideHtmlPreview: boolean
  isStreaming: boolean
  currentAssistantMsgId: string | null
  onAbort: () => void
  onAskAboutSelection: Props['onAskAboutSelection']
}) {
  return messages.map((message) => (
    <div
      key={message.id}
      ref={(node) => {
        if (node) {
          messageRefs.current[message.id] = node
          return
        }
        delete messageRefs.current[message.id]
      }}
      className={`-mx-2 rounded-[26px] px-2 py-1 transition-all ${
        highlightedMessageId === message.id
          ? 'bg-amber-500/10 ring-1 ring-amber-300/35'
          : 'bg-transparent ring-1 ring-transparent'
      }`}
    >
      <MessageBubble
        message={message}
        isActiveHtmlPreviewMessage={message.id === activeHtmlPreviewMessageId}
        hideHtmlPreview={hideHtmlPreview}
        isStreaming={isStreaming && message.id === currentAssistantMsgId}
        onAbort={isStreaming && message.id === currentAssistantMsgId ? onAbort : undefined}
        onAskAboutSelection={onAskAboutSelection}
      />
    </div>
  ))
}

export function ChatMessagePane({
  session,
  isNewSession,
  fileConflict,
  fileConflictLabel,
  conflictSessionLabel,
  highlightedMessageId,
  activeHtmlPreviewMessageId,
  hideHtmlPreview,
  showErrorCard,
  messageRefs,
  bottomRef,
  onSend,
  onAbort,
  onAskAboutSelection,
}: Props) {
  const { language } = useI18n()
  return (
    <div
      className="relative z-0 min-w-0 flex-1 overflow-y-auto px-6 py-7"
      style={{ background: 'linear-gradient(180deg, rgb(var(--claude-chat-bg) / 0.985) 0%, rgb(var(--claude-chat-bg)) 100%)' }}
    >
      <div className={`mx-auto w-full max-w-[860px] ${isNewSession ? 'min-h-full' : ''}`}>
        {fileConflict && fileConflictLabel && (
          <div className="chat-danger-banner mb-4 rounded-2xl px-4 py-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="chat-danger-icon mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-xl">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="chat-danger-title font-medium">{language === 'en' ? 'The same file is being edited in another session.' : '같은 파일을 다른 세션에서도 수정 중입니다.'}</p>
                <p className="chat-danger-description mt-1 text-[13px] leading-5">
                  {fileConflictLabel} · {conflictSessionLabel}
                </p>
              </div>
            </div>
          </div>
        )}

        {isNewSession ? (
          <WelcomeScreen onStartPrompt={(prompt) => onSend(prompt, [])} />
        ) : (
          <MessageList
            messages={session.messages}
            messageRefs={messageRefs}
            highlightedMessageId={highlightedMessageId}
            activeHtmlPreviewMessageId={activeHtmlPreviewMessageId}
            hideHtmlPreview={hideHtmlPreview}
            isStreaming={session.isStreaming}
            currentAssistantMsgId={session.currentAssistantMsgId}
            onAbort={onAbort}
            onAskAboutSelection={onAskAboutSelection}
          />
        )}

        {showErrorCard && (
          <div className="mb-4 flex justify-start">
            <div className="flex max-w-[88%] gap-3.5">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-claude-border bg-claude-surface text-[11px] font-semibold text-claude-text">
                C
              </div>
              <div className="chat-error-card rounded-[22px] rounded-tl-md px-4 py-3.5">
                <div className="chat-error-card-title mb-1 flex items-center gap-2 font-medium">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {language === 'en' ? 'Error' : '오류 발생'}
                </div>
                <p className="chat-error-card-message whitespace-pre-wrap font-mono text-xs">{session.error}</p>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
