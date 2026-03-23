import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import { createPortal } from 'react-dom'
import { AgentPixelIcon, type AgentIconType } from './AgentPixelIcon'
import { AgentTeamGuideModal } from './AgentTeamGuideModal'
import { useI18n } from '../../hooks/useI18n'
import {
  buildCustomAgentSystemPrompt,
  getAgentPresets,
  getCustomAgentTag,
  getDefaultCustomAgentRole,
  getPresetCategories,
  normalizeCustomAgentColor,
  resolveAgentColor,
  type AgentPreset,
  type PresetCategory,
  resolveTeamAgentStrings,
} from '../../lib/teamAgentPresets'
import type { AppLanguage } from '../../lib/i18n'

type SelectedAgent = {
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

function createSelectedAgentFromPreset(preset: AgentPreset): SelectedAgent {
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

type Props = {
  onConfirm: (teamName: string, agents: SelectedAgent[]) => void
  onClose: () => void
}

type PresetHoverState = {
  preset: AgentPreset
  rect: DOMRect
} | null

const CUSTOM_AGENT_PRESETS_STORAGE_KEY = 'agent-team-custom-presets-v1'
const MAX_TEAM_AGENTS = 8

const COLOR_PALETTE = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#F97316', '#EC4899', '#14B8A6', '#84CC16',
]

function loadCustomAgentPresets(language: AppLanguage): AgentPreset[] {
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
          <span className="font-medium text-claude-text text-sm">{preset.name}</span>
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: preset.color }}
          >
            {preset.role}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-claude-text/80 truncate">{preset.description}</p>
      </div>
    </div>
  )
}

