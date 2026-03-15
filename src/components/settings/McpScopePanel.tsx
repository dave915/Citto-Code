import type { McpConfigScope, McpReadResult } from '../../../electron/preload'
import { formatDisplayPath, MCP_SCOPE_OPTIONS } from './shared'

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
  const selectedScope = MCP_SCOPE_OPTIONS.find((option) => option.value === scope) ?? MCP_SCOPE_OPTIONS[0]
  const currentProjectLabel = scopeInfo?.projectPath ?? effectiveProjectPath

  return (
    <div className="space-y-3 rounded-xl border border-claude-border bg-claude-surface p-4">
      <div className="flex flex-wrap gap-2">
        {MCP_SCOPE_OPTIONS.map((option) => (
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
            <p className="text-xs text-claude-muted">대상 프로젝트를 선택해서 이 범위에 저장합니다.</p>
            <div className="relative">
              <select
                value={selectedProjectPath}
                onChange={(event) => onSelectedProjectPathChange(event.target.value)}
                className="w-full appearance-none rounded-xl border border-claude-border bg-claude-panel px-3 py-2 pr-10 text-xs font-mono text-claude-text focus:outline-none focus:border-claude-border focus:ring-1 focus:ring-white/10"
              >
                {availableProjectPaths.length === 0 && (
                  <option value="">선택 가능한 프로젝트가 없습니다</option>
                )}
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
                선택된 프로젝트:
                <span className="ml-1 font-mono text-claude-text">{currentProjectLabel}</span>
                {currentProjectName && <span className="ml-2 text-claude-muted/70">({currentProjectName})</span>}
              </p>
            )}
            {availableProjectPaths.length === 0 && (
              <p className="text-xs text-amber-400">사이드바 세션이나 Claude 설정에서 프로젝트 경로를 찾지 못했습니다.</p>
            )}
          </div>
        )}
        <p className="text-xs text-claude-muted">
          저장 파일:
          <span className="ml-1 font-mono text-claude-text">{formatDisplayPath(scopeInfo?.targetPath ?? '')}</span>
        </p>
        {scope === 'local' && scopeInfo?.projectPath && (
          <p className="text-xs text-claude-muted">
            저장 키:
            <span className="ml-1 break-all font-mono text-claude-text">{`projects["${scopeInfo.projectPath}"].mcpServers`}</span>
          </p>
        )}
        {!canManageScope && (
          <p className="text-xs text-amber-400">{scopeInfo?.message ?? '대상 프로젝트 경로를 선택해야 이 범위를 편집할 수 있습니다.'}</p>
        )}
      </div>
    </div>
  )
}
