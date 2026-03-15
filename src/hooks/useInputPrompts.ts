import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { matchShortcut } from '../lib/shortcuts'
import type { PendingPermissionRequest, PendingQuestionRequest, PermissionMode } from '../store/sessions'
import {
  PERMISSION_ACTIONS,
  cycleClaudeCodeMode,
  formatPermissionPreview,
} from '../components/input/inputUtils'

type UseInputPromptsOptions = {
  pendingPermission: PendingPermissionRequest | null
  pendingQuestion: PendingQuestionRequest | null
  isStreaming: boolean
  onPermissionRequestAction: (action: 'once' | 'always' | 'deny') => void
  onQuestionResponse: (answer: string | null) => void
  onAbort: () => void
  permissionMode: PermissionMode
  planMode: boolean
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
  textareaRef: RefObject<HTMLTextAreaElement>
  escapePressedAtRef: MutableRefObject<number>
  resetComposer: () => void
}

export function useInputPrompts({
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
  textareaRef,
  escapePressedAtRef,
  resetComposer,
}: UseInputPromptsOptions) {
  const [showStreamingUi, setShowStreamingUi] = useState(Boolean(isStreaming))
  const [permissionSelectedIndex, setPermissionSelectedIndex] = useState(0)
  const [questionInputMode, setQuestionInputMode] = useState(false)
  const permissionItemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const showPermissionPrompt = Boolean(pendingPermission) && !isStreaming
  const showQuestionPrompt = Boolean(pendingQuestion) && !showPermissionPrompt && !isStreaming
  const questionOptions = pendingQuestion?.options ?? []
  const permissionPreview = formatPermissionPreview(pendingPermission)

  const handleQuestionSubmit = useCallback((answer: string | null) => {
    const trimmed = answer?.trim() ?? ''
    onQuestionResponse(trimmed || null)
    if (!trimmed) return
    resetComposer()
  }, [onQuestionResponse, resetComposer])

  useEffect(() => {
    if ((pendingPermission || pendingQuestion) && !isStreaming) {
      setPermissionSelectedIndex(0)
      setQuestionInputMode(false)
    }
  }, [pendingPermission, pendingQuestion, isStreaming])

  useEffect(() => {
    permissionItemRefs.current[permissionSelectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [permissionSelectedIndex])

  useEffect(() => {
    if (isStreaming) {
      setShowStreamingUi(true)
      return
    }

    const timeout = window.setTimeout(() => {
      setShowStreamingUi(false)
    }, 1200)

    return () => window.clearTimeout(timeout)
  }, [isStreaming])

  useEffect(() => {
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (showQuestionPrompt) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          handleQuestionSubmit(null)
          return
        }

        if (questionInputMode) {
          if (
            event.key === 'ArrowUp' &&
            textareaRef.current &&
            textareaRef.current.selectionStart === textareaRef.current.selectionEnd &&
            textareaRef.current.selectionStart === 0
          ) {
            event.preventDefault()
            event.stopPropagation()
            setQuestionInputMode(false)
            setPermissionSelectedIndex(Math.max(questionOptions.length - 1, 0))
          }
          return
        }

        if (questionOptions.length > 0) {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            event.stopPropagation()
            if (permissionSelectedIndex === questionOptions.length - 1) {
              setQuestionInputMode(true)
            } else {
              setPermissionSelectedIndex((index) => (index + 1) % questionOptions.length)
            }
            return
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault()
            event.stopPropagation()
            setPermissionSelectedIndex((index) => Math.max(index - 1, 0))
            return
          }

          if (event.key === 'Tab') {
            event.preventDefault()
            event.stopPropagation()
            if (event.shiftKey) {
              setPermissionSelectedIndex((index) => Math.max(index - 1, 0))
            } else if (permissionSelectedIndex === questionOptions.length - 1) {
              setQuestionInputMode(true)
            } else {
              setPermissionSelectedIndex((index) => (index + 1) % questionOptions.length)
            }
            return
          }

          if (event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            handleQuestionSubmit(questionOptions[permissionSelectedIndex]?.label ?? null)
            return
          }
        }
      }

      if (showPermissionPrompt) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onPermissionRequestAction('deny')
          return
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          event.stopPropagation()
          setPermissionSelectedIndex((index) => (index + 1) % PERMISSION_ACTIONS.length)
          return
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault()
          event.stopPropagation()
          setPermissionSelectedIndex((index) => (index - 1 + PERMISSION_ACTIONS.length) % PERMISSION_ACTIONS.length)
          return
        }

        if (event.key === 'Tab') {
          event.preventDefault()
          event.stopPropagation()
          if (event.shiftKey) {
            setPermissionSelectedIndex((index) => (index - 1 + PERMISSION_ACTIONS.length) % PERMISSION_ACTIONS.length)
          } else {
            setPermissionSelectedIndex((index) => (index + 1) % PERMISSION_ACTIONS.length)
          }
          return
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          onPermissionRequestAction(PERMISSION_ACTIONS[permissionSelectedIndex].action)
          return
        }
      }

      if (event.key === 'Escape' && showStreamingUi) {
        const now = Date.now()
        event.preventDefault()
        event.stopPropagation()
        if (now - escapePressedAtRef.current < 600) {
          escapePressedAtRef.current = 0
          onAbort()
        } else {
          escapePressedAtRef.current = now
        }
        return
      }

      if (matchShortcut(event, permissionShortcutLabel)) {
        event.preventDefault()
        event.stopPropagation()
        cycleClaudeCodeMode(permissionMode, planMode, onPermissionModeChange, onPlanModeChange)
        return
      }

      if (bypassShortcutLabel && matchShortcut(event, bypassShortcutLabel)) {
        event.preventDefault()
        event.stopPropagation()
        if (!planMode) {
          onPermissionModeChange(permissionMode === 'bypassPermissions' ? 'default' : 'bypassPermissions')
        }
      }
    }

    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => window.removeEventListener('keydown', onKeyDownCapture, true)
  }, [
    showQuestionPrompt,
    questionInputMode,
    questionOptions,
    permissionSelectedIndex,
    showPermissionPrompt,
    handleQuestionSubmit,
    onPermissionRequestAction,
    showStreamingUi,
    onAbort,
    permissionMode,
    permissionShortcutLabel,
    planMode,
    bypassShortcutLabel,
    onPermissionModeChange,
    onPlanModeChange,
    textareaRef,
    escapePressedAtRef,
  ])

  useEffect(() => {
    if (showQuestionPrompt) {
      if (questionInputMode) {
        requestAnimationFrame(() => textareaRef.current?.focus())
      } else {
        requestAnimationFrame(() => permissionItemRefs.current[permissionSelectedIndex]?.focus())
      }
      return
    }

    if (showPermissionPrompt) {
      requestAnimationFrame(() => permissionItemRefs.current[permissionSelectedIndex]?.focus())
    }
  }, [showPermissionPrompt, showQuestionPrompt, questionInputMode, permissionSelectedIndex, textareaRef])

  return {
    handleQuestionSubmit,
    permissionActions: PERMISSION_ACTIONS,
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
  }
}