function PresetHoverCard({ hoverState }: { hoverState: PresetHoverState }) {
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

function SelectedAgentBadge({
  agent,
  onRemove,
}: {
  agent: SelectedAgent
  onRemove: () => void
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-claude-border bg-claude-bg px-2 py-1.5"
      style={{ borderColor: agent.color + '66' }}
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

export function TeamSetupModal({ onConfirm, onClose }: Props) {
  const { language, t } = useI18n()
  const [step, setStep] = useState<'select' | 'custom'>('select')
  const [showGuide, setShowGuide] = useState(false)
  const [teamName, setTeamName] = useState(() => t('team.setup.defaultTeamName'))
  const [selectedAgents, setSelectedAgents] = useState<SelectedAgent[]>([])
  const [customAgentPresets, setCustomAgentPresets] = useState<AgentPreset[]>(() => loadCustomAgentPresets(language))
  const [hoveredPreset, setHoveredPreset] = useState<PresetHoverState>(null)

  // Custom agent form state
  const [customName, setCustomName] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customColor, setCustomColor] = useState(COLOR_PALETTE[0])
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')
  const presetCategories = getPresetCategories(language)
  const agentPresets = getAgentPresets(language)

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(CUSTOM_AGENT_PRESETS_STORAGE_KEY, JSON.stringify(customAgentPresets))
  }, [customAgentPresets])

  const isCategorySelected = (category: PresetCategory) => (
    category.presetIds.every((presetId) => selectedAgents.some((agent) => agent.presetId === presetId))
  )
  const isPresetSelected = (presetId: string) => (
    selectedAgents.some((agent) => agent.presetId === presetId)
  )
  const remainingSlots = Math.max(0, MAX_TEAM_AGENTS - selectedAgents.length)
  const selectedCountLabel = selectedAgents.length < 2
    ? t('team.setup.selectedCountNeedsMin', { count: selectedAgents.length, min: 2 })
    : selectedAgents.length >= MAX_TEAM_AGENTS
      ? t('team.setup.selectedCountAtMax', { count: selectedAgents.length, max: MAX_TEAM_AGENTS })
      : t('team.setup.selectedCount', { count: selectedAgents.length, max: MAX_TEAM_AGENTS })

  function localizeSelectedAgent(agent: SelectedAgent) {
    return resolveTeamAgentStrings(agent, language)
  }

  function togglePreset(preset: AgentPreset) {
    const exists = selectedAgents.find((a) => a.presetId === preset.presetId)
    if (exists) {
      setSelectedAgents((prev) => prev.filter((a) => a.presetId !== preset.presetId))
    } else {
      if (selectedAgents.length >= MAX_TEAM_AGENTS) return
      setSelectedAgents((prev) => [
        ...prev,
        createSelectedAgentFromPreset(preset),
      ])
    }
  }

  function applyCategory(category: PresetCategory) {
    if (isCategorySelected(category)) {
      setSelectedAgents((prev) => (
        prev.filter((agent) => !category.presetIds.includes(agent.presetId ?? ''))
      ))
      return
    }

    const newAgents = category.presetIds
      .map((id) => agentPresets.find((preset) => preset.presetId === id))
      .filter((preset): preset is AgentPreset => Boolean(preset))
      .filter((preset) => !selectedAgents.some((agent) => agent.presetId === preset.presetId))
      .slice(0, remainingSlots)
      .map((preset) => createSelectedAgentFromPreset(preset))

    if (newAgents.length === 0) return
    setSelectedAgents((prev) => [...prev, ...newAgents])
    setTeamName(category.label)
  }

  function saveCustomAgent() {
    if (!customName.trim()) return
    const customPreset: AgentPreset = {
      presetId: `custom-${nanoid()}`,
      name: customName.trim(),
      role: customRole.trim() || getDefaultCustomAgentRole(language),
      description: customDesc.trim(),
      color: normalizeCustomAgentColor(customColor),
      iconType: 'custom',
      systemPrompt: customSystemPrompt.trim() || buildCustomAgentSystemPrompt(customRole, customDesc, language),
      tags: [getCustomAgentTag(language)],
    }
    setCustomAgentPresets((prev) => [customPreset, ...prev])
    setCustomName('')
    setCustomRole('')
    setCustomDesc('')
    setCustomSystemPrompt('')
    setStep('select')
  }

  function deleteCustomAgent(presetId: string) {
    setCustomAgentPresets((prev) => prev.filter((preset) => preset.presetId !== presetId))
    setSelectedAgents((prev) => prev.filter((agent) => agent.presetId !== presetId))
    setHoveredPreset((current) => (
      current?.preset.presetId === presetId ? null : current
    ))
  }

  function handleConfirm() {
    if (selectedAgents.length < 2) return
    onConfirm(
      teamName,
      selectedAgents.map((agent) => ({
        ...agent,
        ...localizeSelectedAgent(agent),
      })),
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="flex h-[90vh] w-[860px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-claude-border/90 bg-claude-panel shadow-[0_24px_56px_rgba(0,0,0,0.34)]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-claude-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-claude-text">{t('team.setup.title')}</h2>
            <p className="text-sm text-claude-text">
              {t('team.setup.description')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="flex items-center gap-1.5 rounded-lg border border-claude-border bg-claude-panel px-3 py-1.5 text-xs font-medium text-claude-text shadow-sm transition-colors hover:bg-claude-bg-hover"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v5m0-8h.01" />
              </svg>
              {t('team.guide')}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-claude-text transition-colors hover:bg-claude-bg-hover"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Agent selection */}
          <div className="flex w-[520px] flex-col border-r border-claude-border">

            {/* Tab bar */}
            <div className="flex border-b border-claude-border">
              <button
                onClick={() => setStep('select')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  step === 'select'
                    ? 'border-b-2 border-blue-500 text-blue-500'
                    : 'text-claude-text/75 hover:bg-claude-surface/40 hover:text-claude-text'
                }`}
              >
                {t('team.setup.tab.agents')}
              </button>
              <button
                onClick={() => setStep('custom')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  step === 'custom'
                    ? 'border-b-2 border-blue-500 text-blue-500'
                    : 'text-claude-text/75 hover:bg-claude-surface/40 hover:text-claude-text'
                }`}
              >
                {t('team.setup.tab.customAgent')}
              </button>
            </div>

            {step === 'select' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Quick categories */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-claude-text">
                    {t('team.setup.quickCategories')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {presetCategories.map((cat) => (
                      <button
                        key={cat.label}
                        onClick={() => applyCategory(cat)}
                        disabled={!isCategorySelected(cat) && remainingSlots === 0}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
                          isCategorySelected(cat)
                            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : 'border-claude-border bg-claude-surface/55 text-claude-text hover:border-claude-border-hover hover:bg-claude-surface hover:text-claude-text disabled:cursor-not-allowed disabled:opacity-40'
                        }`}
                      >
                        {cat.label}
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
                          onClick={() => togglePreset(preset)}
                          onHoverStart={(rect) => setHoveredPreset({ preset, rect })}
                          onHoverEnd={() => {
                            setHoveredPreset((current) => (
                              current?.preset.presetId === preset.presetId ? null : current
                            ))
                          }}
                          onDelete={() => deleteCustomAgent(preset.presetId)}
                        />
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* All presets */}
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
                        onClick={() => togglePreset(preset)}
                        onHoverStart={(rect) => setHoveredPreset({ preset, rect })}
                        onHoverEnd={() => {
                          setHoveredPreset((current) => (
                            current?.preset.presetId === preset.presetId ? null : current
                          ))
                        }}
                      />
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* Custom agent form */
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-claude-text">
                    {t('team.setup.field.role')}
                  </label>
                  <input
                    className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
                    placeholder={t('team.setup.placeholder.customRole')}
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-claude-text">
                    {t('team.setup.field.description')}
                  </label>
                  <input
                    className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
                    placeholder={t('team.setup.placeholder.customDescription')}
                    value={customDesc}
                    onChange={(e) => setCustomDesc(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-claude-text">
                    {t('team.setup.field.systemPromptOptional')}
                  </label>
                  <textarea
                    rows={4}
                    className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none resize-none"
                    placeholder={t('team.setup.placeholder.customSystemPrompt')}
                    value={customSystemPrompt}
                    onChange={(e) => setCustomSystemPrompt(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-claude-text">
                    {t('team.setup.field.color')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCustomColor(c)}
                        className={`h-7 w-7 rounded-full border-2 transition-all ${
                          customColor === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <div className="shrink-0">
                    <AgentPixelIcon type="custom" size={48} color={customColor} />
                  </div>
                  <button
                    onClick={saveCustomAgent}
                    disabled={!customName.trim()}
                    className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Team preview & settings */}
          <div className="flex w-[340px] flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Team name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-claude-text">
                  {t('team.setup.field.teamName')}
                </label>
                <input
                  className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text focus:border-blue-500 focus:outline-none"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>

              {/* Selected agents */}
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
                        agent={{ ...agent, ...localizeSelectedAgent(agent) }}
                        onRemove={() =>
                          setSelectedAgents((prev) => prev.filter((a) => a.id !== agent.id))
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Discussion preview */}
              {selectedAgents.length >= 2 && (
                <div className="rounded-xl border border-claude-border bg-claude-surface/55 p-3">
                  <p className="mb-2 text-xs font-medium text-claude-text">{t('team.setup.discussionOrder')}</p>
                  <div className="space-y-1">
                    {selectedAgents.map((agent, i) => (
                      <div key={agent.id} className="flex items-center gap-2">
                        <span className="w-4 text-xs text-claude-text/80">{i + 1}.</span>
                        <AgentPixelIcon type={agent.iconType} size={20} color={agent.color} />
                        <span className="text-xs text-claude-text">{localizeSelectedAgent(agent).name}</span>
                        {i > 0 && (
                          <span className="text-xs text-claude-text/80">
                            {t('team.setup.discussionOrderReference', { count: i })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="border-t border-claude-border p-4 space-y-2">
              <button
                onClick={handleConfirm}
                disabled={selectedAgents.length < 2}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
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
        </div>
      </div>

      <PresetHoverCard hoverState={step === 'select' ? hoveredPreset : null} />
      {showGuide && <AgentTeamGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  )
}
