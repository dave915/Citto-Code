import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatViewRightPanel } from '../../../hooks/useChatViewLayout'

export type PanelStackMenuItem = {
  id: ChatViewRightPanel
  label: string
  icon: ReactNode
  active: boolean
  disabled?: boolean
  shortcutLabel?: string
}

type Props = {
  items: PanelStackMenuItem[]
  title: string
  onToggle: (panel: ChatViewRightPanel) => void
}

export function PanelStackMenu({ items, title, onToggle }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const activeCount = useMemo(
    () => items.filter((item) => item.active).length,
    [items],
  )

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (containerRef.current?.contains(target)) return
      setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative no-drag" data-no-drag="true">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-claude-text transition-colors ${
          open || activeCount > 0
            ? 'border-claude-border bg-claude-surface'
            : 'border-transparent bg-transparent text-claude-muted hover:border-claude-border hover:bg-claude-surface hover:text-claude-text'
        }`}
        title={title}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14" />
        </svg>
        <svg className={`h-3.5 w-3.5 text-claude-muted transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="m7 10 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-[10px] border border-claude-border bg-claude-panel p-2 shadow-2xl">
          <div className="space-y-1">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => onToggle(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  item.disabled
                    ? 'cursor-not-allowed text-claude-muted/45'
                    : item.active
                      ? 'bg-claude-surface text-claude-text'
                      : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
                }`}
              >
                <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  item.active
                    ? 'border-claude-text/70 bg-claude-text/10 text-claude-text'
                    : 'border-claude-border text-transparent'
                }`}>
                  <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.25 8.25 6.25 11.25 12.75 4.75" />
                  </svg>
                </span>
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.shortcutLabel ? (
                  <span className="flex-shrink-0 text-[11px] text-claude-muted">{item.shortcutLabel}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
