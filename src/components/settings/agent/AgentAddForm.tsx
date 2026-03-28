import type { RefObject } from 'react'
import { useI18n } from '../../../hooks/useI18n'

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

export function AgentAddForm({
  open,
  name,
  creating,
  error,
  nameRef,
  onNameChange,
  onCreate,
  onCancel,
}: Props) {
  const { t } = useI18n()
  if (!open) return null

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-claude-border bg-claude-surface p-3">
      <p className="text-xs font-semibold text-claude-text">{t('settings.agent.addNew')}</p>
      <input
        ref={nameRef}
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && void onCreate()}
        placeholder={t('settings.agent.namePlaceholder')}
        className="w-full rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono focus:border-claude-border focus:outline-none focus:ring-1 focus:ring-white/10"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void onCreate()}
          disabled={creating}
          className="rounded-lg bg-claude-surface-2 px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-[#44444a] disabled:opacity-50"
        >
          {creating ? t('common.creating') : t('common.create')}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
