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

const WELCOME_PROMPT_CHIPS: WelcomePromptChip[] = [
  {
    id: 'explain-code',
    title: '구조 이해',
    label: '이 저장소의 구조와 핵심 흐름을 먼저 이해하기 쉽게 설명해줘',
    prompt: '이 코드의 구조와 핵심 흐름을 초보자도 이해할 수 있게 설명해줘. 중요한 파일과 함수, 데이터 흐름, 수정 시 주의할 점까지 정리해줘.',
  },
  {
    id: 'fix-bug',
    title: '버그 수정',
    label: '문제 원인을 먼저 좁히고 영향 범위를 본 뒤 최소 수정으로 바로 고쳐줘',
    prompt: '문제 원인을 먼저 좁혀서 설명하고, 재현 경로와 영향 범위를 정리한 뒤 최소 수정으로 고쳐줘. 필요하면 테스트 포인트도 함께 제안해줘.',
  },
  {
    id: 'add-tests',
    title: '테스트 추가',
    label: '현재 동작을 기준으로 회귀를 막을 수 있게 테스트까지 같이 추가해줘',
    prompt: '현재 동작을 기준으로 회귀를 막는 테스트를 추가해줘. 우선순위 높은 시나리오, 경계 케이스, 실패해야 하는 케이스를 포함해줘.',
  },
  {
    id: 'commit-message',
    title: '커밋 정리',
    label: '변경사항을 보고 어울리는 커밋 메시지 후보와 추천안을 정리해줘',
    prompt: '이 변경사항을 바탕으로 Conventional Commit 후보 3개와 가장 적절한 추천안 1개, 상세 본문 1개를 작성해줘.',
  },
  {
    id: 'release-notes',
    title: '릴리즈 노트',
    label: '사용자에게 보이는 변화 중심으로 릴리즈 노트 형식으로 정리해줘',
    prompt: '이번 변경사항을 릴리즈 노트 형식으로 정리해줘. 사용자에게 보이는 변화, 개발자 관점 변경점, 주의사항을 분리해서 써줘.',
  },
].sort((a, b) => {
  const labelLengthDiff = b.label.length - a.label.length
  if (labelLengthDiff !== 0) return labelLengthDiff
  return b.prompt.length - a.prompt.length
})

