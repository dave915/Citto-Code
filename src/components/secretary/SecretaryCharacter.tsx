import dittoCriticIcon from '../../assets/agent-icons/ditto-critic.png'
import dittoDefaultIcon from '../../assets/agent-icons/ditto-default.png'
import dittoDeveloperIcon from '../../assets/agent-icons/ditto-developer.png'
import customGreenIcon from '../../assets/agent-icons/custom-green.png'
import type { SecretaryBotState } from '../../../electron/preload'

type Props = {
  state: SecretaryBotState
  size?: number
}

const CHARACTER_BY_STATE: Record<SecretaryBotState, string> = {
  idle: dittoDefaultIcon,
  working: dittoDeveloperIcon,
  done: customGreenIcon,
  error: dittoCriticIcon,
}

const LABEL_BY_STATE: Record<SecretaryBotState, string> = {
  idle: '기본 씨토 대기 중',
  working: '기본 씨토 작업 중',
  done: '기본 씨토 완료',
  error: '기본 씨토 오류',
}

export function SecretaryCharacter({ state, size = 54 }: Props) {
  return (
    <span
      className={`secretary-character secretary-character-${state}`}
      style={{ width: size, height: size }}
    >
      <img
        src={CHARACTER_BY_STATE[state]}
        alt={LABEL_BY_STATE[state]}
        draggable={false}
        className="h-full w-full object-contain"
        style={{ imageRendering: 'pixelated' }}
      />
    </span>
  )
}
