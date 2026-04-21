import type { McpConfigScope, McpReadResult } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { formatDisplayPath, getMcpScopeOptions } from './shared'
import { appFieldClassName, cx } from '../ui/appDesignSystem'

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
    <div className="space-y-2 rounded-md border border-claude-border bg-claude-bg/70 p-3">
      <div className="flex flex-wrap gap-2">
        {scopeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onScopeChange(option.value)}
            className={cx(
              'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
              scope === option.value
                ? 'border-claude-orange/30 bg-claude-panel text-claude-text'
                : 'border-claude-border bg-claude-bg text-claude-muted hover:bg-claude-panel hover:text-claude-text',
            )}
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
                className={`${appFieldClassName} appearance-none pr-10 font-mono text-xs`}
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
