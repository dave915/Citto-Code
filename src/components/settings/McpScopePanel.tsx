import type { McpConfigScope, McpReadResult } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { formatDisplayPath, getMcpScopeOptions } from './shared'

export function McpScopePanel({
  scope,
  scopeInfo,
  availableProjectPaths,
  selectedProjectPath,
  effectiveProjectPath,
  currentProjectName,
  canManageScope,
  onScopeChange,
  onSelectedProjectPathChange,
}: {
  scope: McpConfigScope
  scopeInfo: McpReadResult | null
  availableProjectPaths: string[]
  selectedProjectPath: string
  effectiveProjectPath: string | null
  currentProjectName: string | null
  canManageScope: boolean
  onScopeChange: (scope: McpConfigScope) => void
  onSelectedProjectPathChange: (projectPath: string) => void
}) {
  const { language, t } = useI18n()
  const scopeOptions = getMcpScopeOptions(language)
  const selectedScope = scopeOptions.find((option) => option.value === scope) ?? scopeOptions[0]
  const currentProjectLabel = scopeInfo?.projectPath ?? effectiveProjectPath

  return (
    <div className="space-y-3 rounded-xl border border-claude-border bg-claude-surface p-4">
      <div className="flex flex-wrap gap-2">
        {scopeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onScopeChange(option.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              scope === option.value
                ? 'bg-claude-surface-2 text-claude-text'
                : 'bg-claude-bg text-claude-muted hover:bg-claude-panel hover:text-claude-text'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-claude-muted">{selectedScope.description}</p>
        {scope !== 'user' && (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-claude-muted">
              {t('settings.mcp.selectProjectHint')}
            </p>
            <div className="relative">
              <select
                value={selectedProjectPath}
                onChange={(event) => onSelectedProjectPathChange(event.target.value)}
                className="w-full appearance-none rounded-xl border border-claude-border bg-claude-panel px-3 py-2 pr-10 text-xs font-mono text-claude-text focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10"
              >
                {availableProjectPaths.length === 0 && <option value="">{t('settings.mcp.noAvailableProjects')}</option>}
                {availableProjectPaths.map((path) => (
                  <option key={path} value={path}>{path}</option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-claude-muted"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5 10 12.5 15 7.5" />
              </svg>
            </div>
            {currentProjectLabel && (
              <p className="text-xs text-claude-muted">
                {t('settings.mcp.selectedProject')}
                <span className="ml-1 font-mono text-claude-text">{currentProjectLabel}</span>
                {currentProjectName && <span className="ml-2 text-claude-muted/70">({currentProjectName})</span>}
              </p>
            )}
            {availableProjectPaths.length === 0 && (
              <p className="text-xs text-amber-400">
                {t('settings.mcp.noProjectPathsFound')}
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-claude-muted">
          {t('settings.mcp.storedFile')}
          <span className="ml-1 font-mono text-claude-text">{formatDisplayPath(scopeInfo?.targetPath ?? '')}</span>
        </p>
        {scope === 'local' && scopeInfo?.projectPath && (
          <p className="text-xs text-claude-muted">
            {t('settings.mcp.storedKey')}
            <span className="ml-1 break-all font-mono text-claude-text">{`projects["${scopeInfo.projectPath}"].mcpServers`}</span>
          </p>
        )}
        {!canManageScope && (
          <p className="text-xs text-amber-400">
            {scopeInfo?.message ?? t('settings.mcp.scopeUnavailable')}
          </p>
        )}
      </div>
    </div>
  )
}
