import type { Session } from '../../store/sessions'
import { useI18n } from '../../hooks/useI18n'
import {
  formatDateTime,
  formatPermissionMode,
  lastMessageSummary,
  type SessionExportFormat,
} from '../../lib/sessionExport'

type SessionInfoPanelProps = {
  session: Session
  userMessageCount: number
  assistantMessageCount: number
  promptHistoryCount: number
  contextUsagePercent: number
  onCompact: () => void
  exportingFormat: SessionExportFormat | null
  copyingFormat: SessionExportFormat | null
  exportStatus: string | null
  exportError: string | null
  onExportSession: (format: SessionExportFormat) => void
  onCopySessionExport: (format: SessionExportFormat) => void
}

export function SessionInfoPanel({
  session,
  userMessageCount,
  assistantMessageCount,
  promptHistoryCount,
  contextUsagePercent,
  onCompact,
  exportingFormat,
  copyingFormat,
  exportStatus,
  exportError,
  onExportSession,
  onCopySessionExport,
}: SessionInfoPanelProps) {
  const { language, t } = useI18n()
  const createdAt = session.messages[0]?.createdAt ?? null

  return (
    <div className="flex-1 space-y-4 overflow-y-auto bg-claude-bg/40 p-4">
      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">{t('sessionInfo.section')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onExportSession('markdown')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
            >
              {exportingFormat === 'markdown' ? t('sessionInfo.saving') : 'Markdown'}
            </button>
            <button
              onClick={() => onExportSession('json')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
            >
              {exportingFormat === 'json' ? t('sessionInfo.saving') : 'JSON'}
            </button>
            <button
              onClick={() => onCopySessionExport('markdown')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
            >
              {copyingFormat === 'markdown' ? t('sessionInfo.copying') : t('sessionInfo.copyMd')}
            </button>
            <button
              onClick={() => onCopySessionExport('json')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
            >
              {copyingFormat === 'json' ? t('sessionInfo.copying') : t('sessionInfo.copyJson')}
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-3">
          <InfoRow label={t('sessionInfo.name')} value={session.name} />
          <InfoRow label={t('sessionInfo.path')} value={session.cwd || '~'} mono />
          <InfoRow label={t('sessionInfo.sessionId')} value={session.sessionId ?? t('sessionInfo.noneYet')} mono />
          <InfoRow label={t('sessionInfo.model')} value={session.model ?? t('sessionInfo.defaultModel')} />
          <InfoRow label={t('sessionInfo.permission')} value={formatPermissionMode(session.permissionMode, language)} />
          <InfoRow label={t('sessionInfo.planMode')} value={session.planMode ? t('sessionInfo.on') : t('sessionInfo.off')} />
          <InfoRow label={t('sessionInfo.status')} value={session.isStreaming ? t('sessionInfo.generating') : t('sessionInfo.idle')} />
          <InfoRow label={t('sessionInfo.error')} value={session.error ?? t('sessionInfo.none')} mono={Boolean(session.error)} />
        </div>
        {exportStatus && (
          <p className="mt-3 break-all text-xs text-emerald-200">{exportStatus}</p>
        )}
        {exportError && (
          <p className="mt-3 text-xs text-red-300">{exportError}</p>
        )}
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">{t('sessionInfo.context')}</p>
          <button
            onClick={onCompact}
            disabled={session.isStreaming}
            className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
          >
            {t('sessionInfo.compact')}
          </button>
        </div>
        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold text-claude-text">{contextUsagePercent}%</p>
            <p className="text-xs text-claude-muted">{t('sessionInfo.estimated')}</p>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-claude-bg">
            <div
              className="h-full rounded-full bg-claude-orange transition-[width]"
              style={{ width: `${contextUsagePercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoStat label={t('sessionInfo.userMessages')} value={String(userMessageCount)} />
        <InfoStat label={t('sessionInfo.responseMessages')} value={String(assistantMessageCount)} />
        <InfoStat label={t('sessionInfo.promptHistory')} value={String(promptHistoryCount)} />
        <InfoStat label={t('sessionInfo.lastCost')} value={session.lastCost !== undefined ? `$${session.lastCost.toFixed(4)}` : '-'} />
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">{t('sessionInfo.timeline')}</p>
        <div className="mt-3 space-y-3">
          <InfoRow label={t('sessionInfo.startedAt')} value={createdAt ? formatDateTime(createdAt, language) : t('sessionInfo.noMessages')} />
          <InfoRow label={t('sessionInfo.lastMessage')} value={lastMessageSummary(session, language)} />
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-claude-muted">{label}</span>
      <span className={`text-sm text-claude-text break-words ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <p className="text-xs text-claude-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-claude-text">{value}</p>
    </div>
  )
}
