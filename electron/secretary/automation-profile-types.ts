export type SecretaryAutomationIntent = 'send_message'

export type SecretaryAutomationSlot = 'recipient' | 'message' | 'attachmentPaths'

export type SecretaryAutomationPlatform = 'macos' | 'windows' | 'linux'

export type SecretaryAutomationProfile = {
  id: string
  label: string
  app: {
    names: string[]
    bundleIds?: string[]
    platform: SecretaryAutomationPlatform
  }
  intents: Record<SecretaryAutomationIntent, SecretaryAutomationIntentProfile>
  createdAt: number
  updatedAt: number
}

export type SecretaryAutomationProfileDraft = Omit<
  SecretaryAutomationProfile,
  'createdAt' | 'updatedAt'
> & Partial<Pick<SecretaryAutomationProfile, 'createdAt' | 'updatedAt'>>

export type SecretaryAutomationIntentProfile = {
  slots: SecretaryAutomationSlot[]
  workflow: SecretaryAutomationWorkflowStep[]
  targets: Record<string, SecretaryAutomationTargetHint>
  verification: SecretaryAutomationVerificationRule[]
  fallback?: {
    allowOcr: boolean
    allowCoordinateInput: boolean
  }
}

export type SecretaryAutomationWorkflowStep =
  | { type: 'find'; target: string; optional?: boolean }
  | { type: 'activate'; target: string }
  | { type: 'setText'; target: string; value: string }
  | { type: 'press'; key: string; modifiers?: string[] }
  | { type: 'waitFor'; target: string; timeoutMs?: number }
  | { type: 'verify'; rule: string }

export type SecretaryAutomationTargetPreference =
  | { bottomArea: true }
  | { topArea: true }
  | { nearTarget: string }
  | { focused: true }

export type SecretaryAutomationTargetHint = {
  roles?: string[]
  labels?: string[]
  values?: string[]
  nearText?: string[]
  prefer?: SecretaryAutomationTargetPreference[]
}

export type SecretaryAutomationVerificationRule = {
  type: string
  text?: string
  near?: string
  target?: string
  rule?: string
}
