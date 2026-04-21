import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ModelInfo } from '../../../electron/preload'
import { translate, type AppLanguage } from '../../lib/i18n'
import { AppChip, AppPanel, cx } from '../ui/appDesignSystem'

export function ModelPicker({
  model,
  models,
  loading,
  language,
  onChange,
  disabled,
}: {
  model: string | null
  models: ModelInfo[]
  loading: boolean
  language: AppLanguage
  onChange: (model: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.top, right: window.innerWidth - rect.right })
    }
    setOpen((value) => !value)
  }

  const current = models.find((entry) => entry.id === model)
  const label = current ? current.displayName : (model || translate(language, 'input.modelPicker.defaultModel'))

  const familyColor = (family: string) => {
    if (family === 'opus') return 'text-violet-300'
    if (family === 'haiku') return 'text-emerald-300'
    if (family === 'sonnet') return 'text-sky-300'
    if (family === 'llama') return 'text-orange-300'
    if (family === 'qwen') return 'text-amber-300'
    if (family === 'deepseek') return 'text-cyan-300'
    if (family === 'gemma') return 'text-rose-300'
    if (family === 'mistral') return 'text-fuchsia-300'
    if (family === 'phi') return 'text-lime-300'
    return 'text-amber-200'
  }

  const familyBadge = (family: string) => {
    const first = family.trim().charAt(0)
    return first ? first.toUpperCase() : 'M'
  }

  const currentFamily = current?.family ?? (model ? model.toLowerCase() : 'sonnet')
  const currentIsLocal = current?.isLocal ?? false
  const emptyState = loading
    ? translate(language, 'input.modelPicker.loading')
    : translate(language, 'input.modelPicker.noModels')
  const emptyStateHint = loading
    ? translate(language, 'input.modelPicker.waitHint')
    : translate(language, 'input.modelPicker.ollamaHint')
  const emptyStateClassName = loading ? 'text-claude-muted' : 'text-amber-200'

  const dropdown = open && dropdownPos && createPortal(
    <AppPanel
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        right: dropdownPos.right,
        transform: 'translateY(-100%) translateY(-6px)',
        zIndex: 9999,
      }}
      className="w-56 overflow-hidden rounded-lg p-0 shadow-none"
    >
      <div className="border-b border-claude-border px-3 py-2.5">
        <p className="text-xs font-semibold text-claude-muted uppercase tracking-wide">{translate(language, 'input.modelPicker.selection')}</p>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        <button
          onClick={() => { onChange(null); setOpen(false) }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${!model ? 'bg-claude-surface' : 'hover:bg-claude-surface'}`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-claude-border bg-claude-bg text-claude-muted">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="7" y="8" width="10" height="9" rx="2" />
              <path strokeLinecap="round" d="M12 5v3M10 12h.01M14 12h.01M10 15h4" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-claude-text">{translate(language, 'input.modelPicker.defaultModel')}</p>
            <p className="text-xs text-claude-muted">{translate(language, 'input.modelPicker.claudeDefault')}</p>
          </div>
          {!model && <svg className="h-3.5 w-3.5 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </button>

        {models.length > 0 && <div className="mx-3 my-1 border-t border-claude-border/60" />}

        {models.map((entry) => (
          <button
            key={entry.id}
            onClick={() => { onChange(entry.id); setOpen(false) }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${model === entry.id ? 'bg-claude-surface' : 'hover:bg-claude-surface'}`}
          >
            <span className={`w-4 text-center text-sm font-bold ${familyColor(entry.family)}`}>
              {familyBadge(entry.family)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={`font-medium ${familyColor(entry.family)}`}>{entry.displayName}</p>
                {entry.isLocal && (
                  <AppChip className="px-1.5 py-0.5 text-[10px]" tone="accent">
                    LOCAL
                  </AppChip>
                )}
              </div>
              <p className="truncate text-xs text-claude-muted">{entry.id}</p>
            </div>
            {model === entry.id && <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </button>
        ))}

        {models.length === 0 && (
          <div className={`px-3 py-3 text-center text-xs ${emptyStateClassName}`}>
            <p>{emptyState}</p>
            <p className="mt-1 text-[11px] text-claude-muted">{emptyStateHint}</p>
          </div>
        )}
      </div>
    </AppPanel>,
    document.body
  )

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        disabled={disabled}
        title={translate(language, 'input.modelPicker.choose')}
        className={cx(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
          model
            ? `${familyColor(currentFamily)} border ${currentIsLocal ? 'border-orange-500/45 bg-orange-500/10' : 'border-claude-border bg-claude-surface'}`
            : 'border-transparent text-claude-muted hover:border-claude-border/70 hover:bg-claude-surface hover:text-claude-text',
        )}
      >
        <svg className="h-3 w-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
        </svg>
        <span>{label}</span>
        {currentIsLocal && (
          <AppChip className="px-1.5 py-0.5 text-[10px]" tone="accent">
            LOCAL
          </AppChip>
        )}
        <svg className={`h-2.5 w-2.5 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  )
}
