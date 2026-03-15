import type { Session } from '../../store/sessions'
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
  const createdAt = session.messages[0]?.createdAt ?? null

  return (
    <div className="flex-1 space-y-4 overflow-y-auto bg-claude-bg/40 p-4">
      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">세션</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onExportSession('markdown')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
            >
              {exportingFormat === 'markdown' ? '저장 중...' : 'Markdown'}
            </button>
            <button
              onClick={() => onExportSession('json')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
            >
              {exportingFormat === 'json' ? '저장 중...' : 'JSON'}
            </button>
            <button
              onClick={() => onCopySessionExport('markdown')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
            >
              {copyingFormat === 'markdown' ? '복사 중...' : 'MD 복사'}
            </button>
            <button
              onClick={() => onCopySessionExport('json')}
              disabled={Boolean(exportingFormat) || Boolean(copyingFormat)}
              className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
            >
              {copyingFormat === 'json' ? '복사 중...' : 'JSON 복사'}
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-3">
          <InfoRow label="이름" value={session.name} />
          <InfoRow label="경로" value={session.cwd || '~'} mono />
          <InfoRow label="세션 ID" value={session.sessionId ?? '아직 없음'} mono />
          <InfoRow label="모델" value={session.model ?? '기본 모델'} />
          <InfoRow label="권한" value={formatPermissionMode(session.permissionMode)} />
          <InfoRow label="플랜 모드" value={session.planMode ? '켜짐' : '꺼짐'} />
          <InfoRow label="상태" value={session.isStreaming ? '응답 생성 중' : '대기 중'} />
          <InfoRow label="오류" value={session.error ?? '없음'} mono={Boolean(session.error)} />
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
          <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">현재 컨텍스트</p>
          <button
            onClick={onCompact}
            disabled={session.isStreaming}
            className="rounded-xl border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text disabled:opacity-40"
          >
            압축하기
          </button>
        </div>
        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold text-claude-text">{contextUsagePercent}%</p>
            <p className="text-xs text-claude-muted">추정치</p>
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
        <InfoStat label="사용자 메시지" value={String(userMessageCount)} />
        <InfoStat label="응답 메시지" value={String(assistantMessageCount)} />
        <InfoStat label="프롬프트 기록" value={String(promptHistoryCount)} />
        <InfoStat label="마지막 비용" value={session.lastCost !== undefined ? `$${session.lastCost.toFixed(4)}` : '-'} />
      </div>

      <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-claude-muted">타임라인</p>
        <div className="mt-3 space-y-3">
          <InfoRow label="시작 시각" value={createdAt ? formatDateTime(createdAt) : '메시지 없음'} />
          <InfoRow label="마지막 메시지" value={lastMessageSummary(session)} />
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
