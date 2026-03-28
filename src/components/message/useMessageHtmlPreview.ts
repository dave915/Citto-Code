import { useEffect, useMemo, useState } from 'react'
import type { Message } from '../../store/sessions'
import { extractHtmlPreviewCandidate } from '../ToolCallBlock'

type UseMessageHtmlPreviewOptions = {
  message: Message
  isActiveHtmlPreviewMessage: boolean
  hideHtmlPreview: boolean
  showStreamingUi: boolean
}

export function useMessageHtmlPreview({
  message,
  isActiveHtmlPreviewMessage,
  hideHtmlPreview,
  showStreamingUi,
}: UseMessageHtmlPreviewOptions) {
  const [htmlPreviewContent, setHtmlPreviewContent] = useState<string | null>(null)
  const [htmlPreviewLoading, setHtmlPreviewLoading] = useState(false)
  const htmlPreviewCandidate = useMemo(
    () => (message.role === 'assistant' ? extractHtmlPreviewCandidate(message.toolCalls) : null),
    [message.role, message.toolCalls],
  )
  const shouldShowHtmlPreview = Boolean(
    isActiveHtmlPreviewMessage &&
    !hideHtmlPreview &&
    !showStreamingUi &&
    htmlPreviewCandidate,
  )

  useEffect(() => {
    if (!shouldShowHtmlPreview || !htmlPreviewCandidate) {
      setHtmlPreviewContent(null)
      setHtmlPreviewLoading(false)
      return
    }

    if (!htmlPreviewCandidate.path) {
      setHtmlPreviewContent(htmlPreviewCandidate.fallbackContent ?? null)
      setHtmlPreviewLoading(false)
      return
    }

    let cancelled = false
    setHtmlPreviewContent(null)
    setHtmlPreviewLoading(true)

    window.claude.readFile(htmlPreviewCandidate.path)
      .then((file) => {
        if (cancelled) return
        if (file?.content?.trim()) {
          setHtmlPreviewContent(file.content)
          return
        }

        setHtmlPreviewContent(htmlPreviewCandidate.fallbackContent ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          setHtmlPreviewContent(htmlPreviewCandidate.fallbackContent ?? null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHtmlPreviewLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [htmlPreviewCandidate, shouldShowHtmlPreview])

  return {
    htmlPreviewCandidate,
    htmlPreviewContent,
    htmlPreviewLoading,
    shouldShowHtmlPreview,
  }
}
