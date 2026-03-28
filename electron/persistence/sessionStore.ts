import type { AttachedFile, Message, Session, ToolCallBlock } from '../persistence-types'
import {
  deriveSessionTimestamps,
  normalizeSessions,
  parseJsonValue,
  parseMessageRole,
  parsePermissionMode,
  parseToolCallStatus,
  stringifyJson,
  toBooleanNumber,
} from './normalizers'
import type {
  PersistedAttachmentRow,
  PersistedMessageRow,
  PersistedSessionRow,
  PersistedToolCallRow,
} from './rowTypes'
import type { PersistenceQuery, PersistenceRun, PersistenceTransaction } from './operations'

export function loadSessionsFromStore(query: PersistenceQuery): Session[] {
  const sessionRows = query<PersistedSessionRow>('SELECT * FROM sessions ORDER BY sort_order ASC')
  const messageRows = query<PersistedMessageRow>('SELECT * FROM messages ORDER BY session_id ASC, seq ASC')
  const toolCallRows = query<PersistedToolCallRow>('SELECT * FROM tool_calls ORDER BY message_id ASC, seq ASC')
  const attachmentRows = query<PersistedAttachmentRow>('SELECT * FROM attachments ORDER BY message_id ASC, seq ASC')

  const toolCallsByMessageId = new Map<string, ToolCallBlock[]>()
  for (const row of toolCallRows) {
    const existing = toolCallsByMessageId.get(row.message_id) ?? []
    existing.push({
      id: row.id,
      toolUseId: row.tool_use_id,
      toolName: row.tool_name,
      toolInput: parseJsonValue(row.tool_input_json),
      fileSnapshotBefore: row.file_snapshot_before,
      result: parseJsonValue(row.result_json),
      isError: Boolean(row.is_error),
      status: parseToolCallStatus(row.status),
    })
    toolCallsByMessageId.set(row.message_id, existing)
  }

  const attachmentsByMessageId = new Map<string, AttachedFile[]>()
  for (const row of attachmentRows) {
    const existing = attachmentsByMessageId.get(row.message_id) ?? []
    existing.push({
      id: row.id,
      name: row.name,
      path: row.path,
      content: row.content_text,
      size: row.size,
      fileType: row.file_type ?? undefined,
    })
    attachmentsByMessageId.set(row.message_id, existing)
  }

  const messagesBySessionId = new Map<string, Message[]>()
  for (const row of messageRows) {
    const existing = messagesBySessionId.get(row.session_id) ?? []
    const attachedFiles = attachmentsByMessageId.get(row.id)
    const btwCards = parseJsonValue(row.btw_cards_json)
    existing.push({
      id: row.id,
      role: parseMessageRole(row.role),
      text: row.text,
      thinking: row.thinking,
      toolCalls: toolCallsByMessageId.get(row.id) ?? [],
      attachedFiles: attachedFiles && attachedFiles.length > 0 ? attachedFiles : undefined,
      btwCards: Array.isArray(btwCards)
        ? btwCards as Message['btwCards']
        : undefined,
      createdAt: row.created_at,
    })
    messagesBySessionId.set(row.session_id, existing)
  }

  return sessionRows.map((row) => ({
    id: row.id,
    sessionId: row.claude_session_id,
    name: row.name,
    favorite: Boolean(row.favorite),
    cwd: row.cwd,
    messages: messagesBySessionId.get(row.id) ?? [],
    isStreaming: false,
    currentAssistantMsgId: null,
    error: row.error,
    pendingPermission: null,
    pendingQuestion: null,
    tokenUsage: row.input_tokens,
    lastCost: row.last_cost ?? undefined,
    permissionMode: parsePermissionMode(row.permission_mode),
    planMode: Boolean(row.plan_mode),
    model: row.model,
    modelSwitchNotice: null,
  }))
}

