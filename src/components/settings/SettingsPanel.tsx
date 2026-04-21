import { useEffect, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { AgentTab } from './AgentTab'
import { EnvTab } from './EnvTab'
import { GeneralTab } from './GeneralTab'
import { McpTab } from './McpTab'
import { getSettingsTabs, type SettingsTab } from './shared'
import { SkillTab } from './SkillTab'
import { AppButton, AppTitlebarHistoryGlyphs, cx } from '../ui/appDesignSystem'

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
    <div className="flex h-full flex-col bg-claude-bg">
      <div className="draggable-region flex h-[42px] shrink-0 items-center border-b border-claude-border bg-claude-panel px-4">
        <div className="ml-[92px] flex min-w-0 items-center gap-2">
          <AppTitlebarHistoryGlyphs />
          <span className="truncate text-[13px] font-medium text-claude-text">환경 설정 정리</span>
          <span className="text-[13px] text-claude-muted">citto-code</span>
          <span className="text-[14px] leading-none text-claude-muted/60">···</span>
        </div>
        <div className="no-drag ml-auto flex items-center gap-2" data-no-drag="true">
          <AppButton tone="secondary">열기</AppButton>
          <AppButton tone="secondary">미리보기</AppButton>
          <div className="h-6 w-px bg-claude-border" />
          <span className="text-[11px] text-claude-muted">브랜치</span>
          <span className="text-[11px] text-claude-muted">+35 -9</span>
          <AppButton onClick={onClose} size="icon" tone="ghost" aria-label={t('settings.close')}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
            </svg>
          </AppButton>
        </div>
      </div>

      <div className="min-h-0 flex flex-1">
      {/* Left sidebar */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-claude-border bg-claude-sidebar">
        {/* Title row */}
        <div className="flex items-center justify-between px-4 pb-1 pt-5">
          <p className="text-sm font-semibold text-claude-text">{t('settings.title')}</p>
        </div>

        {/* Subtitle */}
        <p className="px-4 pb-3 text-[11px] leading-relaxed text-claude-muted/70">
          작업 환경과 연결을 조정합니다
        </p>

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
                  'flex min-h-[36px] w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors',
                  tab === item.id
                    ? 'bg-claude-surface font-medium text-claude-text'
                    : 'text-claude-muted hover:bg-claude-panel hover:text-claude-text',
                )}
              >
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
    </div>
  )
}
