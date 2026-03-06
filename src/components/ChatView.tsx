import { useEffect, useRef } from 'react'
import type { Session, PermissionMode } from '../store/sessions'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import type { SelectedFile } from '../../electron/preload'

type Props = {
  session: Session
  onSend: (text: string, files: SelectedFile[]) => void
  onAbort: () => void
  onSelectFolder: () => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
}

export function ChatView({
  session, onSend, onAbort, onSelectFolder,
  onPermissionModeChange, onPlanModeChange, onModelChange,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMsg = session.messages[session.messages.length - 1]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages.length, lastMsg?.text?.length])

  const isNewSession = session.messages.length === 0

  return (
    <div className="flex flex-col h-full bg-claude-bg">
      {/* 헤더: 폴더 경로 + 비용만 */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-claude-border flex-shrink-0">
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-claude-muted"
          title="현재 작업 폴더"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span className="font-mono max-w-xs truncate">
            {session.cwd || '~'}
          </span>
        </div>

        {session.lastCost !== undefined && (
          <span className="text-xs text-claude-muted">${session.lastCost.toFixed(4)}</span>
        )}
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {isNewSession
          ? <WelcomeScreen onSelectFolder={onSelectFolder} />
          : session.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={session.isStreaming && msg.id === session.currentAssistantMsgId}
              />
            ))
        }

        {session.error && (
          <div className="flex justify-center mb-4">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-lg text-sm text-red-700">
              <div className="flex items-center gap-2 font-medium mb-1">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                오류 발생
              </div>
              <p className="font-mono text-xs whitespace-pre-wrap">{session.error}</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 입력창 (설정 툴바 포함) */}
      <InputArea
        cwd={session.cwd}
        onSend={onSend}
        onAbort={onAbort}
        isStreaming={session.isStreaming}
        permissionMode={session.permissionMode}
        planMode={session.planMode}
        model={session.model}
        onPermissionModeChange={onPermissionModeChange}
        onPlanModeChange={onPlanModeChange}
        onModelChange={onModelChange}
      />
    </div>
  )
}

function WelcomeScreen({ onSelectFolder }: { onSelectFolder: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 -mt-12">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-claude-orange to-amber-400 flex items-center justify-center shadow-lg mb-6">
        <span className="text-white text-2xl font-bold">C</span>
      </div>
      <h2 className="text-2xl font-semibold text-claude-text mb-2">Claude UI</h2>
      <p className="text-claude-muted mb-8 max-w-sm leading-relaxed">
        Claude Code CLI 기반 코드 어시스턴트입니다.<br />
        아래 설정을 조정하거나 바로 메시지를 보내세요.
      </p>

      <button
        onClick={onSelectFolder}
        className="flex items-center gap-2 px-5 py-2.5 bg-claude-orange hover:bg-claude-orange/90 text-white rounded-xl text-sm font-medium transition-colors shadow-sm mb-8"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        프로젝트 폴더 열기
      </button>

      <div className="grid grid-cols-2 gap-3 text-left max-w-md w-full">
        {[
          { icon: '💡', label: '코드 설명해줘', desc: '특정 코드의 동작 방식 이해' },
          { icon: '🐛', label: '버그 찾아줘', desc: '오류 원인 파악 및 수정' },
          { icon: '✨', label: '기능 추가해줘', desc: '새로운 기능 구현 요청' },
          { icon: '📋', label: '먼저 계획 세워줘', desc: '플랜 모드로 안전하게 검토' },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-claude-border rounded-xl p-3 text-sm">
            <div className="text-xl mb-1">{item.icon}</div>
            <div className="font-medium text-claude-text">{item.label}</div>
            <div className="text-xs text-claude-muted mt-0.5">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
