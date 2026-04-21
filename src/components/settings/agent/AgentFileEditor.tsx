import { useI18n } from '../../../hooks/useI18n'
import type { AgentFile } from './useAgentTabState'
import { AppButton, appFieldClassName } from '../../ui/appDesignSystem'

type AgentFileEditorProps = {
  editContent: string
  editingFile: AgentFile
  loadingEdit: boolean
  onChangeContent: (value: string) => void
  onClose: () => void
  onSave: () => void | Promise<void>
  saveError: string
  saving: boolean
}

export function AgentFileEditor({
  editContent,
  editingFile,
  loadingEdit,
  onChangeContent,
  onClose,
  onSave,
  saveError,
  saving,
}: AgentFileEditorProps) {
  const { t } = useI18n()

  return (
    <div className="bg-transparent">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-mono font-semibold text-claude-text">{editingFile.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-claude-muted">⌘S {t('common.save')}</span>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-claude-muted transition-colors hover:text-claude-text"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {loadingEdit ? (
        <div className="flex h-24 items-center justify-center text-claude-muted">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
        </div>
      ) : (
        <textarea
          value={editContent}
          onChange={(event) => onChangeContent(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 's') {
              event.preventDefault()
              void onSave()
            }
          }}
          className={`${appFieldClassName} h-56 resize-y font-mono text-xs leading-relaxed`}
          spellCheck={false}
        />
      )}
      {saveError && <p className="mt-1 text-xs text-red-500">{saveError}</p>}
      <div className="mt-2 flex gap-2">
        <AppButton
          onClick={() => void onSave()}
          disabled={saving || loadingEdit}
        >
          {saving ? t('common.saving') : t('common.save')}
        </AppButton>
        <AppButton
          onClick={onClose}
          tone="ghost"
        >
          {t('common.cancel')}
        </AppButton>
      </div>
    </div>
  )
}
