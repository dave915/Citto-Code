import type { SecretaryAction, SecretarySearchResult } from '../../../electron/preload'
import cittoAppIcon from '../../assets/agent-icons/citto-app-icon.png'
import { SecretaryMarkdown } from './SecretaryMarkdown'
import { getSecretaryActionRisk } from './SecretaryTaskHud'

type SecretaryUiMessage = {
  id: string
  role: 'user' | 'secretary'
  content: string
  action?: SecretaryAction | null
  searchResults?: SecretarySearchResult[]
  actionState?: 'pending' | 'accepted' | 'denied' | 'expired'
}

type Props = {
  message: SecretaryUiMessage
  onConfirmAction: (messageId: string, action: SecretaryAction) => void
  onDenyAction: (messageId: string) => void
  onSelectSearchResult?: (result: SecretarySearchResult) => void
  highlighted?: boolean
  showAssistantProfile?: boolean
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
  if (action.type === 'draftWorkflow') return '워크플로우 초안 만들기'
  if (action.type === 'createWorkflow') return '워크플로우 저장'
  if (action.type === 'draftSkill') return '스킬 초안 만들기'
  if (action.type === 'createSkill') return '스킬 생성'
  if (action.type === 'runClaudeCode') return action.mode === 'interactive' ? '채팅에서 실행' : 'Claude Code 실행'
  if (action.type === 'installComputerUse') return 'Cua Driver 설치'
  if (action.type === 'openSettings') return '설정 열기'
  if (action.type === 'cancelActiveTask') return '작업 취소'
  return '실행'
}

function getActionPreview(action: SecretaryAction) {
  if (action.type === 'runClaudeCode') return action.prompt
  if (action.type === 'startChat') return action.initialPrompt
  if (action.type === 'runWorkflow') return `workflowId: ${action.workflowId}`
  if (action.type === 'openSession') {
    return action.messageId
      ? `sessionId: ${action.sessionId}\nmessageId: ${action.messageId}`
      : `sessionId: ${action.sessionId}`
  }
  if (action.type === 'draftWorkflow') return action.initialPrompt ?? action.summary ?? action.name
  if (action.type === 'createWorkflow') return action.prompt ?? action.description ?? action.name
  if (action.type === 'draftSkill') return action.initialPrompt ?? action.description ?? action.name
  if (action.type === 'createSkill') return action.description
  if (action.type === 'installComputerUse') return 'Cua Driver를 설치하고 daemon을 시작합니다. 설치 중 공식 스크립트를 다운로드합니다.'
  return null
}

function getApprovalCopy(action: SecretaryAction) {
  const risk = getSecretaryActionRisk(action)
  if (risk === 'high') {
    return {
      risk,
      label: '위험 작업',
      detail: '실제 실행이나 저장으로 이어질 수 있어 승인 전에는 멈춰 있습니다.',
    }
  }
  if (risk === 'medium') {
    return {
      risk,
      label: '확인 필요',
      detail: '새 흐름을 만들거나 현재 화면을 바꾸기 전에 확인을 받습니다.',
    }
  }
  return {
    risk,
    label: '승인 대기',
    detail: '이동이나 열기 액션도 사용자가 확인한 뒤 실행합니다.',
  }
}

export function SecretaryMessage({
  message,
  onConfirmAction,
  onDenyAction,
  onSelectSearchResult,
  highlighted = false,
  showAssistantProfile = false,
}: Props) {
  const isUser = message.role === 'user'
  const showProfile = showAssistantProfile && !isUser
  const actionPending = message.action && (!message.actionState || message.actionState === 'pending')
  const actionPreview = message.action ? getActionPreview(message.action) : null
  const approvalCopy = actionPending && message.action ? getApprovalCopy(message.action) : null

  return (
    <div
      id={`secretary-message-${message.id}`}
      className={`secretary-chat-row ${isUser ? 'secretary-chat-row-user' : 'secretary-chat-row-assistant'}${showProfile ? ' secretary-chat-row-with-profile' : ''}${highlighted ? ' secretary-chat-row-highlighted' : ''}`}
    >
      {showProfile && (
        <img
          className="secretary-message-profile"
          src={cittoAppIcon}
          alt=""
          aria-hidden="true"
        />
      )}
      <div className={`secretary-message-card ${isUser ? 'secretary-message-card-user' : 'secretary-message-card-assistant'}`}>
        <SecretaryMarkdown text={message.content} />

        {actionPending && message.action && (
          <div className={`secretary-action-row secretary-approval-card secretary-approval-card-${approvalCopy?.risk ?? 'low'}`}>
            <div className="secretary-action-stack">
              {approvalCopy && (
                <div className="secretary-approval-header">
                  <span>{approvalCopy.label}</span>
                  <p>{approvalCopy.detail}</p>
                </div>
              )}
              {actionPreview && (
                <div className="secretary-execute-preview">
                  <span>실행 전 미리보기</span>
                  <p>{actionPreview}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => onConfirmAction(message.id, message.action as SecretaryAction)}
                className="secretary-button secretary-button-primary"
              >
                승인하고 {getActionLabel(message.action)}
              </button>
              <button
                type="button"
                onClick={() => onDenyAction(message.id)}
                className="secretary-button"
              >
                취소
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
        {message.actionState === 'expired' && (
          <p className="secretary-action-note">이전 제안은 다시 확인을 받아야 실행할 수 있어요.</p>
        )}

        {message.searchResults && message.searchResults.length > 0 && (
          <div className="secretary-search-results" aria-label="검색 결과">
            {message.searchResults.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                className="secretary-search-result-card"
                onClick={() => onSelectSearchResult?.(result)}
                disabled={!onSelectSearchResult}
              >
                <div>
                  <span>{result.type}</span>
                  <p>{result.label}</p>
                  {result.excerpt && <small>{result.excerpt}</small>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
