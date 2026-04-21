import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

type TeamButtonTone = 'accent' | 'secondary' | 'ghost' | 'danger' | 'success'
type TeamButtonSize = 'sm' | 'icon'

const teamButtonToneClasses: Record<TeamButtonTone, string> = {
  accent:
    'border-claude-orange/35 bg-claude-orange/12 text-claude-orange hover:border-claude-orange/50 hover:bg-claude-orange/18',
  secondary:
    'border-claude-border bg-claude-panel text-claude-text hover:bg-claude-surface',
  ghost:
    'border-transparent bg-transparent text-claude-muted hover:border-claude-border/70 hover:bg-claude-surface hover:text-claude-text',
  danger:
    'border-red-500/30 bg-red-500/8 text-red-300 hover:bg-red-500/14',
  success:
    'border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/16',
}

const teamButtonSizeClasses: Record<TeamButtonSize, string> = {
  sm: 'h-[30px] px-2.5',
  icon: 'h-[30px] w-[30px]',
}

type TeamButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: TeamButtonSize
  tone?: TeamButtonTone
}

export function TeamButton({
  children,
  className,
  size = 'sm',
  tone = 'secondary',
  type = 'button',
  ...props
}: TeamButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/40 disabled:cursor-not-allowed disabled:border-claude-border disabled:bg-claude-surface disabled:text-claude-muted disabled:opacity-40',
        teamButtonSizeClasses[size],
        teamButtonToneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

type TeamChipTone = 'neutral' | 'accent' | 'success' | 'danger'

const teamChipToneClasses: Record<TeamChipTone, string> = {
  neutral: 'border-claude-border bg-claude-surface/70 text-claude-text',
  accent: 'border-claude-orange/28 bg-claude-orange/10 text-claude-orange',
  success: 'border-green-500/25 bg-green-500/10 text-green-300',
  danger: 'border-red-500/25 bg-red-500/10 text-red-300',
}

type TeamChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: TeamChipTone
}

export function TeamChip({
  children,
  className,
  tone = 'neutral',
  ...props
}: TeamChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none',
        teamChipToneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

type TeamPanelProps = HTMLAttributes<HTMLDivElement>

export function TeamPanel({ children, className, ...props }: TeamPanelProps) {
  return (
    <div
      className={cx(
        'rounded-md border border-claude-border bg-claude-panel/90 shadow-none',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

type TeamEyebrowProps = HTMLAttributes<HTMLParagraphElement>

export function TeamEyebrow({ children, className, ...props }: TeamEyebrowProps) {
  return (
    <p
      className={cx(
        'text-[11px] font-semibold uppercase tracking-[0.14em] text-claude-muted',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  )
}

export const teamFieldClassName =
  'w-full rounded-md border border-claude-border bg-claude-bg px-3 py-2 text-[13px] text-claude-text outline-none transition-colors placeholder:text-claude-muted focus:border-claude-orange/40 focus:ring-1 focus:ring-claude-orange/15'
