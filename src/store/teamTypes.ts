import type { AgentIconType } from '../components/team/AgentPixelIcon'
import type { AttachedFile } from './sessionTypes'

export type AgentMessage = {
  id: string
  text: string
  thinking?: string
  createdAt: number
  isStreaming: boolean
}

export type TeamAgent = {
  id: string
  presetId: string | null
  name: string
  role: string
  description: string
  color: string
  iconType: AgentIconType
  emoji: string
  systemPrompt: string
  claudeSessionId: string | null
  messages: AgentMessage[]
  isStreaming: boolean
  currentMsgId: string | null
  error: string | null
  isCustom: boolean
}

export type TeamStatus = 'idle' | 'running' | 'done' | 'error'

/** 실행 모드
 * sequential : 순차 — 앞 에이전트 응답을 보며 차례로 응답
 * parallel   : 병렬 — 동시에 독립 응답, 이후 라운드에서 서로 참고
 * meeting    : 회의 — 여러 라운드 맞대응 (최대 maxRounds)
 */
export type DiscussionMode = 'sequential' | 'parallel' | 'meeting'

export type AgentTeam = {
  id: string
  name: string
  cwd: string
  agents: TeamAgent[]
  status: TeamStatus
  currentTask: string
  currentTaskPrompt: string
  currentTaskAttachments: AttachedFile[]
  roundNumber: number
  mode: DiscussionMode
  maxRounds: number
}

export type TeamStore = {
  teams: AgentTeam[]
  activeTeamId: string | null

  addTeam: (cwd: string, name: string, agents: Pick<TeamAgent, 'id' | 'presetId' | 'name' | 'role' | 'description' | 'color' | 'iconType' | 'emoji' | 'systemPrompt' | 'isCustom'>[], mode?: DiscussionMode) => string
  removeTeam: (id: string) => void
  setActiveTeam: (id: string | null) => void
  updateTeamName: (teamId: string, name: string) => void
  setTeamCwd: (teamId: string, cwd: string) => void
  setTeamStatus: (teamId: string, status: TeamStatus) => void
  setTeamTask: (teamId: string, task: string, prompt?: string, attachments?: AttachedFile[]) => void
  setTeamMode: (teamId: string, mode: DiscussionMode) => void
  setMaxRounds: (teamId: string, maxRounds: number) => void
  incrementRound: (teamId: string) => void
  resetDiscussion: (teamId: string) => void

  addAgent: (teamId: string, agent: Pick<TeamAgent, 'id' | 'presetId' | 'name' | 'role' | 'description' | 'color' | 'iconType' | 'emoji' | 'systemPrompt' | 'isCustom'>) => void
  removeAgent: (teamId: string, agentId: string) => void
  updateAgent: (teamId: string, agentId: string, patch: Partial<Pick<TeamAgent, 'name' | 'role' | 'description' | 'color' | 'iconType' | 'emoji' | 'systemPrompt'>>) => void

  setAgentClaudeSessionId: (teamId: string, agentId: string, claudeSessionId: string) => void
  startAgentMessage: (teamId: string, agentId: string) => string
  appendAgentText: (teamId: string, agentId: string, msgId: string, chunk: string) => void
  appendAgentThinking: (teamId: string, agentId: string, msgId: string, chunk: string) => void
  finalizeAgentMessage: (teamId: string, agentId: string) => void
  setAgentError: (teamId: string, agentId: string, error: string | null) => void
}
