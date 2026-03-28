import { useCallback, useEffect, useRef } from 'react'
import type { SelectedFile } from '../../electron/preload'
import { createAgentTeamPromptBuilder } from './team/agentTeamPrompts'
import {
  clearContextMappings,
  clearQueuedRuntime,
  createAgentStreamContext,
  drainExecQueue,
  enqueueExec,
  getTeamRuntime,
  resetParallelRuntime,
  resetTeamRuntimeState,
  resolveAgentContext,
  settleParallelTeam,
  type AgentStreamContext,
  type TeamRuntime,
} from './team/agentTeamRuntime'
import { buildPromptWithAttachments, toAttachedFiles } from '../lib/attachmentPrompts'
import { translate, type AppLanguage, type TranslationKey } from '../lib/i18n'
import { nanoid } from '../store/nanoid'
import { useTeamStore } from '../store/teamStore'
import type { AgentTeam, DiscussionMode, TeamAgent } from '../store/teamTypes'

export function useAgentTeamStream(
  envVars: Record<string, string>,
  claudeBinaryPath?: string,
  language: AppLanguage = 'ko',
) {
  const store = useTeamStore()
  const teamsRef = useRef(store.teams)
  teamsRef.current = store.teams
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(language, key, params)

  const requestToAgentRef = useRef<Map<string, AgentStreamContext>>(new Map())
  const sessionToAgentRef = useRef<Map<string, AgentStreamContext>>(new Map())
  const teamRuntimeRef = useRef<Map<string, TeamRuntime>>(new Map())
  const {
    buildInitialPrompt,
    buildParallelPrompt,
    buildParallelRoundPrompt,
    buildMeetingPrompt,
  } = createAgentTeamPromptBuilder(language, t)

  const storeRef = useRef(store)
  storeRef.current = store
  const envVarsRef = useRef(envVars)
  envVarsRef.current = envVars
  const claudePathRef = useRef(claudeBinaryPath)
  claudePathRef.current = claudeBinaryPath

  function failTeam(teamId: string, agentId: string, error: string, requestId?: string, sessionId?: string | null) {
    storeRef.current.setAgentError(teamId, agentId, error)
    storeRef.current.setTeamStatus(teamId, 'error')

    clearQueuedRuntime(teamRuntimeRef.current, teamId)

    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (team?.mode === 'parallel' && (requestId || sessionId)) {
      settleParallelTeam(teamRuntimeRef.current, teamId)
    } else {
      resetParallelRuntime(teamRuntimeRef.current, teamId)
    }
  }

  useEffect(() => {
    const cleanup = window.claude.onClaudeEvent((event) => {
      if (event.type === 'stream-start') {
        const context = resolveAgentContext(
          requestToAgentRef.current,
          sessionToAgentRef.current,
          event.sessionId,
          event.requestId,
        )
        if (!context) return

        sessionToAgentRef.current.set(event.sessionId, context)
        clearContextMappings(
          requestToAgentRef.current,
          sessionToAgentRef.current,
          context,
          undefined,
          event.requestId,
        )
        storeRef.current.setAgentClaudeSessionId(context.teamId, context.agentId, event.sessionId)
        return
      }

      const eventSessionId = 'sessionId' in event ? event.sessionId : null
      const context = resolveAgentContext(
        requestToAgentRef.current,
        sessionToAgentRef.current,
        eventSessionId,
        event.requestId,
      )
      if (!context) return

      const { teamId, agentId, msgId } = context

      switch (event.type) {
        case 'thinking-chunk':
          storeRef.current.appendAgentThinking(teamId, agentId, msgId, event.text)
          break

        case 'text-chunk':
          storeRef.current.appendAgentText(teamId, agentId, msgId, event.text)
          break

        case 'stream-end': {
          storeRef.current.finalizeAgentMessage(teamId, agentId)
          clearContextMappings(
            requestToAgentRef.current,
            sessionToAgentRef.current,
            context,
            event.sessionId,
            event.requestId,
          )

          const team = teamsRef.current.find((candidate) => candidate.id === teamId)
          if (!team) break

          if (team.mode === 'parallel') {
            settleParallelTeam(teamRuntimeRef.current, teamId)
          } else {
            drainExecQueue(teamRuntimeRef.current, teamId)
          }
          break
        }

        case 'error':
          clearContextMappings(
            requestToAgentRef.current,
            sessionToAgentRef.current,
            context,
            event.sessionId,
            event.requestId,
          )
          failTeam(teamId, agentId, event.error, event.requestId, event.sessionId)
          break
      }
    })

    return cleanup
  }, [])

  async function sendToAgentAwaited(
    team: AgentTeam,
    agent: TeamAgent,
    prompt: string,
    attachments?: SelectedFile[],
  ): Promise<void> {
    return new Promise((resolve) => {
      const runtime = getTeamRuntime(teamRuntimeRef.current, team.id)
      const msgId = storeRef.current.startAgentMessage(team.id, agent.id)
      const requestId = nanoid()
      const context: AgentStreamContext = createAgentStreamContext(team.id, agent.id, msgId, requestId)

      requestToAgentRef.current.set(requestId, context)
      if (agent.claudeSessionId) {
        sessionToAgentRef.current.set(agent.claudeSessionId, context)
      }

      runtime.pendingResolve = resolve

      void window.claude.sendMessage({
        sessionId: agent.claudeSessionId,
        prompt,
        attachments,
        cwd: team.cwd,
        requestId,
        permissionMode: 'bypassPermissions',
        envVars: envVarsRef.current,
        ...(claudePathRef.current ? { claudePath: claudePathRef.current } : {}),
      }).catch((error) => {
        clearContextMappings(
          requestToAgentRef.current,
          sessionToAgentRef.current,
          context,
          agent.claudeSessionId,
          requestId,
        )
        failTeam(team.id, agent.id, String(error), requestId, agent.claudeSessionId)
      })
    })
  }

  async function sendAllParallel(
    team: AgentTeam,
    agents: TeamAgent[],
    prompts: string[],
    attachments?: SelectedFile[],
  ): Promise<void> {
    return new Promise((resolve) => {
      const runtime = getTeamRuntime(teamRuntimeRef.current, team.id)
      runtime.parallelPendingCount = agents.length
      runtime.parallelDoneCallback = resolve

      agents.forEach((agent, index) => {
        const msgId = storeRef.current.startAgentMessage(team.id, agent.id)
        const requestId = nanoid()
        const context: AgentStreamContext = createAgentStreamContext(team.id, agent.id, msgId, requestId)

        requestToAgentRef.current.set(requestId, context)
        if (agent.claudeSessionId) {
          sessionToAgentRef.current.set(agent.claudeSessionId, context)
        }

        void window.claude.sendMessage({
          sessionId: agent.claudeSessionId,
          prompt: prompts[index],
          attachments,
          cwd: team.cwd,
          requestId,
          permissionMode: 'bypassPermissions',
          envVars: envVarsRef.current,
          ...(claudePathRef.current ? { claudePath: claudePathRef.current } : {}),
        }).catch((error) => {
          clearContextMappings(
            requestToAgentRef.current,
            sessionToAgentRef.current,
            context,
            agent.claudeSessionId,
            requestId,
          )
          failTeam(team.id, agent.id, String(error), requestId, agent.claudeSessionId)
        })
      })
    })
  }

  const startSequential = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (!team) return

    resetTeamRuntimeState(teamRuntimeRef.current, teamId)
    const taskPrompt = buildPromptWithAttachments(task, files, language)
    storeRef.current.setTeamTask(teamId, task, taskPrompt, toAttachedFiles(files))
    storeRef.current.setTeamStatus(teamId, 'running')

    team.agents.forEach((agent, index) => {
      enqueueExec(teamRuntimeRef.current, teamId, () => {
        const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
        if (!currentTeam) {
          drainExecQueue(teamRuntimeRef.current, teamId)
          return
        }
        const prior = currentTeam.agents.slice(0, index)
        const prompt = buildInitialPrompt(agent, taskPrompt, prior)
        void sendToAgentAwaited(currentTeam, agent, prompt, files)
      })
    })

    enqueueExec(teamRuntimeRef.current, teamId, () => {
      const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
      if (currentTeam?.status === 'running') {
        storeRef.current.setTeamStatus(teamId, 'done')
      }
      drainExecQueue(teamRuntimeRef.current, teamId)
    })
  }, [language])

  const startParallel = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (!team) return

    resetTeamRuntimeState(teamRuntimeRef.current, teamId)
    const taskPrompt = buildPromptWithAttachments(task, files, language)
    storeRef.current.setTeamTask(teamId, task, taskPrompt, toAttachedFiles(files))
    storeRef.current.setTeamStatus(teamId, 'running')

    const prompts = team.agents.map((agent) => buildParallelPrompt(agent, taskPrompt))
    await sendAllParallel(team, team.agents, prompts, files)

    if (teamsRef.current.find((candidate) => candidate.id === teamId)?.status === 'running') {
      storeRef.current.setTeamStatus(teamId, 'done')
    }
  }, [language])

  const startMeeting = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (!team) return

    resetTeamRuntimeState(teamRuntimeRef.current, teamId)
    const taskPrompt = buildPromptWithAttachments(task, files, language)
    storeRef.current.setTeamTask(teamId, task, taskPrompt, toAttachedFiles(files))
    storeRef.current.setTeamStatus(teamId, 'running')

    team.agents.forEach((agent) => {
      enqueueExec(teamRuntimeRef.current, teamId, () => {
        const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
        if (!currentTeam) {
          drainExecQueue(teamRuntimeRef.current, teamId)
          return
        }
        const prompt = buildMeetingPrompt(agent, taskPrompt, currentTeam.agents, 1)
        void sendToAgentAwaited(currentTeam, agent, prompt, files)
      })
    })

    enqueueExec(teamRuntimeRef.current, teamId, () => {
      const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
      if (currentTeam?.status === 'running') {
        storeRef.current.setTeamStatus(teamId, 'done')
      }
      drainExecQueue(teamRuntimeRef.current, teamId)
    })
  }, [language])

  const startDiscussion = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (!team || team.agents.length < 2) return

    const mode: DiscussionMode = team.mode ?? 'sequential'
    if (mode === 'parallel') return startParallel(teamId, task, files)
    if (mode === 'meeting') return startMeeting(teamId, task, files)
    return startSequential(teamId, task, files)
  }, [startMeeting, startParallel, startSequential])

  const continueDiscussion = useCallback(async (teamId: string) => {
    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (!team || team.status !== 'done') return

    resetTeamRuntimeState(teamRuntimeRef.current, teamId)
    storeRef.current.incrementRound(teamId)
    storeRef.current.setTeamStatus(teamId, 'running')

    const newRound = team.roundNumber + 1
    const mode: DiscussionMode = team.mode ?? 'sequential'

    if (mode === 'parallel') {
      const prompts = team.agents.map((agent) => buildParallelRoundPrompt(
        agent,
        team.currentTaskPrompt || team.currentTask,
        team.agents,
        newRound,
      ))
      const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
      if (!currentTeam) return
      await sendAllParallel(currentTeam, team.agents, prompts)
      if (teamsRef.current.find((candidate) => candidate.id === teamId)?.status === 'running') {
        storeRef.current.setTeamStatus(teamId, 'done')
      }
      return
    }

    if (mode === 'meeting') {
      team.agents.forEach((agent) => {
        enqueueExec(teamRuntimeRef.current, teamId, () => {
          const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
          if (!currentTeam) {
            drainExecQueue(teamRuntimeRef.current, teamId)
            return
          }
          const prompt = buildMeetingPrompt(
            agent,
            currentTeam.currentTaskPrompt || currentTeam.currentTask,
            currentTeam.agents,
            newRound,
          )
          void sendToAgentAwaited(currentTeam, agent, prompt)
        })
      })
      enqueueExec(teamRuntimeRef.current, teamId, () => {
        const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
        if (currentTeam?.status === 'running') {
          storeRef.current.setTeamStatus(teamId, 'done')
        }
        drainExecQueue(teamRuntimeRef.current, teamId)
      })
      return
    }

    team.agents.forEach((agent, index) => {
      enqueueExec(teamRuntimeRef.current, teamId, () => {
        const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
        if (!currentTeam) {
          drainExecQueue(teamRuntimeRef.current, teamId)
          return
        }
        const prior = currentTeam.agents.slice(0, index)
        const prompt = buildInitialPrompt(
          agent,
          currentTeam.currentTaskPrompt || currentTeam.currentTask,
          prior,
        )
        void sendToAgentAwaited(currentTeam, agent, prompt)
      })
    })
    enqueueExec(teamRuntimeRef.current, teamId, () => {
      const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
      if (currentTeam?.status === 'running') {
        storeRef.current.setTeamStatus(teamId, 'done')
      }
      drainExecQueue(teamRuntimeRef.current, teamId)
    })
  }, [language])

  const abortDiscussion = useCallback(async (teamId: string) => {
    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (!team) return

    clearQueuedRuntime(teamRuntimeRef.current, teamId)
    resetParallelRuntime(teamRuntimeRef.current, teamId)

    for (const agent of team.agents) {
      if (!agent.claudeSessionId) continue
      try {
        await window.claude.abort({ sessionId: agent.claudeSessionId })
      } catch {
        // Ignore abort failures and let the runtime recover on stream end.
      }
    }

    storeRef.current.setTeamStatus(teamId, 'idle')
  }, [])

  return { startDiscussion, continueDiscussion, abortDiscussion }
}
