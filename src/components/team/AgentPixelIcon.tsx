// Pixel art icons inspired by the Ditto mascot style
// Each agent role has its own expression + accessory

export type AgentIconType =
  | 'architect'   // 설계자 - hard hat
  | 'critic'      // 비판자 - magnifying glass
  | 'developer'   // 개발자 - laptop
  | 'tester'      // 테스터 - clipboard
  | 'security'    // 보안   - shield
  | 'optimizer'   // 최적화 - lightning bolt
  | 'designer'    // 디자이너 - paint brush
  | 'documenter'  // 문서화 - pen
  | 'custom'      // 커스텀 - star

type Props = {
  type: AgentIconType
  size?: number
  color?: string
}

// Pixel unit size for the art
const P = 4

// Base Ditto blob body shape (pixel art)
function BlobBody({ color }: { color: string }) {
  // Dark shade for depth
  const dark = shadeColor(color, -25)
  const light = shadeColor(color, 20)

  return (
    <g>
      {/* Shadow */}
      <ellipse cx={32} cy={58} rx={20} ry={4} fill="rgba(0,0,0,0.2)" />

      {/* Body - main blob */}
      {/* Center mass */}
      <rect x={16} y={20} width={32} height={32} fill={color} rx={2} />
      {/* Left bump */}
      <rect x={10} y={24} width={10} height={20} fill={color} rx={2} />
      {/* Right bump */}
      <rect x={44} y={24} width={10} height={20} fill={color} rx={2} />
      {/* Top bump */}
      <rect x={20} y={14} width={24} height={12} fill={color} rx={2} />
      {/* Bottom feet */}
      <rect x={18} y={48} width={10} height={8} fill={color} rx={1} />
      <rect x={36} y={48} width={10} height={8} fill={color} rx={1} />

      {/* Highlight (top-left) */}
      <rect x={20} y={16} width={8} height={4} fill={light} rx={1} opacity={0.5} />
      <rect x={14} y={26} width={4} height={6} fill={light} rx={1} opacity={0.3} />

      {/* Dark shade (bottom-right) */}
      <rect x={44} y={40} width={8} height={8} fill={dark} rx={1} opacity={0.4} />
    </g>
  )
}

// Eyes
function Eyes({ expression = 'normal' }: { expression?: 'normal' | 'happy' | 'focused' | 'worried' }) {
  if (expression === 'happy') {
    // Squinting happy eyes (^ ^)
    return (
      <g>
        <rect x={22} y={29} width={6} height={2} fill="#1a0a00" rx={1} />
        <rect x={36} y={29} width={6} height={2} fill="#1a0a00" rx={1} />
      </g>
    )
  }
  if (expression === 'focused') {
    // One eye squinted
    return (
      <g>
        <rect x={22} y={28} width={5} height={5} fill="#1a0a00" rx={1} />
        <rect x={37} y={28} width={5} height={5} fill="#1a0a00" rx={1} />
        {/* Furrowed brow */}
        <rect x={21} y={25} width={8} height={2} fill="#1a0a00" rx={1} opacity={0.5} transform="rotate(-5 25 26)" />
        <rect x={35} y={25} width={8} height={2} fill="#1a0a00" rx={1} opacity={0.5} transform="rotate(5 39 26)" />
      </g>
    )
  }
  if (expression === 'worried') {
    // Worried eyes
    return (
      <g>
        <rect x={22} y={28} width={5} height={5} fill="#1a0a00" rx={1} />
        <rect x={37} y={28} width={5} height={5} fill="#1a0a00" rx={1} />
        {/* Sweat drop */}
        <rect x={46} y={22} width={3} height={3} fill="#60c8ff" rx={1} />
        <rect x={47} y={25} width={2} height={2} fill="#60c8ff" rx={1} />
      </g>
    )
  }
  // Normal eyes
  return (
    <g>
      <rect x={22} y={28} width={5} height={5} fill="#1a0a00" rx={1} />
      <rect x={37} y={28} width={5} height={5} fill="#1a0a00" rx={1} />
      {/* Eye shine */}
      <rect x={23} y={29} width={2} height={2} fill="white" rx={0} />
      <rect x={38} y={29} width={2} height={2} fill="white" rx={0} />
    </g>
  )
}

// Mouth
function Mouth({ type = 'smile' }: { type?: 'smile' | 'open' | 'flat' | 'frown' }) {
  if (type === 'open') {
    return (
      <g>
        <rect x={27} y={37} width={10} height={5} fill="#1a0a00" rx={1} />
        <rect x={28} y={38} width={8} height={3} fill="#cc4444" rx={1} />
      </g>
    )
  }
  if (type === 'flat') {
    return <rect x={26} y={39} width={12} height={2} fill="#1a0a00" rx={1} />
  }
  if (type === 'frown') {
    return (
      <g>
        <rect x={27} y={40} width={4} height={2} fill="#1a0a00" rx={1} />
        <rect x={33} y={40} width={4} height={2} fill="#1a0a00" rx={1} />
        <rect x={29} y={39} width={6} height={2} fill="#1a0a00" rx={1} />
      </g>
    )
  }
  // Smile (pixel staircase)
  return (
    <g>
      <rect x={26} y={38} width={3} height={2} fill="#1a0a00" rx={0} />
      <rect x={29} y={39} width={6} height={2} fill="#1a0a00" rx={0} />
      <rect x={35} y={38} width={3} height={2} fill="#1a0a00" rx={0} />
    </g>
  )
}