export function WelcomeScreen({ onStartPrompt }: { onStartPrompt: (prompt: string) => void }) {
  const { language } = useI18n()
  const [activeCard, setActiveCard] = useState({ index: 0, key: 0 })
  const [exitingCard, setExitingCard] = useState<{ index: number; key: number } | null>(null)
  const activeChip = WELCOME_PROMPT_CHIPS[activeCard.index]
  const exitingChip = exitingCard ? WELCOME_PROMPT_CHIPS[exitingCard.index] : null
  const localizeChip = (chip: WelcomePromptChip | null) => {
    if (!chip || language !== 'en') return chip
    if (chip.id === 'explain-code') {
      return {
        ...chip,
        title: 'Understand structure',
        label: 'Explain this repository structure and the main flow before editing',
        prompt: 'Explain this codebase structure and main flow so that even a beginner can understand it. Include important files, functions, data flow, and what to watch out for when modifying it.',
      }
    }
    if (chip.id === 'fix-bug') {
      return {
        ...chip,
        title: 'Fix a bug',
        label: 'Narrow down the root cause, check impact, then fix it with the smallest change',
        prompt: 'First narrow down and explain the root cause, summarize the reproduction path and impact, then fix it with the smallest change possible. Include test points if needed.',
      }
    }
    if (chip.id === 'add-tests') {
      return {
        ...chip,
        title: 'Add tests',
        label: 'Add tests too so the current behavior is protected from regressions',
        prompt: 'Add tests that protect the current behavior from regressions. Include high-priority scenarios, edge cases, and cases that should fail.',
      }
    }
    if (chip.id === 'commit-message') {
      return {
        ...chip,
        title: 'Commit message',
        label: 'Review the changes and suggest commit messages with one recommendation',
        prompt: 'Based on these changes, write three Conventional Commit candidates, one recommended option, and one detailed body.',
      }
    }
    return {
      ...chip,
      title: 'Release notes',
      label: 'Summarize the changes as release notes focused on user-visible impact',
      prompt: 'Summarize these changes in release note format. Separate user-visible changes, developer-facing changes, and cautions.',
    }
  }
  const displayActiveChip = localizeChip(activeChip)!
  const displayExitingChip = localizeChip(exitingChip)
  const showActiveCard = !exitingCard || exitingCard.key !== activeCard.key

  useEffect(() => {
    const exitTimer = window.setTimeout(() => {
      setExitingCard(activeCard)
    }, WELCOME_CARD_STAY_MS)

    const nextTimer = window.setTimeout(() => {
      setActiveCard((current) => ({
        index: (current.index + 1) % WELCOME_PROMPT_CHIPS.length,
        key: current.key + 1,
      }))
    }, WELCOME_CARD_STAY_MS + WELCOME_CARD_OVERLAP_MS)

    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(nextTimer)
    }
  }, [activeCard])

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
    <div className="flex min-h-full w-full flex-col items-center justify-center px-8 pb-10 pt-10 text-center">
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
      <h2 className="mb-2 text-3xl font-semibold tracking-tight text-claude-text">Citto Code</h2>
      <p className="mb-10 max-w-sm text-[15px] leading-7 text-claude-muted">
        {language === 'en' ? 'A code assistant built on top of Claude Code CLI.' : 'Claude Code CLI 기반 코드 어시스턴트입니다.'}
      </p>

      <div className="pointer-events-none mb-10 select-none">
        <div className="relative h-12 w-20 sm:h-14 sm:w-24">
          <img
            src={welcomeTypingGif}
            alt={language === 'en' ? 'Character working on a laptop' : '노트북으로 작업 중인 캐릭터'}
            className="relative h-full w-full object-contain"
            draggable={false}
            style={{
              imageRendering: 'pixelated',
            }}
          />
        </div>
      </div>
      <div className="mt-2 flex w-full max-w-2xl flex-col items-center">
        <div className="relative mt-2 h-56 w-full max-w-[460px] overflow-hidden">
          <div className="pointer-events-none absolute bottom-8 left-1/2 h-[138px] w-[min(82vw,420px)] -translate-x-1/2">
            <div className="absolute inset-0 rounded-[10px] border border-claude-border/65 bg-claude-surface/50 opacity-45 [transform:translateY(10px)_rotate(-2.6deg)]" />
            <div className="absolute inset-0 rounded-[10px] border border-claude-border/75 bg-claude-surface/65 opacity-70 [transform:translateY(5px)_rotate(1.6deg)]" />
          </div>
          <div className="absolute bottom-10 left-1/2 z-10 h-[172px] w-[min(82vw,420px)] -translate-x-1/2">
            {showActiveCard && (
              <button
                key={`active-${activeCard.key}`}
                type="button"
                onClick={() => onStartPrompt(displayActiveChip.prompt)}
                className="absolute bottom-0 left-0 z-10 w-full overflow-hidden rounded-[10px] border border-claude-border bg-claude-surface/95 px-6 py-5 text-left backdrop-blur-sm transition-colors hover:bg-claude-surface-2"
                style={{ animation: `welcome-card-enter ${WELCOME_CARD_ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards` }}
              >
                <div className="text-[11px] font-medium tracking-[0.14em] text-claude-muted">{displayActiveChip.title}</div>
                <div className="mt-2 text-[15px] font-medium leading-6 text-claude-text">
                  {displayActiveChip.label}
                </div>
                <div className="mt-4 text-xs text-claude-muted">{language === 'en' ? 'Click to start immediately' : '클릭해서 바로 시작'}</div>
              </button>
            )}
            {displayExitingChip && exitingCard && (
              <div
                key={`exit-${exitingCard.key}`}
                className="pointer-events-none absolute bottom-0 left-0 z-20 w-full rounded-[10px] border border-claude-border bg-claude-surface/95 px-6 py-5 text-left backdrop-blur-sm"
                style={{ animation: `welcome-card-exit ${WELCOME_CARD_EXIT_MS}ms cubic-bezier(0.4, 0, 0.6, 1) forwards` }}
              >
                <div className="text-[11px] font-medium tracking-[0.14em] text-claude-muted">{displayExitingChip.title}</div>
                <div className="mt-2 text-[15px] font-medium leading-6 text-claude-text">
                  {displayExitingChip.label}
                </div>
                <div className="mt-4 text-xs text-claude-muted">{language === 'en' ? 'Click to start immediately' : '클릭해서 바로 시작'}</div>
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-claude-bg via-claude-bg/75 to-transparent" />
        </div>
      </div>
    </div>
  )
}
