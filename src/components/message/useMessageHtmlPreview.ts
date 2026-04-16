import { useEffect, useMemo, useState } from 'react'
import type { HtmlPreviewCandidate } from '../../lib/toolcalls/types'

type UseMessageHtmlPreviewOptions = {
  candidate: HtmlPreviewCandidate | null
  hideHtmlPreview: boolean
  showStreamingUi: boolean
}

export function useMessageHtmlPreview({
  candidate,
  hideHtmlPreview,
  showStreamingUi,
}: UseMessageHtmlPreviewOptions) {
  const [htmlPreviewContent, setHtmlPreviewContent] = useState<string | null>(null)
  const [htmlPreviewLoading, setHtmlPreviewLoading] = useState(false)
  const htmlPreviewCandidate = useMemo(() => candidate, [candidate])
  const shouldShowHtmlPreview = Boolean(
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

    if (htmlPreviewCandidate.kind === 'url') {
      setHtmlPreviewContent(null)
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
