import type { ReactNode } from 'react'

type Props = {
  active: boolean
  title: string
  onClick: () => void
  children: ReactNode
}

export function HeaderToggleButton({ active, title, onClick, children }: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center rounded-md px-2.5 py-2 text-xs transition-colors ${
        active
          ? 'bg-claude-surface text-claude-text'
          : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
      }`}
      title={title}
    >
      {children}
    </button>
  )
}
