import type { SecretaryAction, SecretarySearchResult } from '../../../electron/preload'
import { SecretaryMarkdown } from './SecretaryMarkdown'

type SecretaryUiMessage = {
  id: string
  role: 'user' | 'secretary'
  content: string
  action?: SecretaryAction | null
  searchResults?: SecretarySearchResult[]
  actionState?: 'pending' | 'accepted' | 'denied'
}

type Props = {
  message: SecretaryUiMessage
  onConfirmAction: (messageId: string, action: SecretaryAction) => void
  onDenyAction: (messageId: string) => void
}

const ROUTE_LABELS: Record<string, string> = {
  home: '홈',
  chat: '채팅',
  roundTable: '라운드테이블',
  preview: '미리보기',
  workflow: '워크플로우',
  settings: '설정',
  history: '히스토리',
}

export type { SecretaryUiMessage }

function getActionLabel(action: SecretaryAction) {
  if (action.type === 'navigate') return `${ROUTE_LABELS[action.route] ?? action.route}로 이동`
  if (action.type === 'startChat') return '새 채팅 시작'
  if (action.type === 'openRoundTable') return '라운드테이블 열기'
  if (action.type === 'openSession') return '세션 열기'
  if (action.type === 'runWorkflow') return '워크플로우 실행'
  if (action.type === 'runClaudeCode') return action.mode === 'interactive' ? '채팅에서 실행' : 'Claude Code 실행'
  if (action.type === 'openSettings') return '설정 열기'
  if (action.type === 'cancelActiveTask') return '작업 취소'
  return '실행'
}

function getActionPreview(action: SecretaryAction) {
  if (action.type === 'runClaudeCode') return action.prompt
  if (action.type === 'startChat') return action.initialPrompt
  if (action.type === 'runWorkflow') return `workflowId: ${action.workflowId}`
  if (action.type === 'openSession') return `sessionId: ${action.sessionId}`
  return null
}

export function SecretaryMessage({ message, onConfirmAction, onDenyAction }: Props) {
  const isUser = message.role === 'user'
  const actionPending = message.action && message.actionState !== 'accepted' && message.actionState !== 'denied'
  const actionPreview = message.action ? getActionPreview(message.action) : null

  return (
    <div className={`secretary-chat-row ${isUser ? 'secretary-chat-row-user' : 'secretary-chat-row-assistant'}`}>
      <div className={`secretary-message-card ${isUser ? 'secretary-message-card-user' : 'secretary-message-card-assistant'}`}>
        <SecretaryMarkdown text={message.content} />

        {actionPending && message.action && (
          <div className="secretary-action-row">
            <div className="secretary-action-stack">
              {actionPreview && (
                <div className="secretary-execute-preview">
                  <span>실행할 작업</span>
                  <p>{actionPreview}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => onConfirmAction(message.id, message.action as SecretaryAction)}
                className="secretary-button secretary-button-primary"
              >
                {getActionLabel(message.action)}
              </button>
              <button
                type="button"
                onClick={() => onDenyAction(message.id)}
                className="secretary-button"
              >
                괜찮아요
              </button>
            </div>
          </div>
        )}

        {message.actionState === 'accepted' && (
          <p className="secretary-action-note">확인했어요.</p>
        )}
        {message.actionState === 'denied' && (
          <p className="secretary-action-note">실행하지 않았어요.</p>
        )}

        {message.searchResults && message.searchResults.length > 0 && (
          <div className="secretary-search-results" aria-label="검색 결과">
            {message.searchResults.map((result) => (
              <div key={`${result.type}-${result.id}`} className="secretary-search-result-card">
                <div>
                  <span>{result.type}</span>
                  <p>{result.label}</p>
                  {result.excerpt && <small>{result.excerpt}</small>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
