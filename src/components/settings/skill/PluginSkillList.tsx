import type { PluginSkill } from '../../../../electron/preload'
import { useI18n } from '../../../hooks/useI18n'
import { AppButton, AppChip } from '../../ui/appDesignSystem'

export function PluginSkillList({ skills }: { skills: PluginSkill[] }) {
  const { t } = useI18n()
  if (skills.length === 0) return null

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-claude-border bg-claude-panel/45">
      <div className="flex items-center justify-between gap-3 border-b border-claude-border/60 px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-claude-text">{t('settings.skill.pluginTitle')}</p>
          <p className="mt-1 text-xs text-claude-muted">{t('settings.skill.pluginDescription')}</p>
        </div>
        <div>
          <AppChip>
            {t('settings.skill.pluginCount', { count: skills.length })}
          </AppChip>
        </div>
      </div>

      <div className="divide-y divide-claude-border/60">
        {skills.map((skill) => (
          <div key={skill.path} className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-claude-border bg-claude-bg text-sm text-claude-text">
              P
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-claude-text">/{skill.name}</p>
                <AppChip className="px-2 py-0.5 text-[10px]">
                  {skill.pluginName}
                </AppChip>
              </div>
              <p className="mt-1 truncate font-mono text-xs text-claude-muted">{skill.path}</p>
            </div>
            <AppButton
              onClick={() => window.claude.openFile(skill.path)}
              size="icon"
              tone="ghost"
              title={t('common.openInExternalEditor')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </AppButton>
          </div>
        ))}
      </div>
    </div>
  )
}
