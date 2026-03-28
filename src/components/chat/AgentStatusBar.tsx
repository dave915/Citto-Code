import { useEffect, useMemo, useRef, useState } from 'react'
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
  const entries = useMemo(() => collectSubagentCalls(session.messages), [session.messages])
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(() => runningCount > 0)
  const previousRunningCountRef = useRef(runningCount)
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.key === selectedKey) ?? null,
    [entries, selectedKey],
  )

  useEffect(() => {
    if (selectedKey && !selectedEntry) {
      setSelectedKey(null)
    }
  }, [selectedEntry, selectedKey])

  useEffect(() => {
    setIsExpanded(runningCount > 0)
    previousRunningCountRef.current = runningCount
  }, [session.id, runningCount])

  useEffect(() => {
    if (runningCount > 0 && previousRunningCountRef.current === 0) {
      setIsExpanded(true)
    }
    previousRunningCountRef.current = runningCount
  }, [runningCount])

  if (entries.length === 0) return null

  const summaryLabels = [
    ...(runningCount > 0 ? [t('subagent.runningCount', { count: runningCount })] : []),
    ...(completedCount > 0 ? [t('subagent.doneCount', { count: completedCount })] : []),
  ]

  return (
    <>
      <div className="mb-2 rounded-xl border border-claude-border/75 bg-claude-panel/40 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)]">
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
          className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-0.5 py-0.5 transition-colors hover:bg-claude-surface/25"
        >
          <div className="min-w-0 flex items-center gap-2">
            <div className="text-[11px] font-semibold text-claude-text/90">
              {t('subagent.title')}
            </div>
            {summaryLabels.length > 0 ? (
              <div className="truncate text-[11px] text-claude-muted/90">
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
          <div className="mt-1.5 border-t border-claude-border/65 pt-1.5">
            <div className="max-h-32 space-y-0 overflow-y-auto">
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
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-claude-surface/45"
                >
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none ${getStatusClassName(entry.status)}`}>
                    {getStatusLabel(entry.status, language)}
                  </span>
                  <div className="min-w-0 flex-1 truncate text-[12px] font-medium leading-4 text-claude-text">
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
