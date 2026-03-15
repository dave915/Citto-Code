import type { PermissionMode } from '../../store/sessions'
import type { ScheduledTaskFrequency } from '../../store/scheduledTasks'
import { ScheduledTaskSelect } from './ScheduledTaskSelect'
import { FREQUENCY_OPTIONS, PERMISSION_OPTIONS } from './utils'

type Props = {
  name: string
  prompt: string
  projectPath: string
  defaultProjectPath: string
  frequency: ScheduledTaskFrequency
  permissionMode: PermissionMode
  selectedFrequencyDescription?: string
  onNameChange: (value: string) => void
  onPromptChange: (value: string) => void
  onProjectPathChange: (value: string) => void
  onSelectFolder: () => void | Promise<void>
  onFrequencyChange: (value: ScheduledTaskFrequency) => void
  onPermissionModeChange: (value: PermissionMode) => void
}

export function TaskBasicsSection({
  name,
  prompt,
  projectPath,
  defaultProjectPath,
  frequency,
  permissionMode,
  selectedFrequencyDescription,
  onNameChange,
  onPromptChange,
  onProjectPathChange,
  onSelectFolder,
  onFrequencyChange,
  onPermissionModeChange,
}: Props) {
  return (
    <>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-claude-muted">작업 이름</span>
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="예: 아침 점검"
          className="h-10 w-full rounded-xl border border-claude-border bg-claude-panel px-3 text-sm text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-claude-muted">프롬프트</span>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={5}
          placeholder="매일 아침 에러 로그를 요약해줘"
          className="w-full rounded-2xl border border-claude-border bg-claude-panel px-3 py-2.5 text-sm leading-relaxed text-claude-text outline-none transition-colors focus:border-claude-border focus:ring-1 focus:ring-white/10"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-claude-muted">작업 폴더</span>
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
            title="폴더 선택"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z" />
            </svg>
          </button>
        </div>
      </label>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">빈도</span>
          <ScheduledTaskSelect value={frequency} onChange={(value) => onFrequencyChange(value as ScheduledTaskFrequency)}>
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </ScheduledTaskSelect>
          <p className="mt-1.5 text-xs text-claude-muted">{selectedFrequencyDescription}</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-claude-muted">권한 모드</span>
          <ScheduledTaskSelect value={permissionMode} onChange={(value) => onPermissionModeChange(value as PermissionMode)}>
            {PERMISSION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </ScheduledTaskSelect>
        </div>
      </div>
    </>
  )
}
