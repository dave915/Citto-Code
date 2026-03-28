import { useI18n } from '../../hooks/useI18n'
import { AgentPixelIcon } from './AgentPixelIcon'
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

      <div className="flex items-center gap-3 pt-2">
        <div className="shrink-0">
          <AgentPixelIcon type="custom" size={48} color={draft.color} />
        </div>
        <button
          type="button"
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
