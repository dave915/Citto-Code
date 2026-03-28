import { AttachmentList } from './input/AttachmentList'
import { InputComposer } from './input/InputComposer'
import { useInputAreaController } from './input/useInputAreaController'
import type { InputAreaProps } from './input/inputAreaTypes'

export function InputArea({
  topSlot,
  ...props
}: InputAreaProps) {
  const controller = useInputAreaController(props)

  return (
    <div className="bg-claude-chat-bg px-6 pt-4 pb-5">
      <div className="mx-auto w-full max-w-[860px]">
        {topSlot}

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
          disabled={props.disabled}
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
