import { useEffect, useState, type MutableRefObject } from 'react'

import { translate, type AppLanguage } from '../../lib/i18n'
import type { PendingPermissionRequest, PendingQuestionRequest } from '../../store/sessions'
import type { PermissionAction } from './inputUtils'

export function InputPromptOverlay({
  language,
  showQuestionPrompt,
  pendingQuestion,
  questionOptions,
  questionInputMode,
  showPermissionPrompt,
  pendingPermission,
  permissionPreview,
  permissionActions,
  permissionSelectedIndex,
  permissionItemRefs,
  onQuestionOptionSelect,
  onPermissionAction,
}: {
  language: AppLanguage
  showQuestionPrompt: boolean
  pendingQuestion: PendingQuestionRequest | null
  questionOptions: Array<{ label: string; description?: string }>
  questionInputMode: boolean
  showPermissionPrompt: boolean
  pendingPermission: PendingPermissionRequest | null
  permissionPreview: string
  permissionActions: PermissionAction[]
  permissionSelectedIndex: number
  permissionItemRefs: MutableRefObject<(HTMLButtonElement | null)[]>
  onQuestionOptionSelect: (label: string) => void
  onPermissionAction: (action: PermissionAction['action']) => void
}) {
  const [permissionCollapsed, setPermissionCollapsed] = useState(false)

  useEffect(() => {
    if (!showPermissionPrompt || !pendingPermission) {
      setPermissionCollapsed(false)
      return
    }
    setPermissionCollapsed(false)
  }, [pendingPermission, showPermissionPrompt])

  if (showQuestionPrompt && pendingQuestion) {
    return (
      <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-lg border border-claude-border bg-claude-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-claude-border/60 bg-claude-surface px-3 py-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-claude-border bg-claude-surface-2 text-claude-text">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M6 4h12a2 2 0 012 2v12l-4-3H6a2 2 0 01-2-2V6a2 2 0 012-2z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-claude-text">{pendingQuestion.header || translate(language, 'input.selectionRequired')}</p>
            <p className="truncate text-xs text-claude-muted">
              {pendingQuestion.question}
              {questionOptions.length > 0
                ? translate(language, 'input.selectionInputHint')
                : ''}
            </p>
          </div>
        </div>
        <div className="py-1">
          {questionOptions.map((option, index) => (
            <button
              key={`${option.label}-${index}`}
              ref={(element) => { permissionItemRefs.current[index] = element }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onQuestionOptionSelect(option.label)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-claude-text transition-colors outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:bg-claude-surface-2 ${
                !questionInputMode && index === permissionSelectedIndex ? 'bg-claude-surface-2 text-white' : 'hover:bg-claude-surface'
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-claude-border bg-claude-surface-2 text-xs font-semibold text-claude-text">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{option.label}</p>
                {option.description ? <p className="truncate text-xs text-claude-muted">{option.description}</p> : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (showPermissionPrompt && pendingPermission) {
    return (
      <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-lg border border-claude-border bg-claude-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-claude-border/60 bg-claude-surface px-3 py-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-claude-border bg-claude-surface-2 text-claude-text">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-claude-text">{translate(language, 'input.permissionApprovalRequired')}</p>
            <p className="truncate text-xs text-claude-muted">
              {pendingPermission.toolName} {permissionPreview}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPermissionCollapsed((current) => !current)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-claude-border/70 bg-claude-surface px-2.5 text-xs font-medium text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
            title={permissionCollapsed ? translate(language, 'common.expand') : translate(language, 'common.collapse')}
          >
            <span>{permissionCollapsed ? translate(language, 'common.expand') : translate(language, 'common.collapse')}</span>
            <svg className={`h-3.5 w-3.5 transition-transform ${permissionCollapsed ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        {!permissionCollapsed && (
          <div className="py-1">
          {permissionActions.map((item, index) => (
            <button
              key={item.action}
              ref={(element) => { permissionItemRefs.current[index] = element }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPermissionAction(item.action)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-claude-text transition-colors outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:bg-claude-surface-2 ${
                index === permissionSelectedIndex ? 'bg-claude-surface-2 text-white' : 'hover:bg-claude-surface'
              }`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg border border-claude-border bg-claude-surface-2 text-xs font-semibold ${
                item.action === 'deny' ? 'text-claude-muted' : 'text-claude-text'
              }`}>
                {item.badge}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.title}</p>
                <p className="truncate text-xs text-claude-muted">{item.description}</p>
              </div>
            </button>
          ))}
          </div>
        )}
      </div>
    )
  }

  return null
}
