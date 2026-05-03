import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  SecretaryAction,
  SecretaryBotState,
  SecretaryConversation,
  SecretaryFloatingPlacement,
  SecretaryHistoryEntry,
  SecretaryProcessResult,
} from '../../electron/preload'
import { SecretaryCharacter } from '../components/secretary/SecretaryCharacter'
import { SecretaryMessage, type SecretaryUiMessage } from '../components/secretary/SecretaryMessage'
import { SecretaryModelPicker } from '../components/secretary/SecretaryModelPicker'
import { useInputModelData } from '../hooks/useInputModelData'
import { applyTheme, type ThemeId } from '../lib/theme'

const SECRETARY_HISTORY_LIMIT = 80
const SECRETARY_RESPONSE_TIMEOUT_MS = 75_000
const SECRETARY_CHARACTER_DRAG_THRESHOLD_PX = 4
const EMPTY_MODEL_ENV_VARS: Record<string, string> = {}

type CharacterDragState = {
  pointerId: number
  startScreenX: number
  startScreenY: number
  lastScreenX: number
  lastScreenY: number
  moved: boolean
}

function createMessageId() {
  return `secretary-floating-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function buildGreetingMessage(): SecretaryUiMessage {
  return {
    id: createMessageId(),
    role: 'secretary',
    content: '무엇을 도와드릴까요?',
  }
}

function buildHistoryMessage(entry: SecretaryHistoryEntry): SecretaryUiMessage {
  return {
    id: `secretary-floating-history-${entry.id}`,
    role: entry.role,
    content: entry.content,
    action: entry.action,
    searchResults: entry.searchResults,
    actionState: entry.action ? 'pending' : undefined,
  }
}

function buildAssistantMessage(result: SecretaryProcessResult): SecretaryUiMessage {
  return {
    id: createMessageId(),
    role: 'secretary',
    content: result.reply,
    action: result.action,
    searchResults: result.searchResults,
    actionState: result.action ? 'pending' : undefined,
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer)
  })
}

export function SecretaryFloating() {
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(true)
  const [sending, setSending] = useState(false)
  const [botState, setBotState] = useState<SecretaryBotState>('idle')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<SecretaryUiMessage[]>(() => [buildGreetingMessage()])
  const [activeConversation, setActiveConversation] = useState<SecretaryConversation | null>(null)
  const [appModel, setAppModel] = useState<string | null>(null)
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  const [placement, setPlacement] = useState<SecretaryFloatingPlacement>({ horizontal: 'left', vertical: 'top' })
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const requestSeqRef = useRef(0)
  const characterDragRef = useRef<CharacterDragState | null>(null)
  const suppressCharacterClickRef = useRef(false)
  const { models, modelsLoading } = useInputModelData(EMPTY_MODEL_ENV_VARS, 'ko')

  const lastAssistantPreview = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.role === 'secretary' && message.content.trim())
    return last?.content.replace(/\s+/g, ' ').trim() || '무엇을 도와드릴까요?'
  }, [messages])

  useEffect(() => {
    const cleanup = window.secretary.onBotState((state) => {
      setBotState(state)
    })
    return cleanup
  }, [])

  useEffect(() => {
    const cleanup = window.secretary.onFloatingPlacement((nextPlacement) => {
      setPlacement(nextPlacement)
    })
    return cleanup
  }, [])

  useEffect(() => {
    const cleanup = window.secretary.onPanelToggle((open) => {
      setVisible(open)
      if (!open) {
        setExpanded(false)
        return
      }
      void loadActiveConversation()
    })
    return cleanup
  }, [])

  useEffect(() => {
    void loadActiveConversation()
    void window.secretary.getActiveContext()
      .then((context) => {
        setAppModel(context.currentModel ?? null)
        if (context.themeId) applyTheme(context.themeId as ThemeId)
        if (typeof context.uiFontSize === 'number') {
          document.documentElement.style.setProperty('--citto-code-font-size', `${context.uiFontSize}px`)
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!expanded) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [expanded, messages])

  useEffect(() => {
    if (!expanded) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [expanded])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (expanded) {
        collapse()
        return
      }
      void window.secretary.setPanelOpen(false)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [expanded])

  const loadActiveConversation = async () => {
    try {
      const conversation = await window.secretary.getActiveConversation()
      setActiveConversation(conversation)
      const history = await window.secretary.getHistory(conversation.id, SECRETARY_HISTORY_LIMIT)
      const chronologicalHistory = [...history].reverse()
      setMessages(chronologicalHistory.length > 0
        ? chronologicalHistory.map(buildHistoryMessage)
        : [buildGreetingMessage()])
      const context = await window.secretary.getActiveContext()
      setAppModel(context.currentModel ?? null)
    } catch {
      setMessages((current) => current.length > 0 ? current : [buildGreetingMessage()])
    }
  }

  const expand = () => {
    if (expanded) return
    setExpanded(true)
    void window.secretary.setFloatingExpanded(true)
  }

  const collapse = () => {
    setExpanded(false)
    void window.secretary.setFloatingExpanded(false)
  }

  const toggleFromCharacterClick = () => {
    if (expanded) {
      collapse()
      return
    }
    expand()
  }

  const handleCharacterPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    characterDragRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      moved: false,
    }
    suppressCharacterClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleCharacterPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = characterDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()

    const totalDeltaX = event.screenX - drag.startScreenX
    const totalDeltaY = event.screenY - drag.startScreenY
    if (!drag.moved && Math.hypot(totalDeltaX, totalDeltaY) < SECRETARY_CHARACTER_DRAG_THRESHOLD_PX) {
      return
    }

    const deltaX = event.screenX - drag.lastScreenX
    const deltaY = event.screenY - drag.lastScreenY
    if (deltaX === 0 && deltaY === 0) return

    drag.moved = true
    drag.lastScreenX = event.screenX
    drag.lastScreenY = event.screenY
    window.secretary.moveFloatingBy(deltaX, deltaY)
  }

  const finishCharacterDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = characterDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    characterDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    suppressCharacterClickRef.current = drag.moved
    if (drag.moved) {
      event.preventDefault()
    }
  }

  const handleCharacterClick = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (suppressCharacterClickRef.current) {
      suppressCharacterClickRef.current = false
      return
    }
    toggleFromCharacterClick()
  }

  const renderDraggableCharacter = (ariaLabel: string) => (
    <button
      type="button"
      className="secretary-floating-character-button"
      aria-label={ariaLabel}
      title="드래그해서 이동"
      onPointerDown={handleCharacterPointerDown}
      onPointerMove={handleCharacterPointerMove}
      onPointerUp={finishCharacterDrag}
      onPointerCancel={finishCharacterDrag}
      onClick={handleCharacterClick}
    >
      <SecretaryCharacter state={botState} size={82} />
    </button>
  )

  const updateMessage = (messageId: string, patch: Partial<SecretaryUiMessage>) => {
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, ...patch } : message
    )))
  }

  const handleCreateConversation = async () => {
    const conversation = await window.secretary.createConversation()
    setActiveConversation(conversation)
    setMessages([buildGreetingMessage()])
  }

  const handleSend = async () => {
    const input = draft.trim()
    if (!input || sending) return

    const requestId = requestSeqRef.current + 1
    requestSeqRef.current = requestId
    setDraft('')
    setSending(true)
    setBotState('working')
    setMessages((current) => [...current, { id: createMessageId(), role: 'user', content: input }])

    try {
      const result = await withTimeout(
        window.secretary.process(input, modelOverride ? { defaultModel: modelOverride } : undefined),
        SECRETARY_RESPONSE_TIMEOUT_MS,
        '비서 응답이 오래 걸려서 이번 요청을 중단했어요. 잠시 후 다시 시도해 주세요.',
      )
      if (requestSeqRef.current !== requestId) return
      setMessages((current) => [...current, buildAssistantMessage(result)])
      setBotState(result.action ? 'done' : 'idle')
      void window.secretary.getActiveConversation().then(setActiveConversation).catch(() => undefined)
    } catch (error) {
      if (requestSeqRef.current !== requestId) return
      setBotState('error')
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: 'secretary',
          content: error instanceof Error ? error.message : '응답을 만들지 못했어요.',
        },
      ])
    } finally {
      if (requestSeqRef.current === requestId) setSending(false)
    }
  }

  const handleConfirmAction = async (messageId: string, action: SecretaryAction) => {
    updateMessage(messageId, { actionState: 'accepted' })
    setSending(true)
    setBotState('working')
    try {
      const result = await window.secretary.executeAction(action)
      setBotState(result.ok ? 'done' : 'error')
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: 'secretary',
          content: result.ok
            ? result.message ?? '실행이 완료되었습니다.'
            : result.error ?? result.message ?? '실행하지 못했어요.',
        },
      ])
    } catch (error) {
      setBotState('error')
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: 'secretary',
          content: error instanceof Error ? error.message : '실행하지 못했어요.',
        },
      ])
    } finally {
      setSending(false)
    }
  }

  if (!visible) return null

  const shellClassName = [
    'secretary-floating-shell',
    expanded ? 'secretary-floating-expanded-shell' : 'secretary-floating-collapsed-shell',
    `secretary-floating-content-${placement.horizontal}`,
    `secretary-floating-content-${placement.vertical}`,
  ].join(' ')

  if (!expanded) {
    return (
      <div className={shellClassName}>
        {renderDraggableCharacter('씨토 열기 또는 드래그해서 이동')}
        <button
          type="button"
          className="secretary-floating-bubble"
          onClick={expand}
          aria-label="씨토 열기"
        >
          <strong>{lastAssistantPreview}</strong>
          <small>클릭해서 열기 · Esc 숨기기</small>
        </button>
      </div>
    )
  }

  return (
    <div className={shellClassName}>
      <section className="secretary-floating-expanded" aria-label="씨토 플로팅 대화">
        <header className="secretary-floating-header">
          <div className="secretary-floating-title">
            <h1>{activeConversation?.title ?? '씨토'}</h1>
          </div>
          <div className="secretary-floating-actions no-drag">
            <SecretaryModelPicker
              model={modelOverride}
              appModel={appModel}
              models={models}
              loading={modelsLoading}
              onChange={setModelOverride}
            />
            <button type="button" onClick={() => void window.secretary.openMainWindow()} title="앱 열기" aria-label="앱 열기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h6v6H9z" />
              </svg>
            </button>
            <button type="button" onClick={() => void handleCreateConversation()} title="새 대화" aria-label="새 대화">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
              </svg>
            </button>
            <button type="button" onClick={collapse} title="접기" aria-label="접기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="secretary-floating-transcript">
          {messages.map((message) => (
            <SecretaryMessage
              key={message.id}
              message={message}
              onConfirmAction={handleConfirmAction}
              onDenyAction={(messageId) => updateMessage(messageId, { actionState: 'denied' })}
            />
          ))}
          {sending && (
            <div className="secretary-chat-row secretary-chat-row-assistant">
              <div className="secretary-message-card secretary-message-card-assistant secretary-message-card-pending">
                확인 중...
              </div>
            </div>
          )}
        </div>

        <form
          className="secretary-floating-input-shell"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSend()
          }}
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void handleSend()
              }
            }}
            placeholder="씨토에게 물어보기"
            rows={2}
          />
          <button type="submit" disabled={!draft.trim() || sending} aria-label="전송">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </section>

      {renderDraggableCharacter('씨토 접기 또는 드래그해서 이동')}
    </div>
  )
}
