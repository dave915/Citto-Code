import { useEffect, useRef } from 'react'
import type { SelectedFile } from '../../electron/preload'
import { useI18n } from '../hooks/useI18n'
import type { PermissionMode, Session } from '../store/sessions'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import { SubagentDrilldownHeader } from './subagentDrilldown/SubagentDrilldownHeader'
import { useSubagentDrilldownState } from './subagentDrilldown/useSubagentDrilldownState'

type Props = {
  session: Session
  toolUseId: string
  title: string
  onBack: () => void
  onSendToMain: (text: string, files: SelectedFile[]) => void
  onSendBtwToMain: (text: string, files: SelectedFile[]) => void
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
  onOpenTeam?: () => void
  hasLinkedTeam?: boolean
}

export function SubagentDrilldownView({
  session,
  toolUseId,
  title,
  onBack,
  onSendToMain,
  onSendBtwToMain,
  permissionMode,
  planMode,
  model,
  onPermissionModeChange,
  onPlanModeChange,
  onModelChange,
  permissionShortcutLabel,
  bypassShortcutLabel,
  onOpenTeam,
  hasLinkedTeam,
}: Props) {
  const { t } = useI18n()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const {
    canReply,
    drillMessages,
    entry,
    headerTitle,
    liveOutput,
    loadingTranscript,
    normalizedTranscriptMessages,
    promptHistory,
    status,
  } = useSubagentDrilldownState({
    session,
    t,
    title,
    toolUseId,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: normalizedTranscriptMessages.length > 0 ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [drillMessages.length, liveOutput, normalizedTranscriptMessages.length, status])

  if (!entry) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-claude-chat-bg">
        <div className="flex-shrink-0 border-b border-claude-border/70 bg-claude-chat-bg/95 backdrop-blur supports-[backdrop-filter]:bg-claude-chat-bg/80">
        <div className="w-full px-6 py-4">
          <button
            type="button"
            onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border border-claude-border/70 bg-claude-surface px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
              {t('subagent.backToChat')}
            </button>
          </div>
        </div>
        <div
          className="relative z-0 min-h-0 flex-1 overflow-y-auto px-6 py-7"
          style={{ background: 'linear-gradient(180deg, rgb(var(--claude-chat-bg) / 0.985) 0%, rgb(var(--claude-chat-bg)) 100%)' }}
        >
          <div className="mx-auto w-full max-w-[860px]">
            <div className="text-sm text-claude-muted">{t('subagent.transcriptUnavailable')}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-claude-chat-bg">
      <SubagentDrilldownHeader
        entry={entry}
        headerTitle={headerTitle}
        onBack={onBack}
        toolUseId={toolUseId}
      />

      <div
        className="relative z-0 min-h-0 flex-1 overflow-y-auto px-6 py-7"
        style={{ background: 'linear-gradient(180deg, rgb(var(--claude-chat-bg) / 0.985) 0%, rgb(var(--claude-chat-bg)) 100%)' }}
      >
        <div className="mx-auto w-full max-w-[860px]">
          {drillMessages.length > 0 ? (
            <div>
              {drillMessages.map((message, index) => {
                const isTranscriptMessage = normalizedTranscriptMessages.length > 0
                const isStreamingMessage = !isTranscriptMessage
                  && message.role === 'assistant'
                  && index === drillMessages.length - 1
                  && (status === 'pending' || status === 'running' || loadingTranscript)

                return (
                  <div key={message.id} className="-mx-2 px-2 py-1">
                    <MessageBubble
                      message={message}
                      isStreaming={isStreamingMessage}
                    />
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="text-sm text-claude-muted">{t('subagent.noOutput')}</div>
          )}
        </div>
      </div>

      <InputArea
        cwd={session.cwd}
        promptHistory={promptHistory}
        onSend={(text, files) => {
          onSendToMain(text, files)
          onBack()
        }}
        onSendBtw={(text, files) => {
          onSendBtwToMain(text, files)
          onBack()
        }}
        onAbort={() => undefined}
        isStreaming={false}
        disabled={!canReply}
        pendingPermission={null}
        onPermissionRequestAction={() => undefined}
        pendingQuestion={null}
        onQuestionResponse={() => undefined}
        permissionMode={permissionMode}
        planMode={planMode}
        model={model}
        onPermissionModeChange={onPermissionModeChange}
        onPlanModeChange={onPlanModeChange}
        onModelChange={onModelChange}
        permissionShortcutLabel={permissionShortcutLabel}
        bypassShortcutLabel={bypassShortcutLabel}
        topSlot={(
          <div className="mb-2 px-1 text-xs text-claude-muted">
            {canReply ? t('subagent.replyToMain') : t('subagent.replyWhenDone')}
          </div>
        )}
        onOpenTeam={onOpenTeam}
        hasLinkedTeam={hasLinkedTeam}
      />
    </div>
  )
}
