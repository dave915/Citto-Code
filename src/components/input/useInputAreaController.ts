import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { FileEntry } from '../../../electron/preload'
import { useSessionsStore } from '../../store/sessions'
import { useInputAttachments } from '../../hooks/useInputAttachments'
import { useInputKeyboard } from '../../hooks/useInputKeyboard'
import { useInputMentions } from '../../hooks/useInputMentions'
import { useInputModelData } from '../../hooks/useInputModelData'
import { useInputPrompts } from '../../hooks/useInputPrompts'
import { useI18n } from '../../hooks/useI18n'
import { extractBtwQuestion, sanitizeEnvVars } from './inputUtils'
import type { InputAreaProps } from './inputAreaTypes'

function mergeExternalDraftText(currentText: string, externalDraftText: string) {
  return currentText.trim().length > 0
    ? `${currentText.trimEnd()}\n\n${externalDraftText}`
    : externalDraftText
}

export function useInputAreaController({
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
  onOpenTeam,
  hasLinkedTeam,
}: InputAreaProps) {
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

  const handleRemoveFile = useCallback((path: string) => {
    setAttachedFiles((current) => current.filter((file) => file.path !== path))
  }, [setAttachedFiles])

  const handleComposerBlur = useCallback(() => {
    setTimeout(() => {
      closeAtMention()
      closeSlashMention()
    }, 150)
  }, [closeAtMention, closeSlashMention])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false
  }, [])

  return {
    language,
    text,
    textareaRef,
    attachedFiles,
    skippedFiles,
    isDragOver,
    questionInputMode,
    overlayProps: {
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
    },
    mentionMenuProps: {
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
    },
    toolbarProps: {
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
    },
    handleInput,
    handleKeyDown,
    handlePaste,
    handleSelect,
    handleComposerBlur,
    handleCompositionStart,
    handleCompositionEnd,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRemoveFile,
  }
}
