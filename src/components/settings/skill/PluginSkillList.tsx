import type { PluginSkill } from '../../../../electron/preload'
import { useI18n } from '../../../hooks/useI18n'

export function PluginSkillList({ skills }: { skills: PluginSkill[] }) {
  const { t } = useI18n()
  if (skills.length === 0) return null

  return (
    <div className="mt-4 rounded-xl border border-claude-border bg-claude-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-claude-text">{t('settings.skill.pluginTitle')}</p>
          <p className="mt-1 text-xs text-claude-muted">{t('settings.skill.pluginDescription')}</p>
        </div>
        <span className="rounded-full border border-claude-border bg-claude-panel px-2 py-0.5 text-[11px] text-claude-muted">
          {t('settings.skill.pluginCount', { count: skills.length })}
        </span>
      </div>

      <div className="space-y-2">
        {skills.map((skill) => (
          <div key={skill.path} className="flex items-center gap-3 rounded-xl border border-claude-border bg-claude-bg px-3 py-3">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-claude-border bg-claude-panel text-sm text-claude-text">
              P
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-claude-text">/{skill.name}</p>
                <span className="rounded-full border border-claude-border bg-claude-panel px-2 py-0.5 text-[10px] text-claude-muted">
                  {skill.pluginName}
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-xs text-claude-muted">{skill.path}</p>
            </div>
            <button
              onClick={() => window.claude.openFile(skill.path)}
              className="rounded-lg p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
              title={t('common.openInExternalEditor')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
