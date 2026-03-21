import { useI18n } from '../../../hooks/useI18n'

export function SkillIntroCard() {
  const { t } = useI18n()
  return (
    <div className="mb-4 rounded-xl border border-claude-border bg-claude-surface p-4">
      <p className="mb-1 text-xs font-semibold text-claude-text">{t('settings.skill.introTitle')}</p>
      <p className="text-xs leading-relaxed text-claude-muted">
        {t('settings.skill.introBody.beforePath')}
        <code className="rounded bg-claude-panel px-1">~/.claude/skills/&lt;name&gt;/SKILL.md</code>
        {t('settings.skill.introBody.afterPath')}
        <code className="rounded bg-claude-panel px-1">template.md</code>
        {t('settings.skill.introBody.afterTemplate')}
        <code className="rounded bg-claude-panel px-1">examples/</code>
        {t('settings.skill.introBody.afterExamples')}
      </p>
    </div>
  )
}
