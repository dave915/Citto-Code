import { useEffect, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { AgentTab } from './AgentTab'
import { EnvTab } from './EnvTab'
import { GeneralTab } from './GeneralTab'
import { McpTab } from './McpTab'
import { getSettingsTabs, type SettingsTab } from './shared'
import { SkillTab } from './SkillTab'
import { AppButton, cx } from '../ui/appDesignSystem'

const TAB_ICONS: Record<SettingsTab, JSX.Element> = {
  general: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1 1 0 011.35-.936l1.252.5a1 1 0 00.829 0l1.252-.5a1 1 0 011.35.936l.114 1.344a1 1 0 00.592.82l1.176.52a1 1 0 01.487 1.41l-.667 1.172a1 1 0 000 .988l.667 1.172a1 1 0 01-.487 1.41l-1.176.52a1 1 0 00-.592.82l-.114 1.344a1 1 0 01-1.35.936l-1.252-.5a1 1 0 00-.829 0l-1.252.5a1 1 0 01-1.35-.936l-.114-1.344a1 1 0 00-.592-.82l-1.176-.52a1 1 0 01-.487-1.41l.667-1.172a1 1 0 000-.988l-.667-1.172a1 1 0 01.487-1.41l1.176-.52a1 1 0 00.592-.82l.114-1.344Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  mcp: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V5a2 2 0 1 1 4 0v2m4 0V5a2 2 0 1 0-4 0v2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 11h12M8 7h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
    </svg>
  ),
  skill: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h7l2 2h7v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 12h4M12 10v4" />
    </svg>
  ),
  agent: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="8" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18a6 6 0 0 1 12 0" />
    </svg>
  ),
  env: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7 4 12l4 5M16 7l4 5-4 5M14 4l-4 16" />
    </svg>
  ),
}

export function SettingsPanel({
  onClose,
  projectPath,
  initialTab,
}: {
  onClose: () => void
  projectPath: string | null
  initialTab: SettingsTab
}) {
  const { language, t } = useI18n()
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [counts, setCounts] = useState<Partial<Record<SettingsTab, number>>>({})
  const tabs = getSettingsTabs(language)
  const activeTabLabel = tabs.find((item) => item.id === tab)?.label ?? ''

  const makeCountUpdater = (tabId: SettingsTab) => (count: number) => {
    setCounts((prev) => ({ ...prev, [tabId]: count }))
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  return (
    <div className="flex h-full bg-claude-bg">
      {/* Left sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-claude-border bg-claude-sidebar">
        {/* macOS traffic-light spacer */}
        <div className="draggable-region pt-8" />

        {/* Header */}
        <div className="flex items-start justify-between gap-2 px-4 pb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-claude-text">{t('settings.title')}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-claude-muted">작업 환경과 연결을 조정합니다</p>
          </div>
          <AppButton
            onClick={onClose}
            size="icon"
            tone="ghost"
            className="shrink-0"
            title={t('settings.close')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </AppButton>
        </div>

        {/* Active section + column labels */}
        <div className="border-t border-claude-border/40 px-4 py-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px]">
            <span className="text-claude-muted/60">활성 섹션</span>
            <span className="text-claude-muted/30">·</span>
            <span className="font-medium text-claude-text">{activeTabLabel}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-medium text-claude-muted/40">
            <span>섹션</span>
            <span>항목</span>
          </div>
        </div>

        {/* Tab list */}
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          <div className="space-y-0.5">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  tab === item.id
                    ? 'bg-claude-surface font-medium text-claude-text'
                    : 'text-claude-muted hover:bg-claude-panel hover:text-claude-text',
                )}
              >
                <span className="shrink-0">{TAB_ICONS[item.id]}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {counts[item.id] != null && (
                  <span className={cx(
                    'shrink-0 text-[11px] tabular-nums',
                    tab === item.id ? 'text-claude-muted' : 'text-claude-muted/40',
                  )}>
                    {counts[item.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </aside>

      {/* Tab content — each tab renders its own 2-column layout */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'general' && <GeneralTab onCountUpdate={makeCountUpdater('general')} />}
        {tab === 'mcp' && <McpTab projectPath={projectPath} onCountUpdate={makeCountUpdater('mcp')} />}
        {tab === 'skill' && <SkillTab onCountUpdate={makeCountUpdater('skill')} />}
        {tab === 'agent' && <AgentTab onCountUpdate={makeCountUpdater('agent')} />}
        {tab === 'env' && <EnvTab onCountUpdate={makeCountUpdater('env')} />}
      </div>
    </div>
  )
}