// === Accessories per role ===

function HardHat({ color }: { color: string }) {
  // Architect hard hat
  const hatColor = '#f5c842'
  return (
    <g>
      {/* Brim */}
      <rect x={12} y={14} width={40} height={3} fill={hatColor} rx={1} />
      {/* Hat body */}
      <rect x={17} y={5} width={30} height={12} fill={hatColor} rx={2} />
      {/* Stripe */}
      <rect x={17} y={10} width={30} height={3} fill="#e8a800" rx={0} />
      {/* Logo dot */}
      <rect x={28} y={7} width={8} height={4} fill="#fff" rx={1} opacity={0.7} />
    </g>
  )
}

function MagnifyingGlass() {
  return (
    <g transform="translate(44, 40)">
      {/* Handle */}
      <rect x={8} y={8} width={3} height={10} fill="#8B6914" rx={1} transform="rotate(45 9 13)" />
      {/* Circle */}
      <rect x={0} y={0} width={12} height={12} fill="none" stroke="#888" strokeWidth={3} rx={6} />
      <rect x={2} y={2} width={8} height={8} fill="rgba(180,220,255,0.3)" rx={4} />
      {/* Shine */}
      <rect x={2} y={2} width={3} height={3} fill="white" rx={1} opacity={0.6} />
    </g>
  )
}

function Laptop() {
  return (
    <g transform="translate(38, 42)">
      {/* Screen */}
      <rect x={0} y={0} width={20} height={13} fill="#222" rx={2} />
      <rect x={1} y={1} width={18} height={11} fill="#1a6fcc" rx={1} />
      {/* Code lines on screen */}
      <rect x={3} y={3} width={8} height={1.5} fill="#7dd3fc" rx={0.5} />
      <rect x={3} y={6} width={12} height={1.5} fill="#86efac" rx={0.5} />
      <rect x={3} y={9} width={6} height={1.5} fill="#fca5a5" rx={0.5} />
      {/* Base */}
      <rect x={-2} y={13} width={24} height={3} fill="#333" rx={1} />
    </g>
  )
}

function Clipboard() {
  return (
    <g transform="translate(42, 36)">
      {/* Board */}
      <rect x={0} y={4} width={18} height={22} fill="#f0e6cc" rx={2} />
      <rect x={1} y={5} width={16} height={20} fill="#faf5e8" rx={1} />
      {/* Clip */}
      <rect x={5} y={0} width={8} height={6} fill="#888" rx={2} />
      <rect x={6} y={1} width={6} height={4} fill="#aaa" rx={1} />
      {/* Check marks */}
      <rect x={3} y={9} width={3} height={3} fill="#22c55e" rx={1} />
      <rect x={7} y={10} width={8} height={1.5} fill="#666" rx={0.5} />
      <rect x={3} y={14} width={3} height={3} fill="#22c55e" rx={1} />
      <rect x={7} y={15} width={8} height={1.5} fill="#666" rx={0.5} />
      <rect x={3} y={19} width={3} height={3} fill="#d1d5db" rx={1} />
      <rect x={7} y={20} width={8} height={1.5} fill="#d1d5db" rx={0.5} />
    </g>
  )
}

function Shield() {
  return (
    <g transform="translate(42, 36)">
      {/* Shield */}
      <path d="M9 0 L18 4 L18 14 Q18 22 9 26 Q0 22 0 14 L0 4 Z" fill="#3b82f6" />
      <path d="M9 2 L16 5 L16 14 Q16 20 9 24 Q2 20 2 14 L2 5 Z" fill="#60a5fa" />
      {/* Lock icon */}
      <rect x={6} y={12} width={6} height={5} fill="#1e40af" rx={1} />
      <rect x={7} y={9} width={4} height={5} fill="none" stroke="#1e40af" strokeWidth={1.5} rx={2} />
      <rect x={8} y={14} width={2} height={2} fill="#93c5fd" rx={0.5} />
    </g>
  )
}

function LightningBolt() {
  return (
    <g transform="translate(46, 34)">
      {/* Lightning bolt - pixel art style */}
      <rect x={8} y={0} width={8} height={3} fill="#fbbf24" />
      <rect x={5} y={3} width={8} height={3} fill="#fbbf24" />
      <rect x={2} y={6} width={12} height={3} fill="#fbbf24" />
      <rect x={5} y={9} width={8} height={3} fill="#fbbf24" />
      <rect x={2} y={12} width={8} height={3} fill="#fbbf24" />
      {/* Glow */}
      <rect x={8} y={0} width={8} height={3} fill="#fef08a" opacity={0.5} />
    </g>
  )
}

