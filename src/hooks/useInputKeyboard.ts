import { useCallback } from 'react'
import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, SetStateAction } from 'react'
import type { FileEntry, SelectedFile } from '../../electron/preload'
import type { SlashCommand } from '../components/input/inputUtils'
import { handleInputKeyboardEvent } from './inputKeyboardHandler'

type Params = {
  text: string
  attachedFiles: SelectedFile[]
  isStreaming: boolean
  canSendWhileStreaming?: boolean
  disabled?: boolean
  showQuestionPrompt: boolean
  showPermissionPrompt: boolean
  questionInputMode: boolean
  questionOptions: Array<{ label: string }>
  permissionSelectedIndex: number
  permissionActions: Array<{ action: 'once' | 'always' | 'deny' }>
  slashResults: SlashCommand[]
  atResults: FileEntry[]
  atSelectedIndex: number
  slashSelectedIndex: number
  promptHistory: string[]
  historyIndex: number | null
  draftTextRef: MutableRefObject<string>
  applyHistoryText: (value: string) => void
  handleAtSelect: (file: FileEntry) => void | Promise<void>
  handleSlashSelect: (command: SlashCommand) => void
  handleQuestionSubmit: (answer: string | null) => void
  handleSend: () => void
  onAbort: () => void
  onPermissionRequestAction: (action: 'once' | 'always' | 'deny') => void
  escapePressedAtRef: MutableRefObject<number>
  isComposingRef: MutableRefObject<boolean>
  closeAtMention: () => void
  closeSlashMention: () => void
  setAtSelectedIndex: Dispatch<SetStateAction<number>>
  setSlashSelectedIndex: Dispatch<SetStateAction<number>>
  setPermissionSelectedIndex: Dispatch<SetStateAction<number>>
  setQuestionInputMode: (value: boolean) => void
  setHistoryIndex: Dispatch<SetStateAction<number | null>>
}

export function useInputKeyboard({
  text,
  attachedFiles,
  isStreaming,
  canSendWhileStreaming,
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
}: Params) {
  const isImeKeyboardEvent = useCallback((native: KeyboardEvent) => (
    isComposingRef.current
    || native.isComposing
    || (native.keyCode || native.which) === 229
  ), [])

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    handleInputKeyboardEvent({
      event,
      text,
      attachedFilesCount: attachedFiles.length,
      isStreaming,
      canSendWhileStreaming,
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
      setAtSelectedIndex,
      setSlashSelectedIndex,
      setPermissionSelectedIndex,
      setQuestionInputMode,
      setHistoryIndex,
      isImeKeyboardEvent,
      closeAtMention,
      closeSlashMention,
    })
  }, [
    applyHistoryText,
    atResults,
    atSelectedIndex,
    attachedFiles.length,
    closeAtMention,
    closeSlashMention,
    disabled,
    draftTextRef,
    handleAtSelect,
    handleQuestionSubmit,
    handleSend,
    handleSlashSelect,
    historyIndex,
    isImeKeyboardEvent,
    isStreaming,
    canSendWhileStreaming,
    onAbort,
    onPermissionRequestAction,
    permissionActions,
    permissionSelectedIndex,
    promptHistory,
    questionInputMode,
    questionOptions,
    setAtSelectedIndex,
    setHistoryIndex,
    setPermissionSelectedIndex,
    setQuestionInputMode,
    setSlashSelectedIndex,
    showPermissionPrompt,
    showQuestionPrompt,
    slashResults,
    slashSelectedIndex,
    text,
  ])

  return {
    handleKeyDown,
  }
}
