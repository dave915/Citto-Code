import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { FileEntry, SelectedFile } from '../../electron/preload'
import { useSessionsStore, type PendingPermissionRequest, type PendingQuestionRequest, type PermissionMode } from '../store/sessions'
import { useInputAttachments } from '../hooks/useInputAttachments'
import { useInputKeyboard } from '../hooks/useInputKeyboard'
import { useInputMentions } from '../hooks/useInputMentions'
import { useInputModelData } from '../hooks/useInputModelData'
import { useInputPrompts } from '../hooks/useInputPrompts'
import { AttachmentList } from './input/AttachmentList'
import { InputComposer } from './input/InputComposer'
import { extractBtwQuestion, sanitizeEnvVars } from './input/inputUtils'
import { useI18n } from '../hooks/useI18n'

function mergeExternalDraftText(currentText: string, externalDraftText: string) {
  return currentText.trim().length > 0
    ? `${currentText.trimEnd()}\n\n${externalDraftText}`
    : externalDraftText
}

type Props = {
  cwd: string
  promptHistory: string[]
  onSend: (text: string, files: SelectedFile[]) => void
  onSendBtw: (text: string, files: SelectedFile[]) => void
  onAbort: () => void
  pendingPermission: PendingPermissionRequest | null
  onPermissionRequestAction: (action: 'once' | 'always' | 'deny') => void
  pendingQuestion: PendingQuestionRequest | null
  onQuestionResponse: (answer: string | null) => void
  isStreaming: boolean
  disabled?: boolean
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
  externalDraft?: { id: number; text: string } | null
  topSlot?: ReactNode
  onOpenTeam?: () => void
  hasLinkedTeam?: boolean
}

