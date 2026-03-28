import { useI18n } from '../../hooks/useI18n'

type Props = {
  activeScheduledTaskCount: number
  scheduleOpen: boolean
  settingsShortcutLabel: string
  onOpenSchedule: () => void
  onOpenSettings: () => void
}

export function SidebarFooter({
  activeScheduledTaskCount,
  scheduleOpen,
  settingsShortcutLabel,
  onOpenSchedule,
  onOpenSettings,
}: Props) {
  const { t } = useI18n()
  return (
    <div className="px-3 py-3 space-y-1.5">
      <button
        onClick={onOpenSchedule}
        className={`flex w-full items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm outline-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 ${
          scheduleOpen
            ? 'bg-claude-surface text-claude-text'
            : 'text-claude-text hover:bg-claude-sidebar-hover hover:text-claude-text'
        }`}
        title={t('sidebar.scheduledTasks')}
      >
        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
        </svg>
        <span className="min-w-0 truncate text-left">{t('sidebar.scheduledTasks')}</span>
        {activeScheduledTaskCount > 0 && (
          <span className="ml-auto rounded-full border border-claude-border bg-claude-panel px-2 py-0.5 text-[11px] text-claude-muted">
            {activeScheduledTaskCount}
          </span>
        )}
      </button>

      <button
        onClick={onOpenSettings}
        className="flex w-full items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm text-claude-text outline-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10 hover:bg-claude-sidebar-hover hover:text-claude-text"
        title={t('sidebar.settingsTitle', { shortcut: settingsShortcutLabel })}
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
        {t('sidebar.settings')}
      </button>
    </div>
  )
}
