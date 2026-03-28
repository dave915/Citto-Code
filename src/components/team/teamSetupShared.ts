import { nanoid } from 'nanoid'
import type { AppLanguage } from '../../lib/i18n'
import {
  buildCustomAgentSystemPrompt,
  getCustomAgentTag,
  getDefaultCustomAgentRole,
  normalizeCustomAgentColor,
  resolveAgentColor,
  resolveTeamAgentStrings,
  type AgentPreset,
} from '../../lib/teamAgentPresets'
import type { AgentIconType } from './AgentPixelIcon'

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
