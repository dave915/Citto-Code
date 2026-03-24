import type { MutableRefObject } from 'react'
import type { SelectedFile } from '../../../electron/preload'
import type {
  NotificationMode,
  PermissionMode,
  Session,
  SessionsStore,
} from '../../store/sessions'

export type StreamStoreActions = Pick<
  SessionsStore,
  | 'addUserMessage'
  | 'startAssistantMessage'
  | 'appendThinkingChunk'
  | 'appendTextChunk'
  | 'addBtwCard'
  | 'appendBtwCardChunk'
  | 'updateBtwCard'
  | 'addToolCall'
  | 'resolveToolCall'
  | 'setStreaming'
  | 'setClaudeSessionId'
  | 'setError'
  | 'setPendingPermission'
  | 'setPendingQuestion'
  | 'setTokenUsage'
  | 'setLastCost'
  | 'updateSession'
  | 'setPermissionMode'
  | 'setModel'
  | 'commitStreamEnd'
  | 'removeSession'
>

export type UseClaudeStreamParams = StreamStoreActions & {
  sessions: Session[]
  activeSessionId: string | null
  defaultProjectPath: string
  sanitizedEnvVars: Record<string, string>
  claudeBinaryPath: string
  notificationMode: NotificationMode
}

export type ScheduledTaskRunMeta = {
  taskId: string
  runAt: number
}

export type BtwRequestContext = {
  requestId: string
  messageId: string
  processKey: string | null
  prompt: string
  tabId: string
}

export type ClaudeStreamStoreSnapshot = StreamStoreActions & {
  activeSessionId: string | null
}

export type ClaudeStreamRuntimeRefs = {
  pendingTabIdRef: MutableRefObject<string | null>
  pendingProcessKeyByTabRef: MutableRefObject<Map<string, string>>
  currentAsstMsgRef: MutableRefObject<Map<string, string>>
  claudeSessionToTabRef: MutableRefObject<Map<string, string>>
  abortedTabIdsRef: MutableRefObject<Set<string>>
  scheduledTaskSessionByRunRef: MutableRefObject<Map<string, string>>
  scheduledTaskRunMetaBySessionRef: MutableRefObject<Map<string, ScheduledTaskRunMeta>>
  notifiedSessionEndsRef: MutableRefObject<Set<string>>
  btwRequestMapRef: MutableRefObject<Map<string, BtwRequestContext>>
  notificationModeRef: MutableRefObject<NotificationMode>
  sessionsRef: MutableRefObject<Session[]>
  storeRef: MutableRefObject<ClaudeStreamStoreSnapshot>
}

export type HandleSendOptions = {
  permissionModeOverride?: PermissionMode
  visibleTextOverride?: string
  skipAutoTransforms?: boolean
}

export type ClaudeSessionHandlerDeps = {
  activeSession: Session | null
  activeSessionId: string | null
  claudeBinaryPath: string
  defaultProjectPath: string
  runtime: ClaudeStreamRuntimeRefs
  sanitizedEnvVars: Record<string, string>
  sessions: Session[]
}

export type HandleSendForSession = (
  sessionId: string,
  text: string,
  files: SelectedFile[],
  options?: HandleSendOptions,
) => Promise<void>