export function saveSessionsToStore(
  runInTransaction: PersistenceTransaction,
  run: PersistenceRun,
  sessions: Session[],
): void {
  const normalizedSessions = normalizeSessions(sessions)

  runInTransaction(() => {
    run('DELETE FROM attachments')
    run('DELETE FROM tool_calls')
    run('DELETE FROM messages')
    run('DELETE FROM sessions')

    for (const [sessionIndex, session] of normalizedSessions.entries()) {
      const { createdAt, updatedAt } = deriveSessionTimestamps(session)
      run(
        `INSERT INTO sessions (
          id,
          claude_session_id,
          name,
          favorite,
          cwd,
          error,
          input_tokens,
          last_cost,
          permission_mode,
          plan_mode,
          model,
          sort_order,
          created_at,
          updated_at
        ) VALUES (
          :id,
          :claudeSessionId,
          :name,
          :favorite,
          :cwd,
          :error,
          :inputTokens,
          :lastCost,
          :permissionMode,
          :planMode,
          :model,
          :sortOrder,
          :createdAt,
          :updatedAt
        )`,
        {
          ':id': session.id,
          ':claudeSessionId': session.sessionId,
          ':name': session.name,
          ':favorite': toBooleanNumber(session.favorite),
          ':cwd': session.cwd,
          ':error': session.error,
          ':inputTokens': session.tokenUsage,
          ':lastCost': session.lastCost ?? null,
          ':permissionMode': session.permissionMode,
          ':planMode': toBooleanNumber(session.planMode),
          ':model': session.model,
          ':sortOrder': sessionIndex,
          ':createdAt': createdAt,
          ':updatedAt': updatedAt,
        },
      )

      for (const [messageIndex, message] of session.messages.entries()) {
        run(
          `INSERT INTO messages (
            id,
            session_id,
            role,
            text,
            thinking,
            btw_cards_json,
            created_at,
            seq
          ) VALUES (
            :id,
            :sessionId,
            :role,
            :text,
            :thinking,
            :btwCardsJson,
            :createdAt,
            :seq
          )`,
          {
            ':id': message.id,
            ':sessionId': session.id,
            ':role': message.role,
            ':text': message.text,
            ':thinking': message.thinking ?? '',
            ':btwCardsJson': stringifyJson(message.btwCards),
            ':createdAt': message.createdAt,
            ':seq': messageIndex,
          },
        )

        for (const [toolCallIndex, toolCall] of message.toolCalls.entries()) {
          run(
            `INSERT INTO tool_calls (
              id,
              message_id,
              tool_use_id,
              tool_name,
              tool_input_json,
              file_snapshot_before,
              result_json,
              is_error,
              status,
              seq
            ) VALUES (
              :id,
              :messageId,
              :toolUseId,
              :toolName,
              :toolInputJson,
              :fileSnapshotBefore,
              :resultJson,
              :isError,
              :status,
              :seq
            )`,
            {
              ':id': toolCall.id,
              ':messageId': message.id,
              ':toolUseId': toolCall.toolUseId,
              ':toolName': toolCall.toolName,
              ':toolInputJson': stringifyJson(toolCall.toolInput),
              ':fileSnapshotBefore': toolCall.fileSnapshotBefore ?? null,
              ':resultJson': stringifyJson(toolCall.result),
              ':isError': toBooleanNumber(toolCall.isError),
              ':status': toolCall.status,
              ':seq': toolCallIndex,
            },
          )
        }

        for (const [attachmentIndex, attachment] of (message.attachedFiles ?? []).entries()) {
          run(
            `INSERT INTO attachments (
              id,
              message_id,
              name,
              path,
              content_text,
              size,
              file_type,
              seq
            ) VALUES (
              :id,
              :messageId,
              :name,
              :path,
              :contentText,
              :size,
              :fileType,
              :seq
            )`,
            {
              ':id': attachment.id,
              ':messageId': message.id,
              ':name': attachment.name,
              ':path': attachment.path,
              ':contentText': attachment.content,
              ':size': attachment.size,
              ':fileType': attachment.fileType ?? null,
              ':seq': attachmentIndex,
            },
          )
        }
      }
    }
  })
}
