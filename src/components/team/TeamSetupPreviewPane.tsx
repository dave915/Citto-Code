import { useI18n } from '../../hooks/useI18n'
import { AgentPixelIcon } from './AgentPixelIcon'
import {
  localizeTeamSetupSelectedAgent,
  type TeamSetupSelectedAgent,
} from './teamSetupShared'

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
        type="button"
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

type Props = {
  teamName: string
  onTeamNameChange: (teamName: string) => void
  selectedAgents: TeamSetupSelectedAgent[]
  selectedCountLabel: string
  onRemoveAgent: (agentId: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function TeamSetupPreviewPane({
  teamName,
  onTeamNameChange,
  selectedAgents,
  selectedCountLabel,
  onRemoveAgent,
  onConfirm,
  onClose,
}: Props) {
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
          type="button"
          onClick={onConfirm}
          disabled={selectedAgents.length < 2}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('team.setup.startTeam')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl py-2 text-sm text-claude-text transition-colors hover:bg-claude-surface/35"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
