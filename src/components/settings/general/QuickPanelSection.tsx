type Props = {
  quickPanelEnabled: boolean
  onToggle: (value: boolean) => void
}

export function QuickPanelSection({ quickPanelEnabled, onToggle }: Props) {
  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-claude-text">퀵 패널</p>
          <p className="mt-1 text-xs leading-relaxed text-claude-muted">
            글로벌 단축키로 Spotlight 스타일 입력창을 열 수 있습니다. 비활성화하면 메인 프로세스 글로벌 단축키 등록도 함께 해제됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!quickPanelEnabled)}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors ${
            quickPanelEnabled
              ? 'border-[#6a6d75] bg-claude-panel'
              : 'border-claude-border bg-claude-panel/70'
          }`}
          aria-pressed={quickPanelEnabled}
          title={quickPanelEnabled ? '퀵 패널 끄기' : '퀵 패널 켜기'}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-claude-text transition-transform ${
              quickPanelEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
