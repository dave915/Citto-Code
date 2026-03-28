import { useI18n } from '../../hooks/useI18n'
import {
  EmptyState,
  LoadingPlaceholder,
} from './shared'
import { McpScopePanel } from './McpScopePanel'
import { McpServerCard } from './McpServerCard'
import { McpServerForm } from './McpServerForm'
import { useMcpTabState } from './useMcpTabState'

export function McpTab({ projectPath }: { projectPath: string | null }) {
  const { t } = useI18n()
  const {
    availableProjectPaths,
    canManageScope,
    confirmDelete,
    currentProjectName,
    editError,
    editForm,
    editingServer,
    editSaving,
    effectiveProjectPath,
    form,
    formError,
    handleDelete,
    handleEditSave,
    handleEditStart,
    handleSave,
    healthByServer,
    listLabel,
    loading,
    saving,
    scope,
    scopeInfo,
    selectedProjectPath,
    servers,
    setConfirmDelete,
    setEditForm,
    setEditingServer,
    setForm,
    setScope,
    setSelectedProjectPath,
    setShowAdd,
    showAdd,
    openAddForm,
  } = useMcpTabState(projectPath)

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="space-y-3 p-4">
      <McpScopePanel
        scope={scope}
        scopeInfo={scopeInfo}
        availableProjectPaths={availableProjectPaths}
        selectedProjectPath={selectedProjectPath}
        effectiveProjectPath={effectiveProjectPath}
        currentProjectName={currentProjectName}
        canManageScope={canManageScope}
        onScopeChange={setScope}
        onSelectedProjectPathChange={setSelectedProjectPath}
      />

      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-claude-muted">{listLabel}</p>
        <button
          onClick={openAddForm}
          disabled={!canManageScope}
          className="flex items-center gap-1 rounded-lg bg-claude-surface px-2.5 py-1 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t('common.add')}
        </button>
      </div>

      {showAdd && (
        <McpServerForm
          title={t('settings.mcp.addServer')}
          form={form}
          error={formError}
          saving={saving}
          submitLabel={t('common.save')}
          onChange={setForm}
          onSubmit={handleSave}
          onCancel={() => setShowAdd(false)}
          autoFocusName
        />
      )}

      {!canManageScope && !showAdd ? (
        <EmptyState
          icon="📁"
          title={t('settings.mcp.projectScopeUnavailableTitle')}
          desc={<>{t('settings.mcp.projectScopeUnavailableDescription')}</>}
        />
      ) : servers.length === 0 && !showAdd ? (
        <EmptyState
          icon="🔌"
          title={t('settings.mcp.emptyTitle')}
          desc={<>{t('settings.mcp.emptyDescription')}</>}
        />
      ) : (
        servers.map((server) => {
          return (
            <McpServerCard
              key={server.name}
              server={server}
              health={healthByServer[server.name]}
              editing={editingServer === server.name}
              confirmDelete={confirmDelete === server.name}
              editForm={editForm}
              editError={editError}
              editSaving={editSaving}
              onEditToggle={() => handleEditStart(server)}
              onEditFormChange={setEditForm}
              onEditSave={handleEditSave}
              onEditCancel={() => setEditingServer(null)}
              onDeleteRequest={() => {
                setConfirmDelete(server.name)
                setShowAdd(false)
              }}
              onDeleteConfirm={() => handleDelete(server.name)}
              onDeleteCancel={() => setConfirmDelete(null)}
            />
          )
        })
      )}
    </div>
  )
}
