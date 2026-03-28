import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { translate } from '../../lib/i18n'
import type { TeamAgent } from '../../store/teamTypes'
import { AgentPixelIcon } from './AgentPixelIcon'

function AgentSpeechBubble({ text }: { text: string }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    setIsOverflowing(content.offsetHeight > viewport.clientHeight + 1)
  }, [text])

  return (
    <div className="pointer-events-none absolute left-1/2 top-[-40px] z-30 w-[152px] -translate-x-1/2">
      <div className="rounded-[8px] border border-[#d7c7b7] bg-[linear-gradient(180deg,#fffaf4_0%,#f9f0e6_100%)] px-3 py-2 text-left text-[11px] leading-[1.35] text-[#4b3c30] shadow-[0_3px_0_#d8ccb9,0_10px_18px_rgba(69,53,40,0.18)]">
        <div ref={viewportRef} className="relative flex max-h-[74px] items-end overflow-hidden">
          {isOverflowing && (
            <div className="absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-[#fffaf4] to-transparent opacity-95" />
          )}
          <span ref={contentRef} className="block w-full whitespace-pre-wrap break-words">
            {text}
          </span>
        </div>
      </div>
      <span className="absolute left-1/2 top-[100%] h-3 w-3 -translate-x-1/2 -translate-y-[5px] rotate-45 border-b border-r border-[#d7c7b7] bg-[#f9f0e6]" />
    </div>
  )
}

function getAgentSpeechPreview(agent: TeamAgent, language: ReturnType<typeof useI18n>['language']) {
  if (!agent.isStreaming) return null
  return translate(language, 'team.agent.speakingPreview', { name: agent.name })
}

export function getOfficeCarpetInsets(agentCount: number) {
  const columns = agentCount <= 3 ? agentCount : agentCount <= 4 ? 2 : agentCount <= 6 ? 3 : 4

  switch (columns) {
    case 1:
      return { outer: '34%', inner: '37%' }
    case 2:
      return { outer: '25%', inner: '28%' }
    case 3:
      return { outer: '15.5%', inner: '18.5%' }
    default:
      return { outer: '10.5%', inner: '13.5%' }
  }
}

type Props = {
  agent: TeamAgent
  index: number
  total: number
  isFocused: boolean
  isActive: boolean
  onSelect: () => void
}

export function AgentSeat({
  agent,
  index,
  total,
  isFocused,
  isActive,
  onSelect,
}: Props) {
  const columns = total <= 3 ? total : total <= 4 ? 2 : total <= 6 ? 3 : 4
  const rows = Math.ceil(total / Math.max(columns, 1))
  const column = index % Math.max(columns, 1)
  const row = Math.floor(index / Math.max(columns, 1))
  const xStart = columns === 1 ? 50 : columns === 2 ? 36 : columns === 3 ? 24 : 20
  const xEnd = 100 - xStart
  const yStart = rows === 1 ? 56 : rows === 2 ? 41 : 36
  const yEnd = rows === 1 ? 56 : rows === 2 ? 73 : 78
  const xBase =
    columns === 1
      ? 50
      : xStart + ((xEnd - xStart) * column) / Math.max(columns - 1, 1)
  const x = Math.min(82, Math.max(18, xBase))
  const y =
    rows === 1 ? 54 : yStart + ((yEnd - yStart) * row) / Math.max(rows - 1, 1)
  const nameTone = agent.error
    ? 'border-red-500 bg-red-50 text-red-900'
    : isFocused
      ? 'border-[#3958a8] bg-[#eef3ff] text-[#1b2950]'
      : 'border-[#8a7868] bg-[#f3e9dc] text-[#43342a]'
  const { language } = useI18n()
  const speechPreview = getAgentSpeechPreview(agent, language)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="absolute flex w-[116px] -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center transition-all duration-200 hover:scale-[1.03]"
      style={{
        left: `${x}%`,
        top: `${y}%`,
      }}
    >
      <div className="relative h-[108px] w-[104px]">
        {speechPreview && <AgentSpeechBubble text={speechPreview} />}

        <span
          className={`absolute left-1/2 top-[84px] z-20 max-w-[84px] -translate-x-1/2 truncate rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${nameTone}`}
          style={{
            boxShadow: isFocused ? '0 2px 0 rgba(57,88,168,0.2)' : '0 2px 0 rgba(76,60,49,0.12)',
          }}
        >
          {agent.name}
        </span>

        <span className="absolute left-1/2 top-[81px] h-[8px] w-[48px] -translate-x-1/2 bg-black/8 blur-sm" />
        <span className="absolute left-1/2 top-[88px] h-[16px] w-[12px] -translate-x-1/2 bg-[#524236]" />
        <span className="absolute left-1/2 top-[98px] h-[8px] w-[30px] -translate-x-1/2 border border-[#6b5e53] bg-[#b5a89a]" />

        <div
          className="absolute left-1/2 top-[14px] h-[24px] w-[38px] -translate-x-1/2 border-2 border-[#34414f] bg-[linear-gradient(180deg,#6d7f99_0%,#4a596c_100%)]"
          style={{
            boxShadow: isActive
              ? `0 0 0 2px ${agent.color}55, 0 0 12px ${agent.color}30, 0 3px 0 #283240`
              : '0 3px 0 #283240',
          }}
        >
          <span
            className="absolute inset-[3px] border border-black/30"
            style={{ backgroundColor: isActive ? `${agent.color}99` : '#dbe9f9' }}
          />
          <span className="absolute bottom-[-8px] left-1/2 h-[8px] w-[6px] -translate-x-1/2 bg-[#566172]" />
        </div>

        <div
          className="absolute left-1/2 top-[40px] flex h-[30px] w-[86px] -translate-x-1/2 items-start justify-center border-2 border-[#56402f] bg-[linear-gradient(180deg,#89664b_0%,#6b4d39_100%)]"
          style={{
            boxShadow: isFocused
              ? `0 0 0 2px ${agent.color}40, 0 4px 0 #5b412f`
              : '0 4px 0 #5b412f',
          }}
        >
          <span className="absolute inset-x-[8px] top-[4px] h-[6px] bg-white/10" />
          <span className="absolute inset-x-[18px] top-[14px] h-[5px] border border-[#6c5140] bg-[#9a7760]" />
          <div className="relative z-10 mt-[2px]">
            <AgentPixelIcon type={agent.iconType} size={40} color={agent.color} />
          </div>
          {agent.isStreaming && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3 w-3">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                style={{ backgroundColor: agent.color }}
              />
              <span
                className="relative inline-flex h-3 w-3 rounded-full border border-black/30"
                style={{ backgroundColor: agent.color }}
              />
            </span>
          )}
        </div>

        <div className="absolute left-1/2 top-[74px] h-[18px] w-[38px] -translate-x-1/2 border-2 border-[#774a29] bg-[linear-gradient(180deg,#cc8753_0%,#a35e35_100%)]">
          <span className="absolute inset-x-[6px] top-[4px] h-[4px] bg-white/8" />
        </div>

        {agent.error && (
          <span className="absolute right-[2px] top-[30px] border border-red-900 bg-red-500 px-1 py-0.5 text-[9px] font-bold text-white shadow-lg">
            !
          </span>
        )}
        {isFocused && (
          <span className="absolute inset-[10px] -z-10 bg-white/8 blur-xl" />
        )}
      </div>
    </button>
  )
}
