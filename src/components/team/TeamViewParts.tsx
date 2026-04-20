import { useI18n } from '../../hooks/useI18n'
import { formatAttachedFilesSummary } from '../../lib/attachmentPrompts'
import { translate, type AppLanguage } from '../../lib/i18n'
import type { DiscussionMode } from '../../store/teamTypes'
import { TeamChip, cx } from './teamDesignSystem'

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
    <div className="flex items-center gap-1 rounded-lg border border-claude-border bg-claude-panel p-0.5">
      {modeOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          title={option.desc}
          onClick={() => onChange(option.value)}
          className={cx(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            mode === option.value
              ? 'border border-claude-orange/35 bg-claude-orange/12 text-claude-orange'
              : 'border border-transparent text-claude-muted hover:bg-claude-surface hover:text-claude-text',
          )}
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
    idle: { label: translate(language, 'team.status.idle'), tone: 'neutral' as const, dotClassName: 'bg-claude-muted' },
    running: { label: translate(language, 'team.status.running'), tone: 'accent' as const, dotClassName: 'bg-claude-orange' },
    done: { label: translate(language, 'team.status.done'), tone: 'success' as const, dotClassName: 'bg-green-400' },
    error: { label: translate(language, 'team.status.error'), tone: 'danger' as const, dotClassName: 'bg-red-400' },
  }
  const config = configs[status as keyof typeof configs] ?? configs.idle

  return (
    <TeamChip tone={config.tone} className="shrink-0">
      <span className={cx('h-1.5 w-1.5 rounded-full', config.dotClassName)} />
      {config.label}
    </TeamChip>
  )
}
