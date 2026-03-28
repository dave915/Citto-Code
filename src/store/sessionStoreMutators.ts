import type { BtwCard, Message, Session, ToolCallBlock } from './sessionTypes'

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
