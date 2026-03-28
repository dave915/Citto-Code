import type { MutableRefObject } from 'react'
import type { SelectedFile } from '../../../electron/preload'
import { InputArea } from '../InputArea'
import { SubagentDrilldownView } from '../SubagentDrilldownView'
import type { AskAboutSelectionPayload, FileConflict } from './chatViewUtils'
import { AgentStatusBar } from './AgentStatusBar'
import { ChatMessagePane } from './ChatMessagePane'
import type { Session, PermissionMode } from '../../store/sessions'

type Props = {
  activeHtmlPreviewMessageId: string | null
  bottomRef: MutableRefObject<HTMLDivElement | null>
  bypassShortcutLabel: string
  conflictSessionLabel: string
  drillTarget: { toolUseId: string; title: string } | null
  externalDraft: { id: number; text: string } | null
  fileConflict?: FileConflict | null
  fileConflictLabel: string | null
  hasLinkedTeam: boolean
  hideHtmlPreview: boolean
  highlightedMessageId: string | null
  isNewSession: boolean
  messageRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
  promptHistory: string[]
  onAbort: () => void
  onAskAboutSelection: (payload: AskAboutSelectionPayload) => void
  onCloseDrilldown: () => void
  onDismissModelSwitchNotice: () => void
  onModelChange: (model: string | null) => void
  onOpenTeam?: () => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onPermissionRequestAction: (action: 'once' | 'always' | 'deny') => void
  onPlanModeChange: (value: boolean) => void
  onQuestionResponse: (answer: string | null) => void
  onSend: (text: string, files: SelectedFile[]) => void
  onSendBtw: (text: string, files: SelectedFile[]) => void
  onToggleBtwCard: (cardId: string) => void
  onOpenDrilldown: (target: { toolUseId: string; title: string }) => void
  permissionShortcutLabel: string
  session: Session
  showErrorCard: boolean
}

export function ChatViewMainContent({
  activeHtmlPreviewMessageId,
  bottomRef,
  bypassShortcutLabel,
  conflictSessionLabel,
  drillTarget,
  externalDraft,
  fileConflict,
  fileConflictLabel,
  hasLinkedTeam,
  hideHtmlPreview,
  highlightedMessageId,
  isNewSession,
  messageRefs,
  promptHistory,
  onAbort,
  onAskAboutSelection,
  onCloseDrilldown,
  onDismissModelSwitchNotice,
  onModelChange,
  onOpenTeam,
  onOpenDrilldown,
  onPermissionModeChange,
  onPermissionRequestAction,
  onPlanModeChange,
  onQuestionResponse,
  onSend,
  onSendBtw,
  onToggleBtwCard,
  permissionShortcutLabel,
  session,
  showErrorCard,
}: Props) {
  if (drillTarget) {
    return (
      <SubagentDrilldownView
        session={session}
        toolUseId={drillTarget.toolUseId}
        title={drillTarget.title}
        onBack={onCloseDrilldown}
        onSendToMain={onSend}
        onSendBtwToMain={onSendBtw}
        permissionMode={session.permissionMode}
        planMode={session.planMode}
        model={session.model}
        modelSwitchNotice={session.modelSwitchNotice}
        onPermissionModeChange={onPermissionModeChange}
        onPlanModeChange={onPlanModeChange}
        onModelChange={onModelChange}
        onDismissModelSwitchNotice={onDismissModelSwitchNotice}
        permissionShortcutLabel={permissionShortcutLabel}
        bypassShortcutLabel={bypassShortcutLabel}
        onOpenTeam={onOpenTeam}
        hasLinkedTeam={hasLinkedTeam}
      />
    )
  }

  return (
    <>
      <ChatMessagePane
        session={session}
        isNewSession={isNewSession}
        fileConflict={fileConflict}
        fileConflictLabel={fileConflictLabel}
        conflictSessionLabel={conflictSessionLabel}
        highlightedMessageId={highlightedMessageId}
        activeHtmlPreviewMessageId={activeHtmlPreviewMessageId}
        hideHtmlPreview={hideHtmlPreview}
        showErrorCard={showErrorCard}
        messageRefs={messageRefs}
        bottomRef={bottomRef}
        onSend={(text) => onSend(text, [])}
        onAbort={onAbort}
        onAskAboutSelection={onAskAboutSelection}
        onToggleBtwCard={onToggleBtwCard}
      />
      <InputArea
        cwd={session.cwd}
        promptHistory={promptHistory}
        onSend={onSend}
        onSendBtw={onSendBtw}
        onAbort={onAbort}
        isStreaming={session.isStreaming}
        pendingPermission={session.pendingPermission}
        onPermissionRequestAction={onPermissionRequestAction}
        pendingQuestion={session.pendingQuestion}
        onQuestionResponse={onQuestionResponse}
        permissionMode={session.permissionMode}
        planMode={session.planMode}
        model={session.model}
        modelSwitchNotice={session.modelSwitchNotice}
        onPermissionModeChange={onPermissionModeChange}
        onPlanModeChange={onPlanModeChange}
        onModelChange={onModelChange}
        onDismissModelSwitchNotice={onDismissModelSwitchNotice}
        permissionShortcutLabel={permissionShortcutLabel}
        bypassShortcutLabel={bypassShortcutLabel}
        externalDraft={externalDraft}
        topSlot={(
          <AgentStatusBar
            session={session}
            onDrillDown={onOpenDrilldown}
          />
        )}
        onOpenTeam={onOpenTeam}
        hasLinkedTeam={hasLinkedTeam}
      />
    </>
  )
}
