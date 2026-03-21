import { type McpForm, type McpServer } from './shared'
import { McpServerForm } from './McpServerForm'
import { useI18n } from '../../hooks/useI18n'

export function McpServerCard({
  server,
  editing,
  confirmDelete,
  editForm,
  editError,
  editSaving,
  onEditToggle,
  onEditFormChange,
  onEditSave,
  onEditCancel,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  server: McpServer
  editing: boolean
  confirmDelete: boolean
  editForm: McpForm
  editError: string
  editSaving: boolean
  onEditToggle: () => void
  onEditFormChange: (form: McpForm) => void
  onEditSave: () => void
  onEditCancel: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}) {
  const { t } = useI18n()
  const typeColor = 'text-claude-muted bg-claude-panel border-claude-border'

  return (
    <div className="rounded-xl border border-claude-border bg-claude-bg p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-400" />
          <span className="text-sm font-semibold text-claude-text">{server.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {server.type && (
            <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${typeColor}`}>
              {server.type}{server.type === 'sse' ? ` (${t('settings.mcp.deprecated')})` : ''}
            </span>
          )}
          <button
            onClick={onEditToggle}
            className="rounded-lg border border-claude-border px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
          >
            {editing ? t('common.close') : t('common.edit')}
          </button>
          {confirmDelete ? (
            <>
              <button
                onClick={onDeleteConfirm}
                className="rounded-lg bg-red-500 px-2.5 py-1 text-xs text-white transition-colors hover:bg-red-600"
              >
                {t('settings.mcp.confirmDelete')}
              </button>
              <button
                onClick={onDeleteCancel}
                className="rounded-lg border border-claude-border px-2.5 py-1 text-xs text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button
              onClick={onDeleteRequest}
              className="rounded-lg border border-red-900/40 px-2.5 py-1 text-xs text-red-300 transition-colors hover:bg-red-950/30"
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {server.command && (
        <div className="mt-2 rounded-lg border border-claude-border bg-claude-panel px-3 py-2 font-mono text-xs text-claude-muted">
          {server.command}{server.args?.length ? ` ${server.args.join(' ')}` : ''}
        </div>
      )}
      {server.url && (
        <div className="mt-2 break-all rounded-lg border border-claude-border bg-claude-panel px-3 py-2 font-mono text-xs text-claude-muted">
          {server.url}
        </div>
      )}
      {server.headers && Object.keys(server.headers).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.keys(server.headers).map((key) => (
            <span key={key} className="rounded border border-claude-border bg-claude-panel px-1.5 py-0.5 font-mono text-xs text-claude-muted">
              {key}
            </span>
          ))}
        </div>
      )}
      {server.env && Object.keys(server.env).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.keys(server.env).map((key) => (
            <span key={key} className="rounded border border-claude-border bg-claude-panel px-1.5 py-0.5 font-mono text-xs text-claude-muted">
              {key}
            </span>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-3">
          <McpServerForm
            title={t('settings.mcp.editServer')}
            form={editForm}
            error={editError}
            saving={editSaving}
            submitLabel={t('settings.mcp.saveChanges')}
            onChange={onEditFormChange}
            onSubmit={onEditSave}
            onCancel={onEditCancel}
          />
        </div>
      )}
    </div>
  )
}
