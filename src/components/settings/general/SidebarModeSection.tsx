import type { SidebarMode } from '../../../store/sessions'

type Props = {
  sidebarMode: SidebarMode
  onChange: (mode: SidebarMode) => void
}

const options = [
  {
    value: 'session',
    title: '세션 기준',
    desc: '모든 세션을 생성 순서대로 바로 표시',
  },
  {
    value: 'project',
    title: '프로젝트 기준',
    desc: '같은 폴더의 세션을 프로젝트 아래로 그룹화',
  },
] as const satisfies Array<{ value: SidebarMode; title: string; desc: string }>

export function SidebarModeSection({ sidebarMode, onChange }: Props) {
  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">사이드바 표시 방식</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        세션을 평면 목록으로 보거나, 프로젝트별로 묶어서 볼 수 있습니다.
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
