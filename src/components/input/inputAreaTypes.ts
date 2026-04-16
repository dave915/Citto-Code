import type { ReactNode } from 'react'
import type { SelectedFile } from '../../../electron/preload'
import type {
  ModelSwitchNotice,
  PendingPermissionRequest,
  PendingQuestionRequest,
  PermissionMode,
} from '../../store/sessions'
import type { ExternalDraft, PreviewElementSelectionPayload } from '../chat/chatViewUtils'

export type InputAreaProps = {
  cwd: string
  promptHistory: string[]
  onSend: (text: string, files: SelectedFile[]) => void
  onSendBtw: (text: string, files: SelectedFile[]) => void
  onAbort: () => void
  pendingPermission: PendingPermissionRequest | null
  onPermissionRequestAction: (action: 'once' | 'always' | 'deny') => void
  pendingQuestion: PendingQuestionRequest | null
  onQuestionResponse: (answer: string | null) => void
  isStreaming: boolean
  disabled?: boolean
  permissionMode: PermissionMode
  planMode: boolean
  model: string | null
  modelSwitchNotice: ModelSwitchNotice | null
  onPermissionModeChange: (mode: PermissionMode) => void
  onPlanModeChange: (value: boolean) => void
  onModelChange: (model: string | null) => void
  onDismissModelSwitchNotice: () => void
  permissionShortcutLabel: string
  bypassShortcutLabel: string
  externalDraft?: ExternalDraft | null
  previewSelectionResetToken?: number
  onPreviewSelectionDraftsChange?: (drafts: PreviewElementSelectionPayload[]) => void
  onPreviewSelectionHoverChange?: (selectionKey: string | null) => void
  topSlot?: ReactNode
  onOpenTeam?: () => void
  hasLinkedTeam?: boolean
}
