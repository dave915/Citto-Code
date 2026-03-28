import { createPortal } from 'react-dom'
import { useI18n } from '../../hooks/useI18n'
import type { AgentPreset, PresetCategory } from '../../lib/teamAgentPresets'
import { AgentPixelIcon } from './AgentPixelIcon'
import type { PresetHoverState } from './teamSetupShared'

function AgentPresetCard({
  preset,
  selected,
  disabled,
  onClick,
  onHoverStart,
  onHoverEnd,
  onDelete,
}: {
  preset: AgentPreset
  selected: boolean
  disabled?: boolean
  onClick: () => void
  onHoverStart: (rect: DOMRect) => void
  onHoverEnd: () => void
  onDelete?: () => void
}) {
  const { t } = useI18n()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (disabled) return
        onClick()
      }}
      onKeyDown={(event) => {
        if (disabled) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      onMouseEnter={(event) => onHoverStart(event.currentTarget.getBoundingClientRect())}
      onMouseMove={(event) => onHoverStart(event.currentTarget.getBoundingClientRect())}
      onMouseLeave={onHoverEnd}
      onFocus={(event) => onHoverStart(event.currentTarget.getBoundingClientRect())}
      onBlur={onHoverEnd}
      aria-disabled={disabled}
      className={`
        relative flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all
        ${selected
          ? 'border-blue-500 bg-blue-500/10'
          : disabled
            ? 'cursor-not-allowed border-claude-border bg-claude-surface opacity-50'
            : 'border-claude-border bg-claude-surface hover:border-claude-border-hover hover:bg-claude-surface-2/45'
        }
      `}
    >
      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete()
          }}
          className="absolute right-2 top-2 rounded-md p-1 text-claude-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
          title={t('team.setup.deletePreset')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {selected && (
        <div className={`absolute top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 ${onDelete ? 'right-9' : 'right-2'}`}>
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
      <div className="shrink-0">
        <AgentPixelIcon type={preset.iconType} size={40} color={preset.color} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-claude-text">{preset.name}</span>
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: preset.color }}
          >
            {preset.role}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-claude-text/80">{preset.description}</p>
      </div>
    </div>
  )
}

export function PresetHoverCard({ hoverState }: { hoverState: PresetHoverState }) {
  const { t } = useI18n()

  if (!hoverState || typeof document === 'undefined') return null

  const width = 360
  const height = 280
  const gap = 12
  const margin = 16
  const { preset, rect } = hoverState
  const placeRight = rect.right + gap + width <= window.innerWidth - margin
  const left = placeRight
    ? rect.right + gap
    : Math.max(margin, rect.left - width - gap)
  const top = Math.min(
    Math.max(margin, rect.top),
    window.innerHeight - height - margin,
  )

  return createPortal(
    <div
      className="pointer-events-none fixed z-[200] w-[360px] rounded-2xl border border-claude-border bg-claude-bg-base/95 p-4 shadow-2xl backdrop-blur"
      style={{ left, top }}
    >
      <div className="mb-3 flex items-start gap-3">
        <AgentPixelIcon type={preset.iconType} size={36} color={preset.color} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-claude-text">{preset.name}</p>
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: preset.color }}
            >
              {preset.role}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-claude-text-muted">
            {preset.description}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-claude-text-muted">
            {t('team.setup.descriptionLabel')}
          </p>
          <div className="rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-xs leading-relaxed text-claude-text">
            {preset.description}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-claude-text-muted">
            {t('team.setup.systemPromptLabel')}
          </p>
          <div className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-xs leading-relaxed text-claude-text">
            {preset.systemPrompt}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

type Props = {
  presetCategories: PresetCategory[]
  customAgentPresets: AgentPreset[]
  agentPresets: AgentPreset[]
  remainingSlots: number
  isCategorySelected: (category: PresetCategory) => boolean
  isPresetSelected: (presetId: string) => boolean
  onApplyCategory: (category: PresetCategory) => void
  onTogglePreset: (preset: AgentPreset) => void
  onHoverStart: (preset: AgentPreset, rect: DOMRect) => void
  onHoverEnd: (presetId: string) => void
  onDeleteCustomPreset: (presetId: string) => void
}

export function TeamSetupSelectionPane({
  presetCategories,
  customAgentPresets,
  agentPresets,
  remainingSlots,
  isCategorySelected,
  isPresetSelected,
  onApplyCategory,
  onTogglePreset,
  onHoverStart,
  onHoverEnd,
  onDeleteCustomPreset,
}: Props) {
  const { t } = useI18n()

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-claude-text">
          {t('team.setup.quickCategories')}
        </p>
        <div className="flex flex-wrap gap-2">
          {presetCategories.map((category) => (
            <button
              key={category.label}
              type="button"
              onClick={() => onApplyCategory(category)}
              disabled={!isCategorySelected(category) && remainingSlots === 0}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
                isCategorySelected(category)
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-claude-border bg-claude-surface/55 text-claude-text hover:border-claude-border-hover hover:bg-claude-surface hover:text-claude-text disabled:cursor-not-allowed disabled:opacity-40'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {customAgentPresets.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-claude-text">
            {t('team.setup.savedCustomAgents', { count: customAgentPresets.length })}
          </p>
          <div className="grid grid-cols-1 gap-2">
            {customAgentPresets.map((preset) => {
              const isSelected = isPresetSelected(preset.presetId)
              return (
                <AgentPresetCard
                  key={preset.presetId}
                  preset={preset}
                  selected={isSelected}
                  disabled={!isSelected && remainingSlots === 0}
                  onClick={() => onTogglePreset(preset)}
                  onHoverStart={(rect) => onHoverStart(preset, rect)}
                  onHoverEnd={() => onHoverEnd(preset.presetId)}
                  onDelete={() => onDeleteCustomPreset(preset.presetId)}
                />
              )
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-claude-text">
          {t('team.setup.defaultAgents', { count: agentPresets.length })}
        </p>
        <div className="grid grid-cols-1 gap-2">
          {agentPresets.map((preset) => {
            const isSelected = isPresetSelected(preset.presetId)
            return (
              <AgentPresetCard
                key={preset.presetId}
                preset={preset}
                selected={isSelected}
                disabled={!isSelected && remainingSlots === 0}
                onClick={() => onTogglePreset(preset)}
                onHoverStart={(rect) => onHoverStart(preset, rect)}
                onHoverEnd={() => onHoverEnd(preset.presetId)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
