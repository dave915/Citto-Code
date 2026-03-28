import { useCallback, useEffect, useRef } from 'react'
import type { SelectedFile } from '../../electron/preload'
import { buildPromptWithAttachments, toAttachedFiles } from '../lib/attachmentPrompts'
import { resolveEnvVarsForModel } from '../lib/claudeRuntime'
import { translate, type AppLanguage, type TranslationKey } from '../lib/i18n'
import { nanoid } from '../store/nanoid'
import { useTeamStore } from '../store/teamStore'
import type { AgentTeam, DiscussionMode, TeamAgent } from '../store/teamTypes'
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

  function getTeamById(teamId: string) {
    return teamsRef.current.find((candidate) => candidate.id === teamId) ?? null
  }

  function markTeamDoneIfRunning(teamId: string) {
    if (getTeamById(teamId)?.status === 'running') {
      storeRef.current.setTeamStatus(teamId, 'done')
    }
  }

  function failTeam(teamId: string, agentId: string, error: string, requestId?: string, sessionId?: string | null) {
    storeRef.current.setAgentError(teamId, agentId, error)
    storeRef.current.setTeamStatus(teamId, 'error')

    clearQueuedRuntime(teamRuntimeRef.current, teamId)

    const team = getTeamById(teamId)
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

          if (getTeamById(teamId)?.mode === 'parallel') {
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

  function dispatchAgentPrompt(
    team: AgentTeam,
    agent: TeamAgent,
    prompt: string,
    attachments?: SelectedFile[],
    onQueuedResolve?: () => void,
  ) {
    const runtime = getTeamRuntime(teamRuntimeRef.current, team.id)
    const msgId = storeRef.current.startAgentMessage(team.id, agent.id)
    const requestId = nanoid()
    const context: AgentStreamContext = createAgentStreamContext(team.id, agent.id, msgId, requestId)

    requestToAgentRef.current.set(requestId, context)
    if (agent.claudeSessionId) {
      sessionToAgentRef.current.set(agent.claudeSessionId, context)
    }

    if (onQueuedResolve) {
      runtime.pendingResolve = onQueuedResolve
    }

    void window.claude.sendMessage({
      sessionId: agent.claudeSessionId,
      prompt,
      attachments,
      cwd: team.cwd,
      requestId,
      permissionMode: 'bypassPermissions',
      model: agent.model ?? undefined,
      envVars: resolveEnvVarsForModel(agent.model, envVarsRef.current),
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
  }

  async function sendToAgentAwaited(
    team: AgentTeam,
    agent: TeamAgent,
    prompt: string,
    attachments?: SelectedFile[],
  ): Promise<void> {
    return new Promise((resolve) => {
      dispatchAgentPrompt(team, agent, prompt, attachments, resolve)
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
        dispatchAgentPrompt(team, agent, prompts[index], attachments)
      })
    })
  }

  function prepareInitialTurn(teamId: string, task: string, files: SelectedFile[] = []) {
    const team = getTeamById(teamId)
    if (!team) return null

    resetTeamRuntimeState(teamRuntimeRef.current, teamId)
    const taskPrompt = buildPromptWithAttachments(task, files, language)
    storeRef.current.setTeamTask(teamId, task, taskPrompt, toAttachedFiles(files))
    storeRef.current.setTeamStatus(teamId, 'running')

    return { team, taskPrompt }
  }

  function enqueueQueuedTurn(
    teamId: string,
    agents: TeamAgent[],
    buildPrompt: (team: AgentTeam, agent: TeamAgent, index: number) => string,
    attachments?: SelectedFile[],
  ) {
    agents.forEach((agent, index) => {
      enqueueExec(teamRuntimeRef.current, teamId, () => {
        const currentTeam = getTeamById(teamId)
        if (!currentTeam) {
          drainExecQueue(teamRuntimeRef.current, teamId)
          return
        }

        void sendToAgentAwaited(currentTeam, agent, buildPrompt(currentTeam, agent, index), attachments)
      })
    })

    enqueueExec(teamRuntimeRef.current, teamId, () => {
      markTeamDoneIfRunning(teamId)
      drainExecQueue(teamRuntimeRef.current, teamId)
    })
  }

  async function runParallelTurn(
    team: AgentTeam,
    prompts: string[],
    attachments?: SelectedFile[],
  ) {
    await sendAllParallel(team, team.agents, prompts, attachments)
    markTeamDoneIfRunning(team.id)
  }

  function prepareContinuation(teamId: string) {
    const team = getTeamById(teamId)
    if (!team || team.status !== 'done') return null

    resetTeamRuntimeState(teamRuntimeRef.current, teamId)
    storeRef.current.incrementRound(teamId)
    storeRef.current.setTeamStatus(teamId, 'running')

    return {
      mode: team.mode ?? 'sequential',
      newRound: team.roundNumber + 1,
      taskPrompt: team.currentTaskPrompt || team.currentTask,
      team,
    }
  }

  const startSequential = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const prepared = prepareInitialTurn(teamId, task, files)
    if (!prepared) return

    enqueueQueuedTurn(
      teamId,
      prepared.team.agents,
      (currentTeam, agent, index) => {
        const prior = currentTeam.agents.slice(0, index)
        return buildInitialPrompt(agent, prepared.taskPrompt, prior)
      },
      files,
    )
  }, [buildInitialPrompt, language])

  const startParallel = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const prepared = prepareInitialTurn(teamId, task, files)
    if (!prepared) return

    const prompts = prepared.team.agents.map((agent) => buildParallelPrompt(agent, prepared.taskPrompt))
    await runParallelTurn(prepared.team, prompts, files)
  }, [buildParallelPrompt, language])

  const startMeeting = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const prepared = prepareInitialTurn(teamId, task, files)
    if (!prepared) return

    enqueueQueuedTurn(
      teamId,
      prepared.team.agents,
      (currentTeam, agent) => buildMeetingPrompt(agent, prepared.taskPrompt, currentTeam.agents, 1),
      files,
    )
  }, [buildMeetingPrompt, language])

  const startDiscussion = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = getTeamById(teamId)
    if (!team || team.agents.length < 2) return

    const mode: DiscussionMode = team.mode ?? 'sequential'
    if (mode === 'parallel') return startParallel(teamId, task, files)
    if (mode === 'meeting') return startMeeting(teamId, task, files)
    return startSequential(teamId, task, files)
  }, [startMeeting, startParallel, startSequential])

  const continueDiscussion = useCallback(async (teamId: string) => {
    const continuation = prepareContinuation(teamId)
    if (!continuation) return

    if (continuation.mode === 'parallel') {
      const currentTeam = getTeamById(teamId)
      if (!currentTeam) return

      const prompts = currentTeam.agents.map((agent) => buildParallelRoundPrompt(
        agent,
        continuation.taskPrompt,
        currentTeam.agents,
        continuation.newRound,
      ))
      await runParallelTurn(currentTeam, prompts)
      return
    }

    if (continuation.mode === 'meeting') {
      enqueueQueuedTurn(
        teamId,
        continuation.team.agents,
        (currentTeam, agent) => buildMeetingPrompt(
          agent,
          currentTeam.currentTaskPrompt || currentTeam.currentTask,
          currentTeam.agents,
          continuation.newRound,
        ),
      )
      return
    }

    enqueueQueuedTurn(
      teamId,
      continuation.team.agents,
      (currentTeam, agent, index) => {
        const prior = currentTeam.agents.slice(0, index)
        return buildInitialPrompt(
          agent,
          currentTeam.currentTaskPrompt || currentTeam.currentTask,
          prior,
        )
      },
    )
  }, [buildInitialPrompt, buildMeetingPrompt, buildParallelRoundPrompt])

  const abortDiscussion = useCallback(async (teamId: string) => {
    const team = getTeamById(teamId)
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
