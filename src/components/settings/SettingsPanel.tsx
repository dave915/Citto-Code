import { useEffect, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { SidebarMode } from '../../store/sessions'
import { AgentTab } from './AgentTab'
import { EnvTab } from './EnvTab'
import { GeneralTab } from './GeneralTab'
import { McpTab } from './McpTab'
import { getSettingsTabs, type SettingsTab } from './shared'
import { SkillTab } from './SkillTab'

export function SettingsPanel({
  onClose,
  onSidebarModeChange,
  projectPath,
}: {
  onClose: () => void
  onSidebarModeChange: (mode: SidebarMode) => void
  projectPath: string | null
}) {
  const { language, t } = useI18n()
  const [tab, setTab] = useState<SettingsTab>('general')
  const tabs = getSettingsTabs(language)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="flex h-full flex-col bg-claude-bg">
      <div className="draggable-region flex flex-shrink-0 items-center justify-between border-b border-claude-border bg-claude-panel px-5 py-3.5">
        <h2 className="text-sm font-semibold text-claude-text">{t('settings.title')}</h2>
        <button
          onClick={onClose}
          className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
          title={t('settings.close')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-shrink-0 gap-1 border-b border-claude-border bg-claude-panel px-2 py-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              tab === item.id
                ? 'bg-claude-surface-2 text-claude-text'
                : 'text-claude-muted hover:bg-claude-surface hover:text-claude-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'general' && <GeneralTab onSidebarModeChange={onSidebarModeChange} />}
        {tab === 'mcp' && <McpTab projectPath={projectPath} />}
        {tab === 'skill' && <SkillTab />}
        {tab === 'agent' && <AgentTab />}
        {tab === 'env' && <EnvTab />}
      </div>
    </div>
  )
}
