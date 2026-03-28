import { createPortal } from 'react-dom'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

const COPY_FEEDBACK_RESET_MS = 1400

export function useCopyFeedback(copyText: string | null | undefined) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return

    const timeoutId = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_RESET_MS)
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  const copy = useCallback(() => {
    const nextText = copyText?.trim()
    if (!nextText) return

    void navigator.clipboard.writeText(nextText).then(() => {
      setCopied(true)
    })
  }, [copyText])

  return { copied, copy }
}

export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => window.removeEventListener('keydown', handleKeyDownCapture, true)
  }, [onClose])
}

type TeamOverlayPortalProps = {
  backdropClassName: string
  children: ReactNode
  closeLabel: string
  onClose: () => void
  overlayClassName: string
}

export function TeamOverlayPortal({
  backdropClassName,
  children,
  closeLabel,
  onClose,
  overlayClassName,
}: TeamOverlayPortalProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={`fixed inset-0 flex items-center justify-center p-6 ${overlayClassName}`}>
      <button
        type="button"
        onClick={onClose}
        className={`absolute inset-0 ${backdropClassName}`}
        aria-label={closeLabel}
      />
      {children}
    </div>,
    document.body,
  )
}
