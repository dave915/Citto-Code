import { createPortal } from 'react-dom'
import { useI18n } from '../../hooks/useI18n'
import type { AgentPreset, PresetCategory } from '../../lib/teamAgentPresets'
import { AgentPixelIcon } from './AgentPixelIcon'
import { TeamButton, TeamChip, TeamEyebrow, TeamPanel, cx } from './teamDesignSystem'
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
      className={cx(
        'relative flex min-h-[48px] items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
        selected
          ? 'border-claude-orange/40 bg-claude-orange/10'
          : disabled
            ? 'cursor-not-allowed border-claude-border bg-claude-surface opacity-50'
            : 'border-claude-border bg-claude-surface/80 hover:bg-claude-surface-2/45',
      )}
    >
      {onDelete && (
        <TeamButton
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete()
          }}
          className="absolute right-2 top-2"
          size="icon"
          tone="ghost"
          title={t('team.setup.deletePreset')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </TeamButton>
      )}

      {selected && (
        <div className={`absolute top-2 flex h-4 w-4 items-center justify-center rounded-full border border-claude-orange/40 bg-claude-orange ${onDelete ? 'right-10' : 'right-2'}`}>
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
      <div className="shrink-0">
        <AgentPixelIcon type={preset.iconType} size={34} color={preset.color} />
      </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium leading-5 text-claude-text">{preset.name}</span>
            <TeamChip
              className="border-transparent px-1.5 py-0.5 text-[10px] text-white"
              style={{ backgroundColor: preset.color }}
            >
              {preset.role}
            </TeamChip>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-claude-text/75">{preset.description}</p>
        </div>
    </div>
  )
}

export function PresetHoverCard({ hoverState }: { hoverState: PresetHoverState }) {
  const { t } = useI18n()

  if (!hoverState || typeof document === 'undefined') return null

  const width = 340
  const height = 260
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
    <TeamPanel
      className="pointer-events-none fixed z-[200] w-[340px] p-3 shadow-none"
      style={{ left, top }}
    >
      <div className="mb-2.5 flex items-start gap-2.5">
        <AgentPixelIcon type={preset.iconType} size={32} color={preset.color} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold leading-5 text-claude-text">{preset.name}</p>
            <TeamChip
              className="border-transparent px-1.5 py-0.5 text-[10px] text-white"
              style={{ backgroundColor: preset.color }}
            >
              {preset.role}
            </TeamChip>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-claude-muted">
            {preset.description}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        <div>
          <TeamEyebrow className="mb-1">
            {t('team.setup.descriptionLabel')}
          </TeamEyebrow>
          <div className="rounded-md border border-claude-border bg-claude-bg px-2.5 py-1.5 text-[11px] leading-5 text-claude-text">
            {preset.description}
          </div>
        </div>

        <div>
          <TeamEyebrow className="mb-1">
            {t('team.setup.systemPromptLabel')}
          </TeamEyebrow>
          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-claude-border bg-claude-bg px-2.5 py-1.5 text-[11px] leading-5 text-claude-text">
            {preset.systemPrompt}
          </div>
        </div>
      </div>
    </TeamPanel>,
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
    <div className="flex-1 space-y-4 overflow-y-auto p-3">
      <div>
        <TeamEyebrow className="mb-2 text-claude-text">
          {t('team.setup.quickCategories')}
        </TeamEyebrow>
        <div className="flex flex-wrap gap-2">
          {presetCategories.map((category) => (
            <TeamButton
              key={category.label}
              onClick={() => onApplyCategory(category)}
              disabled={!isCategorySelected(category) && remainingSlots === 0}
              tone={isCategorySelected(category) ? 'accent' : 'secondary'}
            >
              {category.label}
            </TeamButton>
          ))}
        </div>
      </div>

      {customAgentPresets.length > 0 && (
        <div>
          <TeamEyebrow className="mb-2 text-claude-text">
            {t('team.setup.savedCustomAgents', { count: customAgentPresets.length })}
          </TeamEyebrow>
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
        <TeamEyebrow className="mb-2 text-claude-text">
          {t('team.setup.defaultAgents', { count: agentPresets.length })}
        </TeamEyebrow>
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
