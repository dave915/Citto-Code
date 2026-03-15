export function SkillIntroCard() {
  return (
    <div className="mb-4 rounded-xl border border-claude-border bg-claude-surface p-4">
      <p className="mb-1 text-xs font-semibold text-claude-text">Skill이란?</p>
      <p className="text-xs leading-relaxed text-claude-muted">
        <code className="rounded bg-claude-panel px-1">~/.claude/skills/&lt;name&gt;/SKILL.md</code> 에 정의하는 슬래시 명령어입니다.
        하위 파일(template.md, examples/ 등)을 추가해 더 풍부한 Skill을 만들 수 있습니다.
      </p>
    </div>
  )
}
