import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import { createPortal } from 'react-dom'
import { AgentPixelIcon, type AgentIconType } from './AgentPixelIcon'
import {
  AGENT_PRESETS,
  PRESET_CATEGORIES,
  type AgentPreset,
} from '../../lib/teamAgentPresets'
import { normalizeSelectedFolder } from '../../lib/claudeRuntime'

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
    color: preset.color,
    iconType: preset.iconType,
    isCustom: preset.presetId.startsWith('custom-'),
    systemPrompt: preset.systemPrompt,
  }
}

type Props = {
  defaultCwd: string
  onConfirm: (teamName: string, cwd: string, agents: SelectedAgent[]) => void
  onClose: () => void
}

type PresetHoverState = {
  preset: AgentPreset
  rect: DOMRect
} | null

const CUSTOM_AGENT_PRESETS_STORAGE_KEY = 'agent-team-custom-presets-v1'

const COLOR_PALETTE = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#F97316', '#EC4899', '#0EA5E9',
  '#14B8A6', '#84CC16',
]

function loadCustomAgentPresets(): AgentPreset[] {
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
        color: candidate.color,
        iconType: candidate.iconType as AgentIconType,
        systemPrompt: candidate.systemPrompt,
        tags: Array.isArray(candidate.tags)
          ? candidate.tags.filter((tag): tag is string => typeof tag === 'string')
          : ['커스텀'],
      }]
    })
  } catch {
    return []
  }
}

function AgentPresetCard({
  preset,
  selected,
  onClick,
  onHoverStart,
  onHoverEnd,
  onDelete,
}: {
  preset: AgentPreset
  selected: boolean
  onClick: () => void
  onHoverStart: (rect: DOMRect) => void
  onHoverEnd: () => void
  onDelete?: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
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
      className={`
        relative flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all
        ${selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-claude-border bg-claude-bg hover:border-claude-border-hover hover:bg-claude-bg-hover'
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
          title="삭제"
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
        <p className="mt-0.5 text-xs text-claude-text-muted truncate">{preset.description}</p>
      </div>
    </div>
  )
}

function PresetHoverCard({ hoverState }: { hoverState: PresetHoverState }) {
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
            설명
          </p>
          <div className="rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-xs leading-relaxed text-claude-text">
            {preset.description}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-claude-text-muted">
            시스템 프롬프트
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

export function TeamSetupModal({ defaultCwd, onConfirm, onClose }: Props) {
  const [step, setStep] = useState<'select' | 'custom'>('select')
  const [teamName, setTeamName] = useState('새 에이전트 팀')
  const [cwd, setCwd] = useState(defaultCwd)
  const [selectedAgents, setSelectedAgents] = useState<SelectedAgent[]>([])
  const [customAgentPresets, setCustomAgentPresets] = useState<AgentPreset[]>(() => loadCustomAgentPresets())
  const [hoveredPreset, setHoveredPreset] = useState<PresetHoverState>(null)

  // Custom agent form state
  const [customName, setCustomName] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customColor, setCustomColor] = useState(COLOR_PALETTE[0])
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(CUSTOM_AGENT_PRESETS_STORAGE_KEY, JSON.stringify(customAgentPresets))
  }, [customAgentPresets])

  const isCategorySelected = (category: typeof PRESET_CATEGORIES[number]) => (
    category.presetIds.every((presetId) => selectedAgents.some((agent) => agent.presetId === presetId))
  )

  function togglePreset(preset: AgentPreset) {
    const exists = selectedAgents.find((a) => a.presetId === preset.presetId)
    if (exists) {
      setSelectedAgents((prev) => prev.filter((a) => a.presetId !== preset.presetId))
    } else {
      setSelectedAgents((prev) => [
        ...prev,
        createSelectedAgentFromPreset(preset),
      ])
    }
  }

  function applyCategory(category: typeof PRESET_CATEGORIES[0]) {
    if (isCategorySelected(category)) {
      setSelectedAgents((prev) => (
        prev.filter((agent) => !category.presetIds.includes(agent.presetId ?? ''))
      ))
      return
    }

    const newAgents = category.presetIds
      .map((id) => AGENT_PRESETS.find((preset) => preset.presetId === id))
      .filter((preset): preset is AgentPreset => Boolean(preset))
      .filter((preset) => !selectedAgents.some((agent) => agent.presetId === preset.presetId))
      .map((preset) => createSelectedAgentFromPreset(preset))

    setSelectedAgents((prev) => [...prev, ...newAgents])
    setTeamName(category.label)
  }

  function saveCustomAgent() {
    if (!customName.trim()) return
    const customPreset: AgentPreset = {
      presetId: `custom-${nanoid()}`,
      name: customName.trim(),
      role: customRole.trim() || '에이전트',
      description: customDesc.trim(),
      color: customColor,
      iconType: 'custom',
      systemPrompt: customSystemPrompt.trim() || `당신은 ${customRole || '에이전트'}입니다. ${customDesc}`,
      tags: ['커스텀'],
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

  async function handleSelectFolder() {
    const selected = normalizeSelectedFolder(await window.claude.selectFolder({
      defaultPath: cwd || defaultCwd,
      title: '작업 폴더 선택',
    }))
    if (!selected) return
    setCwd(selected)
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
                에이전트
              </button>
              <button
                onClick={() => setStep('custom')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  step === 'custom'
                    ? 'border-b-2 border-blue-500 text-blue-500'
                    : 'text-claude-text-muted hover:text-claude-text'
                }`}
              >
                커스텀 에이전트
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
                          isCategorySelected(cat)
                            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : 'border-claude-border text-claude-text-muted hover:border-claude-border-hover hover:text-claude-text'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {customAgentPresets.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-claude-text-muted">
                      저장한 커스텀 에이전트 ({customAgentPresets.length})
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {customAgentPresets.map((preset) => (
                        <AgentPresetCard
                          key={preset.presetId}
                          preset={preset}
                          selected={!!selectedAgents.find((agent) => agent.presetId === preset.presetId)}
                          onClick={() => togglePreset(preset)}
                          onHoverStart={(rect) => setHoveredPreset({ preset, rect })}
                          onHoverEnd={() => {
                            setHoveredPreset((current) => (
                              current?.preset.presetId === preset.presetId ? null : current
                            ))
                          }}
                          onDelete={() => deleteCustomAgent(preset.presetId)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* All presets */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-claude-text-muted">
                    기본 에이전트 ({AGENT_PRESETS.length})
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {AGENT_PRESETS.map((preset) => (
                      <AgentPresetCard
                        key={preset.presetId}
                        preset={preset}
                        selected={!!selectedAgents.find((a) => a.presetId === preset.presetId)}
                        onClick={() => togglePreset(preset)}
                        onHoverStart={(rect) => setHoveredPreset({ preset, rect })}
                        onHoverEnd={() => {
                          setHoveredPreset((current) => (
                            current?.preset.presetId === preset.presetId ? null : current
                          ))
                        }}
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
                    onClick={saveCustomAgent}
                    disabled={!customName.trim()}
                    className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    저장
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
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text font-mono focus:border-blue-500 focus:outline-none"
                    value={cwd}
                    onChange={(e) => setCwd(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSelectFolder()}
                    className="shrink-0 rounded-lg border border-claude-border px-3 py-2 text-sm text-claude-text-muted transition-colors hover:border-claude-border-hover hover:text-claude-text"
                  >
                    폴더 선택
                  </button>
                </div>
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

      <PresetHoverCard hoverState={step === 'select' ? hoveredPreset : null} />
    </div>
  )
}
