import { useI18n } from '../../hooks/useI18n'
import type { SubagentCallSummary } from '../../lib/agent-subcalls'
import { getStatusClassName, getStatusLabel } from '../chat/agentStatusShared'

type SubagentDrilldownHeaderProps = {
  entry: SubagentCallSummary
  headerTitle: string
  onBack: () => void
  toolUseId: string
}

export function SubagentDrilldownHeader({
  entry,
  headerTitle,
  onBack,
  toolUseId,
}: SubagentDrilldownHeaderProps) {
  const { language, t } = useI18n()

  return (
    <div className="flex-shrink-0 border-b border-claude-border/70 bg-claude-chat-bg/95 backdrop-blur supports-[backdrop-filter]:bg-claude-chat-bg/80">
      <div className="w-full px-6 py-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-claude-border/70 bg-claude-surface text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
            aria-label={t('subagent.backToChat')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-medium text-claude-text">
                {headerTitle}
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusClassName(entry.status)}`}>
                {getStatusLabel(entry.status, language)}
              </span>
            </div>
            <div className="mt-1 text-xs text-claude-muted">
              {entry.agent ? `${entry.agent} · ` : ''}{toolUseId}
            </div>
            {entry.transcriptPath ? (
              <div className="mt-1 truncate font-mono text-[11px] text-claude-muted/85">
                {entry.transcriptPath}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