function PaintBrush() {
  return (
    <g transform="translate(42, 34)">
      {/* Handle */}
      <rect x={10} y={0} width={4} height={14} fill="#8B4513" rx={1} />
      {/* Ferrule (metal band) */}
      <rect x={9} y={12} width={6} height={3} fill="#aaa" rx={0} />
      {/* Bristles */}
      <rect x={8} y={15} width={8} height={10} fill="#ff6b35" rx={3} />
      {/* Paint blob */}
      <rect x={0} y={18} width={8} height={6} fill="#a855f7" rx={2} />
      <rect x={2} y={20} width={4} height={3} fill="#c084fc" rx={1} />
    </g>
  )
}

function Pen() {
  return (
    <g transform="translate(44, 34)">
      {/* Pen body */}
      <rect x={7} y={0} width={5} height={16} fill="#1e40af" rx={2} />
      {/* Clip */}
      <rect x={11} y={1} width={2} height={12} fill="#3b82f6" rx={1} />
      {/* Grip */}
      <rect x={6} y={14} width={7} height={5} fill="#374151" rx={1} />
      {/* Tip */}
      <rect x={8} y={19} width={3} height={4} fill="#9ca3af" rx={0} />
      <rect x={9} y={22} width={1} height={3} fill="#6b7280" />
      {/* Ink drop */}
      <rect x={2} y={18} width={5} height={4} fill="#3b82f6" rx={2} />
    </g>
  )
}

function Star() {
  return (
    <g transform="translate(44, 32)">
      {/* Pixel star */}
      <rect x={6} y={0} width={4} height={4} fill="#f59e0b" />
      <rect x={0} y={6} width={16} height={4} fill="#f59e0b" />
      <rect x={2} y={2} width={4} height={4} fill="#f59e0b" />
      <rect x={10} y={2} width={4} height={4} fill="#f59e0b" />
      <rect x={4} y={10} width={8} height={4} fill="#f59e0b" />
      <rect x={2} y={14} width={4} height={4} fill="#f59e0b" />
      <rect x={10} y={14} width={4} height={4} fill="#f59e0b" />
      {/* Shine */}
      <rect x={7} y={1} width={2} height={2} fill="#fde68a" />
    </g>
  )
}

// Motion lines for "running" effect (optimizer)
function MotionLines({ color }: { color: string }) {
  return (
    <g opacity={0.7}>
      <rect x={2} y={26} width={8} height={2} fill={color} rx={1} />
      <rect x={0} y={31} width={10} height={2} fill={color} rx={1} />
      <rect x={2} y={36} width={6} height={2} fill={color} rx={1} />
    </g>
  )
}

function shadeColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + percent * 2.55))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent * 2.55))
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent * 2.55))
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

const ICON_CONFIGS: Record<AgentIconType, {
  expression: 'normal' | 'happy' | 'focused' | 'worried'
  mouth: 'smile' | 'open' | 'flat' | 'frown'
  Accessory: React.FC<{ color: string }>
  motionLines?: boolean
}> = {
  architect: {
    expression: 'focused',
    mouth: 'flat',
    Accessory: ({ color }) => <HardHat color={color} />,
  },
  critic: {
    expression: 'focused',
    mouth: 'flat',
    Accessory: () => <MagnifyingGlass />,
  },
  developer: {
    expression: 'happy',
    mouth: 'smile',
    Accessory: () => <Laptop />,
  },
  tester: {
    expression: 'normal',
    mouth: 'flat',
    Accessory: () => <Clipboard />,
  },
  security: {
    expression: 'focused',
    mouth: 'flat',
    Accessory: () => <Shield />,
  },
  optimizer: {
    expression: 'happy',
    mouth: 'open',
    Accessory: () => <LightningBolt />,
    motionLines: true,
  },
  designer: {
    expression: 'happy',
    mouth: 'smile',
    Accessory: () => <PaintBrush />,
  },
  documenter: {
    expression: 'normal',
    mouth: 'smile',
    Accessory: () => <Pen />,
  },
  custom: {
    expression: 'normal',
    mouth: 'smile',
    Accessory: () => <Star />,
  },
}

export function AgentPixelIcon({ type, size = 64, color = '#D4845A' }: Props) {
  const config = ICON_CONFIGS[type] ?? ICON_CONFIGS.custom

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ imageRendering: 'pixelated' }}
    >
      {config.motionLines && <MotionLines color={color} />}
      <BlobBody color={color} />
      <Eyes expression={config.expression} />
      <Mouth type={config.mouth} />
      <config.Accessory color={color} />
    </svg>
  )
}

export type { AgentIconType }
