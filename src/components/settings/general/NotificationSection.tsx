import type { NotificationMode } from '../../../store/sessions'

type Props = {
  notificationMode: NotificationMode
  onChange: (mode: NotificationMode) => void
}

const options: Array<{ value: NotificationMode; title: string; desc: string }> = [
  {
    value: 'background',
    title: '백그라운드일 때만',
    desc: '앱이 뒤에 있거나 포커스가 없을 때만 알림을 보냅니다.',
  },
  {
    value: 'all',
    title: '항상 받기',
    desc: '앱이 앞에 있어도 작업 완료 알림을 보냅니다.',
  },
  {
    value: 'off',
    title: '받지 않음',
    desc: '작업 완료 알림을 보내지 않습니다.',
  },
]

export function NotificationSection({ notificationMode, onChange }: Props) {
  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">작업 완료 알림</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        Claude 작업이 끝났을 때 알림을 언제 받을지 선택합니다. 중단한 작업이나 권한/선택지 대기 상태는 제외됩니다.
      </p>

      <div className="mt-4 grid gap-2">
        {options.map((option) => {
          const active = notificationMode === option.value
          return (
            <button
              key={option.value}
              type="button"
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
