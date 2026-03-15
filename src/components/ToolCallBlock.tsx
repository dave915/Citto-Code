import type { ToolCallBlock as ToolCallBlockType } from '../store/sessions'
import type { AskAboutSelectionPayload } from '../lib/toolCallUtils'
import { ToolTimeline } from './toolcalls/ToolTimeline'

export { HtmlPreview } from './toolcalls/HtmlPreview'
export { extractHtmlPreviewCandidate } from '../lib/toolCallUtils'
export { ToolTimeline } from './toolcalls/ToolTimeline'
export type { AskAboutSelectionPayload } from '../lib/toolCallUtils'

export function ToolCallBlock({
  toolCall,
  onAskAboutSelection,
}: {
  toolCall: ToolCallBlockType
  onAskAboutSelection?: (payload: AskAboutSelectionPayload) => void
}) {
  return <ToolTimeline toolCalls={[toolCall]} onAskAboutSelection={onAskAboutSelection} />
}
