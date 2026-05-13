import type { SecretaryAction } from './actions'
import type { SecretaryAutomationProfile } from './automation-profile-types'

type RunAppAutomationAction = Extract<SecretaryAction, { type: 'runAppAutomation' }>

type BuildRunAppAutomationPromptOptions = {
  action: RunAppAutomationAction
  profile: SecretaryAutomationProfile
  coordinateFallbackAllowed: boolean
}

function redactLongText(text: string, maxLength = 1200): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}

export function buildRunAppAutomationPrompt({
  action,
  profile,
  coordinateFallbackAllowed,
}: BuildRunAppAutomationPromptOptions): string {
  const intentProfile = profile.intents[action.intent]
  const slots = {
    recipient: action.slots.recipient,
    message: action.slots.message,
    attachmentPaths: action.slots.attachmentPaths ?? [],
  }

  return [
    'Citto Secretary runAppAutomation 실행입니다.',
    '',
    '사용자는 이미 Citto approval card에서 이 외부 앱 자동화를 승인했습니다.',
    '그래도 send_message는 아래 slot 값만 사용해야 하며, slot에 없는 수신자/본문/첨부를 화면에서 추론하거나 새로 만들지 마세요.',
    '',
    'Intent:',
    action.intent,
    '',
    '승인 요약:',
    action.confirmationSummary,
    '',
    'App hint:',
    action.appHint ?? '(none)',
    '',
    'Profile:',
    JSON.stringify(profile, null, 2),
    '',
    'Intent profile:',
    JSON.stringify(intentProfile, null, 2),
    '',
    'Slots:',
    JSON.stringify({
      ...slots,
      message: redactLongText(slots.message ?? ''),
    }, null, 2),
    '',
    '필수 실행 규칙:',
    '- 앱별 TypeScript adapter나 앱 전용 우회 절차를 가정하지 말고 profile.workflow, profile.targets, profile.verification만 기준으로 진행하세요.',
    '- 먼저 citto-accessibility-use.list_apps로 대상 앱을 찾으세요. 실행 중이 아니면 citto-visual-use.launch_app으로 실행한 뒤 다시 citto-accessibility-use.list_apps/get_ui_tree로 확인하세요.',
    '- 대상 앱이 여러 개면 appHint, profile.app.names, profile.app.bundleIds 순서로 좁히고 여전히 모호하면 실행하지 말고 후보를 보고하세요.',
    '- UI 구조 읽기와 대상 선택은 citto-accessibility-use.get_ui_tree와 citto-accessibility-use.find_ui_targets를 먼저 사용하세요.',
    '- profile.workflow의 find/activate/setText/verify 단계는 accessibility element id 기반으로 수행하세요. setText는 citto-accessibility-use.perform_ui_action(action="setText"), activate는 action="press"를 먼저 사용하세요.',
    '- workflow의 press key 단계는 대상 앱 pid를 확인한 뒤 키보드 fallback으로만 수행하세요. 이 단계는 좌표 fallback이 아니지만 foreground 입력임을 결과에 적으세요.',
    '- recipient와 message slot 값이 비어 있거나 실행 중 화면 상태가 slot과 다르게 바뀐 것이 보이면 즉시 중단하세요.',
    '- final send 직전에는 recipient와 message가 승인 slot 값과 일치하는지 get_ui_tree/find_ui_targets/verify_ui_state로 다시 확인하세요.',
    '- 수신자가 여러 명으로 매칭되거나 sendButton/messageInput/recipientSearch 후보가 모호하면 실행하지 말고 어떤 target이 모호한지 한국어로 보고하세요.',
    '- 첨부 파일 업로드는 이 Phase에서 지원하지 않습니다. attachmentPaths가 있으면 업로드하지 말고 지원하지 않는다고 보고하세요.',
    coordinateFallbackAllowed
      ? '- profile이 coordinate fallback을 허용합니다. 그러나 AX 경로가 실패하고 OCR로 대상이 명확하며 final send 직전 slot verification이 끝난 경우에만 citto-visual-use 좌표 도구를 사용하세요. 좌표 fallback을 쓰면 결과에 반드시 "foreground 입력 fallback 사용"이라고 쓰세요.'
      : '- profile이 coordinate fallback을 허용하지 않습니다. citto-visual-use의 click_window/double_click_window 좌표 도구를 사용하지 마세요. OCR은 읽기 fallback으로만 사용할 수 있습니다.',
    intentProfile?.fallback?.allowOcr
      ? '- AX tree에 필요한 텍스트가 없을 때만 citto-visual-use.capture_window_ocr을 읽기 fallback으로 사용할 수 있습니다.'
      : '- OCR fallback도 profile에서 허용하지 않았으면 사용하지 마세요.',
    '- 성공/실패와 관계없이 마지막 응답은 한국어로 짧게 쓰고, 사용한 경로(accessibility/profile, OCR fallback, coordinate fallback 여부)와 찾지 못한 target이 있으면 target 이름을 포함하세요.',
  ].join('\n')
}

export function buildRunAppAutomationResultSuffix(coordinateFallbackAllowed: boolean): string {
  return coordinateFallbackAllowed
    ? '실행 정책: accessibility/profile 우선. profile상 좌표 fallback은 허용되지만 AX 실패와 slot verification 이후에만 사용할 수 있습니다.'
    : '실행 정책: accessibility/profile 우선. 이 profile에서는 좌표 fallback을 허용하지 않습니다.'
}
