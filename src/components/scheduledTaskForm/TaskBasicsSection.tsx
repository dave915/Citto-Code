import type { PermissionMode } from '../../store/sessions'
import type { ScheduledTaskFrequency } from '../../store/scheduledTasks'
import { translate, type AppLanguage } from '../../lib/i18n'
import { ScheduledTaskSelect } from './ScheduledTaskSelect'
import { getFrequencyOptions, getPermissionOptions } from './utils'
import type { ModelInfo } from '../../../electron/preload'

type Props = {
  name: string
  language: AppLanguage
  prompt: string
  projectPath: string
  defaultProjectPath: string
  model: string | null
  models: ModelInfo[]
  modelsLoading: boolean
  frequency: ScheduledTaskFrequency
  permissionMode: PermissionMode
  selectedFrequencyDescription?: string
  onNameChange: (value: string) => void
  onPromptChange: (value: string) => void
  onProjectPathChange: (value: string) => void
  onModelChange: (value: string | null) => void
  onSelectFolder: () => void | Promise<void>
  onFrequencyChange: (value: ScheduledTaskFrequency) => void
  onPermissionModeChange: (value: PermissionMode) => void
}

export function TaskBasicsSection({
  name,
  language,
  prompt,
  projectPath,
  defaultProjectPath,
  model,
  models,
  modelsLoading,
  frequency,
  permissionMode,
  selectedFrequencyDescription,
  onNameChange,
  onPromptChange,
  onProjectPathChange,
  onModelChange,
  onSelectFolder,
  onFrequencyChange,
  onPermissionModeChange,
}: Props) {
  const frequencyOptions = getFrequencyOptions(language)
  const permissionOptions = getPermissionOptions(language)
  const selectedModelMissing = Boolean(model && !models.some((entry) => entry.id === model))

  return (
    <>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.taskName')}</span>
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={translate(language, 'scheduled.form.placeholder.taskName')}
          className="h-10 w-full rounded-xl border border-claude-border bg-claude-panel px-3 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.prompt')}</span>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={5}
          placeholder={translate(language, 'scheduled.form.placeholder.prompt')}
          className="w-full rounded-2xl border border-claude-border bg-claude-panel px-3 py-2.5 text-sm leading-relaxed text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.taskFolder')}</span>
        <div className="relative">
          <input
            value={projectPath}
            onChange={(event) => onProjectPathChange(event.target.value)}
            placeholder={defaultProjectPath}
            className="h-10 w-full rounded-xl border border-claude-border bg-claude-panel px-3 pr-11 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
          />
          <button
            onClick={() => void onSelectFolder()}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title={translate(language, 'scheduled.form.chooseFolder')}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z" />
            </svg>
          </button>
        </div>
      </label>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.frequency')}</span>
          <ScheduledTaskSelect value={frequency} onChange={(value) => onFrequencyChange(value as ScheduledTaskFrequency)}>
            {frequencyOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </ScheduledTaskSelect>
          <p className="mt-1.5 text-xs text-claude-muted">{selectedFrequencyDescription}</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.model')}</span>
          <ScheduledTaskSelect value={model ?? ''} onChange={(value) => onModelChange(value || null)}>
            <option value="">{translate(language, 'input.modelPicker.defaultModel')}</option>
            {selectedModelMissing ? <option value={model ?? ''}>{model}</option> : null}
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.displayName}{entry.isLocal ? ' · LOCAL' : ''}</option>
            ))}
          </ScheduledTaskSelect>
          <p className="mt-1.5 text-xs text-claude-muted">
            {modelsLoading
              ? translate(language, 'input.modelPicker.loading')
              : models.length > 0
                ? translate(language, 'scheduled.form.modelHint')
                : translate(language, 'input.modelPicker.ollamaHint')}
          </p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">{translate(language, 'scheduled.form.field.permissionMode')}</span>
          <ScheduledTaskSelect value={permissionMode} onChange={(value) => onPermissionModeChange(value as PermissionMode)}>
            {permissionOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </ScheduledTaskSelect>
        </div>
      </div>
    </>
  )
}
