import { useEffect, useRef, useState } from 'react'

type AgentStatusCopyButtonProps = {
  text: string
  label: string
  copiedLabel: string
}

export function AgentStatusCopyButton({
  text,
  label,
  copiedLabel,
}: AgentStatusCopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const resetTimeoutRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current)
    }
  }, [])

  if (!text.trim()) return null

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }

      setCopied(true)
      resetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false)
        resetTimeoutRef.current = null
      }, 1200)
    }).catch(() => undefined)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-claude-border/70 bg-claude-surface px-2.5 py-1 text-[11px] text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
    >
      {copied ? copiedLabel : label}
    </button>
  )
}
