import { pruneEmptyCurrentAssistantMessage } from '../lib/sessionUtils'
import { nanoid } from './nanoid'
import type { AttachedFile, BtwCard, Message, Session, ToolCallBlock } from './sessionTypes'

export function updateSessionById(
  sessions: Session[],
  sessionId: string,
  updater: (session: Session) => Session,
): Session[] {
  return sessions.map((session) => (
    session.id === sessionId ? updater(session) : session
  ))
}

export function updateMessages(
  session: Session,
  updater: (message: Message) => Message,
): Session {
  return {
    ...session,
    messages: session.messages.map(updater),
  }
}

export function updateMessageById(
  session: Session,
  messageId: string,
  updater: (message: Message) => Message,
): Session {
  return updateMessages(session, (message) => (
    message.id === messageId ? updater(message) : message
  ))
}

export function updateBtwCards(
  session: Session,
  updater: (card: BtwCard) => BtwCard,
): Session {
  return updateMessages(session, (message) => ({
    ...message,
    btwCards: message.btwCards?.map(updater),
  }))
}

export function updateToolCalls(
  session: Session,
  updater: (toolCall: ToolCallBlock) => ToolCallBlock,
): Session {
  return updateMessages(session, (message) => ({
    ...message,
    toolCalls: message.toolCalls.map(updater),
  }))
}

export function patchSession(session: Session, patch: Partial<Session>): Session {
  return {
    ...session,
    ...patch,
  }
}

export function appendSessionMessage(
  session: Session,
  message: Message,
): Session {
  return {
    ...session,
    messages: [...session.messages, message],
  }
}

export function createUserMessage(
  text: string,
  files?: AttachedFile[],
  messageId = nanoid(),
): Message {
  return {
    id: messageId,
    role: 'user',
    text,
    thinking: '',
    toolCalls: [],
    ...(files ? { attachedFiles: files } : {}),
    createdAt: Date.now(),
  }
}

export function appendUserMessage(
  session: Session,
  text: string,
  files?: AttachedFile[],
  messageId = nanoid(),
): Session {
  return patchSession(
    appendSessionMessage(session, createUserMessage(text, files, messageId)),
    {
      pendingPermission: null,
      pendingQuestion: null,
    },
  )
}

export function createAssistantMessage(messageId = nanoid()): Message {
  return {
    id: messageId,
    role: 'assistant',
    text: '',
    thinking: '',
    toolCalls: [],
    createdAt: Date.now(),
  }
}

export function startAssistantStreamingSession(
  session: Session,
  messageId = nanoid(),
): Session {
  return patchSession(
    appendSessionMessage(session, createAssistantMessage(messageId)),
    {
      currentAssistantMsgId: messageId,
      isStreaming: true,
      pendingPermission: null,
      pendingQuestion: null,
      tokenUsage: null,
    },
  )
}

function createBtwAnchorMessage(card: BtwCard): Message {
  return {
    id: nanoid(),
    role: 'assistant',
    text: '',
    thinking: '',
    toolCalls: [],
    btwCards: [card],
    createdAt: Date.now(),
  }
}

export function appendBtwCardToLastMessage(
  session: Session,
  card: BtwCard,
): { session: Session; targetMessageId: string } {
  const lastMessage = session.messages[session.messages.length - 1]
  if (!lastMessage) {
    const anchorMessage = createBtwAnchorMessage(card)
    return {
      session: appendSessionMessage(session, anchorMessage),
      targetMessageId: anchorMessage.id,
    }
  }

  return {
    session: updateMessageById(
      session,
      lastMessage.id,
      (message) => ({ ...message, btwCards: [...(message.btwCards ?? []), card] }),
    ),
    targetMessageId: lastMessage.id,
  }
}

export function appendToolCallToMessage(
  session: Session,
  messageId: string,
  toolCall: ToolCallBlock,
): Session {
  return updateMessageById(
    session,
    messageId,
    (message) => ({ ...message, toolCalls: [...message.toolCalls, toolCall] }),
  )
}

export function finalizeStreamingSession(
  session: Session,
  patch: Partial<Session> = {},
): Session {
  const nextSession = patchSession(session, {
    ...patch,
    isStreaming: false,
  })

  return patchSession(nextSession, {
    messages: pruneEmptyCurrentAssistantMessage(nextSession),
    currentAssistantMsgId: null,
  })
}
