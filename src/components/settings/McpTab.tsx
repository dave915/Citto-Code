import { useEffect, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { AppButton, AppChip, cx } from '../ui/appDesignSystem'
import { McpScopePanel } from './McpScopePanel'
import { McpServerForm } from './McpServerForm'
import { type McpServer } from './shared'
import { useMcpTabState } from './useMcpTabState'

function ServerStatusDot({ status }: { status: string }) {
  if (status === 'ok') return <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
  if (status === 'auth-required') return <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
  if (status === 'error' || status === 'missing-command') return <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" />
  return <span className="h-2 w-2 shrink-0 rounded-full bg-claude-muted/40" />
}

function ServerStatusLabel({ status }: { status: string }) {
  const { t } = useI18n()
  if (status === 'ok') return <span className="text-[10px] text-emerald-400">{t('settings.mcp.health.ok')}</span>
  if (status === 'auth-required') return <span className="text-[10px] text-amber-400">{t('settings.mcp.health.authRequired')}</span>
  if (status === 'error' || status === 'missing-command') return <span className="text-[10px] text-rose-400">{t('settings.mcp.health.error')}</span>
  return <span className="text-[10px] text-claude-muted/60">{t('settings.mcp.health.checking')}</span>
}

export function McpTab({
  projectPath,
  onCountUpdate,
}: {
  projectPath: string | null
  onCountUpdate?: (count: number) => void
}) {
  const { t } = useI18n()
  const [selectedServerName, setSelectedServerName] = useState<string | null>(null)

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

  useEffect(() => {
    onCountUpdate?.(servers.length)
  }, [servers.length, onCountUpdate])

  // Auto-select first server
  useEffect(() => {
    if (!loading && servers.length > 0 && !selectedServerName) {
      setSelectedServerName(servers[0].name)
    }
  }, [loading, servers.length, selectedServerName])

  const selectedServer = servers.find((s) => s.name === selectedServerName) ?? null
  const selectedHealth = selectedServer ? (healthByServer[selectedServer.name] ?? null) : null
  const selectedStatus = selectedHealth?.status ?? 'checking'

  const statusLabel = (status: string) => {
    if (status === 'ok') return t('settings.mcp.health.ok')
    if (status === 'auth-required') return t('settings.mcp.health.authRequired')
    if (status === 'error' || status === 'missing-command') return t('settings.mcp.health.error')
    return t('settings.mcp.health.checking')
  }

  const statusTone = (status: string) => {
    if (status === 'ok') return 'success' as const
    if (status === 'auth-required') return 'accent' as const
    if (status === 'error' || status === 'missing-command') return 'danger' as const
    return 'neutral' as const
  }

  const isLocalServer = (server: McpServer) => !server.url && (server.command || !server.type || server.type === 'stdio')

  const remoteServers = servers.filter((s) => !isLocalServer(s))
  const localServers = servers.filter((s) => isLocalServer(s))

  return (
    <div className="flex h-full">
      {/* Middle: server list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-claude-border bg-claude-sidebar/50">
        <div className="flex items-center justify-between border-b border-claude-border/50 px-4 py-3.5">
          <p className="text-sm font-semibold text-claude-text">{t('settings.tab.mcp')}</p>
          <AppButton
            size="icon"
            tone="ghost"
            onClick={openAddForm}
            disabled={!canManageScope}
            title={t('common.add')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </AppButton>
        </div>

        {/* Scope selector */}
        <div className="border-b border-claude-border/40 px-3 py-2">
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
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {showAdd && (
            <div className="mb-2 rounded-lg border border-claude-border bg-claude-panel/60 p-3">
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
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-claude-muted">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            </div>
          ) : servers.length === 0 ? (
            <p className="px-3 py-3 text-xs text-claude-muted">{t('settings.mcp.emptyTitle')}</p>
          ) : (
            <>
              {remoteServers.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">
                    연결
                  </p>
                  <div className="space-y-0.5">
                    {remoteServers.map((server) => {
                      const health = healthByServer[server.name]
                      const status = health?.status ?? 'checking'
                      const isSelected = selectedServerName === server.name
                      return (
                        <button
                          key={server.name}
                          onClick={() => setSelectedServerName(server.name)}
                          className={cx(
                            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                            isSelected ? 'bg-claude-surface' : 'hover:bg-claude-panel',
                          )}
                        >
                          <ServerStatusDot status={status} />
                          <span className={cx(
                            'min-w-0 flex-1 truncate text-sm font-medium',
                            isSelected ? 'text-claude-text' : 'text-claude-text/80',
                          )}>
                            {server.name}
                          </span>
                          <ServerStatusLabel status={status} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {localServers.length > 0 && (
                <div>
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">
                    로컬 서버
                  </p>
                  <div className="space-y-0.5">
                    {localServers.map((server) => {
                      const health = healthByServer[server.name]
                      const status = health?.status ?? 'checking'
                      const isSelected = selectedServerName === server.name
                      return (
                        <button
                          key={server.name}
                          onClick={() => setSelectedServerName(server.name)}
                          className={cx(
                            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                            isSelected ? 'bg-claude-surface' : 'hover:bg-claude-panel',
                          )}
                        >
                          <ServerStatusDot status={status} />
                          <span className={cx(
                            'min-w-0 flex-1 truncate text-sm font-medium',
                            isSelected ? 'text-claude-text' : 'text-claude-text/80',
                          )}>
                            {server.name}
                          </span>
                          <ServerStatusLabel status={status} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: server detail */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-claude-bg">
        {selectedServer ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-claude-border/50 px-6 py-3.5">
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-claude-text">{selectedServer.name}</p>
                <AppChip tone={statusTone(selectedStatus)}>
                  {statusLabel(selectedStatus)}
                </AppChip>
                {selectedServer.type && (
                  <AppChip tone="neutral">{selectedServer.type}</AppChip>
                )}
              </div>
              <div className="flex items-center gap-2">
                <AppButton
                  tone="ghost"
                  onClick={() => handleEditStart(selectedServer)}
                >
                  {editingServer === selectedServer.name ? t('common.close') : t('common.edit')}
                </AppButton>
                {confirmDelete === selectedServer.name ? (
                  <>
                    <AppButton tone="danger" onClick={() => void handleDelete(selectedServer.name)}>
                      {t('settings.mcp.confirmDelete')}
                    </AppButton>
                    <AppButton tone="ghost" onClick={() => setConfirmDelete(null)}>
                      {t('common.cancel')}
                    </AppButton>
                  </>
                ) : (
                  <AppButton tone="danger" onClick={() => setConfirmDelete(selectedServer.name)}>
                    {t('common.delete')}
                  </AppButton>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Summary card */}
              <div className="mb-4 rounded-xl border border-claude-border bg-claude-panel/70 p-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-claude-muted/70">요약</p>
                    {selectedHealth?.message && selectedStatus !== 'ok' ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-claude-text">{selectedHealth.message}</p>
                    ) : (
                      <p className="mt-1.5 text-sm leading-relaxed text-claude-text">
                        {selectedServer.url
                          ? `HTTP 연결: ${selectedServer.url}`
                          : selectedServer.command
                            ? `${selectedServer.command}${selectedServer.args?.length ? ` ${selectedServer.args.join(' ')}` : ''}`
                            : '설정 없음'}
                      </p>
                    )}
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2">
                    <div className="rounded-lg border border-claude-border/60 bg-claude-bg/60 px-3 py-2 text-center">
                      <p className="text-[10px] font-medium text-claude-muted/60">위치</p>
                      <p className="mt-0.5 text-xs font-semibold text-claude-text">
                        {selectedServer.url ? 'HTTP' : '로컬'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-claude-border/60 bg-claude-bg/60 px-3 py-2 text-center">
                      <p className="text-[10px] font-medium text-claude-muted/60">상태</p>
                      <p className={cx(
                        'mt-0.5 text-xs font-semibold',
                        selectedStatus === 'ok' ? 'text-emerald-400' : 'text-claude-muted',
                      )}>
                        {statusLabel(selectedStatus)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Config details */}
              {selectedServer.command && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-claude-muted">명령어</p>
                  <div className="rounded-lg border border-claude-border bg-claude-panel/60 px-3 py-2.5 font-mono text-xs text-claude-muted">
                    {selectedServer.command}
                    {selectedServer.args?.length ? ` ${selectedServer.args.join(' ')}` : ''}
                  </div>
                </div>
              )}

              {selectedServer.url && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-claude-muted">URL</p>
                  <div className="break-all rounded-lg border border-claude-border bg-claude-panel/60 px-3 py-2.5 font-mono text-xs text-claude-muted">
                    {selectedServer.url}
                  </div>
                </div>
              )}

              {selectedServer.env && Object.keys(selectedServer.env).length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-claude-muted">환경변수</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(selectedServer.env).map((key) => (
                      <span key={key} className="rounded border border-claude-border bg-claude-panel px-2 py-0.5 font-mono text-[11px] text-claude-muted">
                        {key}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedServer.headers && Object.keys(selectedServer.headers).length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-claude-muted">헤더</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(selectedServer.headers).map((key) => (
                      <span key={key} className="rounded border border-claude-border bg-claude-panel px-2 py-0.5 font-mono text-[11px] text-claude-muted">
                        {key}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Edit form */}
              {editingServer === selectedServer.name && (
                <div className="mt-4 rounded-xl border border-claude-border bg-claude-panel/70 p-4">
                  <McpServerForm
                    title={t('settings.mcp.editServer')}
                    form={editForm}
                    error={editError}
                    saving={editSaving}
                    submitLabel={t('settings.mcp.saveChanges')}
                    onChange={setEditForm}
                    onSubmit={handleEditSave}
                    onCancel={() => setEditingServer(null)}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-claude-muted">{listLabel}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
