import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from 'react'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

type AppButtonTone = 'accent' | 'secondary' | 'ghost' | 'danger' | 'success'
type AppButtonSize = 'sm' | 'icon'

const buttonToneClasses: Record<AppButtonTone, string> = {
  accent:
    'border-claude-orange/35 bg-claude-orange/12 text-claude-orange hover:border-claude-orange/50 hover:bg-claude-orange/18',
  secondary:
    'border-claude-border bg-claude-panel text-claude-text hover:bg-claude-surface',
  ghost:
    'border-transparent bg-transparent text-claude-muted hover:border-claude-border/70 hover:bg-claude-surface hover:text-claude-text',
  danger:
    'border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/16',
  success:
    'border-emerald-500/28 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/16',
}

const buttonSizeClasses: Record<AppButtonSize, string> = {
  sm: 'h-8 px-3',
  icon: 'h-8 w-8',
}

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: AppButtonSize
  tone?: AppButtonTone
}

export function AppButton({
  children,
  className,
  size = 'sm',
  tone = 'secondary',
  type = 'button',
  ...props
}: AppButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/35 disabled:cursor-not-allowed disabled:border-claude-border disabled:bg-claude-surface disabled:text-claude-muted disabled:opacity-40',
        buttonSizeClasses[size],
        buttonToneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

type AppSwitchProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  checked: boolean
}

export function AppSwitch({
  checked,
  className,
  type = 'button',
  ...props
}: AppSwitchProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-claude-orange/35',
        checked
          ? 'border-claude-orange/30 bg-claude-orange/16'
          : 'border-claude-border bg-claude-bg',
        className,
      )}
      {...props}
    >
      <span
        className={cx(
          'inline-block h-[18px] w-[18px] rounded-full bg-claude-text transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-1',
        )}
      />
    </button>
  )
}

type AppChipTone = 'neutral' | 'accent' | 'success' | 'danger'

const chipToneClasses: Record<AppChipTone, string> = {
  neutral: 'border-claude-border bg-claude-surface/75 text-claude-text',
  accent: 'border-claude-orange/28 bg-claude-orange/10 text-claude-orange',
  success: 'border-emerald-500/24 bg-emerald-500/10 text-emerald-200',
  danger: 'border-red-500/24 bg-red-500/10 text-red-200',
}

type AppChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: AppChipTone
}

export function AppChip({
  children,
  className,
  tone = 'neutral',
  ...props
}: AppChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none',
        chipToneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

type AppPanelProps = HTMLAttributes<HTMLDivElement>

export const AppPanel = forwardRef<HTMLDivElement, AppPanelProps>(function AppPanel(
  { children, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        'rounded-lg border border-claude-border bg-claude-panel/90 shadow-[0_16px_36px_rgba(0,0,0,0.18)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})

type AppEyebrowProps = HTMLAttributes<HTMLParagraphElement>

export function AppEyebrow({ children, className, ...props }: AppEyebrowProps) {
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

export const appFieldClassName =
  'w-full rounded-lg border border-claude-border bg-claude-bg px-3 py-2 text-sm text-claude-text outline-none transition-colors placeholder:text-claude-muted focus:border-claude-orange/40 focus:ring-1 focus:ring-claude-orange/15'
