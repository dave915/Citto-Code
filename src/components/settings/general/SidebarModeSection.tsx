import type { SidebarMode } from '../../../store/sessions'
import { useI18n } from '../../../hooks/useI18n'

type Props = {
  sidebarMode: SidebarMode
  onChange: (mode: SidebarMode) => void
}

export function SidebarModeSection({ sidebarMode, onChange }: Props) {
  const { t } = useI18n()
  const options = [
    {
      value: 'session',
      title: t('settings.general.sidebarMode.session.title'),
      desc: t('settings.general.sidebarMode.session.description'),
    },
    {
      value: 'project',
      title: t('settings.general.sidebarMode.project.title'),
      desc: t('settings.general.sidebarMode.project.description'),
    },
  ] as const satisfies Array<{ value: SidebarMode; title: string; desc: string }>

  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">{t('settings.general.sidebarMode.title')}</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        {t('settings.general.sidebarMode.description')}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = sidebarMode === option.value
          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active
                  ? 'border-[#6a6d75] bg-claude-panel'
                  : 'border-claude-border bg-claude-panel hover:bg-claude-bg'
              }`}
            >
              <div className="text-sm font-medium text-claude-text">{option.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-claude-muted">{option.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
