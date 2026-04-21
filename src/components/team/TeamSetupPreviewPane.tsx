import type { ModelInfo } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { normalizeConfiguredModelSelection } from '../../lib/modelSelection'
import { AgentPixelIcon } from './AgentPixelIcon'
import { TeamButton, TeamChip, TeamEyebrow, TeamPanel, teamFieldClassName } from './teamDesignSystem'
import {
  localizeTeamSetupSelectedAgent,
  type TeamSetupSelectedAgent,
} from './teamSetupShared'

function SelectedAgentBadge({
  agent,
  models,
  modelsLoading,
  onModelChange,
  onRemove,
}: {
  agent: TeamSetupSelectedAgent
  models: ModelInfo[]
  modelsLoading: boolean
  onModelChange: (value: string | null) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const normalizedSelectedModel = normalizeConfiguredModelSelection(agent.model)
  const selectedModelMissing = Boolean(
    normalizedSelectedModel && !models.some((entry) => entry.id === normalizedSelectedModel),
  )

  return (
    <TeamPanel
      className="space-y-2 bg-claude-bg px-2 py-1.5 shadow-none"
      style={{ borderColor: `${agent.color}66` }}
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <AgentPixelIcon type={agent.iconType} size={24} color={agent.color} />
          <span className="truncate text-[13px] text-claude-text">{agent.name}</span>
        </div>
        <TeamButton onClick={onRemove} size="icon" tone="ghost" className="ml-1 h-6 w-6">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </TeamButton>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-claude-text/70">{t('team.setup.field.model')}</span>
        <select
          value={normalizedSelectedModel ?? ''}
          onChange={(event) => onModelChange(event.target.value || null)}
          className={`${teamFieldClassName} h-8 bg-claude-surface px-2 text-xs`}
        >
          <option value="">{t('input.modelPicker.defaultModel')}</option>
          {selectedModelMissing ? <option value={normalizedSelectedModel ?? ''}>{normalizedSelectedModel}</option> : null}
          {models.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.displayName}{entry.isLocal ? ' · LOCAL' : ''}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-claude-text/60">
          {modelsLoading
            ? t('input.modelPicker.loading')
            : models.length > 0
              ? t('team.setup.modelHint')
              : t('input.modelPicker.ollamaHint')}
        </p>
      </label>
    </TeamPanel>
  )
}

type Props = {
  teamName: string
  onTeamNameChange: (teamName: string) => void
  models: ModelInfo[]
  modelsLoading: boolean
  selectedAgents: TeamSetupSelectedAgent[]
  selectedCountLabel: string
  onAgentModelChange: (agentId: string, model: string | null) => void
  onRemoveAgent: (agentId: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function TeamSetupPreviewPane({
  teamName,
  onTeamNameChange,
  models,
  modelsLoading,
  selectedAgents,
  selectedCountLabel,
  onAgentModelChange,
  onRemoveAgent,
  onConfirm,
  onClose,
}: Props) {
  const { language, t } = useI18n()

  return (
    <div className="flex w-[340px] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-claude-text">
            {t('team.setup.field.teamName')}
          </label>
          <input
            className={teamFieldClassName}
            value={teamName}
            onChange={(event) => onTeamNameChange(event.target.value)}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <TeamEyebrow className="text-claude-text">
              {t('team.setup.selectedAgents')}
            </TeamEyebrow>
            <TeamChip>{selectedCountLabel}</TeamChip>
          </div>

          {selectedAgents.length === 0 ? (
            <div className="rounded-md border border-dashed border-claude-border p-4 text-center">
              <p className="text-[13px] text-claude-muted">
                {t('team.setup.selectFromLeft')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedAgents.map((agent) => (
                <SelectedAgentBadge
                  key={agent.id}
                  agent={{ ...agent, ...localizeTeamSetupSelectedAgent(agent, language) }}
                  models={models}
                  modelsLoading={modelsLoading}
                  onModelChange={(model) => onAgentModelChange(agent.id, model)}
                  onRemove={() => onRemoveAgent(agent.id)}
                />
              ))}
            </div>
          )}
        </div>

        {selectedAgents.length >= 2 && (
          <TeamPanel className="bg-claude-surface/55 p-2.5 shadow-none">
            <TeamEyebrow className="mb-2 text-claude-text">{t('team.setup.discussionOrder')}</TeamEyebrow>
            <div className="space-y-1">
              {selectedAgents.map((agent, index) => {
                const localizedAgent = localizeTeamSetupSelectedAgent(agent, language)
                return (
                  <div key={agent.id} className="flex items-center gap-2">
                    <span className="w-4 text-xs text-claude-muted">{index + 1}.</span>
                    <AgentPixelIcon type={agent.iconType} size={20} color={agent.color} />
                    <span className="text-xs text-claude-text">{localizedAgent.name}</span>
                    {index > 0 && (
                      <span className="text-xs text-claude-muted">
                        {t('team.setup.discussionOrderReference', { count: index })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </TeamPanel>
        )}
      </div>

      <div className="space-y-2 border-t border-claude-border p-3">
        <TeamButton
          onClick={onConfirm}
          disabled={selectedAgents.length < 2}
          tone="accent"
          className="w-full"
        >
          {t('team.setup.startTeam')}
        </TeamButton>
        <TeamButton onClick={onClose} tone="ghost" className="w-full">
          {t('common.cancel')}
        </TeamButton>
      </div>
    </div>
  )
}
