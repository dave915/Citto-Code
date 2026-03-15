import { useState } from 'react'
import { DEFAULT_PROJECT_PATH } from '../../../store/sessions'

type Props = {
  defaultProjectPath: string
  onChange: (path: string) => void
}

export function DefaultProjectSection({ defaultProjectPath, onChange }: Props) {
  const [loading, setLoading] = useState(false)

  const handleSelectDefaultProject = async () => {
    setLoading(true)
    try {
      const folder = await window.claude.selectFolder({
        defaultPath: defaultProjectPath,
        title: '기본 프로젝트 폴더 선택',
      })
      if (folder) onChange(folder)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">기본 프로젝트 폴더</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        새 세션이나 폴더 선택 창이 처음 열릴 위치입니다. 기본값은 Desktop이며, 언제든 다른 폴더로 바꿀 수 있습니다.
      </p>

      <div className="mt-4 rounded-xl border border-claude-border bg-claude-panel p-3">
        <label className="mb-2 block text-xs font-medium text-claude-muted">현재 경로</label>
        <input
          value={defaultProjectPath}
          readOnly
          className="w-full rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-sm text-claude-text outline-none"
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSelectDefaultProject()}
            disabled={loading}
            className="rounded-xl border border-claude-border bg-claude-surface px-3 py-2 text-sm text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? '폴더 여는 중...' : '폴더 선택'}
          </button>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_PROJECT_PATH)}
            className="rounded-xl border border-claude-border bg-claude-panel px-3 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-bg hover:text-claude-text"
          >
            Desktop으로 복원
          </button>
        </div>
      </div>
    </div>
  )
}
