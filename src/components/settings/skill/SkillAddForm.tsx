import type { RefObject } from 'react'

type Props = {
  open: boolean
  name: string
  creating: boolean
  error: string
  nameRef: RefObject<HTMLInputElement>
  onNameChange: (value: string) => void
  onCreate: () => void | Promise<void>
  onCancel: () => void
}

export function SkillAddForm({
  open,
  name,
  creating,
  error,
  nameRef,
  onNameChange,
  onCreate,
  onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-claude-border bg-claude-surface p-3">
      <p className="text-xs font-semibold text-claude-text">새 Skill 추가</p>
      <p className="text-xs text-claude-muted">~/.claude/skills/&lt;name&gt;/SKILL.md 로 생성됩니다</p>
      <input
        ref={nameRef}
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && void onCreate()}
        placeholder="skill-name (소문자, 숫자, 하이픈)"
        className="w-full rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono focus:border-claude-border focus:outline-none focus:ring-1 focus:ring-white/10"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void onCreate()}
          disabled={creating}
          className="rounded-lg bg-claude-surface-2 px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-[#44444a] disabled:opacity-50"
        >
          {creating ? '생성 중...' : '생성'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
        >
          취소
        </button>
      </div>
    </div>
  )
}