export function InputArea({
  cwd,
  promptHistory,
  onSend,
  onSendBtw,
  onAbort,
  pendingPermission,
  onPermissionRequestAction,
  pendingQuestion,
  onQuestionResponse,
  isStreaming,
  disabled,
  permissionMode,
  planMode,
  model,
  onPermissionModeChange,
  onPlanModeChange,
  onModelChange,
  permissionShortcutLabel,
  bypassShortcutLabel,
  externalDraft,
  topSlot,
  onOpenTeam,
  hasLinkedTeam,
}: Props) {
  const { language } = useI18n()
  const envVars = useSessionsStore((state) => state.envVars)
  const sanitizedEnvVars = useMemo(() => sanitizeEnvVars(envVars), [envVars])
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const escapePressedAtRef = useRef(0)
  const lastAppliedDraftIdRef = useRef<number | null>(null)

  const {
    attachedFiles,
    isAttaching,
    isDragOver,
    setAttachedFiles,
    skippedFiles,
    handleAttachFiles,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
  } = useInputAttachments({ disabled, isStreaming })
  const { models, modelsLoading, slashCommands } = useInputModelData(sanitizedEnvVars, language)

  const syncTextareaHeight = useCallback((value: string) => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    if (value.length === 0) {
      textareaRef.current.style.height = 'auto'
    }
  }, [])

  const {
    applyHistoryText,
    atItemRefs,
    atResults,
    atSelectedIndex,
    closeAtMention,
    closeSlashMention,
    draftTextRef,
    handleAtSelect,
    handleInput,
    handleSelect,
    handleSlashSelect,
    historyIndex,
    setAtSelectedIndex,
    setHistoryIndex,
    setSlashSelectedIndex,
    slashItemRefs,
    slashResults,
    slashSelectedIndex,
  } = useInputMentions({
    cwd,
    promptHistory,
    slashCommands,
    syncTextareaHeight,
    text,
    textareaRef,
    setAttachedFiles,
    setText,
  })

  const resetComposer = useCallback(() => {
    setText('')
    setAttachedFiles([])
    closeAtMention()
    closeSlashMention()
    setHistoryIndex(null)
    draftTextRef.current = ''
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [closeAtMention, closeSlashMention, draftTextRef, setHistoryIndex, setAttachedFiles])

  const {
    handleQuestionSubmit,
    permissionActions,
    permissionItemRefs,
    permissionPreview,
    permissionSelectedIndex,
    questionInputMode,
    questionOptions,
    setPermissionSelectedIndex,
    setQuestionInputMode,
    showPermissionPrompt,
    showQuestionPrompt,
    showStreamingUi,
  } = useInputPrompts({
    pendingPermission,
    pendingQuestion,
    isStreaming,
    onPermissionRequestAction,
    onQuestionResponse,
    onAbort,
    permissionMode,
    planMode,
    onPermissionModeChange,
    onPlanModeChange,
    permissionShortcutLabel,
    bypassShortcutLabel,
    language,
    textareaRef,
    escapePressedAtRef,
    resetComposer,
  })

  useEffect(() => {
    if (!externalDraft || lastAppliedDraftIdRef.current === externalDraft.id) return

    lastAppliedDraftIdRef.current = externalDraft.id
    const nextText = mergeExternalDraftText(text, externalDraft.text)

    setText(nextText)
    setHistoryIndex(null)
    draftTextRef.current = nextText
    closeAtMention()
    closeSlashMention()

    requestAnimationFrame(() => {
      syncTextareaHeight(nextText)
      const end = nextText.length
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(end, end)
    })
  }, [closeAtMention, closeSlashMention, draftTextRef, externalDraft, syncTextareaHeight, text, setHistoryIndex])

  useEffect(() => {
    syncTextareaHeight(text)
  }, [syncTextareaHeight, text])

  const btwQuestion = useMemo(() => extractBtwQuestion(text), [text])
  const canSendBtw = btwQuestion !== null && btwQuestion.length > 0

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if ((!trimmed && attachedFiles.length === 0) || disabled) return

    if (btwQuestion !== null) {
      if (btwQuestion.length === 0) return
      onSendBtw(btwQuestion, attachedFiles)
      resetComposer()
      return
    }

    if (isStreaming) return

    onSend(trimmed, attachedFiles)
    resetComposer()
  }, [attachedFiles, btwQuestion, disabled, isStreaming, onSend, onSendBtw, resetComposer, text])

  const { handleKeyDown } = useInputKeyboard({
    text,
    attachedFiles,
    isStreaming,
    canSendWhileStreaming: canSendBtw,
    disabled,
    showQuestionPrompt,
    showPermissionPrompt,
    questionInputMode,
    questionOptions,
    permissionSelectedIndex,
    permissionActions,
    slashResults,
    atResults,
    atSelectedIndex,
    slashSelectedIndex,
    promptHistory,
    historyIndex,
    draftTextRef,
    applyHistoryText,
    handleAtSelect,
    handleSlashSelect,
    handleQuestionSubmit,
    handleSend,
    onAbort,
    onPermissionRequestAction,
    escapePressedAtRef,
    isComposingRef,
    closeAtMention,
    closeSlashMention,
    setAtSelectedIndex,
    setSlashSelectedIndex,
    setPermissionSelectedIndex,
    setQuestionInputMode,
    setHistoryIndex,
  })

  const canSend = btwQuestion !== null
    ? canSendBtw && !disabled
    : (text.trim().length > 0 || attachedFiles.length > 0) && !isStreaming && !disabled
  const overlayProps = {
    language,
    showQuestionPrompt,
    pendingQuestion,
    questionOptions,
    questionInputMode,
    showPermissionPrompt,
    pendingPermission,
    permissionPreview,
    permissionActions,
    permissionSelectedIndex,
    permissionItemRefs,
    onQuestionOptionSelect: (label: string) => {
      setQuestionInputMode(false)
      handleQuestionSubmit(label)
    },
    onPermissionAction: onPermissionRequestAction,
  }
  const mentionMenuProps = {
    language,
    slashResults,
    atResults,
    slashSelectedIndex,
    atSelectedIndex,
    slashItemRefs,
    atItemRefs,
    onSlashSelect: handleSlashSelect,
    onAtSelect: (file: FileEntry) => {
      void handleAtSelect(file)
    },
  }
  const toolbarProps = {
    language,
    isStreaming,
    disabled,
    isAttaching,
    handleAttachFiles: () => { void handleAttachFiles() },
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
    canSendWhileStreaming: canSendBtw,
    onOpenTeam,
    hasLinkedTeam,
  }
  const handleRemoveFile = (path: string) => {
    setAttachedFiles((current) => current.filter((file) => file.path !== path))
  }
  const handleComposerBlur = () => {
    setTimeout(() => {
      closeAtMention()
      closeSlashMention()
    }, 150)
  }
  const handleCompositionStart = () => {
    isComposingRef.current = true
  }
  const handleCompositionEnd = () => {
    isComposingRef.current = false
  }

  return (
    <div className="bg-claude-chat-bg px-6 pt-4 pb-5">
      <div className="mx-auto w-full max-w-[860px]">
        {topSlot}

        <AttachmentList
          attachedFiles={attachedFiles}
          skippedFiles={skippedFiles}
          language={language}
          onRemoveFile={handleRemoveFile}
        />

        <InputComposer
          textareaRef={textareaRef}
          language={language}
          text={text}
          attachedFileCount={attachedFiles.length}
          isStreaming={isStreaming}
          allowStreamingInput={isStreaming}
          disabled={disabled}
          isDragOver={isDragOver}
          showQuestionPrompt={showQuestionPrompt}
          questionInputMode={questionInputMode}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            void handlePaste(event)
          }}
          onSelect={handleSelect}
          onBlur={handleComposerBlur}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          overlayProps={overlayProps}
          mentionMenuProps={mentionMenuProps}
          toolbarProps={toolbarProps}
        />
      </div>
    </div>
  )
}
