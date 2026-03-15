import type { ReactNode } from 'react'
import type { McpConfigScope } from '../../../electron/preload'
import { translate, type AppLanguage } from '../../lib/i18n'

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

export const MCP_SCOPE_OPTIONS: Array<{
  value: McpConfigScope
  label: string
  description: string
}> = [
  { value: 'user', label: '전체', description: '~/.claude.json 전체 공통 설정' },
  { value: 'local', label: '프로젝트별', description: '~/.claude.json 안에서 선택한 프로젝트별 설정' },
  { value: 'project', label: '공유', description: '선택한 프로젝트의 .mcp.json 공유 설정' },
]

export function getMcpScopeOptions(language: AppLanguage) {
  return language === 'en'
    ? [
        { value: 'user' as const, label: 'Global', description: 'Shared settings in ~/.claude.json' },
        { value: 'local' as const, label: 'Project local', description: 'Project-specific settings stored in ~/.claude.json' },
        { value: 'project' as const, label: 'Shared project', description: 'Shared settings in the selected project .mcp.json' },
      ]
    : MCP_SCOPE_OPTIONS
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

export function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 text-3xl">{icon}</span>
      <p className="mb-1 text-sm font-medium text-claude-text">{title}</p>
      <p className="text-xs leading-relaxed text-claude-muted">{desc}</p>
    </div>
  )
}
