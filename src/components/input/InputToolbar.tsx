import type { ModelInfo } from '../../../electron/preload'
import { translate, type AppLanguage } from '../../lib/i18n'
import type { PermissionMode } from '../../store/sessions'
import { AppButton, cx } from '../ui/appDesignSystem'
import { ModelPicker } from './ModelPicker'
import { getPermissionOptions } from './inputUtils'

export function InputToolbar({
  isStreaming,
  canSendWhileStreaming,
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
  onOpenTeam,
  hasLinkedTeam,
}: {
  isStreaming: boolean
  canSendWhileStreaming?: boolean
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
  onOpenTeam?: () => void
  hasLinkedTeam?: boolean
}) {
  const permissionOptions = getPermissionOptions(language)
  const bypassOption = permissionOptions.find((option) => option.value === 'bypassPermissions')

  return (
    <div className="flex items-center gap-2 border-t border-claude-border/70 px-4 pb-3 pt-2.5">
      <AppButton
        onClick={handleAttachFiles}
        disabled={isStreaming || disabled || isAttaching}
        title={translate(language, 'input.attachFiles')}
        size="icon"
        tone="ghost"
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
      </AppButton>

      {onOpenTeam && (
        <AppButton
          onClick={onOpenTeam}
          title={translate(language, 'team.openTeam')}
          tone={hasLinkedTeam ? 'accent' : 'ghost'}
          className="h-8 px-2.5"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="7" r="3" />
            <circle cx="17" cy="7" r="3" />
            <path strokeLinecap="round" d="M3 20c0-3.314 2.686-6 6-6h6c3.314 0 6 2.686 6 6" />
          </svg>
          {translate(language, 'team.openTeam')}
        </AppButton>
      )}

      <div className="h-4 w-px flex-shrink-0 bg-claude-border" />

      <div className="flex flex-shrink-0 items-center gap-0.5">
        {permissionOptions.filter((option) => option.value !== 'bypassPermissions').map((option) => {
          const isActive = !planMode && permissionMode === option.value

          return (
            <AppButton
              key={option.value}
              onClick={() => {
                if (planMode) onPlanModeChange(false)
                onPermissionModeChange(option.value)
              }}
              disabled={isStreaming}
              title={`${option.title}${permissionShortcutLabel ? ` (${permissionShortcutLabel})` : ''}`}
              tone={isActive ? 'secondary' : 'ghost'}
              className="h-8 px-3"
            >
              {option.label}
            </AppButton>
          )
        })}

        <AppButton
          onClick={() => {
            const nextPlanMode = !planMode
            onPlanModeChange(nextPlanMode)
            if (nextPlanMode) onPermissionModeChange('default')
          }}
          disabled={isStreaming}
          title={`${planMode
            ? translate(language, 'input.planMode.off')
            : translate(language, 'input.planMode.on')}${permissionShortcutLabel ? ` (${permissionShortcutLabel})` : ''}`}
          tone={planMode ? 'secondary' : 'ghost'}
          className="h-8 px-3"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="6" y="5" width="12" height="15" rx="2" />
            <path strokeLinecap="round" d="M9 9h6M9 13h6M9 17h4" />
          </svg>
          <span>{translate(language, 'input.planMode.label')}</span>
        </AppButton>

        <AppButton
          onClick={() => onPermissionModeChange('bypassPermissions')}
          disabled={isStreaming || planMode}
          title={
            planMode
              ? translate(language, 'input.bypassUnavailableInPlan')
              : `${bypassOption?.title ?? translate(language, 'input.permission.bypass.title')}${bypassShortcutLabel ? ` (${bypassShortcutLabel})` : ''}`
          }
          tone={permissionMode === 'bypassPermissions' ? 'accent' : 'ghost'}
          className="h-8 px-3"
        >
          {bypassOption?.label ?? `⚡ ${translate(language, 'input.permission.bypass.label')}`}
        </AppButton>
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

      {showStreamingUi && !canSendWhileStreaming ? (
        <AppButton
          onClick={onAbort}
          size="icon"
          tone="danger"
          className="h-9 w-9"
          title={translate(language, 'input.stop')}
        >
          <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5.25" y="5.25" width="13.5" height="13.5" rx="2.85" />
          </svg>
        </AppButton>
      ) : (
        <AppButton
          onClick={handleSend}
          disabled={!canSend}
          size="icon"
          tone="accent"
          className={cx('h-9 w-9')}
          title={translate(language, canSendWhileStreaming ? 'input.btw.send' : 'input.send')}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
          </svg>
        </AppButton>
      )}
    </div>
  )
}
