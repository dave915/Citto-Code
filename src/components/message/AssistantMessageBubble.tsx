import { useEffect, useState, type ClipboardEventHandler, type ReactNode } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { Message } from '../../store/sessions'
import { BtwCardStack } from '../input/BtwCardStack'
import { ToolTimeline } from '../ToolCallBlock'
import { MessageMarkdown } from './messageMarkdown'

type Props = {
  message: Message
  copyButton: ReactNode
  isStreaming?: boolean
  onAskAboutSelection?: (payload: {
    kind: 'diff' | 'code'
    path: string
    startLine: number
    endLine: number
    code: string
    prompt?: string
  }) => void
  onToggleBtwCard?: (cardId: string) => void
  onMarkdownCopy: ClipboardEventHandler<HTMLDivElement>
}

function ThinkingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 18h6m-5 3h4m-6.25-6.5A7 7 0 1119 9c0 2.18-.98 3.47-2.08 4.49-.89.83-1.42 1.48-1.64 2.01a.75.75 0 01-.69.5h-4.18a.75.75 0 01-.69-.5c-.22-.53-.75-1.18-1.64-2.01C5.98 12.47 5 11.18 5 9a7 7 0 014.75 6.5z"
      />
    </svg>
  )
}

function ThinkingDots({ muted = false }: { muted?: boolean }) {
  const dotClassName = muted ? 'bg-claude-muted/70' : 'bg-claude-text/85'

  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClassName} animate-bounce`} style={{ animationDelay: '0ms' }} />
      <span className={`h-1.5 w-1.5 rounded-full ${dotClassName} animate-bounce`} style={{ animationDelay: '150ms' }} />
      <span className={`h-1.5 w-1.5 rounded-full ${dotClassName} animate-bounce`} style={{ animationDelay: '300ms' }} />
    </div>
  )
}

export function AssistantMessageBubble({
  message,
  copyButton,
  isStreaming,
  onAskAboutSelection,
  onToggleBtwCard,
  onMarkdownCopy,
}: Props) {
  const { t } = useI18n()
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const showStreamingUi = Boolean(isStreaming)
  const hasThinking = Boolean(message.thinking?.trim())
  const hasBtwCards = Boolean(message.btwCards?.length)
  const showThinkingRow = hasThinking || showStreamingUi
  const showThinkingPanel = hasThinking && thinkingOpen

  useEffect(() => {
    if (showStreamingUi) {
      setThinkingOpen(true)
      return
    }

    setThinkingOpen(false)
  }, [showStreamingUi])

  return (
    <div className="flex justify-start mb-2.5">
      <div className="group/message w-full">
        {message.toolCalls.length > 0 && (
          <div className="max-w-[88%]">
            <ToolTimeline toolCalls={message.toolCalls} onAskAboutSelection={onAskAboutSelection} />
          </div>
        )}

        {(message.text || hasThinking || showStreamingUi) && (
          <div className="relative inline-block max-w-[88%] px-0.5 py-1 align-top">
            {showThinkingRow ? (
              <div className="mb-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!hasThinking) return
                    setThinkingOpen((value) => !value)
                  }}
                  className={`flex items-center gap-1.5 text-left text-[12px] leading-5 text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 ${hasThinking ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <svg className={`h-3 w-3 transition-transform ${showThinkingPanel ? 'rotate-90' : 'rotate-0'} ${hasThinking ? 'opacity-100' : 'opacity-35'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                  </svg>
                  <ThinkingIcon className="h-3.5 w-3.5 text-claude-muted/90" />
                  <span>{showStreamingUi ? t('chat.message.thinkingStreaming') : t('chat.message.thinking')}</span>
                </button>

                {showThinkingPanel ? (
                  <div className="ml-[10px] border-l border-claude-border/70 pl-3">
                    <MessageMarkdown
                      text={message.thinking ?? ''}
                      role="assistant"
                      className="prose max-h-64 max-w-none overflow-x-auto overflow-y-auto break-words pr-2 text-[13px] leading-7 text-claude-muted/90 [overflow-wrap:anywhere] [&_*]:text-inherit [&_li::marker]:text-claude-muted/55 [&_ol]:my-0 [&_ol]:space-y-2.5 [&_ol]:pl-5 [&_p]:my-0 [&_ul]:my-0 [&_ul]:space-y-2.5 [&_ul]:pl-5"
                      onCopy={onMarkdownCopy}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {message.text ? (
              <MessageMarkdown
                text={message.text}
                role="assistant"
                className="prose max-w-none overflow-x-auto break-words text-[14px] leading-6 [overflow-wrap:anywhere]"
                onCopy={onMarkdownCopy}
              />
            ) : null}

            {showStreamingUi ? (
              <div className={`${showThinkingRow || message.text ? 'mt-2' : ''} flex items-center gap-1 py-1`}>
                <ThinkingDots muted />
              </div>
            ) : null}
            <div className="absolute -bottom-7 left-0 z-10">
              {copyButton}
            </div>
          </div>
        )}

        {hasBtwCards && onToggleBtwCard ? (
          <BtwCardStack
            cards={message.btwCards ?? []}
            onToggle={onToggleBtwCard}
            className={(message.text || hasThinking || showStreamingUi || message.toolCalls.length > 0) ? 'mt-2 max-w-[88%]' : 'max-w-[88%]'}
          />
        ) : null}
      </div>
    </div>
  )
}
