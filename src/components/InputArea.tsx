import { AttachmentList } from './input/AttachmentList'
import { InputComposer } from './input/InputComposer'
import { useInputAreaController } from './input/useInputAreaController'
import type { InputAreaProps } from './input/inputAreaTypes'
import { useI18n } from '../hooks/useI18n'
import { useMcpRuntimeStore } from '../store/mcpRuntime'

export function InputArea({
  topSlot,
  ...props
}: InputAreaProps) {
  const { t } = useI18n()
  const controller = useInputAreaController(props)
  const backendSwitchNotice = props.modelSwitchNotice
  const authNotice = useMcpRuntimeStore((state) => state.authNotice)
  const clearAuthNotice = useMcpRuntimeStore((state) => state.clearAuthNotice)

  return (
    <div className="bg-claude-chat-bg px-6 pt-4 pb-5">
      <div className="mx-auto w-full max-w-[860px]">
        {topSlot}

        {backendSwitchNotice && (
          <div className="mb-3 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-amber-100">{t('input.modelSwitchWarning.title')}</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                {t('input.modelSwitchWarning.description', {
                  from: backendSwitchNotice.fromModel ?? t('input.modelPicker.defaultModel'),
                  to: backendSwitchNotice.toModel ?? t('input.modelPicker.defaultModel'),
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={props.onDismissModelSwitchNotice}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-500/20"
            >
              {t('input.modelSwitchWarning.confirm')}
            </button>
          </div>
        )}

        {authNotice && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-100">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-200">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {t('input.mcpAuthNotice', { serverName: authNotice.serverName })}
              </p>
              {authNotice.message ? (
                <p className="truncate text-[11px] text-amber-100/75">
                  {t('input.mcpAuthNoticeDetail', { message: authNotice.message })}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => clearAuthNotice(authNotice.id)}
              className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-100 transition-colors hover:bg-amber-500/20"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        <AttachmentList
          attachedFiles={controller.attachedFiles}
          skippedFiles={controller.skippedFiles}
          language={controller.language}
          onRemoveFile={controller.handleRemoveFile}
        />

        <InputComposer
          textareaRef={controller.textareaRef}
          language={controller.language}
          text={controller.text}
          attachedFileCount={controller.attachedFiles.length}
          isStreaming={props.isStreaming}
          allowStreamingInput={props.isStreaming}
          disabled={props.disabled || Boolean(backendSwitchNotice)}
          isDragOver={controller.isDragOver}
          showQuestionPrompt={controller.overlayProps.showQuestionPrompt}
          questionInputMode={controller.questionInputMode}
          onChange={controller.handleInput}
          onKeyDown={controller.handleKeyDown}
          onPaste={(event) => {
            void controller.handlePaste(event)
          }}
          onSelect={controller.handleSelect}
          onBlur={controller.handleComposerBlur}
          onCompositionStart={controller.handleCompositionStart}
          onCompositionEnd={controller.handleCompositionEnd}
          onDragEnter={controller.handleDragEnter}
          onDragOver={controller.handleDragOver}
          onDragLeave={controller.handleDragLeave}
          onDrop={controller.handleDrop}
          overlayProps={controller.overlayProps}
          mentionMenuProps={controller.mentionMenuProps}
          toolbarProps={controller.toolbarProps}
        />
      </div>
    </div>
  )
}
