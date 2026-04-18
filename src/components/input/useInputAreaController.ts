import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { FileEntry, SelectedFile } from '../../../electron/preload'
import { useSessionsStore } from '../../store/sessions'
import { useInputAttachments } from '../../hooks/useInputAttachments'
import { useInputKeyboard } from '../../hooks/useInputKeyboard'
import { useInputMentions } from '../../hooks/useInputMentions'
import { useInputModelData } from '../../hooks/useInputModelData'
import { useInputPrompts } from '../../hooks/useInputPrompts'
import { useI18n } from '../../hooks/useI18n'
import {
  buildPreviewSelectionKey,
  buildPreviewSelectionSummary,
  buildPreviewSelectionsDraft,
  type PreviewElementSelectionPayload,
} from '../chat/chatViewUtils'
import { extractBtwQuestion, sanitizeEnvVars } from './inputUtils'
import type { InputAreaProps } from './inputAreaTypes'

function mergeExternalDraftText(currentText: string, externalDraftText: string) {
  return currentText.trim().length > 0
    ? `${currentText.trimEnd()}\n\n${externalDraftText}`
    : externalDraftText
}

function togglePreviewSelectionDraft(
  currentSelections: PreviewElementSelectionPayload[],
  nextSelection: PreviewElementSelectionPayload,
) {
  const nextKey = buildPreviewSelectionKey(nextSelection)
  const exists = currentSelections.some((selection) => buildPreviewSelectionKey(selection) === nextKey)
  if (exists) {
    return currentSelections.filter((selection) => buildPreviewSelectionKey(selection) !== nextKey)
  }
  return [...currentSelections, nextSelection]
}

