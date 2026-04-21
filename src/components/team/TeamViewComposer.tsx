import { type ClipboardEvent as ReactClipboardEvent, type MutableRefObject, type RefObject } from 'react'
import type { SelectedFile } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import type { AgentTeam } from '../../store/teamTypes'
import { AttachmentList } from '../input/AttachmentList'
import { TeamButton } from './teamDesignSystem'

type Props = {
  activeTeam: AgentTeam
  attachedFiles: SelectedFile[]
  canSubmitTask: boolean
  injected: boolean
  isAttaching: boolean
  isComposingRef: MutableRefObject<boolean>
  isDragOver: boolean
  onAbort: () => void
  onAttachFiles: () => void
  onContinue: () => void
  onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onInjectSummary?: () => void
  onPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void
  onRemoveFile: (path: string) => void
  onStart: () => void
  onTaskChange: (value: string) => void
  onTaskKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  skippedFiles: { name: string; reason: string }[]
  task: string
  textareaRef: RefObject<HTMLTextAreaElement>
}

export function TeamViewComposer({
  activeTeam,
  attachedFiles,
  canSubmitTask,
  injected,
  isAttaching,
  isComposingRef,
  isDragOver,
  onAbort,
  onAttachFiles,
  onContinue,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onInjectSummary,
  onPaste,
  onRemoveFile,
  onStart,
  onTaskChange,
  onTaskKeyDown,
  skippedFiles,
  task,
  textareaRef,
}: Props) {
  const { language, t } = useI18n()

  return (
    <div className="shrink-0 border-t border-claude-border/60 bg-claude-bg px-4 py-2.5">
      <div className="w-full">
        <AttachmentList
          attachedFiles={attachedFiles}
          skippedFiles={skippedFiles}
          language={language}
          onRemoveFile={onRemoveFile}
        />

        <div
          className={`relative overflow-hidden rounded-md border bg-claude-panel transition-colors ${
            isDragOver
              ? 'border-claude-orange/55 ring-1 ring-claude-orange/25'
              : 'border-claude-border'
          }`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="px-4 pb-2.5 pt-3">
            <textarea
              ref={textareaRef}
              value={task}
              onChange={(event) => onTaskChange(event.target.value)}
              onKeyDown={onTaskKeyDown}
              onPaste={onPaste}
              onCompositionStart={() => { isComposingRef.current = true }}
              onCompositionEnd={() => { isComposingRef.current = false }}
              placeholder={
                activeTeam.status === 'running'
                  ? t('team.placeholder.running')
                  : activeTeam.currentTask
                    ? t('team.placeholder.newTopic')
                    : t('team.placeholder.topic')
              }
              rows={1}
              disabled={activeTeam.status === 'running'}
              className="chat-input-textarea min-h-[26px] max-h-[140px] w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[14px] leading-6 text-claude-text outline-none [overflow-wrap:anywhere] placeholder:text-claude-muted disabled:opacity-50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-claude-border/70 px-3 pb-2 pt-2">
            <TeamButton
              onClick={onAttachFiles}
              disabled={activeTeam.status === 'running' || isAttaching}
              title={t('team.attachFiles')}
              size="icon"
              tone="ghost"
            >
              {isAttaching ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </TeamButton>

            <span className="text-xs text-claude-muted">
              {activeTeam.status === 'running'
                ? (() => {
                    const mode = activeTeam.mode ?? 'sequential'
                    const streamingAgents = activeTeam.agents.filter((agent) => agent.isStreaming)
                    if (mode === 'parallel' && streamingAgents.length > 1) {
                      return t('team.streaming.parallel', { count: streamingAgents.length })
                    }
                    const defaultAgentName = streamingAgents[0]?.name ?? t('team.streaming.defaultAgent')
                    if (mode === 'meeting') {
                      return t('team.streaming.meeting', { round: activeTeam.roundNumber, name: defaultAgentName })
                    }
                    return t('team.streaming.agent', { name: defaultAgentName })
                  })()
                : t('team.inputHint')}
            </span>

            <div className="flex-1" />

            {activeTeam.status === 'running' ? (
              <TeamButton
                onClick={onAbort}
                size="icon"
                tone="danger"
                title={t('team.abort')}
              >
                <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="5.25" y="5.25" width="13.5" height="13.5" rx="2.85" />
                </svg>
              </TeamButton>
            ) : (
              <>
                {activeTeam.status === 'done' && (
                  <>
                    <TeamButton onClick={onContinue} tone="secondary">
                      {activeTeam.mode === 'meeting'
                        ? t('team.continue.meeting', { round: activeTeam.roundNumber + 1 })
                        : activeTeam.mode === 'parallel'
                          ? t('team.continue.parallel')
                          : t('team.continue.sequential')}
                    </TeamButton>
                    {onInjectSummary && (
                      <TeamButton
                        onClick={onInjectSummary}
                        disabled={injected}
                        tone={injected ? 'success' : 'accent'}
                      >
                        {injected ? (
                          <>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            {t('team.injectToChatDone')}
                          </>
                        ) : (
                          <>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 4h14a2 2 0 002-2V8l-6-6H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {t('team.injectToChat')}
                          </>
                        )}
                      </TeamButton>
                    )}
                  </>
                )}

                <TeamButton
                  onClick={onStart}
                  disabled={!canSubmitTask}
                  size="icon"
                  tone="accent"
                  title={activeTeam.status === 'done' ? t('team.startNewTopic') : t('team.startDiscussion')}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
                  </svg>
                </TeamButton>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
