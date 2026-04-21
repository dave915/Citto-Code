import { useEffect, useState } from 'react'
import welcomeTypingGif from '../../assets/mascot/welcome-typing-transparent.gif'
import { useI18n } from '../../hooks/useI18n'

type WelcomePromptChip = {
  id: string
  title: string
  label: string
  prompt: string
}

const WELCOME_CARD_STAY_MS = 4200
const WELCOME_CARD_ENTER_MS = 760
const WELCOME_CARD_EXIT_MS = 1180
const WELCOME_CARD_OVERLAP_MS = 1060

export function WelcomeScreen({ onStartPrompt }: { onStartPrompt: (prompt: string) => void }) {
  const { t } = useI18n()
  const welcomePromptChips: WelcomePromptChip[] = [
    {
      id: 'explain-code',
      title: t('welcome.prompt.explainCode.title'),
      label: t('welcome.prompt.explainCode.label'),
      prompt: t('welcome.prompt.explainCode.prompt'),
    },
    {
      id: 'fix-bug',
      title: t('welcome.prompt.fixBug.title'),
      label: t('welcome.prompt.fixBug.label'),
      prompt: t('welcome.prompt.fixBug.prompt'),
    },
    {
      id: 'add-tests',
      title: t('welcome.prompt.addTests.title'),
      label: t('welcome.prompt.addTests.label'),
      prompt: t('welcome.prompt.addTests.prompt'),
    },
    {
      id: 'commit-message',
      title: t('welcome.prompt.commitMessage.title'),
      label: t('welcome.prompt.commitMessage.label'),
      prompt: t('welcome.prompt.commitMessage.prompt'),
    },
    {
      id: 'release-notes',
      title: t('welcome.prompt.releaseNotes.title'),
      label: t('welcome.prompt.releaseNotes.label'),
      prompt: t('welcome.prompt.releaseNotes.prompt'),
    },
  ].sort((a, b) => {
    const labelLengthDiff = b.label.length - a.label.length
    if (labelLengthDiff !== 0) return labelLengthDiff
    return b.prompt.length - a.prompt.length
  })
  const [activeCard, setActiveCard] = useState({ index: 0, key: 0 })
  const [exitingCard, setExitingCard] = useState<{ index: number; key: number } | null>(null)
  const activeChip = welcomePromptChips[activeCard.index]
  const exitingChip = exitingCard ? welcomePromptChips[exitingCard.index] : null
  const displayActiveChip = activeChip
  const displayExitingChip = exitingChip
  const showActiveCard = !exitingCard || exitingCard.key !== activeCard.key

  useEffect(() => {
    const exitTimer = window.setTimeout(() => {
      setExitingCard(activeCard)
    }, WELCOME_CARD_STAY_MS)

    const nextTimer = window.setTimeout(() => {
      setActiveCard((current) => ({
        index: (current.index + 1) % welcomePromptChips.length,
        key: current.key + 1,
      }))
    }, WELCOME_CARD_STAY_MS + WELCOME_CARD_OVERLAP_MS)

    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(nextTimer)
    }
  }, [activeCard, welcomePromptChips.length])

  useEffect(() => {
    if (!exitingCard) return

    const cleanupTimer = window.setTimeout(() => {
      setExitingCard((current) => (current?.key === exitingCard.key ? null : current))
    }, WELCOME_CARD_EXIT_MS)

    return () => {
      window.clearTimeout(cleanupTimer)
    }
  }, [exitingCard])

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center px-6 pb-8 pt-8 text-center">
      <style>
        {`
          @keyframes welcome-card-enter {
            0% {
              opacity: 0;
              transform: translateY(50px) scale(0.95);
            }
            68% {
              opacity: 1;
              transform: translateY(-6px) scale(1.01);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @keyframes welcome-card-exit {
            0% {
              opacity: 1;
              transform: translateY(0) translateX(0) rotate(0deg) scale(1);
            }
            58% {
              opacity: 1;
              transform: translateY(-24px) translateX(8px) rotate(1.5deg) scale(1);
            }
            82% {
              opacity: 0.92;
              transform: translateY(-70px) translateX(18px) rotate(3.9deg) scale(0.955);
            }
            100% {
              opacity: 0;
              transform: translateY(-118px) translateX(30px) rotate(6.6deg) scale(0.89);
            }
          }

        `}
      </style>
      <h2 className="mb-1.5 text-[22px] font-semibold tracking-tight text-claude-text">Citto Code</h2>
      <p className="mb-6 max-w-md text-[13px] leading-6 text-claude-muted">
        {t('welcome.subtitle')}
      </p>

      <div className="pointer-events-none mb-6 select-none">
        <div className="relative h-12 w-20 sm:h-14 sm:w-24">
          <img
            src={welcomeTypingGif}
            alt={t('welcome.characterAlt')}
            className="relative h-full w-full object-contain"
            draggable={false}
            style={{
              imageRendering: 'pixelated',
            }}
          />
        </div>
      </div>
      <div className="mt-2 flex w-full max-w-2xl flex-col items-center">
        <div className="relative mt-2 h-44 w-full max-w-[420px] overflow-hidden">
          <div className="pointer-events-none absolute bottom-8 left-1/2 h-[132px] w-[min(82vw,420px)] -translate-x-1/2">
            <div className="absolute inset-0 rounded-md border border-claude-border/45 bg-transparent opacity-45 [transform:translateY(8px)_rotate(-2.2deg)]" />
            <div className="absolute inset-0 rounded-md border border-claude-border/55 bg-transparent opacity-75 [transform:translateY(4px)_rotate(1.2deg)]" />
          </div>
          <div className="absolute bottom-8 left-1/2 z-10 h-[138px] w-[min(82vw,400px)] -translate-x-1/2">
            {showActiveCard && (
              <button
                key={`active-${activeCard.key}`}
                type="button"
                onClick={() => onStartPrompt(displayActiveChip.prompt)}
                className="absolute bottom-0 left-0 z-10 w-full overflow-hidden rounded-md border border-claude-border bg-claude-panel/95 px-4 py-3 text-left transition-colors hover:bg-claude-surface"
                style={{ animation: `welcome-card-enter ${WELCOME_CARD_ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards` }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-claude-orange">{displayActiveChip.title}</div>
                <div className="mt-1.5 text-[13px] font-medium leading-5 text-claude-text">
                  {displayActiveChip.label}
                </div>
                <div className="mt-3 text-[11px] text-claude-muted">{t('welcome.clickStart')}</div>
              </button>
            )}
            {displayExitingChip && exitingCard && (
              <div
                key={`exit-${exitingCard.key}`}
                className="pointer-events-none absolute bottom-0 left-0 z-20 w-full rounded-md border border-claude-border bg-claude-panel/95 px-4 py-3 text-left"
                style={{ animation: `welcome-card-exit ${WELCOME_CARD_EXIT_MS}ms cubic-bezier(0.4, 0, 0.6, 1) forwards` }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-claude-orange">{displayExitingChip.title}</div>
                <div className="mt-1.5 text-[13px] font-medium leading-5 text-claude-text">
                  {displayExitingChip.label}
                </div>
                <div className="mt-3 text-[11px] text-claude-muted">{t('welcome.clickStart')}</div>
              </div>
            )}
          </div>
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 h-20 w-[min(86vw,440px)] -translate-x-1/2"
            style={{
              background: 'radial-gradient(ellipse at center bottom, rgb(var(--claude-bg) / 0.82) 0%, rgb(var(--claude-bg) / 0.44) 44%, rgb(var(--claude-bg) / 0) 78%)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
