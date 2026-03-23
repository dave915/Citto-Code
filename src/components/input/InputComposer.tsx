import type { ComponentProps, RefObject } from 'react'
import { translate, type AppLanguage } from '../../lib/i18n'
import { InputPromptOverlay } from './InputPromptOverlay'
import { InputToolbar } from './InputToolbar'
import { MentionMenu } from './MentionMenu'

type Props = {
  textareaRef: RefObject<HTMLTextAreaElement>
  language: AppLanguage
  text: string
  attachedFileCount: number
  isStreaming: boolean
  allowStreamingInput?: boolean
  disabled?: boolean
  isDragOver: boolean
  showQuestionPrompt: boolean
  questionInputMode: boolean
  onChange: ComponentProps<'textarea'>['onChange']
  onKeyDown: ComponentProps<'textarea'>['onKeyDown']
  onPaste: ComponentProps<'textarea'>['onPaste']
  onSelect: ComponentProps<'textarea'>['onSelect']
  onBlur: () => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
  onDragEnter: ComponentProps<'div'>['onDragEnter']
  onDragOver: ComponentProps<'div'>['onDragOver']
  onDragLeave: ComponentProps<'div'>['onDragLeave']
  onDrop: ComponentProps<'div'>['onDrop']
  overlayProps: ComponentProps<typeof InputPromptOverlay>
  mentionMenuProps: ComponentProps<typeof MentionMenu>
  toolbarProps: ComponentProps<typeof InputToolbar>
}

export function InputComposer({
  textareaRef,
  language,
  text,
  attachedFileCount,
  isStreaming,
  allowStreamingInput,
  disabled,
  isDragOver,
  showQuestionPrompt,
  questionInputMode,
  onChange,
  onKeyDown,
  onPaste,
  onSelect,
  onBlur,
  onCompositionStart,
  onCompositionEnd,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  overlayProps,
  mentionMenuProps,
  toolbarProps,
}: Props) {
  return (
    <div className="relative">
      <InputPromptOverlay {...overlayProps} />
      <MentionMenu {...mentionMenuProps} />

      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative overflow-hidden rounded-[12px] border bg-claude-panel transition-all ${
          isDragOver
            ? 'border-white/25 ring-1 ring-white/12'
            : 'border-claude-border'
        }`}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 rounded-[12px] border border-white/10 bg-white/[0.03]" />
        )}

        <div className="px-5 pb-3 pt-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onSelect={onSelect}
            onBlur={onBlur}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            placeholder={
              isStreaming
                ? translate(language, allowStreamingInput ? 'input.placeholder.waitingWithBtw' : 'input.placeholder.waiting')
                : attachedFileCount > 0
                  ? translate(language, 'input.placeholder.withFiles')
                  : translate(language, 'input.placeholder.default')
            }
            rows={1}
            disabled={(isStreaming && !allowStreamingInput) || disabled}
            readOnly={showQuestionPrompt && !questionInputMode}
            className="chat-input-textarea min-h-[28px] max-h-[200px] w-full resize-none bg-transparent text-[15px] leading-7 text-claude-text outline-none placeholder:text-claude-muted disabled:opacity-50"
          />
        </div>

        <InputToolbar {...toolbarProps} />
      </div>
    </div>
  )
}
