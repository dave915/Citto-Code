import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  SecretaryAction,
  SecretaryBotState,
  SecretaryConversation,
  SecretaryHistoryEntry,
  SecretaryProcessResult,
  SecretaryRuntimeConfig,
  SelectedFile,
} from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { buildPromptWithAttachments, formatAttachedFilesSummary } from '../../lib/attachmentPrompts'
import { resolveEnvVarsForModel } from '../../lib/claudeRuntime'
import type { PermissionMode } from '../../store/sessions'
import { InputArea } from '../InputArea'
import { ConversationList } from './ConversationList'
import { SecretaryCharacter } from './SecretaryCharacter'
import { SecretaryMessage, type SecretaryUiMessage } from './SecretaryMessage'

type Props = {
  open: boolean
  onClose: () => void
  mode?: 'overlay' | 'screen'
  runtimeConfig?: SecretaryRuntimeConfig
  composerCwd?: string
}

const SECRETARY_HISTORY_LIMIT = 80
const SECRETARY_RESPONSE_TIMEOUT_MS = 75_000

function createMessageId() {
  return `secretary-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function buildGreetingMessage(): SecretaryUiMessage {
  return {
    id: createMessageId(),
    role: 'secretary',
    content: '무엇을 이어서 할까요? Citto 화면과 지금까지 나눈 대화를 함께 보고 도와드릴게요.',
  }
}

function buildHistoryMessage(entry: SecretaryHistoryEntry): SecretaryUiMessage {
  return {
    id: `secretary-history-${entry.id}`,
    role: entry.role,
    content: entry.content,
  }
}

function buildAssistantMessage(result: SecretaryProcessResult): SecretaryUiMessage {
  return {
    id: createMessageId(),
    role: 'secretary',
    content: result.reply,
    action: result.action,
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

export function SecretaryPanel({ open, onClose, mode = 'overlay', runtimeConfig, composerCwd }: Props) {
  const { language } = useI18n()
  const [sending, setSending] = useState(false)
  const [botState, setBotState] = useState<SecretaryBotState>('idle')
  const [messages, setMessages] = useState<SecretaryUiMessage[]>(() => [buildGreetingMessage()])
  const [conversations, setConversations] = useState<SecretaryConversation[]>([])
  const [activeConversation, setActiveConversation] = useState<SecretaryConversation | null>(null)
  const [conversationListOpen, setConversationListOpen] = useState(false)
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
  const [planMode, setPlanMode] = useState(false)
  const [composerModel, setComposerModel] = useState<string | null>(runtimeConfig?.defaultModel ?? null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const submittedDuringHistoryLoadRef = useRef(false)
  const requestSeqRef = useRef(0)
  const isScreen = mode === 'screen'
  const promptHistory = useMemo(
    () => messages
      .filter((message) => message.role === 'user' && message.content.trim().length > 0)
      .map((message) => message.content),
    [messages],
  )

  const stateLabel = useMemo(() => {
    if (botState === 'working') return '생각 중'
    if (botState === 'done') return '제안 준비됨'
    if (botState === 'error') return '확인 필요'
    return '대기 중'
  }, [botState])

  useEffect(() => {
    setComposerModel(runtimeConfig?.defaultModel ?? null)
  }, [runtimeConfig?.defaultModel])

  useEffect(() => {
    const cleanup = window.secretary.onBotState((state) => {
      setBotState(state)
    })
    return cleanup
  }, [])

  const refreshConversations = async () => {
    const list = await window.secretary.listConversations()
    setConversations(list)
    return list
  }

  const loadConversation = async (conversation: SecretaryConversation) => {
    setActiveConversation(conversation)
    const [history] = await Promise.all([
      window.secretary.getHistory(conversation.id, SECRETARY_HISTORY_LIMIT),
      refreshConversations(),
    ])
    const chronologicalHistory = [...history].reverse()
    setMessages(chronologicalHistory.length > 0
      ? chronologicalHistory.map(buildHistoryMessage)
      : [buildGreetingMessage()])
  }

  useEffect(() => {
    if (!open) return undefined

    let cancelled = false
    submittedDuringHistoryLoadRef.current = false
    Promise.all([
      window.secretary.getActiveConversation(),
      window.secretary.listConversations(),
    ])
      .then(async ([conversation, conversationList]) => {
        if (cancelled || submittedDuringHistoryLoadRef.current) return
        setActiveConversation(conversation)
        setConversations(conversationList)
        const history = await window.secretary.getHistory(conversation.id, SECRETARY_HISTORY_LIMIT)
        if (cancelled || submittedDuringHistoryLoadRef.current) return
        const chronologicalHistory = [...history].reverse()
        setMessages(chronologicalHistory.length > 0
          ? chronologicalHistory.map(buildHistoryMessage)
          : [buildGreetingMessage()])
      })
      .catch(() => {
        if (!cancelled) {
          setMessages((current) => current.length > 0 ? current : [buildGreetingMessage()])
        }
      })

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, open])

  const updateMessage = (messageId: string, patch: Partial<SecretaryUiMessage>) => {
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, ...patch } : message
    )))
  }

  const buildRuntimeForRequest = (): SecretaryRuntimeConfig => {
    const selectedModel = composerModel ?? runtimeConfig?.defaultModel ?? null
    const envVars = resolveEnvVarsForModel(selectedModel, runtimeConfig?.envVars ?? {}) ?? runtimeConfig?.envVars
    return {
      ...runtimeConfig,
      defaultModel: selectedModel,
      envVars,
    }
  }

  const handleSecretarySend = async (text: string, files: SelectedFile[]) => {
    const trimmedText = text.trim()
    const prompt = buildPromptWithAttachments(trimmedText, files, language, {
      includeImageReferences: true,
    }).trim()
    if (!prompt || sending) return

    const requestId = requestSeqRef.current + 1
    requestSeqRef.current = requestId
    const visibleUserContent = trimmedText
      ? files.length > 0
        ? `${trimmedText}\n\n${formatAttachedFilesSummary(files.length, language)}`
        : trimmedText
      : formatAttachedFilesSummary(files.length, language)

    submittedDuringHistoryLoadRef.current = true
    setSending(true)
    setBotState('working')
    setMessages((current) => [
      ...current,
      { id: createMessageId(), role: 'user', content: visibleUserContent },
    ])

    try {
      const result = await withTimeout(
        window.secretary.process(prompt, buildRuntimeForRequest()),
        SECRETARY_RESPONSE_TIMEOUT_MS,
        '비서 응답이 오래 걸려서 이번 요청을 중단했어요. 잠시 후 다시 시도해 주세요.',
      )
      if (requestSeqRef.current !== requestId) return
      setMessages((current) => [...current, buildAssistantMessage(result)])
      setBotState(result.action ? 'done' : 'idle')
      void Promise.all([
        window.secretary.getActiveConversation().then(setActiveConversation),
        refreshConversations(),
      ]).catch(() => undefined)
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
      if (requestSeqRef.current === requestId) {
        setSending(false)
      }
    }
  }

  const handleComposerSend = (text: string, files: SelectedFile[]) => {
    void handleSecretarySend(text, files)
  }

  const handleAbort = () => {
    if (!sending) return
    requestSeqRef.current += 1
    setSending(false)
    setBotState('idle')
    setMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        role: 'secretary',
        content: '이번 요청은 중단했어요. 필요하면 이어서 다시 물어봐 주세요.',
      },
    ])
  }

  const handleConfirmAction = async (messageId: string, action: SecretaryAction) => {
    updateMessage(messageId, { actionState: 'accepted' })
    setBotState('working')
    setSending(true)

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

  const handleCreateConversation = async () => {
    const conversation = await window.secretary.createConversation()
    if (!isScreen) setConversationListOpen(false)
    await loadConversation(conversation)
  }

  const handleSwitchConversation = async (conversationId: string) => {
    const result = await window.secretary.switchConversation(conversationId)
    if (!result.ok || !result.conversation) return
    if (!isScreen) setConversationListOpen(false)
    await loadConversation(result.conversation)
  }

  const handleRenameConversation = async (conversationId: string, title: string) => {
    const result = await window.secretary.renameConversation(conversationId, title)
    if (result.ok && result.conversation) {
      if (activeConversation?.id === conversationId) setActiveConversation(result.conversation)
      await refreshConversations()
    }
  }

  const handleArchiveConversation = async (conversationId: string) => {
    const result = await window.secretary.archiveConversation(conversationId)
    if (result.ok && result.conversation) {
      await loadConversation(result.conversation)
    }
  }

  if (!open) return null

  const conversationList = (
    <ConversationList
      conversations={conversations}
      activeConversationId={activeConversation?.id ?? null}
      onSelect={(id) => void handleSwitchConversation(id)}
      onRename={(id, title) => void handleRenameConversation(id, title)}
      onArchive={(id) => void handleArchiveConversation(id)}
      variant={isScreen ? 'sidebar' : 'panel'}
    />
  )

  const transcript = (
    <div ref={scrollRef} className={isScreen ? 'secretary-session-transcript' : 'secretary-transcript'}>
      <div className={isScreen ? 'secretary-session-message-list' : undefined}>
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
    </div>
  )

  const composer = (
    <div className={isScreen ? 'secretary-session-input' : 'secretary-input-area'}>
      <InputArea
        cwd={composerCwd?.trim() || '~'}
        promptHistory={promptHistory}
        onSend={handleComposerSend}
        onSendBtw={handleComposerSend}
        onAbort={handleAbort}
        pendingPermission={null}
        onPermissionRequestAction={() => undefined}
        pendingQuestion={null}
        onQuestionResponse={() => undefined}
        isStreaming={sending}
        permissionMode={permissionMode}
        planMode={planMode}
        model={composerModel}
        modelSwitchNotice={null}
        onPermissionModeChange={setPermissionMode}
        onPlanModeChange={setPlanMode}
        onModelChange={setComposerModel}
        onDismissModelSwitchNotice={() => undefined}
        permissionShortcutLabel=""
        bypassShortcutLabel=""
        autoFocus
      />
    </div>
  )

  const conversationCard = (
    <section
      className="secretary-conversation-card"
      aria-label="씨토 대화 패널"
    >
      <div className="secretary-card-header">
        <div>
          <div className="secretary-card-title-row">
            <h2>{activeConversation?.title ?? '기본 씨토'}</h2>
            <span>{stateLabel}</span>
          </div>
          <p>Citto 세션과 워크플로우를 보고 제안합니다</p>
        </div>
        <div className="secretary-card-actions">
          {!isScreen && (
            <button
              type="button"
              onClick={() => setConversationListOpen((current) => !current)}
              className="secretary-icon-text-button"
            >
              채팅
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleCreateConversation()}
            className="secretary-icon-text-button"
          >
            새 채팅
          </button>
          <button
            type="button"
            onClick={onClose}
            className="secretary-close-button"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      </div>

      {!isScreen && conversationListOpen && conversationList}

      {transcript}
      {composer}
    </section>
  )

  if (isScreen) {
    return (
      <div className="secretary-screen-root">
        <aside className="secretary-history-sidebar" aria-label="씨토 채팅">
          <div className="secretary-sidebar-drag-region draggable-region" />
          <div className="secretary-sidebar-primary-actions">
            <button
              type="button"
              onClick={() => void handleCreateConversation()}
              className="secretary-sidebar-action-button"
            >
              <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>새 채팅</span>
            </button>
          </div>
          <div className="secretary-history-sidebar-header">
            <p>채팅</p>
            <span>{conversations.length}</span>
          </div>
          {conversationList}
        </aside>

        <main className="secretary-session-main" aria-label="기본 씨토 비서">
          <header className="secretary-session-header draggable-region">
            <div className="secretary-session-title">
              <SecretaryCharacter state={botState} size={26} />
              <div>
                <h2>{activeConversation?.title ?? '기본 씨토'}</h2>
                <p>씨토 비서 · {stateLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="secretary-session-close-button"
              aria-label="비서 닫기"
              title="비서 닫기"
            >
              ×
            </button>
          </header>
          {transcript}
          {composer}
        </main>
      </div>
    )
  }

  return (
    <div className={isScreen ? 'secretary-screen-root' : 'secretary-panel-root open'}>
      {!isScreen && (
        <button
          type="button"
          className="secretary-panel-backdrop"
          aria-label="비서 패널 닫기"
          onClick={onClose}
        />
      )}
      <aside
        className="secretary-panel"
        aria-label="기본 씨토 비서"
        role="dialog"
        aria-modal
      >
        {conversationCard}

        <div className="secretary-character-stage" aria-hidden="true">
          <SecretaryCharacter state={botState} size={112} />
        </div>
      </aside>
    </div>
  )
}
