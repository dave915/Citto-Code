import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { AgentTeam, TeamAgent, TeamStore, DiscussionMode } from './teamTypes'

export const useTeamStore = create<TeamStore>((set) => ({
  teams: [],
  activeTeamId: null,

  addTeam: (cwd, name, agents, mode = 'sequential') => {
    const id = nanoid()
    const teamAgents: TeamAgent[] = agents.map((a) => ({
      ...a,
      claudeSessionId: null,
      messages: [],
      isStreaming: false,
      currentMsgId: null,
      error: null,
    }))
    set((state) => ({
      teams: [
        ...state.teams,
        {
          id,
          name,
          cwd,
          agents: teamAgents,
          status: 'idle',
          currentTask: '',
          currentTaskPrompt: '',
          currentTaskAttachments: [],
          roundNumber: 1,
          mode,
          maxRounds: 3,
        } satisfies AgentTeam,
      ],
      activeTeamId: id,
    }))
    return id
  },

  removeTeam: (id) =>
    set((state) => {
      const removedIndex = state.teams.findIndex((team) => team.id === id)
      const remainingTeams = state.teams.filter((team) => team.id !== id)

      if (state.activeTeamId !== id) {
        return {
          teams: remainingTeams,
          activeTeamId: state.activeTeamId,
        }
      }

      const fallbackIndex = removedIndex < 0
        ? 0
        : Math.min(removedIndex, remainingTeams.length - 1)

      return {
        teams: remainingTeams,
        activeTeamId: remainingTeams[fallbackIndex]?.id ?? null,
      }
    }),

  setActiveTeam: (id) => set({ activeTeamId: id }),

  updateTeamName: (teamId, name) =>
    set((state) => ({
      teams: state.teams.map((t) => (t.id !== teamId ? t : { ...t, name })),
    })),

  setTeamCwd: (teamId, cwd) =>
    set((state) => ({
      teams: state.teams.map((t) => (t.id !== teamId ? t : { ...t, cwd })),
    })),

  setTeamStatus: (teamId, status) =>
    set((state) => ({
      teams: state.teams.map((t) => (t.id !== teamId ? t : { ...t, status })),
    })),

  setTeamTask: (teamId, task, prompt = task, attachments = []) =>
    set((state) => ({
      teams: state.teams.map((t) => (
        t.id !== teamId
          ? t
          : {
              ...t,
              currentTask: task,
              currentTaskPrompt: prompt,
              currentTaskAttachments: attachments,
            }
      )),
    })),

  setTeamMode: (teamId, mode: DiscussionMode) =>
    set((state) => ({
      teams: state.teams.map((t) => (t.id !== teamId ? t : { ...t, mode })),
    })),

  setMaxRounds: (teamId, maxRounds) =>
    set((state) => ({
      teams: state.teams.map((t) => (t.id !== teamId ? t : { ...t, maxRounds })),
    })),

  incrementRound: (teamId) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId ? t : { ...t, roundNumber: t.roundNumber + 1 },
      ),
    })),

  resetDiscussion: (teamId) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              status: 'idle',
              currentTask: '',
              currentTaskPrompt: '',
              currentTaskAttachments: [],
              roundNumber: 1,
              agents: t.agents.map((a) => ({
                ...a,
                claudeSessionId: null,
                messages: [],
                isStreaming: false,
                currentMsgId: null,
                error: null,
              })),
            },
      ),
    })),

  addAgent: (teamId, agentData) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              agents: [
                ...t.agents,
                {
                  ...agentData,
                  claudeSessionId: null,
                  messages: [],
                  isStreaming: false,
                  currentMsgId: null,
                  error: null,
                },
              ],
            },
      ),
    })),

  removeAgent: (teamId, agentId) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId ? t : { ...t, agents: t.agents.filter((a) => a.id !== agentId) },
      ),
    })),

  updateAgent: (teamId, agentId, patch) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId
          ? t
          : { ...t, agents: t.agents.map((a) => (a.id !== agentId ? a : { ...a, ...patch })) },
      ),
    })),

  setAgentClaudeSessionId: (teamId, agentId, claudeSessionId) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              agents: t.agents.map((a) => (a.id !== agentId ? a : { ...a, claudeSessionId })),
            },
      ),
    })),

  startAgentMessage: (teamId, agentId) => {
    const msgId = nanoid()
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              agents: t.agents.map((a) =>
                a.id !== agentId
                  ? a
                  : {
                      ...a,
                      isStreaming: true,
                      currentMsgId: msgId,
                      messages: [
                        ...a.messages,
                        {
                          id: msgId,
                          text: '',
                          thinking: '',
                          createdAt: Date.now(),
                          isStreaming: true,
                        },
                      ],
                    },
              ),
            },
      ),
    }))
    return msgId
  },

  appendAgentText: (teamId, agentId, msgId, chunk) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              agents: t.agents.map((a) =>
                a.id !== agentId
                  ? a
                  : {
                      ...a,
                      messages: a.messages.map((m) =>
                        m.id !== msgId ? m : { ...m, text: m.text + chunk },
                      ),
                    },
              ),
            },
      ),
    })),

  appendAgentThinking: (teamId, agentId, msgId, chunk) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              agents: t.agents.map((a) =>
                a.id !== agentId
                  ? a
                  : {
                      ...a,
                      messages: a.messages.map((m) =>
                        m.id !== msgId ? m : { ...m, thinking: (m.thinking ?? '') + chunk },
                      ),
                    },
              ),
            },
      ),
    })),

  finalizeAgentMessage: (teamId, agentId) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              agents: t.agents.map((a) => {
                if (a.id !== agentId) return a
                return {
                  ...a,
                  isStreaming: false,
                  currentMsgId: null,
                  messages: a.messages.map((m) =>
                    m.id !== a.currentMsgId ? m : { ...m, isStreaming: false },
                  ),
                }
              }),
            },
      ),
    })),

  setAgentError: (teamId, agentId, error) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              agents: t.agents.map((a) =>
                a.id !== agentId ? a : { ...a, error, isStreaming: false, currentMsgId: null },
              ),
            },
      ),
    })),
}))
