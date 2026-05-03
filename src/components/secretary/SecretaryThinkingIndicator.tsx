import { useEffect, useState } from 'react'

import cittoAppIcon from '../../assets/agent-icons/citto-app-icon.png'
import cittoThinkingLaptopGif from '../../assets/mascot/citto-thinking-laptop.gif'

type SecretaryThinkingIndicatorProps = {
  variant?: 'character' | 'dots'
}

export function SecretaryThinkingIndicator({ variant = 'character' }: SecretaryThinkingIndicatorProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  if (variant === 'dots') {
    return (
      <div className="secretary-chat-row secretary-chat-row-assistant">
        <div className="secretary-message-card secretary-message-card-assistant secretary-message-card-pending secretary-thinking-card secretary-thinking-dots-card" aria-label="생각 중" aria-live="polite">
          <span className="secretary-thinking-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="secretary-chat-row secretary-chat-row-assistant">
      <div className="secretary-message-card secretary-message-card-assistant secretary-message-card-pending secretary-thinking-card" aria-live="polite">
        <img
          src={prefersReducedMotion ? cittoAppIcon : cittoThinkingLaptopGif}
          alt=""
          draggable={false}
          className="secretary-thinking-character"
          aria-hidden="true"
        />
        <span>생각 중...</span>
      </div>
    </div>
  )
}
