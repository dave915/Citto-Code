import type { ClaudeInstallationStatus } from '../../../electron/preload'

export function ClaudeInstallModal({
  installationStatus,
  onRetry,
  onClose,
}: {
  installationStatus: ClaudeInstallationStatus
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-claude-border bg-claude-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-claude-text">Claude Code를 찾을 수 없습니다</p>
            <p className="mt-1 text-sm leading-relaxed text-claude-muted">
              앱 실행 시 `claude --version` 확인에 실패했습니다. Claude Code CLI를 설치하고 `claude` 명령이 PATH에 잡혀 있어야 합니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title="닫기"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-xs text-claude-muted">확인된 경로</p>
          <p className="mt-1 break-all font-mono text-xs text-claude-text">{installationStatus.path ?? '찾지 못함'}</p>
        </div>

        <div className="mt-3 rounded-2xl border border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-xs text-claude-muted">설치 후 확인할 항목</p>
          <ul className="mt-2 space-y-1 text-sm text-claude-text">
            <li>터미널에서 `claude --version` 이 정상 출력되는지</li>
            <li>앱을 다시 열거나 아래 `다시 확인` 버튼을 눌러 재검사</li>
          </ul>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-claude-border px-3 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
          >
            닫기
          </button>
          <button
            onClick={onRetry}
            className="rounded-xl bg-claude-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:brightness-110"
          >
            다시 확인
          </button>
        </div>
      </div>
    </div>
  )
}
