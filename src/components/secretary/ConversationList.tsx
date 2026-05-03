import type { SecretaryConversation } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { formatSidebarRelativeTime } from '../sidebar/sidebarUtils'

type Props = {
  conversations: SecretaryConversation[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onArchive: (id: string) => void
  variant?: 'panel' | 'sidebar'
}

function formatConversationTime(timestamp: number, language: ReturnType<typeof useI18n>['language']) {
  const relative = formatSidebarRelativeTime(timestamp, language)
  if (relative) return relative
  if (!timestamp) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onRename,
  onArchive,
  variant = 'panel',
}: Props) {
  const { language } = useI18n()
  const isSidebar = variant === 'sidebar'

  return (
    <div className={`secretary-conversation-list secretary-conversation-list-${variant}`} aria-label="비서 채팅">
      {conversations.length === 0 ? (
        <p className="secretary-conversation-empty">아직 채팅이 없습니다.</p>
      ) : conversations.map((conversation) => (
        <div
          key={conversation.id}
          className={`secretary-conversation-item ${conversation.id === activeConversationId ? 'active' : ''}`}
        >
          <button
            type="button"
            className="secretary-conversation-select"
            onClick={() => onSelect(conversation.id)}
          >
            <span>{conversation.title || '새 채팅'}</span>
            <time>{formatConversationTime(conversation.updatedAt, language)}</time>
          </button>
          <div className="secretary-conversation-actions">
            {!isSidebar && (
              <button
                type="button"
                aria-label="대화 제목 수정"
                onClick={() => {
                  const title = window.prompt('대화 제목', conversation.title)
                  if (title !== null) onRename(conversation.id, title)
                }}
              >
                수정
              </button>
            )}
            <button
              type="button"
              aria-label="대화 보관"
              onClick={() => onArchive(conversation.id)}
            >
              {isSidebar ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4h8v2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v5m4-5v5" />
                </svg>
              ) : '보관'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