function mergePreviewSelectionAttachment(
  currentAttachments: Record<string, SelectedFile>,
  selectionKey: string,
  nextAttachment: SelectedFile | null | undefined,
  alreadySelected: boolean,
) {
  if (alreadySelected || !nextAttachment) {
    const { [selectionKey]: _removed, ...rest } = currentAttachments
    return rest
  }

  return {
    ...currentAttachments,
    [selectionKey]: nextAttachment,
  }
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
  previewSelectionResetToken,
  onPreviewSelectionDraftsChange,
  onOpenTeam,
  hasLinkedTeam,
}: InputAreaProps) {
  const { language, t } = useI18n()
  const envVars = useSessionsStore((state) => state.envVars)
  const sanitizedEnvVars = useMemo(() => sanitizeEnvVars(envVars), [envVars])
  const [text, setText] = useState('')
  const [previewSelectionDrafts, setPreviewSelectionDrafts] = useState<PreviewElementSelectionPayload[]>([])
  const [previewSelectionAttachments, setPreviewSelectionAttachments] = useState<Record<string, SelectedFile>>({})
  const previewSelectionKeysRef = useRef<Set<string>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const escapePressedAtRef = useRef(0)
  const lastAppliedDraftIdRef = useRef<number | null>(null)

  const {
    attachedFiles: manualAttachedFiles,
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
  const attachedFiles = useMemo(
    () => [...manualAttachedFiles, ...Object.values(previewSelectionAttachments)],
    [manualAttachedFiles, previewSelectionAttachments],
  )
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
    setPreviewSelectionDrafts([])
    setPreviewSelectionAttachments({})
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
    setHistoryIndex(null)
    closeAtMention()
    closeSlashMention()

    if (externalDraft.kind === 'preview-selection') {
      const selectionKey = buildPreviewSelectionKey(externalDraft.selection)
      const alreadySelected = previewSelectionKeysRef.current.has(selectionKey)
      setPreviewSelectionDrafts((current) => togglePreviewSelectionDraft(current, externalDraft.selection))
      setPreviewSelectionAttachments((currentAttachments) => mergePreviewSelectionAttachment(
        currentAttachments,
        selectionKey,
        externalDraft.attachment,
        alreadySelected,
      ))

      requestAnimationFrame(() => {
        const end = text.length
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(end, end)
      })
      return
    }

    setPreviewSelectionDrafts([])
    setPreviewSelectionAttachments({})
    const nextText = mergeExternalDraftText(text, externalDraft.text)

    setText(nextText)
    draftTextRef.current = nextText

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

  useEffect(() => {
    if (previewSelectionResetToken === undefined) return
    setPreviewSelectionDrafts([])
    setPreviewSelectionAttachments({})
  }, [previewSelectionResetToken])

  useEffect(() => {
    onPreviewSelectionDraftsChange?.(previewSelectionDrafts)
  }, [onPreviewSelectionDraftsChange, previewSelectionDrafts])

  useEffect(() => {
    previewSelectionKeysRef.current = new Set(
      previewSelectionDrafts.map((selection) => buildPreviewSelectionKey(selection)),
    )
  }, [previewSelectionDrafts])

  const btwQuestion = useMemo(() => extractBtwQuestion(text), [text])
  const previewSelectionItems = useMemo(() => (
    previewSelectionDrafts.map((selection) => ({
      key: buildPreviewSelectionKey(selection),
      selection,
      summary: buildPreviewSelectionSummary(selection, t),
    }))
  ), [previewSelectionDrafts, t])
  const canSendBtw = btwQuestion !== null && btwQuestion.length > 0

  const handleSend = useCallback(() => {
    const previewSelectionText = previewSelectionDrafts.length > 0
      ? buildPreviewSelectionsDraft(previewSelectionDrafts, t)
      : ''
    const trimmed = text.trim()
    const composedText = previewSelectionText
      ? trimmed.length > 0
        ? `${previewSelectionText}\n\n${trimmed}`
        : previewSelectionText
      : trimmed

    if ((!composedText.trim() && attachedFiles.length === 0) || disabled) return

    if (btwQuestion !== null) {
      if (btwQuestion.length === 0) return
      const composedBtwQuestion = previewSelectionText
        ? `${previewSelectionText}\n\n${btwQuestion}`
        : btwQuestion

      onSendBtw(composedBtwQuestion, attachedFiles)
      resetComposer()
      return
    }

    if (isStreaming) return

    onSend(composedText, attachedFiles)
    resetComposer()
  }, [attachedFiles, btwQuestion, disabled, isStreaming, onSend, onSendBtw, previewSelectionDrafts, resetComposer, t, text])

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
    : (text.trim().length > 0 || attachedFiles.length > 0 || previewSelectionDrafts.length > 0) && !isStreaming && !disabled

  const handleRemoveFile = useCallback((path: string) => {
    const previewSelectionKeyToRemove = Object.entries(previewSelectionAttachments)
      .find(([, file]) => file.path === path)?.[0] ?? null

    if (previewSelectionKeyToRemove) {
      setPreviewSelectionAttachments((current) => {
        const { [previewSelectionKeyToRemove]: _removed, ...rest } = current
        return rest
      })
      setPreviewSelectionDrafts((current) => current.filter((selection) => (
        buildPreviewSelectionKey(selection) !== previewSelectionKeyToRemove
      )))
      return
    }

    setAttachedFiles((current) => current.filter((file) => file.path !== path))
  }, [previewSelectionAttachments, setAttachedFiles])

  const clearPreviewSelectionDrafts = useCallback(() => {
    setPreviewSelectionDrafts([])
    setPreviewSelectionAttachments({})
    textareaRef.current?.focus()
  }, [])

  const removePreviewSelectionDraft = useCallback((selectionKey: string) => {
    setPreviewSelectionDrafts((current) => current.filter((selection) => buildPreviewSelectionKey(selection) !== selectionKey))
    setPreviewSelectionAttachments((current) => {
      const { [selectionKey]: _removed, ...rest } = current
      return rest
    })
    textareaRef.current?.focus()
  }, [])

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
    visibleAttachedFiles: manualAttachedFiles,
    skippedFiles,
    isDragOver,
    previewSelectionItems,
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
    clearPreviewSelectionDrafts,
    removePreviewSelectionDraft,
  }
}
