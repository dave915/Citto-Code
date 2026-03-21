import type { ModelInfo } from '../../../electron/preload'
import type { AppLanguage } from '../../lib/i18n'
import type { PermissionMode } from '../../store/sessions'
import { ModelPicker } from './ModelPicker'
import { getPermissionOptions } from './inputUtils'

export function InputToolbar({
  isStreaming,
  language,
  disabled,
  isAttaching,
  handleAttachFiles,
  permissionMode,
  planMode,
  onPermissionModeChange,
  onPlanModeChange,
  permissionShortcutLabel,
  bypassShortcutLabel,
  model,
  models,
  modelsLoading,
  onModelChange,
  showStreamingUi,
  onAbort,
  handleSend,
  canSend,
}: {
  isStreaming: boolean
  language: AppLanguage
  disabled?: boolean
  isAttaching: boolean
  handleAttachFiles: () => void
  permissionMode: PermissionMode
  planMode: boolean
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
  model: string | null
  models: ModelInfo[]
  modelsLoading: boolean
  onModelChange: (model: string | null) => void
  showStreamingUi: boolean
  onAbort: () => void
  handleSend: () => void
  canSend: boolean
}) {
  const permissionOptions = getPermissionOptions(language)

  return (
    <div className="flex items-center gap-2 border-t border-claude-border/70 px-4 pb-3 pt-2.5">
      <button
        onClick={handleAttachFiles}
        disabled={isStreaming || disabled || isAttaching}
        title={language === 'en' ? 'Attach files' : '파일 첨부'}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text disabled:opacity-30"
      >
        {isAttaching ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        )}
      </button>

      <div className="h-4 w-px flex-shrink-0 bg-claude-border" />

      <div className="flex flex-shrink-0 items-center gap-0.5">
        {permissionOptions.filter((option) => option.value !== 'bypassPermissions').map((option) => {
          const isActive = !planMode && permissionMode === option.value

          return (
            <button
              key={option.value}
              onClick={() => {
                if (planMode) onPlanModeChange(false)
                onPermissionModeChange(option.value)
              }}
              disabled={isStreaming}
              title={`${option.title}${permissionShortcutLabel ? ` (${permissionShortcutLabel})` : ''}`}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                isActive
                  ? 'border border-claude-border bg-claude-surface text-claude-text'
                  : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
              }`}
            >
              {option.label}
            </button>
          )
        })}

        <button
          onClick={() => {
            const nextPlanMode = !planMode
            onPlanModeChange(nextPlanMode)
            if (nextPlanMode) onPermissionModeChange('default')
          }}
          disabled={isStreaming}
          title={`${planMode
            ? (language === 'en' ? 'Plan mode OFF' : '플랜 모드 OFF')
            : (language === 'en' ? 'Plan mode ON: read and analyze only' : '플랜 모드 ON: 읽기·분석만')}${permissionShortcutLabel ? ` (${permissionShortcutLabel})` : ''}`}
          className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
            planMode
              ? 'border border-claude-border bg-claude-surface text-claude-text'
              : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
          }`}
        >
          <span>📋</span>
          <span>{language === 'en' ? 'Plan mode' : '플랜 모드'}</span>
        </button>

        <button
          onClick={() => onPermissionModeChange('bypassPermissions')}
          disabled={isStreaming || planMode}
          title={
            planMode
              ? (language === 'en' ? 'Bypass is unavailable in plan mode' : '플랜 모드에서는 전체허용을 사용할 수 없음')
              : `${permissionOptions.find((option) => option.value === 'bypassPermissions')?.title ?? (language === 'en' ? 'Bypass' : '전체허용')}${bypassShortcutLabel ? ` (${bypassShortcutLabel})` : ''}`
          }
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
            permissionMode === 'bypassPermissions'
              ? 'border border-claude-border bg-claude-surface text-claude-text'
              : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
          }`}
        >
          {permissionOptions.find((option) => option.value === 'bypassPermissions')?.label ?? (language === 'en' ? '⚡ Bypass' : '⚡ 전체허용')}
        </button>
      </div>

      <div className="flex-1" />

      <ModelPicker
        model={model}
        models={models}
        loading={modelsLoading}
        language={language}
        onChange={onModelChange}
        disabled={isStreaming}
      />

      <div className="h-4 w-px flex-shrink-0 bg-claude-border" />

      {showStreamingUi ? (
        <button
          onClick={onAbort}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90"
          title={language === 'en' ? 'Stop' : '중단'}
        >
          <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5.25" y="5.25" width="13.5" height="13.5" rx="2.85" />
          </svg>
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-claude-surface-2 text-claude-text transition-colors hover:bg-claude-panel disabled:bg-claude-surface-2 disabled:text-claude-muted disabled:opacity-100"
          title={language === 'en' ? 'Send (Enter)' : '전송 (Enter)'}
        >
          <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  )
}
