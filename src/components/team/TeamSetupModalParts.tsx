import { nanoid } from 'nanoid'
import { createPortal } from 'react-dom'
import { useI18n } from '../../hooks/useI18n'
import type { AppLanguage } from '../../lib/i18n'
import {
  buildCustomAgentSystemPrompt,
  getCustomAgentTag,
  getDefaultCustomAgentRole,
  normalizeCustomAgentColor,
  resolveAgentColor,
  resolveTeamAgentStrings,
  type AgentPreset,
  type PresetCategory,
} from '../../lib/teamAgentPresets'
import { AgentPixelIcon, type AgentIconType } from './AgentPixelIcon'

export type TeamSetupSelectedAgent = {
  id: string
  presetId: string | null
  name: string
  role: string
  description: string
  color: string
  iconType: AgentIconType
  isCustom: boolean
  systemPrompt: string
}

export type TeamSetupCustomDraft = {
  name: string
  role: string
  description: string
  color: string
  systemPrompt: string
}

export type PresetHoverState = {
  preset: AgentPreset
  rect: DOMRect
} | null

export const CUSTOM_AGENT_PRESETS_STORAGE_KEY = 'agent-team-custom-presets-v1'
export const MAX_TEAM_AGENTS = 8

export const COLOR_PALETTE = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#F97316', '#EC4899', '#14B8A6', '#84CC16',
]

export function createEmptyTeamSetupCustomDraft(): TeamSetupCustomDraft {
  return {
    name: '',
    role: '',
    description: '',
    color: COLOR_PALETTE[0],
    systemPrompt: '',
  }
}

export function createSelectedAgentFromPreset(preset: AgentPreset): TeamSetupSelectedAgent {
  return {
    id: nanoid(),
    presetId: preset.presetId,
    name: preset.name,
    role: preset.role,
    description: preset.description,
    color: resolveAgentColor(preset.iconType, preset.color),
    iconType: preset.iconType,
    isCustom: preset.presetId.startsWith('custom-'),
    systemPrompt: preset.systemPrompt,
  }
}

export function loadCustomAgentPresets(language: AppLanguage): AgentPreset[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(CUSTOM_AGENT_PRESETS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const candidate = item as Partial<AgentPreset>
      if (
        typeof candidate.presetId !== 'string'
        || typeof candidate.name !== 'string'
        || typeof candidate.role !== 'string'
        || typeof candidate.description !== 'string'
        || typeof candidate.color !== 'string'
        || typeof candidate.iconType !== 'string'
        || typeof candidate.systemPrompt !== 'string'
      ) {
        return []
      }

      return [{
        presetId: candidate.presetId,
        name: candidate.name,
        role: candidate.role,
        description: candidate.description,
        color: normalizeCustomAgentColor(candidate.color),
        iconType: candidate.iconType as AgentIconType,
        systemPrompt: candidate.systemPrompt,
        tags: Array.isArray(candidate.tags)
          ? candidate.tags.filter((tag): tag is string => typeof tag === 'string')
          : [getCustomAgentTag(language)],
      }]
    })
  } catch {
    return []
  }
}

