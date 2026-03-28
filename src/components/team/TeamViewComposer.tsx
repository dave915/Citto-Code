import { type ClipboardEvent as ReactClipboardEvent, type MutableRefObject, type RefObject } from 'react'
import type { SelectedFile } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import type { AgentTeam } from '../../store/teamTypes'
import { AttachmentList } from '../input/AttachmentList'

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
    <div className="shrink-0 border-t border-claude-border/60 bg-claude-bg px-4 py-4">
      <div className="w-full">
        <AttachmentList
          attachedFiles={attachedFiles}
          skippedFiles={skippedFiles}
          language={language}
          onRemoveFile={onRemoveFile}
        />

        <div
          className={`relative overflow-hidden rounded-[12px] border bg-claude-panel transition-colors ${
            isDragOver
              ? 'border-blue-500/60 ring-1 ring-blue-500/20'
              : 'border-claude-border'
          }`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="px-5 pb-3 pt-4">
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
              className="chat-input-textarea min-h-[28px] max-h-[140px] w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[15px] leading-7 text-claude-text outline-none [overflow-wrap:anywhere] placeholder:text-claude-muted disabled:opacity-50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-claude-border/70 px-4 pb-3 pt-2.5">
            <button
              type="button"
              onClick={onAttachFiles}
              disabled={activeTeam.status === 'running' || isAttaching}
              title={t('team.attachFiles')}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text disabled:opacity-30"
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
            </button>

            <span className="text-xs text-claude-text-muted">
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
              <button
                type="button"
                onClick={onAbort}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90"
                title={t('team.abort')}
              >
                <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="5.25" y="5.25" width="13.5" height="13.5" rx="2.85" />
                </svg>
              </button>
            ) : (
              <>
                {activeTeam.status === 'done' && (
                  <>
                    <button
                      type="button"
                      onClick={onContinue}
                      className="rounded-xl border border-claude-border px-3 py-1.5 text-xs font-medium text-claude-text-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
                    >
                      {activeTeam.mode === 'meeting'
                        ? t('team.continue.meeting', { round: activeTeam.roundNumber + 1 })
                        : activeTeam.mode === 'parallel'
                          ? t('team.continue.parallel')
                          : t('team.continue.sequential')}
                    </button>
                    {onInjectSummary && (
                      <button
                        type="button"
                        onClick={onInjectSummary}
                        disabled={injected}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                          injected
                            ? 'cursor-default border-green-500/40 bg-green-500/10 text-green-400'
                            : 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                        }`}
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
                      </button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={onStart}
                  disabled={!canSubmitTask}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-claude-surface-2 text-claude-text transition-colors hover:bg-claude-panel disabled:bg-claude-surface-2 disabled:text-claude-muted disabled:opacity-100"
                  title={activeTeam.status === 'done' ? t('team.startNewTopic') : t('team.startDiscussion')}
                >
                  <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
