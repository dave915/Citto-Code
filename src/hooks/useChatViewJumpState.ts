import { useEffect, useRef, useState } from 'react'
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, lastMessage?.text?.length, lastMessage?.thinking?.length, lastMessage?.toolCalls.length])

  useEffect(() => {
    if (!jumpToMessageId || !jumpToMessageToken) return

    const targetNode = messageRefs.current[jumpToMessageId]
    if (!targetNode) return

    targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(jumpToMessageId)

    if (messageHighlightTimerRef.current != null) {
      window.clearTimeout(messageHighlightTimerRef.current)
    }

    messageHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === jumpToMessageId ? null : current))
      messageHighlightTimerRef.current = null
    }, 2200)
  }, [jumpToMessageId, jumpToMessageToken, messages.length])

  useEffect(() => () => {
    if (messageHighlightTimerRef.current != null) {
      window.clearTimeout(messageHighlightTimerRef.current)
    }
  }, [])

  return {
    bottomRef,
    messageRefs,
    highlightedMessageId,
  }
}
