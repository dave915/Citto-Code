import { translate } from '../../lib/i18n'
import type { SubagentCallSummary } from '../../lib/agent-subcalls'

export function getStatusLabel(status: SubagentCallSummary['status'], language: string) {
  if (status === 'pending') return translate(language as 'ko' | 'en', 'subagent.status.pending')
  if (status === 'running') return translate(language as 'ko' | 'en', 'subagent.status.running')
  if (status === 'error') return translate(language as 'ko' | 'en', 'subagent.status.error')
  return translate(language as 'ko' | 'en', 'subagent.status.done')
}

export function getStatusClassName(status: SubagentCallSummary['status']) {
  if (status === 'pending') return 'border-amber-400/30 bg-amber-400/10 text-amber-100'
  if (status === 'running') return 'border-sky-400/30 bg-sky-400/10 text-sky-100'
  if (status === 'error') return 'border-red-400/30 bg-red-400/10 text-red-100'
  return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
}
