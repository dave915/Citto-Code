import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { useI18n } from '../hooks/useI18n'
import type { Message } from '../store/sessions'
import { AssistantMessageBubble } from './message/AssistantMessageBubble'
import { normalizeCopiedMarkdownText } from './message/messageMarkdown'
import { UserMessageBubble } from './message/UserMessageBubble'

type Props = {
  message: Message
  isStreaming?: boolean
  onAbort?: () => void
  onAskAboutSelection?: (payload: {
    kind: 'diff' | 'code'
    path: string
    startLine: number
    endLine: number
    code: string
    prompt?: string
  }) => void
  onToggleBtwCard?: (cardId: string) => void
}

export function MessageBubble(props: Props) {
  const { t } = useI18n()
  const {
    message,
    isStreaming,
    onAskAboutSelection,
    onToggleBtwCard,
  } = props
  const [copied, setCopied] = useState(false)
  const copyResetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current)
      }
    }
  }, [])

  const handleMarkdownCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    const selectedText = window.getSelection()?.toString()
    if (!selectedText) return

    const normalizedText = normalizeCopiedMarkdownText(selectedText)
    if (normalizedText === selectedText) return

    event.preventDefault()
    event.clipboardData.setData('text/plain', normalizedText)
  }

  const handleCopyMessage = async () => {
    if (!message.text) return

    const normalizedText = normalizeCopiedMarkdownText(message.text)
    try {
      await navigator.clipboard.writeText(normalizedText)
      setCopied(true)
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current)
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        copyResetTimerRef.current = null
      }, 1400)
    } catch {
      // noop
    }
  }

  const copyButton = message.text ? (
    <button
      type="button"
      onClick={handleCopyMessage}
      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-panel/90 text-claude-muted opacity-0 transition-all hover:bg-claude-surface-2 hover:text-claude-text group-hover/message:opacity-100 focus:outline-none focus-visible:opacity-100"
      title={copied ? t('common.copied') : t('common.copy')}
      aria-label={copied ? t('common.copied') : t('common.copy')}
    >
      {copied ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="9" y="9" width="10" height="10" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 9V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2h2" />
        </svg>
      )}
    </button>
  ) : null

  if (message.role === 'user') {
    return (
      <UserMessageBubble
        message={message}
        copyButton={copyButton}
        onMarkdownCopy={handleMarkdownCopy}
      />
    )
  }

  return (
    <AssistantMessageBubble
      message={message}
      copyButton={copyButton}
      isStreaming={isStreaming}
      onAskAboutSelection={onAskAboutSelection}
      onToggleBtwCard={onToggleBtwCard}
      onMarkdownCopy={handleMarkdownCopy}
    />
  )
}