export function localizeTeamSetupSelectedAgent(
  agent: TeamSetupSelectedAgent,
  language: AppLanguage,
) {
  return resolveTeamAgentStrings(agent, language)
}

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
}: {
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
}) {
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

export function TeamSetupCustomAgentForm({
  draft,
  onDraftChange,
  onSave,
}: {
  draft: TeamSetupCustomDraft
  onDraftChange: (patch: Partial<TeamSetupCustomDraft>) => void
  onSave: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <p className="text-sm text-claude-text">
        {t('team.setup.customIntro')}
      </p>

      <div>
        <label className="mb-1 block text-xs font-medium text-claude-text">
          {t('team.setup.field.name')} *
        </label>
        <input
          className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
          placeholder={t('team.setup.placeholder.customName')}
          value={draft.name}
          onChange={(event) => onDraftChange({ name: event.target.value })}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-claude-text">
          {t('team.setup.field.role')}
        </label>
        <input
          className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
          placeholder={t('team.setup.placeholder.customRole')}
          value={draft.role}
          onChange={(event) => onDraftChange({ role: event.target.value })}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-claude-text">
          {t('team.setup.field.description')}
        </label>
        <input
          className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
          placeholder={t('team.setup.placeholder.customDescription')}
          value={draft.description}
          onChange={(event) => onDraftChange({ description: event.target.value })}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-claude-text">
          {t('team.setup.field.systemPromptOptional')}
        </label>
        <textarea
          rows={4}
          className="w-full resize-none rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
          placeholder={t('team.setup.placeholder.customSystemPrompt')}
          value={draft.systemPrompt}
          onChange={(event) => onDraftChange({ systemPrompt: event.target.value })}
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-claude-text">
          {t('team.setup.field.color')}
        </label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => onDraftChange({ color })}
              className={`h-7 w-7 rounded-full border-2 transition-all ${
                draft.color === color ? 'scale-110 border-white' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <div className="shrink-0">
          <AgentPixelIcon type="custom" size={48} color={draft.color} />
        </div>
        <button
          onClick={onSave}
          disabled={!draft.name.trim()}
          className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}

function SelectedAgentBadge({
  agent,
  onRemove,
}: {
  agent: TeamSetupSelectedAgent
  onRemove: () => void
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-claude-border bg-claude-bg px-2 py-1.5"
      style={{ borderColor: `${agent.color}66` }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <AgentPixelIcon type={agent.iconType} size={24} color={agent.color} />
        <span className="truncate text-sm text-claude-text">{agent.name}</span>
      </div>
      <button
        onClick={onRemove}
        className="ml-1 rounded p-0.5 text-claude-text-muted hover:text-red-400"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export function TeamSetupPreviewPane({
  teamName,
  onTeamNameChange,
  selectedAgents,
  selectedCountLabel,
  onRemoveAgent,
  onConfirm,
  onClose,
}: {
  teamName: string
  onTeamNameChange: (teamName: string) => void
  selectedAgents: TeamSetupSelectedAgent[]
  selectedCountLabel: string
  onRemoveAgent: (agentId: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  const { language, t } = useI18n()

  return (
    <div className="flex w-[340px] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-claude-text">
            {t('team.setup.field.teamName')}
          </label>
          <input
            className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text focus:border-blue-500 focus:outline-none"
            value={teamName}
            onChange={(event) => onTeamNameChange(event.target.value)}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-claude-text">
              {t('team.setup.selectedAgents')}
            </p>
            <span className="text-xs text-claude-text/80">
              {selectedCountLabel}
            </span>
          </div>

          {selectedAgents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-claude-border p-6 text-center">
              <p className="text-sm text-claude-text/80">
                {t('team.setup.selectFromLeft')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedAgents.map((agent) => (
                <SelectedAgentBadge
                  key={agent.id}
                  agent={{ ...agent, ...localizeTeamSetupSelectedAgent(agent, language) }}
                  onRemove={() => onRemoveAgent(agent.id)}
                />
              ))}
            </div>
          )}
        </div>

        {selectedAgents.length >= 2 && (
          <div className="rounded-xl border border-claude-border bg-claude-surface/55 p-3">
            <p className="mb-2 text-xs font-medium text-claude-text">{t('team.setup.discussionOrder')}</p>
            <div className="space-y-1">
              {selectedAgents.map((agent, index) => {
                const localizedAgent = localizeTeamSetupSelectedAgent(agent, language)
                return (
                  <div key={agent.id} className="flex items-center gap-2">
                    <span className="w-4 text-xs text-claude-text/80">{index + 1}.</span>
                    <AgentPixelIcon type={agent.iconType} size={20} color={agent.color} />
                    <span className="text-xs text-claude-text">{localizedAgent.name}</span>
                    {index > 0 && (
                      <span className="text-xs text-claude-text/80">
                        {t('team.setup.discussionOrderReference', { count: index })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-claude-border p-4">
        <button
          onClick={onConfirm}
          disabled={selectedAgents.length < 2}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('team.setup.startTeam')}
        </button>
        <button
          onClick={onClose}
          className="w-full rounded-xl py-2 text-sm text-claude-text transition-colors hover:bg-claude-surface/35"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

export function buildCustomAgentPreset(
  draft: TeamSetupCustomDraft,
  language: AppLanguage,
): AgentPreset {
  return {
    presetId: `custom-${nanoid()}`,
    name: draft.name.trim(),
    role: draft.role.trim() || getDefaultCustomAgentRole(language),
    description: draft.description.trim(),
    color: normalizeCustomAgentColor(draft.color),
    iconType: 'custom',
    systemPrompt:
      draft.systemPrompt.trim()
      || buildCustomAgentSystemPrompt(draft.role, draft.description, language),
    tags: [getCustomAgentTag(language)],
  }
}
