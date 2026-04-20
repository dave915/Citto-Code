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
  const tabs = getSettingsTabs(language)

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
      <div className="draggable-region flex flex-shrink-0 items-center justify-between border-b border-claude-border bg-claude-panel px-5 py-3">
        <h2 className="text-sm font-semibold text-claude-text">{t('settings.title')}</h2>
        <AppButton
          onClick={onClose}
          size="icon"
          tone="ghost"
          title={t('settings.close')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </AppButton>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-claude-border bg-claude-sidebar px-3 py-4">
          <div className="space-y-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cx(
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
                  tab === item.id
                    ? 'border-claude-border bg-claude-surface text-claude-text'
                    : 'border-transparent text-claude-muted hover:border-claude-border/60 hover:bg-claude-panel hover:text-claude-text',
                )}
              >
                <span className="text-current">{TAB_ICONS[item.id]}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto bg-claude-bg">
          {tab === 'general' && <GeneralTab />}
          {tab === 'mcp' && <McpTab projectPath={projectPath} />}
          {tab === 'skill' && <SkillTab />}
          {tab === 'agent' && <AgentTab />}
          {tab === 'env' && <EnvTab />}
        </div>
      </div>
    </div>
  )
}
