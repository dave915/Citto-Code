import type { ClaudeInstallationStatus } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'

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
      <div className="w-full max-w-md rounded-[16px] border border-claude-border bg-claude-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-claude-text">{t('install.title')}</p>
            <p className="mt-1 text-sm leading-relaxed text-claude-muted">
              {t('install.description')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title={t('settings.close')}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-xs text-claude-muted">{t('install.detectedPath')}</p>
          <p className="mt-1 break-all font-mono text-xs text-claude-text">{installationStatus.path ?? t('install.pathNotFound')}</p>
        </div>

        <div className="mt-3 rounded-2xl border border-claude-border bg-claude-surface px-4 py-3">
          <p className="text-xs text-claude-muted">{t('install.checklist')}</p>
          <ul className="mt-2 space-y-1 text-sm text-claude-text">
            <li>{t('install.checklist.version')}</li>
            <li>{t('install.checklist.retry')}</li>
          </ul>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-claude-border px-3 py-2 text-sm text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
          >
            {t('settings.close')}
          </button>
          <button
            onClick={onRetry}
            className="rounded-xl bg-claude-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:brightness-110"
          >
            {t('install.retry')}
          </button>
        </div>
      </div>
    </div>
  )
}
