import { useState } from 'react'
import { nanoid } from 'nanoid'
import { AgentPixelIcon, type AgentIconType } from './AgentPixelIcon'
import {
  AGENT_PRESETS,
  PRESET_CATEGORIES,
  type AgentPreset,
} from '../../lib/teamAgentPresets'

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

type Props = {
  defaultCwd: string
  onConfirm: (teamName: string, cwd: string, agents: SelectedAgent[]) => void
  onClose: () => void
}

const COLOR_PALETTE = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#F97316', '#EC4899', '#0EA5E9',
  '#14B8A6', '#84CC16',
]

function AgentPresetCard({
  preset,
  selected,
  onClick,
}: {
  preset: AgentPreset
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all
        ${selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-claude-border bg-claude-bg hover:border-claude-border-hover hover:bg-claude-bg-hover'
        }
      `}
    >
      {selected && (
        <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
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
        <p className="mt-0.5 text-xs text-claude-text-muted truncate">{preset.description}</p>
      </div>
    </button>
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
      <AgentPixelIcon type={agent.iconType} size={24} color={agent.color} />
      <span className="text-sm text-claude-text">{agent.name}</span>
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

export function TeamSetupModal({ defaultCwd, onConfirm, onClose }: Props) {
  const [step, setStep] = useState<'select' | 'custom'>('select')
  const [teamName, setTeamName] = useState('새 에이전트 팀')
  const [cwd, setCwd] = useState(defaultCwd)
  const [selectedAgents, setSelectedAgents] = useState<SelectedAgent[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Custom agent form state
  const [customName, setCustomName] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customColor, setCustomColor] = useState(COLOR_PALETTE[0])
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')

  function togglePreset(preset: AgentPreset) {
    const exists = selectedAgents.find((a) => a.presetId === preset.presetId)
    if (exists) {
      setSelectedAgents((prev) => prev.filter((a) => a.presetId !== preset.presetId))
    } else {
      setSelectedAgents((prev) => [
        ...prev,
        {
          id: nanoid(),
          presetId: preset.presetId,
          name: preset.name,
          role: preset.role,
          description: preset.description,
          color: preset.color,
          iconType: preset.iconType,
          isCustom: false,
          systemPrompt: preset.systemPrompt,
        },
      ])
    }
  }

  function applyCategory(category: typeof PRESET_CATEGORIES[0]) {
    const presets = category.presetIds
      .map((id) => AGENT_PRESETS.find((p) => p.presetId === id))
      .filter(Boolean) as AgentPreset[]

    const newAgents = presets
      .filter((p) => !selectedAgents.find((a) => a.presetId === p.presetId))
      .map((preset) => ({
        id: nanoid(),
        presetId: preset.presetId,
        name: preset.name,
        role: preset.role,
        description: preset.description,
        color: preset.color,
        iconType: preset.iconType,
        isCustom: false,
        systemPrompt: preset.systemPrompt,
      }))

    setSelectedAgents((prev) => [...prev, ...newAgents])
    setActiveCategory(category.label)
    setTeamName(category.label)
  }

  function addCustomAgent() {
    if (!customName.trim()) return
    setSelectedAgents((prev) => [
      ...prev,
      {
        id: nanoid(),
        presetId: null,
        name: customName.trim(),
        role: customRole.trim() || '에이전트',
        description: customDesc.trim(),
        color: customColor,
        iconType: 'custom',
        isCustom: true,
        systemPrompt: customSystemPrompt.trim() || `당신은 ${customRole || '에이전트'}입니다. ${customDesc}`,
      },
    ])
    setCustomName('')
    setCustomRole('')
    setCustomDesc('')
    setCustomSystemPrompt('')
    setStep('select')
  }

  function handleConfirm() {
    if (selectedAgents.length < 2) return
    onConfirm(teamName, cwd, selectedAgents)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-[90vh] w-[860px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-claude-border bg-claude-bg-base shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-claude-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-claude-text">에이전트 팀 구성</h2>
            <p className="text-sm text-claude-text-muted">
              함께 토론할 에이전트들을 선택하세요
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-claude-text-muted hover:bg-claude-bg-hover hover:text-claude-text"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
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
                    : 'text-claude-text-muted hover:text-claude-text'
                }`}
              >
                샘플 에이전트
              </button>
              <button
                onClick={() => setStep('custom')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  step === 'custom'
                    ? 'border-b-2 border-blue-500 text-blue-500'
                    : 'text-claude-text-muted hover:text-claude-text'
                }`}
              >
                + 커스텀 에이전트
              </button>
            </div>

            {step === 'select' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Quick categories */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-claude-text-muted">
                    빠른 팀 구성
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_CATEGORIES.map((cat) => (
                      <button
                        key={cat.label}
                        onClick={() => applyCategory(cat)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
                          activeCategory === cat.label
                            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : 'border-claude-border text-claude-text-muted hover:border-claude-border-hover hover:text-claude-text'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* All presets */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-claude-text-muted">
                    전체 에이전트 ({AGENT_PRESETS.length})
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {AGENT_PRESETS.map((preset) => (
                      <AgentPresetCard
                        key={preset.presetId}
                        preset={preset}
                        selected={!!selectedAgents.find((a) => a.presetId === preset.presetId)}
                        onClick={() => togglePreset(preset)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Custom agent form */
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <p className="text-sm text-claude-text-muted">
                  직접 에이전트를 만들어 팀에 추가하세요
                </p>

                <div>
                  <label className="mb-1 block text-xs font-medium text-claude-text-muted">
                    이름 *
                  </label>
                  <input
                    className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
                    placeholder="예: 데이터 분석가"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-claude-text-muted">
                    역할
                  </label>
                  <input
                    className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
                    placeholder="예: Data Analyst"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-claude-text-muted">
                    설명
                  </label>
                  <input
                    className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none"
                    placeholder="이 에이전트가 하는 일"
                    value={customDesc}
                    onChange={(e) => setCustomDesc(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-claude-text-muted">
                    시스템 프롬프트 (선택)
                  </label>
                  <textarea
                    rows={4}
                    className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text placeholder:text-claude-text-muted focus:border-blue-500 focus:outline-none resize-none"
                    placeholder="에이전트의 역할과 행동 방식을 자세히 설명하세요..."
                    value={customSystemPrompt}
                    onChange={(e) => setCustomSystemPrompt(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-claude-text-muted">
                    색상
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
                    onClick={addCustomAgent}
                    disabled={!customName.trim()}
                    className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    팀에 추가
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
                <label className="mb-1 block text-xs font-medium text-claude-text-muted">
                  팀 이름
                </label>
                <input
                  className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text focus:border-blue-500 focus:outline-none"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>

              {/* Project path */}
              <div>
                <label className="mb-1 block text-xs font-medium text-claude-text-muted">
                  작업 경로
                </label>
                <input
                  className="w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text font-mono focus:border-blue-500 focus:outline-none"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                />
              </div>

              {/* Selected agents */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-claude-text-muted">
                    선택된 에이전트
                  </p>
                  <span className="text-xs text-claude-text-muted">
                    {selectedAgents.length}명 {selectedAgents.length < 2 && '(최소 2명 필요)'}
                  </span>
                </div>

                {selectedAgents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-claude-border p-6 text-center">
                    <p className="text-sm text-claude-text-muted">
                      왼쪽에서 에이전트를 선택하세요
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedAgents.map((agent) => (
                      <SelectedAgentBadge
                        key={agent.id}
                        agent={agent}
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
                <div className="rounded-xl border border-claude-border bg-claude-bg p-3">
                  <p className="mb-2 text-xs font-medium text-claude-text-muted">토론 순서</p>
                  <div className="space-y-1">
                    {selectedAgents.map((agent, i) => (
                      <div key={agent.id} className="flex items-center gap-2">
                        <span className="text-xs text-claude-text-muted w-4">{i + 1}.</span>
                        <AgentPixelIcon type={agent.iconType} size={20} color={agent.color} />
                        <span className="text-xs text-claude-text">{agent.name}</span>
                        {i > 0 && (
                          <span className="text-xs text-claude-text-muted">
                            (앞 {i}명 응답 참고)
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
                팀 시작하기 →
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl py-2 text-sm text-claude-text-muted hover:text-claude-text"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
