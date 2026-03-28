import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, SetStateAction } from 'react'
import type { FileEntry } from '../../electron/preload'
import type { SlashCommand } from '../components/input/inputUtils'

type InputKeyboardHandlerParams = {
  event: ReactKeyboardEvent<HTMLTextAreaElement>
  text: string
  attachedFilesCount: number
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
  setAtSelectedIndex: Dispatch<SetStateAction<number>>
  setSlashSelectedIndex: Dispatch<SetStateAction<number>>
  setPermissionSelectedIndex: Dispatch<SetStateAction<number>>
  setQuestionInputMode: (value: boolean) => void
  setHistoryIndex: Dispatch<SetStateAction<number | null>>
  isImeKeyboardEvent: (native: KeyboardEvent) => boolean
  closeAtMention: () => void
  closeSlashMention: () => void
}

function getTextareaLineState(textarea: HTMLTextAreaElement) {
  const cursor = textarea.selectionStart
  const hasSelection = textarea.selectionStart !== textarea.selectionEnd
  const beforeCursor = textarea.value.slice(0, cursor)
  const afterCursor = textarea.value.slice(cursor)

  return {
    hasSelection,
    isAtFirstLine: !beforeCursor.includes('\n'),
    isAtLastLine: !afterCursor.includes('\n'),
  }
}

function getUniqueHistory(promptHistory: string[]) {
  return [...new Set(promptHistory)].reverse()
}

export function handleInputKeyboardEvent({
  event,
  text,
  attachedFilesCount,
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
}: InputKeyboardHandlerParams) {
  const { hasSelection, isAtFirstLine, isAtLastLine } = getTextareaLineState(event.currentTarget)

  if (showQuestionPrompt) {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleQuestionSubmit(null)
      return
    }

    if (questionInputMode && event.key === 'ArrowUp' && isAtFirstLine && !hasSelection) {
      event.preventDefault()
      setQuestionInputMode(false)
      setPermissionSelectedIndex(Math.max(questionOptions.length - 1, 0))
      return
    }

    if (!questionInputMode && questionOptions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (permissionSelectedIndex === questionOptions.length - 1) {
          setQuestionInputMode(true)
        } else {
          setPermissionSelectedIndex((index) => (index + 1) % questionOptions.length)
        }
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setPermissionSelectedIndex((index) => Math.max(index - 1, 0))
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        if (event.shiftKey) {
          setPermissionSelectedIndex((index) => Math.max(index - 1, 0))
        } else if (permissionSelectedIndex === questionOptions.length - 1) {
          setQuestionInputMode(true)
        } else {
          setPermissionSelectedIndex((index) => (index + 1) % questionOptions.length)
        }
        return
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleQuestionSubmit(questionOptions[permissionSelectedIndex]?.label ?? null)
        return
      }

      if (
        event.key.length === 1
        || event.key === 'Backspace'
        || event.key === 'Delete'
        || event.key === 'Home'
        || event.key === 'End'
      ) {
        event.preventDefault()
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && text.trim()) {
      const native = event.nativeEvent as KeyboardEvent
      if (isImeKeyboardEvent(native)) return
      event.preventDefault()
      handleQuestionSubmit(text)
      return
    }
  }

  if (showPermissionPrompt) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onPermissionRequestAction('deny')
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setPermissionSelectedIndex((index) => (index + 1) % permissionActions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setPermissionSelectedIndex((index) => (index - 1 + permissionActions.length) % permissionActions.length)
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey) {
        setPermissionSelectedIndex((index) => (index - 1 + permissionActions.length) % permissionActions.length)
      } else {
        setPermissionSelectedIndex((index) => (index + 1) % permissionActions.length)
      }
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onPermissionRequestAction(permissionActions[permissionSelectedIndex].action)
      return
    }
  }

  if (event.key === 'Escape') {
    const now = Date.now()

    if (slashResults.length > 0) {
      event.preventDefault()
      closeSlashMention()
      escapePressedAtRef.current = 0
      return
    }

    if (atResults.length > 0) {
      event.preventDefault()
      closeAtMention()
      escapePressedAtRef.current = 0
      return
    }

    if (isStreaming) {
      event.preventDefault()
      if (now - escapePressedAtRef.current < 600) {
        escapePressedAtRef.current = 0
        onAbort()
      } else {
        escapePressedAtRef.current = now
      }
      return
    }

    escapePressedAtRef.current = 0
    return
  }

  escapePressedAtRef.current = 0

  if (!hasSelection && slashResults.length === 0 && atResults.length === 0 && promptHistory.length > 0) {
    const uniqueHistory = getUniqueHistory(promptHistory)

    if (event.key === 'ArrowUp' && isAtFirstLine) {
      event.preventDefault()
      if (uniqueHistory.length === 0) return
      const nextIndex = historyIndex === null ? 0 : Math.min(historyIndex + 1, uniqueHistory.length - 1)
      if (historyIndex === null) {
        draftTextRef.current = text
      }
      setHistoryIndex(nextIndex)
      applyHistoryText(uniqueHistory[nextIndex])
      return
    }

    if (event.key === 'ArrowDown' && historyIndex !== null && isAtLastLine) {
      event.preventDefault()
      if (historyIndex <= 0) {
        setHistoryIndex(null)
        applyHistoryText(draftTextRef.current)
      } else {
        const nextIndex = historyIndex - 1
        setHistoryIndex(nextIndex)
        applyHistoryText(uniqueHistory[nextIndex])
      }
      return
    }
  }

  if (slashResults.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSlashSelectedIndex((index) => (index + 1) % slashResults.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSlashSelectedIndex((index) => (index - 1 + slashResults.length) % slashResults.length)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      const native = event.nativeEvent as KeyboardEvent
      if (!isImeKeyboardEvent(native)) {
        event.preventDefault()
        handleSlashSelect(slashResults[slashSelectedIndex])
        return
      }
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      handleSlashSelect(slashResults[slashSelectedIndex])
      return
    }
  }

  if (atResults.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setAtSelectedIndex((index) => (index + 1) % atResults.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setAtSelectedIndex((index) => (index - 1 + atResults.length) % atResults.length)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      const native = event.nativeEvent as KeyboardEvent
      if (!isImeKeyboardEvent(native)) {
        event.preventDefault()
        void handleAtSelect(atResults[atSelectedIndex])
        return
      }
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      void handleAtSelect(atResults[atSelectedIndex])
      return
    }
  }

  if (event.key !== 'Enter' || event.shiftKey) return

  const native = event.nativeEvent as KeyboardEvent
  if (isImeKeyboardEvent(native)) return

  if ((text.trim().length === 0 && attachedFilesCount === 0) || disabled || (isStreaming && !canSendWhileStreaming)) {
    event.preventDefault()
    return
  }

  event.preventDefault()
  handleSend()
}
