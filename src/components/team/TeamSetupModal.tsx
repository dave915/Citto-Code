import { useEffect, useMemo, useState } from 'react'
import { AgentTeamGuideModal } from './AgentTeamGuideModal'
import { useI18n } from '../../hooks/useI18n'
import { useInputModelData } from '../../hooks/useInputModelData'
import { sanitizeEnvVars } from '../../lib/claudeRuntime'
import {
  type AgentPreset,
  getAgentPresets,
  getPresetCategories,
  type PresetCategory,
} from '../../lib/teamAgentPresets'
import {
  buildCustomAgentPreset,
  createEmptyTeamSetupCustomDraft,
  createSelectedAgentFromPreset,
  CUSTOM_AGENT_PRESETS_STORAGE_KEY,
  loadCustomAgentPresets,
  localizeTeamSetupSelectedAgent,
  MAX_TEAM_AGENTS,
  PresetHoverCard,
  type PresetHoverState,
  TeamSetupCustomAgentForm,
  TeamSetupPreviewPane,
  TeamSetupSelectionPane,
  type TeamSetupCustomDraft,
  type TeamSetupSelectedAgent,
} from './TeamSetupModalParts'
import { useSessionsStore } from '../../store/sessions'

type Props = {
  onConfirm: (teamName: string, agents: TeamSetupSelectedAgent[]) => void
  onClose: () => void
}

export function TeamSetupModal({ onConfirm, onClose }: Props) {
  const { language, t } = useI18n()
  const envVars = useSessionsStore((state) => state.envVars)
  const [step, setStep] = useState<'select' | 'custom'>('select')
  const [showGuide, setShowGuide] = useState(false)
  const [teamName, setTeamName] = useState(() => t('team.setup.defaultTeamName'))
  const [selectedAgents, setSelectedAgents] = useState<TeamSetupSelectedAgent[]>([])
  const [customAgentPresets, setCustomAgentPresets] = useState<AgentPreset[]>(() => loadCustomAgentPresets(language))
  const [hoveredPreset, setHoveredPreset] = useState<PresetHoverState>(null)
  const [customDraft, setCustomDraft] = useState<TeamSetupCustomDraft>(createEmptyTeamSetupCustomDraft)
  const presetCategories = getPresetCategories(language)
  const agentPresets = getAgentPresets(language)
  const sanitizedEnvVars = useMemo(() => sanitizeEnvVars(envVars), [envVars])
  const { models, modelsLoading } = useInputModelData(sanitizedEnvVars, language)

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

  function updateCustomDraft(patch: Partial<TeamSetupCustomDraft>) {
    setCustomDraft((current) => ({ ...current, ...patch }))
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
    if (!customDraft.name.trim()) return
    const customPreset = buildCustomAgentPreset(customDraft, language)
    setCustomAgentPresets((prev) => [customPreset, ...prev])
    setCustomDraft(createEmptyTeamSetupCustomDraft())
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
        ...localizeTeamSetupSelectedAgent(agent, language),
      })),
    )
  }

  function updateSelectedAgentModel(agentId: string, model: string | null) {
    setSelectedAgents((current) => current.map((agent) => (
      agent.id === agentId ? { ...agent, model } : agent
    )))
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
              <TeamSetupSelectionPane
                presetCategories={presetCategories}
                customAgentPresets={customAgentPresets}
                agentPresets={agentPresets}
                remainingSlots={remainingSlots}
                isCategorySelected={isCategorySelected}
                isPresetSelected={isPresetSelected}
                onApplyCategory={applyCategory}
                onTogglePreset={togglePreset}
                onHoverStart={(preset, rect) => setHoveredPreset({ preset, rect })}
                onHoverEnd={(presetId) => {
                  setHoveredPreset((current) => (
                    current?.preset.presetId === presetId ? null : current
                  ))
                }}
                onDeleteCustomPreset={deleteCustomAgent}
              />
            ) : (
              <TeamSetupCustomAgentForm
                draft={customDraft}
                onDraftChange={updateCustomDraft}
                onSave={saveCustomAgent}
              />
            )}
          </div>

          {/* Right: Team preview & settings */}
          <TeamSetupPreviewPane
            teamName={teamName}
            onTeamNameChange={setTeamName}
            models={models}
            modelsLoading={modelsLoading}
            selectedAgents={selectedAgents}
            selectedCountLabel={selectedCountLabel}
            onAgentModelChange={updateSelectedAgentModel}
            onRemoveAgent={(agentId) => {
              setSelectedAgents((prev) => prev.filter((agent) => agent.id !== agentId))
            }}
            onConfirm={handleConfirm}
            onClose={onClose}
          />
        </div>
      </div>

      <PresetHoverCard hoverState={step === 'select' ? hoveredPreset : null} />
      {showGuide && <AgentTeamGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  )
}
