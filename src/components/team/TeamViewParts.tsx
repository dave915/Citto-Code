import { useI18n } from '../../hooks/useI18n'
import { formatAttachedFilesSummary } from '../../lib/attachmentPrompts'
import { translate, type AppLanguage } from '../../lib/i18n'
import type { DiscussionMode } from '../../store/teamTypes'

export { AgentSeat, getOfficeCarpetInsets } from './TeamAgentSeat'
export { SelectedAgentPanel } from './TeamSelectedAgentPanel'
export { TeamTaskPopover as TaskPopover } from './TeamTaskPopover'

export const DETAIL_PANEL_DEFAULT_WIDTH = 420
const DETAIL_PANEL_MIN_WIDTH = 320
const DETAIL_PANEL_MAX_WIDTH = 640

function getModeOptions(language: AppLanguage): { value: DiscussionMode; label: string; icon: string; desc: string }[] {
  return [
    {
      value: 'sequential',
      label: translate(language, 'team.mode.sequential.label'),
      icon: '→',
      desc: translate(language, 'team.mode.sequential.description'),
    },
    {
      value: 'parallel',
      label: translate(language, 'team.mode.parallel.label'),
      icon: '⇉',
      desc: translate(language, 'team.mode.parallel.description'),
    },
    {
      value: 'meeting',
      label: translate(language, 'team.mode.meeting.label'),
      icon: '◎',
      desc: translate(language, 'team.mode.meeting.description'),
    },
  ]
}

export function formatTeamTaskSummary(
  task: string,
  attachedFiles: Array<{ id: string; name: string; path: string; size: number }>,
  language: AppLanguage,
) {
  const trimmed = task.trim()
  if (trimmed) return trimmed
  if (attachedFiles.length > 0) return formatAttachedFilesSummary(attachedFiles.length, language)
  return translate(language, 'team.noTopicYet')
}

export function clampDetailPanelWidth(width: number) {
  const viewportMax =
    typeof window === 'undefined'
      ? DETAIL_PANEL_MAX_WIDTH
      : Math.max(
          DETAIL_PANEL_MIN_WIDTH,
          Math.min(DETAIL_PANEL_MAX_WIDTH, window.innerWidth - 460),
        )

  return Math.min(viewportMax, Math.max(DETAIL_PANEL_MIN_WIDTH, width))
}

export function normalizeTeamProjectKey(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '~') return '~'

  const normalized = trimmed.replace(/\\/g, '/')
  if (normalized === '/') return normalized
  return normalized.replace(/\/+$/, '').toLowerCase()
}

export function ModeSelector({
  mode,
  disabled,
  onChange,
}: {
  mode: DiscussionMode
  disabled: boolean
  onChange: (mode: DiscussionMode) => void
}) {
  const { language } = useI18n()
  const modeOptions = getModeOptions(language)

  return (
    <div className="flex items-center gap-1 rounded-lg border border-claude-border bg-claude-bg p-0.5">
      {modeOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          title={option.desc}
          onClick={() => onChange(option.value)}
          className={`
            flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all
            disabled:cursor-not-allowed disabled:opacity-50
            ${mode === option.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-claude-text-muted hover:text-claude-text'
            }
          `}
        >
          <span className="font-mono text-base leading-none">{option.icon}</span>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const { language } = useI18n()
  const configs = {
    idle: { label: translate(language, 'team.status.idle'), className: 'bg-gray-500/20 text-gray-400' },
    running: { label: translate(language, 'team.status.running'), className: 'bg-blue-500/20 text-blue-400 animate-pulse' },
    done: { label: translate(language, 'team.status.done'), className: 'bg-green-500/20 text-green-400' },
    error: { label: translate(language, 'team.status.error'), className: 'bg-red-500/20 text-red-400' },
  }
  const config = configs[status as keyof typeof configs] ?? configs.idle

  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none ${config.className}`}>
      {config.label}
    </span>
  )
}
