import { useMemo, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { type ToolCallBlock as ToolCallBlockType } from '../../store/sessions'
import { buildSummary, buildTimelineEntries, type AskAboutSelectionPayload } from '../../lib/toolCallUtils'
import { TimelineEntryRow } from './TimelineEntryRow'

export function ToolTimeline({
  toolCalls,
  onAskAboutSelection,
}: {
  toolCalls: ToolCallBlockType[]
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  const { language } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const entries = useMemo(() => buildTimelineEntries(toolCalls, language), [language, toolCalls])
  const visibleEntries = showAll ? entries : entries.slice(0, 3)
  const hiddenCount = Math.max(0, entries.length - visibleEntries.length)

  if (entries.length === 0) return null

  return (
    <div className="mb-0.5 space-y-0.5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-1.5 text-left text-[12px] leading-5 text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
      >
        <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : 'rotate-0'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
        <span>{buildSummary(entries, language)}</span>
      </button>

      {expanded && (
        <div className="space-y-1">
          {visibleEntries.map((entry) => (
            <TimelineEntryRow key={entry.id} entry={entry} onAskAboutSelection={onAskAboutSelection} />
          ))}
          {hiddenCount > 0 && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="ml-5 text-[14px] text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
            >
              {language === 'en' ? `Show ${hiddenCount} more` : `${hiddenCount}개 더 보기`}
            </button>
          )}
          {showAll && entries.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="ml-5 text-[14px] text-claude-muted outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
            >
              {language === 'en' ? 'Show less' : '간단히 보기'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
