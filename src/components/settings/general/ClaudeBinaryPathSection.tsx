import { useEffect, useState } from 'react'

type PathStatus = { ok: true; version: string | null } | { ok: false } | null

type Props = {
  claudeBinaryPath: string
  onChange: (path: string) => void
}

export function ClaudeBinaryPathSection({ claudeBinaryPath, onChange }: Props) {
  const [draft, setDraft] = useState(claudeBinaryPath)
  const [pathStatus, setPathStatus] = useState<PathStatus>(null)

  useEffect(() => {
    setDraft(claudeBinaryPath)
  }, [claudeBinaryPath])

  useEffect(() => {
    let cancelled = false

    if (!draft.trim()) {
      setPathStatus(null)
    }

    const timer = window.setTimeout(async () => {
      if (!cancelled && draft !== claudeBinaryPath) {
        onChange(draft)
      }

      if (!draft.trim()) return

      const result = await window.claude.checkInstallation(draft).catch(() => ({
        installed: false,
        version: null,
      }))
      if (cancelled) return
      setPathStatus(result.installed ? { ok: true, version: result.version } : { ok: false })
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [claudeBinaryPath, draft, onChange])

  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-sm font-semibold text-claude-text">Claude 실행 경로</p>
      <p className="mt-1 text-xs leading-relaxed text-claude-muted">
        비워두면 자동으로 감지합니다. 터미널에서{' '}
        <code className="rounded bg-claude-border px-1 py-0.5 font-mono">which claude</code>로 경로를 확인할 수 있습니다.
      </p>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="~/.local/bin/claude"
        className="mt-3 w-full rounded-xl border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text outline-none focus:border-claude-accent"
        spellCheck={false}
      />
      {pathStatus !== null && (
        pathStatus.ok
          ? <p className="mt-1.5 text-xs text-green-400">✓ {pathStatus.version ?? '경로 확인됨'}</p>
          : <p className="mt-1.5 text-xs text-red-400">경로를 찾을 수 없습니다</p>
      )}
    </div>
  )
}
