import type { RefObject } from 'react'
import { useI18n } from '../../../hooks/useI18n'
import { AppButton, appFieldClassName } from '../../ui/appDesignSystem'

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
    <div className="mb-3 space-y-2 rounded-lg border border-claude-border bg-claude-bg/70 p-3">
      <p className="text-xs font-semibold text-claude-text">{t('settings.agent.addNew')}</p>
      <input
        ref={nameRef}
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && void onCreate()}
        placeholder={t('settings.agent.namePlaceholder')}
        className={`${appFieldClassName} font-mono text-xs`}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <AppButton
          onClick={() => void onCreate()}
          disabled={creating}
        >
          {creating ? t('common.creating') : t('common.create')}
        </AppButton>
        <AppButton
          onClick={onCancel}
          tone="ghost"
        >
          {t('common.cancel')}
        </AppButton>
      </div>
    </div>
  )
}
