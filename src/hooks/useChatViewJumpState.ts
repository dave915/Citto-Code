import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '../store/sessions'

type Params = {
  messages: Message[]
  jumpToMessageId?: string | null
  jumpToMessageToken?: number
}

export function useChatViewJumpState({
  messages,
  jumpToMessageId,
  jumpToMessageToken,
}: Params) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const messageHighlightTimerRef = useRef<number | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const lastMessage = messages[messages.length - 1]

  const focusMessageById = useCallback((messageId: string) => {
    const targetNode = messageRefs.current[messageId]
    if (!targetNode) return false

    targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(messageId)

    if (messageHighlightTimerRef.current != null) {
      window.clearTimeout(messageHighlightTimerRef.current)
    }

    messageHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current))
      messageHighlightTimerRef.current = null
    }, 2200)

    return true
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, lastMessage?.text?.length, lastMessage?.thinking?.length, lastMessage?.toolCalls.length])

  useEffect(() => {
    if (!jumpToMessageId || !jumpToMessageToken) return
    focusMessageById(jumpToMessageId)
  }, [focusMessageById, jumpToMessageId, jumpToMessageToken, messages.length])

  useEffect(() => () => {
    if (messageHighlightTimerRef.current != null) {
      window.clearTimeout(messageHighlightTimerRef.current)
    }
  }, [])

  return {
    bottomRef,
    focusMessageById,
    messageRefs,
    highlightedMessageId,
  }
}
