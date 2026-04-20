import type { ClaudeInstallationStatus } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { AppButton, AppPanel } from '../ui/appDesignSystem'

export function ClaudeInstallModal({
  installationStatus,
  onRetry,
  onClose,
}: {
  installationStatus: ClaudeInstallationStatus
  onRetry: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
      <AppPanel className="w-full max-w-md rounded-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-claude-text">{t('install.title')}</p>
            <p className="mt-1 text-sm leading-relaxed text-claude-muted">
              {t('install.description')}
            </p>
          </div>
          <AppButton
            onClick={onClose}
            size="icon"
            tone="ghost"
            title={t('settings.close')}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </AppButton>
        </div>

        <AppPanel className="mt-4 bg-claude-surface px-4 py-3 shadow-none">
          <p className="text-xs text-claude-muted">{t('install.detectedPath')}</p>
          <p className="mt-1 break-all font-mono text-xs text-claude-text">{installationStatus.path ?? t('install.pathNotFound')}</p>
        </AppPanel>

        <AppPanel className="mt-3 bg-claude-surface px-4 py-3 shadow-none">
          <p className="text-xs text-claude-muted">{t('install.checklist')}</p>
          <ul className="mt-2 space-y-1 text-sm text-claude-text">
            <li>{t('install.checklist.version')}</li>
            <li>{t('install.checklist.retry')}</li>
          </ul>
        </AppPanel>

        <div className="mt-5 flex justify-end gap-2">
          <AppButton onClick={onClose}>
            {t('settings.close')}
          </AppButton>
          <AppButton onClick={onRetry} tone="accent">
            {t('install.retry')}
          </AppButton>
        </div>
      </AppPanel>
    </div>
  )
}
