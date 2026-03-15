import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ModelInfo } from '../../../electron/preload'
import type { AppLanguage } from '../../lib/i18n'

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
  const label = current ? current.displayName : (model || (language === 'en' ? 'Default model' : '기본 모델'))

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
  const emptyState = loading
    ? (language === 'en' ? 'Loading models...' : '모델 목록을 불러오는 중...')
    : (language === 'en' ? 'No models are available.' : '선택 가능한 모델이 없습니다.')
  const emptyStateHint = loading
    ? (language === 'en' ? 'Please wait a moment.' : '잠시만 기다려 주세요.')
    : (language === 'en' ? 'If you use Ollama, make sure the Ollama server is running with the app.' : 'Ollama를 쓰는 경우 앱과 함께 Ollama 서버가 실행 중인지 확인하세요.')
  const emptyStateClassName = loading ? 'text-claude-muted' : 'text-amber-200'

  const dropdown = open && dropdownPos && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        right: dropdownPos.right,
        transform: 'translateY(-100%) translateY(-6px)',
        zIndex: 9999,
      }}
      className="w-56 overflow-hidden rounded-2xl border border-claude-border bg-claude-panel"
    >
      <div className="border-b border-claude-border px-3 py-2.5">
        <p className="text-xs font-semibold text-claude-muted uppercase tracking-wide">{language === 'en' ? 'Model selection' : '모델 선택'}</p>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        <button
          onClick={() => { onChange(null); setOpen(false) }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${!model ? 'bg-claude-surface' : 'hover:bg-claude-surface'}`}
        >
          <span className="w-4 text-center text-base">🤖</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-claude-text">{language === 'en' ? 'Default model' : '기본 모델'}</p>
            <p className="text-xs text-claude-muted">{language === 'en' ? 'Claude Code default' : 'Claude Code 기본값'}</p>
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
              <p className={`font-medium ${familyColor(entry.family)}`}>{entry.displayName}</p>
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
    </div>,
    document.body
  )

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        disabled={disabled}
        title={language === 'en' ? 'Choose model' : '모델 선택'}
        className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
          model
            ? `${familyColor(currentFamily)} border border-claude-border bg-claude-surface`
            : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
        }`}
      >
        <svg className="h-3 w-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
        </svg>
        <span>{label}</span>
        <svg className={`h-2.5 w-2.5 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  )
}
