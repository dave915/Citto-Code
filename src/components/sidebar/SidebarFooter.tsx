import { useI18n } from '../../hooks/useI18n'

type Props = {
  settingsOpen: boolean
  settingsShortcutLabel: string
  onOpenSettings: () => void
}

export function SidebarFooter({
  settingsOpen,
  settingsShortcutLabel,
  onOpenSettings,
}: Props) {
  const { t } = useI18n()
  return (
    <div className="mt-auto border-t border-claude-border px-2 py-2">
      <button
        onClick={onOpenSettings}
        className={`flex min-h-[30px] w-full items-center gap-2 rounded-md border px-2 py-1.5 text-[13px] outline-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/35 ${
          settingsOpen
            ? 'border-claude-border bg-claude-surface text-claude-text'
            : 'border-transparent text-claude-text hover:border-claude-border/60 hover:bg-claude-sidebar-hover hover:text-claude-text'
        }`}
        title={t('sidebar.settingsTitle', { shortcut: settingsShortcutLabel })}
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
        <span className="min-w-0 truncate text-left">{t('sidebar.settings')}</span>
      </button>
    </div>
  )
}
