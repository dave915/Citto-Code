import type { ReactNode } from 'react'
import type { Session } from '../../store/sessions'
import { useI18n } from '../../hooks/useI18n'
import { getIntlLocale } from '../../lib/i18n'
import {
  formatDateTime,
  formatPermissionMode,
  lastMessageSummary,
  type SessionExportFormat,
} from '../../lib/sessionExport'
import { AppButton, AppChip } from '../ui/appDesignSystem'

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
  const formattedTokenUsage = session.tokenUsage !== null
    ? new Intl.NumberFormat(getIntlLocale(language)).format(session.tokenUsage)
    : null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-claude-bg/30">
      <SessionInfoSection
        title={t('sessionInfo.section')}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <AppButton
              onClick={() => onExportSession('markdown')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
            >
              {exportingFormat === 'markdown' ? t('sessionInfo.saving') : 'Markdown'}
            </AppButton>
            <AppButton
              onClick={() => onExportSession('json')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
            >
              {exportingFormat === 'json' ? t('sessionInfo.saving') : 'JSON'}
            </AppButton>
            <AppButton
              onClick={() => onCopySessionExport('markdown')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              tone="ghost"
            >
              {copyingFormat === 'markdown' ? t('sessionInfo.copying') : t('sessionInfo.copyMd')}
            </AppButton>
            <AppButton
              onClick={() => onCopySessionExport('json')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              tone="ghost"
            >
              {copyingFormat === 'json' ? t('sessionInfo.copying') : t('sessionInfo.copyJson')}
            </AppButton>
          </div>
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AppChip tone={session.isStreaming ? 'accent' : 'neutral'}>
            {session.isStreaming ? t('sessionInfo.generating') : t('sessionInfo.idle')}
          </AppChip>
        </div>
        <div className="mt-3 space-y-3">
          <InfoRow label={t('sessionInfo.name')} value={session.name} />
          <InfoRow label={t('sessionInfo.path')} value={session.cwd || '~'} mono />
          <InfoRow label={t('sessionInfo.sessionId')} value={session.sessionId ?? t('sessionInfo.noneYet')} mono />
          <InfoRow label={t('sessionInfo.model')} value={session.model ?? t('sessionInfo.defaultModel')} />
          <InfoRow label={t('sessionInfo.permission')} value={formatPermissionMode(session.permissionMode, language)} />
          <InfoRow label={t('sessionInfo.planMode')} value={session.planMode ? t('sessionInfo.on') : t('sessionInfo.off')} />
          <InfoRow label={t('sessionInfo.error')} value={session.error ?? t('sessionInfo.none')} mono={Boolean(session.error)} />
        </div>
        {exportStatus && (
          <p className="mt-3 break-all text-xs text-emerald-200">{exportStatus}</p>
        )}
        {exportError && (
          <p className="mt-3 text-xs text-red-300">{exportError}</p>
        )}
      </SessionInfoSection>

      <SessionInfoSection
        title={t('sessionInfo.context')}
        action={(
          <AppButton
            onClick={onCompact}
            disabled={session.isStreaming}
            tone="ghost"
          >
            {t('sessionInfo.compact')}
          </AppButton>
        )}
      >
        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold text-claude-text">{contextUsagePercent}%</p>
              {formattedTokenUsage !== null ? (
                <p className="text-xs text-claude-muted">{formattedTokenUsage} {t('sessionInfo.inputTokens')}</p>
              ) : null}
            </div>
            <p className="text-xs text-claude-muted">
              {formattedTokenUsage !== null ? t('sessionInfo.actual') : t('sessionInfo.estimated')}
            </p>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-claude-bg">
            <div
              className="h-full rounded-full bg-claude-orange transition-[width]"
              style={{ width: `${contextUsagePercent}%` }}
            />
          </div>
        </div>
      </SessionInfoSection>

      <div className="grid grid-cols-2 gap-3 px-4 py-4">
        <InfoStat label={t('sessionInfo.userMessages')} value={String(userMessageCount)} />
        <InfoStat label={t('sessionInfo.responseMessages')} value={String(assistantMessageCount)} />
        <InfoStat label={t('sessionInfo.promptHistory')} value={String(promptHistoryCount)} />
        <InfoStat label={t('sessionInfo.lastCost')} value={session.lastCost !== undefined ? `$${session.lastCost.toFixed(4)}` : '-'} />
      </div>

      <SessionInfoSection title={t('sessionInfo.timeline')}>
        <div className="mt-3 space-y-3">
          <InfoRow label={t('sessionInfo.startedAt')} value={createdAt ? formatDateTime(createdAt, language) : t('sessionInfo.noMessages')} />
          <InfoRow label={t('sessionInfo.lastMessage')} value={lastMessageSummary(session, language)} />
        </div>
      </SessionInfoSection>
    </div>
  )
}

function SessionInfoSection({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-b border-claude-border/70 px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">{title}</p>
        {action}
      </div>
      {children}
    </section>
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
    <div className="rounded-md border border-claude-border bg-claude-panel/65 p-3">
      <p className="text-xs text-claude-muted">{label}</p>
      <p className="mt-1 text-[14px] font-semibold text-claude-text">{value}</p>
    </div>
  )
}
