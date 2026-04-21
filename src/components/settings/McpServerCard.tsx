import { useI18n } from '../../hooks/useI18n'
import type { McpHealthCheckResult } from '../../../electron/preload'
import { AppButton, AppChip, AppPanel } from '../ui/appDesignSystem'
import { McpServerForm } from './McpServerForm'
import { type McpForm, type McpServer } from './shared'

export function McpServerCard({
  server,
  health,
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
  health?: McpHealthCheckResult
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
  const healthStatus = health?.status ?? 'checking'
  const healthLabel = healthStatus === 'ok'
    ? t('settings.mcp.health.ok')
    : healthStatus === 'auth-required'
      ? t('settings.mcp.health.authRequired')
      : healthStatus === 'missing-command'
        ? t('settings.mcp.health.missingCommand')
        : healthStatus === 'error'
          ? t('settings.mcp.health.error')
          : t('settings.mcp.health.checking')
  const healthTone = healthStatus === 'ok'
    ? {
        dot: 'bg-emerald-400',
        badge: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
      }
    : healthStatus === 'auth-required'
      ? {
          dot: 'bg-amber-400',
          badge: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
        }
      : healthStatus === 'missing-command' || healthStatus === 'error'
        ? {
            dot: 'bg-rose-400',
            badge: 'border-rose-500/25 bg-rose-500/10 text-rose-200',
          }
        : {
            dot: 'bg-claude-muted',
            badge: 'border-claude-border bg-claude-panel text-claude-muted',
          }
  const detailMessage = healthStatus === 'ok' || healthStatus === 'checking'
    ? ''
    : health?.message?.trim() ?? ''

  return (
    <AppPanel className="bg-claude-bg p-4 shadow-none">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${healthTone.dot}`} />
          <span className="text-sm font-semibold text-claude-text">{server.name}</span>
          <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${healthTone.badge}`}>
            {healthLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {server.type && (
            <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${typeColor}`}>
              {server.type}{server.type === 'sse' ? ` (${t('settings.mcp.deprecated')})` : ''}
            </span>
          )}
          <AppButton onClick={onEditToggle} tone="ghost">
            {editing ? t('common.close') : t('common.edit')}
          </AppButton>
          {confirmDelete ? (
            <>
              <AppButton onClick={onDeleteConfirm} tone="danger">
                {t('settings.mcp.confirmDelete')}
              </AppButton>
              <AppButton onClick={onDeleteCancel} tone="ghost">
                {t('common.cancel')}
              </AppButton>
            </>
          ) : (
            <AppButton onClick={onDeleteRequest} tone="danger">
              {t('common.delete')}
            </AppButton>
          )}
        </div>
      </div>

      {server.command && (
        <div className="mt-2 rounded-md border border-claude-border bg-claude-panel px-3 py-2 font-mono text-xs text-claude-muted">
          {server.command}{server.args?.length ? ` ${server.args.join(' ')}` : ''}
        </div>
      )}
      {server.url && (
        <div className="mt-2 break-all rounded-md border border-claude-border bg-claude-panel px-3 py-2 font-mono text-xs text-claude-muted">
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
      {detailMessage && (
        <p className="mt-2 text-xs text-claude-muted">
          {detailMessage}
        </p>
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
    </AppPanel>
  )
}
