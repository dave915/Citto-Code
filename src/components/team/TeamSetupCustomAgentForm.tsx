import { useI18n } from '../../hooks/useI18n'
import { AgentPixelIcon } from './AgentPixelIcon'
import { TeamButton, TeamPanel, teamFieldClassName } from './teamDesignSystem'
import { COLOR_PALETTE, type TeamSetupCustomDraft } from './teamSetupShared'

type Props = {
  draft: TeamSetupCustomDraft
  onDraftChange: (patch: Partial<TeamSetupCustomDraft>) => void
  onSave: () => void
}

export function TeamSetupCustomAgentForm({ draft, onDraftChange, onSave }: Props) {
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
          className={teamFieldClassName}
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
          className={teamFieldClassName}
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
          className={teamFieldClassName}
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
          className={`${teamFieldClassName} resize-none`}
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
              type="button"
              onClick={() => onDraftChange({ color })}
              className={`h-7 w-7 rounded-full border-2 transition-all ${
                draft.color === color ? 'scale-110 border-white' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <TeamPanel className="flex items-center gap-3 bg-claude-surface/55 px-3 py-3 shadow-none">
        <div className="shrink-0">
          <AgentPixelIcon type="custom" size={48} color={draft.color} />
        </div>
        <TeamButton onClick={onSave} disabled={!draft.name.trim()} tone="accent" className="flex-1">
          {t('common.save')}
        </TeamButton>
      </TeamPanel>
    </div>
  )
}
