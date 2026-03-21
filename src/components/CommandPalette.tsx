import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import { searchSessionMessages, searchSessions, type Session } from '../store/sessions'

type CommandPaletteItem =
  | { id: string; kind: 'action'; label: string; description: string; onSelect: () => void }
  | { id: string; kind: 'session'; label: string; description: string; sessionId: string; onSelect: () => void }
  | {
      id: string
      kind: 'message'
      label: string
      description: string
      sessionId: string
      messageId: string
      role: 'user' | 'assistant'
      onSelect: () => void
    }

type Props = {
  open: boolean
  sessions: Session[]
  onClose: () => void
  onNewSession: () => void | Promise<void>
  onOpenSettings: () => void
  onSelectSession: (sessionId: string) => void
  onSelectMessage: (sessionId: string, messageId: string) => void
}

export function CommandPalette({
  open,
  sessions,
  onClose,
  onNewSession,
  onOpenSettings,
  onSelectSession,
  onSelectMessage,
}: Props) {
  const { language } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const items = useMemo<CommandPaletteItem[]>(() => {
    const trimmedQuery = query.trim()
    const filteredSessions = searchSessions(sessions, query).slice(0, trimmedQuery ? 5 : 8)
    const messageMatches = trimmedQuery ? searchSessionMessages(sessions, query, 12) : []

    if (trimmedQuery) {
      return [
        ...messageMatches.map((match) => ({
          id: `message-${match.messageId}`,
          kind: 'message' as const,
          label: match.preview,
          description: `${match.role === 'user' ? (language === 'en' ? 'User message' : '사용자 메시지') : (language === 'en' ? 'Claude response' : 'Claude 응답')} · ${match.sessionName} · ${match.cwd || '~'}`,
          sessionId: match.sessionId,
          messageId: match.messageId,
          role: match.role,
          onSelect: () => onSelectMessage(match.sessionId, match.messageId),
        })),
        ...filteredSessions.map((session) => ({
          id: `session-${session.id}`,
          kind: 'session' as const,
          label: session.name,
          description: `${language === 'en' ? 'Session' : '세션'} · ${session.cwd || '~'}`,
          sessionId: session.id,
          onSelect: () => onSelectSession(session.id),
        })),
      ]
    }

    return [
      {
        id: 'new-session',
        kind: 'action',
        label: language === 'en' ? 'New session' : '새 세션',
        description: language === 'en' ? 'Open a new project or session.' : '새 프로젝트 또는 세션을 엽니다.',
        onSelect: () => {
          void onNewSession()
        },
      },
      {
        id: 'open-settings',
        kind: 'action',
        label: language === 'en' ? 'Open settings' : '설정 열기',
        description: language === 'en' ? 'Open the settings screen.' : '환경설정 화면을 엽니다.',
        onSelect: onOpenSettings,
      },
      ...filteredSessions.map((session) => ({
        id: `session-${session.id}`,
        kind: 'session' as const,
        label: session.name,
        description: session.cwd || '~',
        sessionId: session.id,
        onSelect: () => onSelectSession(session.id),
      })),
    ]
  }, [language, onNewSession, onOpenSettings, onSelectMessage, onSelectSession, query, sessions])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedIndex(0)
      return
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  const handleConfirm = () => {
    const item = items[selectedIndex]
    if (!item) return
    item.onSelect()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm">
      <button
        type="button"
        aria-label={language === 'en' ? 'Close command palette' : '커맨드 팔레트 닫기'}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[16px] border border-claude-border bg-claude-panel shadow-2xl">
        <div className="border-b border-claude-border bg-claude-surface px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedIndex((index) => (index + 1) % Math.max(items.length, 1))
                return
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex((index) => (index - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1))
                return
              }

              if (event.key === 'Enter') {
                event.preventDefault()
                handleConfirm()
              }
            }}
            placeholder={language === 'en' ? 'Search sessions, messages, or run a command' : '세션, 대화 내용 검색 또는 명령 실행'}
            className="command-palette-input w-full bg-transparent text-[15px] text-claude-text outline-none placeholder:text-claude-muted"
            spellCheck={false}
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto py-2">
          {items.length > 0 ? (
            items.map((item, index) => {
              const active = index === selectedIndex

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    item.onSelect()
                    onClose()
                  }}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    active ? 'bg-claude-surface-2' : 'hover:bg-claude-surface'
                  }`}
                >
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-claude-border bg-claude-surface text-claude-text">
                    {item.kind === 'action' ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                      </svg>
                    ) : item.kind === 'message' ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h7M7 16h5" />
                        <rect x="4" y="4" width="16" height="16" rx="3" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-claude-text">{item.label}</div>
                      {item.kind === 'message' && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.role === 'user'
                            ? 'bg-sky-500/10 text-sky-200'
                            : 'bg-emerald-500/10 text-emerald-200'
                        }`}>
                          {item.role === 'user' ? 'USER' : 'AI'}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-claude-muted">{item.description}</div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="px-4 py-8 text-center text-sm text-claude-muted">
              {query.trim()
                ? (language === 'en' ? 'No matching sessions or messages.' : '일치하는 세션이나 메시지가 없습니다.')
                : (language === 'en' ? 'No results found.' : '검색 결과가 없습니다.')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
