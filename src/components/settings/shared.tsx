import type { ReactNode } from 'react'
import type { McpConfigScope } from '../../../electron/preload'
import { translate, type AppLanguage } from '../../lib/i18n'
import { cx } from '../ui/appDesignSystem'

export type SettingsTab = 'general' | 'mcp' | 'skill' | 'agent' | 'env'

export function getSettingsTabs(language: AppLanguage): Array<{ id: SettingsTab; label: string }> {
  return [
    { id: 'general', label: translate(language, 'settings.tab.general') },
    { id: 'mcp', label: translate(language, 'settings.tab.mcp') },
    { id: 'skill', label: translate(language, 'settings.tab.skill') },
    { id: 'agent', label: translate(language, 'settings.tab.agent') },
    { id: 'env', label: translate(language, 'settings.tab.env') },
  ]
}

export type McpServer = {
  name: string
  command?: string
  args?: string[]
  type?: string
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

export type McpForm = {
  name: string
  serverType: 'http' | 'stdio'
  command: string
  args: string
  url: string
  headers: string
  env: string
}

export const EMPTY_MCP_FORM: McpForm = {
  name: '',
  serverType: 'http',
  command: '',
  args: '',
  url: '',
  headers: '',
  env: '',
}

export function getMcpScopeOptions(language: AppLanguage) {
  return [
    {
      value: 'user' as const,
      label: translate(language, 'settings.mcp.scope.user.label'),
      description: translate(language, 'settings.mcp.scope.user.description'),
    },
    {
      value: 'local' as const,
      label: translate(language, 'settings.mcp.scope.local.label'),
      description: translate(language, 'settings.mcp.scope.local.description'),
    },
    {
      value: 'project' as const,
      label: translate(language, 'settings.mcp.scope.project.label'),
      description: translate(language, 'settings.mcp.scope.project.description'),
    },
  ]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function formatDisplayPath(path: string): string {
  return path || '-'
}

export function normalizeProjectPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '~') return null
  return trimmed
}

export function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-16 text-claude-muted">
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
      </svg>
    </div>
  )
}

export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cx('border-b border-claude-border/60 px-4 py-4 last:border-b-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-claude-text">{title}</p>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-claude-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  )
}

export function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-claude-border bg-claude-panel/35 px-5 py-10 text-center">
      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-claude-border bg-claude-bg text-base">
        {icon}
      </span>
      <p className="mb-1 text-sm font-medium text-claude-text">{title}</p>
      <p className="text-xs leading-relaxed text-claude-muted">{desc}</p>
    </div>
  )
}
