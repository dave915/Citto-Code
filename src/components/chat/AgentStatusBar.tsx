import { useEffect, useMemo, useState } from 'react'
import { collectSubagentCalls } from '../../lib/agent-subcalls'
import { useI18n } from '../../hooks/useI18n'
import type { Session } from '../../store/sessions'
import { AgentDetailModal } from './AgentDetailModal'
import { getStatusClassName, getStatusLabel } from './agentStatusShared'

type Props = {
  session: Session
  onDrillDown?: (target: { toolUseId: string; title: string }) => void
}

export function AgentStatusBar({ session, onDrillDown }: Props) {
  const { language, t } = useI18n()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const entries = useMemo(() => collectSubagentCalls(session.messages), [session.messages])
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.key === selectedKey) ?? null,
    [entries, selectedKey],
  )
  const { runningCount, completedCount } = useMemo(() => (
    entries.reduce(
      (counts, entry) => {
        if (entry.status === 'running' || entry.status === 'pending') {
          counts.runningCount += 1
        } else if (entry.status === 'done') {
          counts.completedCount += 1
        }
        return counts
      },
      { runningCount: 0, completedCount: 0 },
    )
  ), [entries])

  useEffect(() => {
    if (selectedKey && !selectedEntry) {
      setSelectedKey(null)
    }
  }, [selectedEntry, selectedKey])

  useEffect(() => {
    setIsExpanded(true)
  }, [session.id])

  if (entries.length === 0) return null

  const summaryLabels = [
    ...(runningCount > 0 ? [t('subagent.runningCount', { count: runningCount })] : []),
    ...(completedCount > 0 ? [t('subagent.doneCount', { count: completedCount })] : []),
  ]

  return (
    <>
      <div className="mb-3 rounded-xl border border-claude-border/75 bg-claude-panel/40 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)]">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setIsExpanded((current) => !current)
          }}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-0.5 transition-colors hover:bg-claude-surface/25"
        >
          <div className="min-w-0 flex items-center gap-2">
            <div className="text-[12px] font-semibold text-claude-text/90">
              {t('subagent.title')}
            </div>
            {summaryLabels.length > 0 ? (
              <div className="truncate text-[11px] text-claude-muted">
                {summaryLabels.join(' · ')}
              </div>
            ) : null}
          </div>

          <svg
            className={`h-3.5 w-3.5 shrink-0 text-claude-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </div>

        {isExpanded ? (
          <div className="mt-2 border-t border-claude-border/65 pt-2">
            <div className="space-y-0.5">
              {entries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => {
                    if (onDrillDown) {
                      onDrillDown({
                        toolUseId: entry.toolUseId,
                        title: entry.description || entry.agent || t('subagent.defaultName'),
                      })
                      return
                    }
                    setSelectedKey(entry.key)
                  }}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-claude-surface/45"
                >
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${getStatusClassName(entry.status)}`}>
                    {getStatusLabel(entry.status, language)}
                  </span>
                  <div className="min-w-0 flex-1 truncate text-[12px] font-medium leading-5 text-claude-text">
                    {entry.description || entry.agent || entry.toolUseId}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {!onDrillDown && selectedKey ? (
        <AgentDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedKey(null)}
        />
      ) : null}
    </>
  )
}
