import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ModelInfo } from '../../../electron/preload'

type Props = {
  model: string | null
  appModel: string | null
  models: ModelInfo[]
  loading: boolean
  onChange: (model: string | null) => void
}

type DropdownPosition = {
  top: number
  right: number
  placement: 'above' | 'below'
}

function getModelLabel(model: string | null, appModel: string | null, models: ModelInfo[]) {
  const effectiveModel = model ?? appModel
  if (!effectiveModel) return '앱 기본'
  const found = models.find((entry) => entry.id === effectiveModel)
  return found?.displayName ?? effectiveModel
}

function getFamily(model: string | null, models: ModelInfo[]) {
  const found = models.find((entry) => entry.id === model)
  if (found?.family) return found.family
  if (!model) return 'default'
  const lowered = model.toLowerCase()
  if (lowered.includes('opus')) return 'opus'
  if (lowered.includes('haiku')) return 'haiku'
  if (lowered.includes('sonnet')) return 'sonnet'
  return 'model'
}

export function SecretaryModelPicker({
  model,
  appModel,
  models,
  loading,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<DropdownPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        buttonRef.current
        && !buttonRef.current.contains(event.target as Node)
        && dropdownRef.current
        && !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownHeight = 272
      const aboveSpace = rect.top
      const belowSpace = window.innerHeight - rect.bottom
      setPosition({
        top: belowSpace > aboveSpace || aboveSpace < dropdownHeight + 12 ? rect.bottom + 6 : rect.top - 6,
        right: Math.max(8, window.innerWidth - rect.right),
        placement: belowSpace > aboveSpace || aboveSpace < dropdownHeight + 12 ? 'below' : 'above',
      })
    }
    setOpen((value) => !value)
  }

  const effectiveModel = model ?? appModel
  const label = getModelLabel(model, appModel, models)
  const family = getFamily(effectiveModel, models)
  const currentModels = appModel && !models.some((entry) => entry.id === appModel)
    ? [{ id: appModel, displayName: appModel, family: getFamily(appModel, []), provider: 'custom' as const, isLocal: false }, ...models]
    : models

  const dropdown = open && position && createPortal(
    <div
      ref={dropdownRef}
      className="secretary-model-menu"
      style={{
        position: 'fixed',
        top: position.top,
        right: position.right,
        transform: position.placement === 'above' ? 'translateY(-100%)' : undefined,
        zIndex: 9999,
      }}
    >
      <div className="secretary-model-menu-header">씨토 모델</div>
      <button
        type="button"
        className={`secretary-model-option ${model === null ? 'active' : ''}`}
        onClick={() => {
          onChange(null)
          setOpen(false)
        }}
      >
        <span>앱 기본</span>
        <small>{appModel ?? 'Claude 기본값'}</small>
      </button>
      {currentModels.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`secretary-model-option ${model === entry.id ? 'active' : ''}`}
          onClick={() => {
            onChange(entry.id)
            setOpen(false)
          }}
        >
          <span>{entry.displayName}</span>
          <small>{entry.id}</small>
        </button>
      ))}
      {currentModels.length === 0 && (
        <div className="secretary-model-empty">
          {loading ? '모델을 불러오는 중' : '모델 목록 없음'}
        </div>
      )}
    </div>,
    document.body,
  )

  return (
    <div className="secretary-model-picker no-drag">
      <button
        ref={buttonRef}
        type="button"
        className={`secretary-model-trigger secretary-model-trigger-${family}`}
        onClick={handleToggle}
        title="씨토 모델 선택"
      >
        <span>{label}</span>
        <svg className={open ? 'open' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {dropdown}
    </div>
  )
}
