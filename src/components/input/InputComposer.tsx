import type { ComponentProps, RefObject } from 'react'
import type { AppLanguage } from '../../lib/i18n'
import { InputPromptOverlay } from './InputPromptOverlay'
import { InputToolbar } from './InputToolbar'
import { MentionMenu } from './MentionMenu'

type Props = {
  textareaRef: RefObject<HTMLTextAreaElement>
  language: AppLanguage
  text: string
  attachedFileCount: number
  isStreaming: boolean
  disabled?: boolean
  isDragOver: boolean
  showQuestionPrompt: boolean
  questionInputMode: boolean
  onChange: ComponentProps<'textarea'>['onChange']
  onKeyDown: ComponentProps<'textarea'>['onKeyDown']
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
  disabled,
  isDragOver,
  showQuestionPrompt,
  questionInputMode,
  onChange,
  onKeyDown,
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
        className={`relative overflow-hidden rounded-[24px] border bg-claude-panel transition-all ${
          isDragOver
            ? 'border-white/25 ring-1 ring-white/12'
            : 'border-claude-border'
        }`}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 rounded-[24px] border border-white/10 bg-white/[0.03]" />
        )}

        <div className="px-5 pb-3 pt-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onSelect={onSelect}
            onBlur={onBlur}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            placeholder={
              isStreaming
                ? (language === 'en' ? 'Waiting for a response...' : '응답을 기다리는 중...')
                : attachedFileCount > 0
                  ? (language === 'en' ? 'Ask about the files or enter instructions...' : '파일에 대해 질문하거나 지시사항을 입력하세요...')
                  : (language === 'en'
                      ? '@ for file references · / for commands · Shift+Enter: newline · Enter: send'
                      : '@로 파일참조 · /로 명령어 · Shift+Enter: 줄바꿈 · Enter: 전송')
            }
            rows={1}
            disabled={isStreaming || disabled}
            readOnly={showQuestionPrompt && !questionInputMode}
            className="chat-input-textarea min-h-[28px] max-h-[200px] w-full resize-none bg-transparent text-[15px] leading-7 text-claude-text outline-none placeholder:text-claude-muted disabled:opacity-50"
          />
        </div>

        <InputToolbar {...toolbarProps} />
      </div>
    </div>
  )
}
