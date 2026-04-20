import type { MutableRefObject } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { AppButton, AppPanel, appFieldClassName } from '../ui/appDesignSystem'

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
  const { t } = useI18n()
  if (!open) return null

  return (
    <div
      className="no-drag absolute inset-0 z-40 flex items-center justify-center bg-black/45 px-6 backdrop-blur-sm"
      data-no-drag="true"
      onMouseDown={onClose}
    >
      <AppPanel
        className="w-full max-w-[312px] p-3"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[12px] font-semibold text-claude-text">{t('git.branchModal.title')}</h3>
            <p className="mt-1 text-[10px] leading-4.5 text-claude-muted">{t('git.branchModal.description')}</p>
          </div>
          <AppButton
            onClick={onClose}
            size="icon"
            tone="ghost"
            title={t('common.close')}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </AppButton>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-claude-muted">{t('git.branchModal.fieldName')}</label>
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
            placeholder={t('git.branchModal.placeholder')}
            className={`${appFieldClassName} text-[12px]`}
          />
        </div>

        <div className="mt-3.5 flex items-center justify-end gap-2">
          <AppButton
            onClick={onClose}
            tone="ghost"
          >
            {t('common.cancel')}
          </AppButton>
          <AppButton
            onClick={() => void onCreate()}
            disabled={gitActionLoading || !gitNewBranchName.trim()}
            tone="accent"
          >
            {t('git.branchModal.createAndSwitch')}
          </AppButton>
        </div>
      </AppPanel>
    </div>
  )
}
