import dittoArchitectIcon from '../../assets/agent-icons/ditto-architect.png'
import dittoCriticIcon from '../../assets/agent-icons/ditto-critic.png'
import dittoDeveloperIcon from '../../assets/agent-icons/ditto-developer.png'
import dittoDesignerIcon from '../../assets/agent-icons/ditto-designer.png'
import dittoDocumenterIcon from '../../assets/agent-icons/ditto-documenter.png'
import dittoOptimizerIcon from '../../assets/agent-icons/ditto-optimizer.png'
import dittoSecurityIcon from '../../assets/agent-icons/ditto-security.png'
import dittoTesterIcon from '../../assets/agent-icons/ditto-tester.png'
import customBlueIcon from '../../assets/agent-icons/custom-blue.png'
import customCoralIcon from '../../assets/agent-icons/custom-coral.png'
import customGreenIcon from '../../assets/agent-icons/custom-green.png'
import customOrangeIcon from '../../assets/agent-icons/custom-orange.png'
import customPinkIcon from '../../assets/agent-icons/custom-pink.png'
import customPurpleIcon from '../../assets/agent-icons/custom-purple.png'
import customRedIcon from '../../assets/agent-icons/custom-red.png'
import customTealIcon from '../../assets/agent-icons/custom-teal.png'
import customYellowIcon from '../../assets/agent-icons/custom-yellow.png'

export type AgentIconType =
  | 'architect'
  | 'critic'
  | 'developer'
  | 'tester'
  | 'security'
  | 'optimizer'
  | 'designer'
  | 'documenter'
  | 'custom'

type Props = {
  type: AgentIconType
  size?: number
  color?: string
}

type CustomIconEntry = {
  hex: string
  src: string
  offsetSourceX?: number
}

const BUILTIN_ICON_BY_TYPE: Record<Exclude<AgentIconType, 'custom'>, string> = {
  architect: dittoArchitectIcon,
  critic: dittoCriticIcon,
  developer: dittoDeveloperIcon,
  tester: dittoTesterIcon,
  security: dittoSecurityIcon,
  optimizer: dittoOptimizerIcon,
  designer: dittoDesignerIcon,
  documenter: dittoDocumenterIcon,
}

const CUSTOM_ICON_SOURCE_WIDTH = 280

const CUSTOM_ICON_BY_COLOR: CustomIconEntry[] = [
  { hex: '#3B82F6', src: customBlueIcon, offsetSourceX: 18 },
  { hex: '#EF4444', src: customRedIcon, offsetSourceX: -10 },
  { hex: '#10B981', src: customGreenIcon, offsetSourceX: 15 },
  { hex: '#F59E0B', src: customYellowIcon, offsetSourceX: 16 },
  { hex: '#8B5CF6', src: customPurpleIcon, offsetSourceX: 0 },
  { hex: '#F97316', src: customOrangeIcon, offsetSourceX: 10 },
  { hex: '#EC4899', src: customPinkIcon, offsetSourceX: -11 },
  { hex: '#14B8A6', src: customTealIcon, offsetSourceX: 0 },
] as const

function normalizeHex(color?: string) {
  if (!color) return null
  const trimmed = color.trim().toUpperCase()
  if (!trimmed.startsWith('#')) return null
  if (trimmed.length === 7) return trimmed
  if (trimmed.length !== 4) return null

  const [, r, g, b] = trimmed
  return `#${r}${r}${g}${g}${b}${b}`
}

function hexToRgb(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function getCustomIcon(color?: string) {
  const normalized = normalizeHex(color)
  if (!normalized) return { src: customCoralIcon, offsetSourceX: -9 }

  const exactMatch = CUSTOM_ICON_BY_COLOR.find((entry) => entry.hex === normalized)
  if (exactMatch) return exactMatch

  const target = hexToRgb(normalized)

  let closest = CUSTOM_ICON_BY_COLOR[0]
  let closestDistance = Number.POSITIVE_INFINITY

  for (const entry of CUSTOM_ICON_BY_COLOR) {
    const sample = hexToRgb(entry.hex)
    const distance =
      (target.r - sample.r) ** 2 +
      (target.g - sample.g) ** 2 +
      (target.b - sample.b) ** 2

    if (distance < closestDistance) {
      closest = entry
      closestDistance = distance
    }
  }

  return closest
}

export function AgentPixelIcon({ type, size = 64, color }: Props) {
  const customIcon = type === 'custom' ? getCustomIcon(color) : null
  const src = customIcon?.src ?? BUILTIN_ICON_BY_TYPE[type] ?? customCoralIcon
  const customOffsetX = customIcon
    ? (size * (customIcon.offsetSourceX ?? 0)) / CUSTOM_ICON_SOURCE_WIDTH
    : 0

  return (
    <span
      className="relative block overflow-hidden select-none"
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        width={size}
        height={size}
        className="absolute inset-0 block h-full w-full object-contain"
        style={{
          imageRendering: 'pixelated',
          transform: customOffsetX === 0 ? undefined : `translateX(${customOffsetX}px)`,
        }}
      />
    </span>
  )
}
