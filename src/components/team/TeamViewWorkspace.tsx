import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { AgentTeam, TeamAgent } from '../../store/teamTypes'
import { AgentPixelIcon } from './AgentPixelIcon'
import { TeamButton } from './teamDesignSystem'
import {
  AgentSeat,
  ModeSelector,
  SelectedAgentPanel,
  TaskPopover,
} from './TeamViewParts'

type Props = {
  activeAgentId: string | null
  activeTeam: AgentTeam
  carpetInsets: { outer: string; inner: string }
  detailPanelStyle: CSSProperties
  focusedAgent: TeamAgent | null
  onChangeMode: (mode: AgentTeam['mode']) => void
  onCloseTaskPopover: () => void
  onOpenTaskPopover: () => void
  onRemoveTeam: () => void
  onReset: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onSelectAgent: (agentId: string) => void
  taskSummary: string
  taskPopoverOpen: boolean
}

export function TeamViewWorkspace({
  activeAgentId,
  activeTeam,
  carpetInsets,
  detailPanelStyle,
  focusedAgent,
  onChangeMode,
  onCloseTaskPopover,
  onOpenTaskPopover,
  onRemoveTeam,
  onReset,
  onResizeStart,
  onSelectAgent,
  taskSummary,
  taskPopoverOpen,
}: Props) {
  const { language, t } = useI18n()

  return (
    <>
      <div className="flex h-[40px] shrink-0 items-center gap-3 border-b border-claude-border bg-claude-bg px-3">
        <ModeSelector
          mode={activeTeam.mode ?? 'sequential'}
          disabled={activeTeam.status === 'running'}
          onChange={onChangeMode}
        />

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs text-claude-muted">{t('team.roundLabel')}</span>
          <span className="shrink-0 text-xs font-bold text-claude-text">{activeTeam.roundNumber}</span>
          <span className="mx-1 shrink-0 text-claude-border">·</span>
          {activeTeam.agents.map((agent, index) => {
            const isParallel = (activeTeam.mode ?? 'sequential') === 'parallel'

            return (
              <div key={agent.id} className="flex shrink-0 items-center gap-1">
                {index > 0 && (
                  isParallel ? (
                    <span className="px-0.5 text-xs text-claude-muted">+</span>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" className="text-claude-muted">
                      <path d="M4 6h4M6 4l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  )
                )}
                <AgentPixelIcon
                  type={agent.iconType}
                  size={20}
                  color={agent.color}
                />
                <span className={`text-xs ${agent.id === activeAgentId ? 'font-semibold text-claude-text' : 'text-claude-muted'}`}>
                  {agent.name}
                </span>
              </div>
            )
          })}
        </div>

        {(activeTeam.currentTask || activeTeam.currentTaskAttachments.length > 0) && (
          <p className="max-w-xs truncate text-xs text-claude-muted">
            "{taskSummary}"
          </p>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <TeamButton
            onClick={onReset}
            disabled={activeTeam.status === 'running'}
            tone="ghost"
          >
            {t('team.reset')}
          </TeamButton>
          <TeamButton
            onClick={onRemoveTeam}
            disabled={activeTeam.status === 'running'}
            size="icon"
            tone="danger"
            title={t('team.delete')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </TeamButton>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
        <section
          className={`flex min-h-[360px] min-w-0 items-center justify-center overflow-hidden px-1 py-1 transition-all duration-300 ${
            focusedAgent ? 'lg:flex-[1.05]' : 'flex-1'
          }`}
        >
          <div
            className="relative mx-auto aspect-[5/4] h-full max-h-full w-auto max-w-full min-w-0 overflow-hidden rounded-[8px] border-2 border-[#8c98a4] shadow-[0_12px_28px_rgba(38,52,68,0.16)]"
            style={{
              backgroundImage: [
                'linear-gradient(180deg, #eef3f7 0%, #e7edf3 28%, #c5cdd6 28%, #bcc5ce 100%)',
                'repeating-linear-gradient(90deg, transparent 0 43px, rgba(118,132,147,0.08) 43px 44px)',
                'repeating-linear-gradient(0deg, transparent 0 43px, rgba(118,132,147,0.08) 43px 44px)',
              ].join(', '),
            }}
          >
            <div className="absolute left-[7%] top-[6%] h-[16%] w-[24%] rounded-[6px] border-2 border-[#93a7bc] bg-[linear-gradient(180deg,#d4ecff_0%,#c3ddf7_100%)] shadow-[0_4px_0_#a6b6c6]">
              <span className="absolute inset-x-[6px] top-1/2 h-px -translate-y-1/2 bg-white/70" />
              <span className="absolute inset-y-[6px] left-1/2 w-px -translate-x-1/2 bg-white/60" />
            </div>

            <div className="absolute right-[7%] top-[6%] h-[16%] w-[24%] rounded-[6px] border-2 border-[#93a7bc] bg-[linear-gradient(180deg,#d4ecff_0%,#c3ddf7_100%)] shadow-[0_4px_0_#a6b6c6]">
              <span className="absolute inset-x-[6px] top-1/2 h-px -translate-y-1/2 bg-white/70" />
              <span className="absolute inset-y-[6px] left-1/2 w-px -translate-x-1/2 bg-white/60" />
            </div>

            <div className="absolute inset-x-0 top-[28%] h-[2px] bg-[#a4afba]/70" />

            <button
              type="button"
              onClick={onOpenTaskPopover}
              className="absolute left-1/2 top-[7%] z-10 w-[20%] min-w-[164px] -translate-x-1/2 border-2 border-[#96a3b0] bg-[linear-gradient(180deg,#ffffff,#edf2f6)] px-4 py-3 text-center shadow-[0_4px_0_#c7d0d9] transition-transform hover:-translate-y-[1px]"
            >
              <span className="inline-flex border border-[#cfd8e1] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#607080]">
                {t('team.taskLabel')}
              </span>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#4c5a67]">
                {taskSummary}
              </p>
            </button>

            <div
              className="absolute bottom-[10%] top-[34%] rounded-[10px] border border-white/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))]"
              style={{ left: carpetInsets.outer, right: carpetInsets.outer }}
            />
            <div
              className="absolute bottom-[12%] top-[36%] rounded-[8px] border border-[#aeb8c2]/40 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.03)_0_28px,rgba(139,151,163,0.09)_28px_29px),repeating-linear-gradient(0deg,rgba(255,255,255,0.02)_0_28px,rgba(139,151,163,0.08)_28px_29px)]"
              style={{ left: carpetInsets.inner, right: carpetInsets.inner }}
            />

            {activeTeam.agents.map((agent, index) => (
              <AgentSeat
                key={agent.id}
                agent={agent}
                index={index}
                total={activeTeam.agents.length}
                isFocused={agent.id === focusedAgent?.id}
                isActive={agent.id === activeAgentId}
                onSelect={() => onSelectAgent(agent.id)}
              />
            ))}
          </div>
        </section>

        {focusedAgent && (
          <div className="relative min-h-0 min-w-0 lg:shrink-0" style={detailPanelStyle}>
            <button
              type="button"
              onPointerDown={onResizeStart}
              className="absolute bottom-[28px] left-[-12px] top-[28px] z-20 hidden w-6 cursor-col-resize items-center justify-center lg:flex"
              aria-label={t('team.resizePanel')}
              title={t('team.resizePanelHint')}
            >
              <span className="relative h-full w-full">
                <span className="absolute left-1/2 top-1/2 h-14 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-claude-border/80 bg-claude-panel shadow-[0_4px_12px_rgba(0,0,0,0.22)]" />
                <span className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-claude-muted/60" />
              </span>
            </button>

            <section className="min-h-0 min-w-0 lg:h-full lg:w-[var(--team-detail-width)] lg:min-w-[var(--team-detail-width)] lg:max-w-[var(--team-detail-width)]">
              <SelectedAgentPanel
                agent={focusedAgent}
                isFirst={activeTeam.agents[0]?.id === focusedAgent.id}
                roundNumber={activeTeam.roundNumber}
              />
            </section>
          </div>
        )}
      </div>

      {taskPopoverOpen && (
        <TaskPopover
          task={activeTeam.currentTask}
          attachedFiles={activeTeam.currentTaskAttachments}
          language={language}
          onClose={onCloseTaskPopover}
        />
      )}
    </>
  )
}
