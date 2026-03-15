import type { MutableRefObject } from 'react'

export function BranchCreateModal({
  open,
  branchCreateInputRef,
  gitNewBranchName,
  gitActionLoading,
  onClose,
  onNameChange,
  onCreate,
}: {
  open: boolean
  branchCreateInputRef: MutableRefObject<HTMLInputElement | null>
  gitNewBranchName: string
  gitActionLoading: boolean
  onClose: () => void
  onNameChange: (value: string) => void
  onCreate: () => void | Promise<void>
}) {
  if (!open) return null

  return (
    <div
      className="no-drag absolute inset-0 z-40 flex items-center justify-center bg-black/45 px-6 backdrop-blur-sm"
      data-no-drag="true"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[312px] rounded-[18px] border border-claude-border bg-claude-panel p-3"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[12px] font-semibold text-claude-text">새 브랜치 생성 및 체크아웃</h3>
            <p className="mt-1 text-[10px] leading-4.5 text-claude-muted">브랜치 이름을 입력하면 자동으로 체크아웃합니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title="닫기"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-claude-muted">브랜치 이름</label>
          <input
            ref={branchCreateInputRef}
            value={gitNewBranchName}
            onChange={(event) => onNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void onCreate()
              }
            }}
            placeholder="예: feature/header-branch-menu"
            className="w-full rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-[12px] text-claude-text outline-none placeholder:text-claude-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
          />
        </div>

        <div className="mt-3.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-claude-border bg-claude-surface px-3 py-1.5 text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={gitActionLoading || !gitNewBranchName.trim()}
            className="rounded-xl border border-claude-border bg-claude-surface px-3 py-1.5 text-[11px] font-medium text-claude-text transition-colors hover:bg-claude-surface-2 disabled:opacity-50"
          >
            생성 후 전환
          </button>
        </div>
      </div>
    </div>
  )
}
