import { useCallback, useEffect, useRef } from 'react'
import type { SelectedFile } from '../../electron/preload'
import { buildPromptWithAttachments, toAttachedFiles } from '../lib/attachmentPrompts'
import { translate, type AppLanguage, type TranslationKey } from '../lib/i18n'
import { resolveTeamAgentStrings } from '../lib/teamAgentPresets'
import { nanoid } from '../store/nanoid'
import { useTeamStore } from '../store/teamStore'
import type { AgentTeam, DiscussionMode, TeamAgent } from '../store/teamTypes'

type AgentStreamContext = {
  teamId: string
  agentId: string
  msgId: string
  requestId: string
}

type TeamRuntime = {
  execQueue: Array<() => void>
  isQueueRunning: boolean
  pendingResolve: (() => void) | null
  parallelPendingCount: number
  parallelDoneCallback: (() => void) | null
}

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

  const storeRef = useRef(store)
  storeRef.current = store
  const envVarsRef = useRef(envVars)
  envVarsRef.current = envVars
  const claudePathRef = useRef(claudeBinaryPath)
  claudePathRef.current = claudeBinaryPath

  function getTeamRuntime(teamId: string): TeamRuntime {
    const existing = teamRuntimeRef.current.get(teamId)
    if (existing) return existing

    const created: TeamRuntime = {
      execQueue: [],
      isQueueRunning: false,
      pendingResolve: null,
      parallelPendingCount: 0,
      parallelDoneCallback: null,
    }
    teamRuntimeRef.current.set(teamId, created)
    return created
  }

  function resetTeamRuntimeState(teamId: string) {
    const runtime = getTeamRuntime(teamId)
    runtime.execQueue = []
    runtime.isQueueRunning = false
    runtime.pendingResolve = null
    runtime.parallelPendingCount = 0
    runtime.parallelDoneCallback = null
  }

  function deleteIfMatches(
    map: Map<string, AgentStreamContext>,
    key: string | null | undefined,
    context: AgentStreamContext,
  ) {
    if (!key) return
    const current = map.get(key)
    if (!current) return
    if (
      current.teamId === context.teamId
      && current.agentId === context.agentId
      && current.msgId === context.msgId
      && current.requestId === context.requestId
    ) {
      map.delete(key)
    }
  }

  function clearContextMappings(
    context: AgentStreamContext,
    sessionId?: string | null,
    requestId?: string,
  ) {
    deleteIfMatches(requestToAgentRef.current, requestId ?? context.requestId, context)
    deleteIfMatches(sessionToAgentRef.current, sessionId, context)
  }

  function resolveAgentContext(sessionId?: string | null, requestId?: string): AgentStreamContext | null {
    if (sessionId) {
      const mapped = sessionToAgentRef.current.get(sessionId)
      if (mapped) return mapped
    }
    if (requestId) {
      return requestToAgentRef.current.get(requestId) ?? null
    }
    return null
  }

  function settleParallelTeam(teamId: string) {
    const runtime = getTeamRuntime(teamId)
    runtime.parallelPendingCount -= 1
    if (runtime.parallelPendingCount <= 0) {
      runtime.parallelPendingCount = 0
      const callback = runtime.parallelDoneCallback
      runtime.parallelDoneCallback = null
      callback?.()
    }
  }

  function drainExecQueue(teamId: string) {
    const runtime = getTeamRuntime(teamId)
    const resolve = runtime.pendingResolve
    runtime.pendingResolve = null
    resolve?.()

    const next = runtime.execQueue.shift()
    if (next) {
      next()
    } else {
      runtime.isQueueRunning = false
    }
  }

  function enqueueExec(teamId: string, fn: () => void) {
    const runtime = getTeamRuntime(teamId)
    runtime.execQueue.push(fn)
    if (!runtime.isQueueRunning) {
      runtime.isQueueRunning = true
      const next = runtime.execQueue.shift()
      next?.()
    }
  }

  function failTeam(teamId: string, agentId: string, error: string, requestId?: string, sessionId?: string | null) {
    storeRef.current.setAgentError(teamId, agentId, error)
    storeRef.current.setTeamStatus(teamId, 'error')

    const runtime = getTeamRuntime(teamId)
    runtime.execQueue = []
    runtime.isQueueRunning = false

    const resolve = runtime.pendingResolve
    runtime.pendingResolve = null
    resolve?.()

    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (team?.mode === 'parallel' && (requestId || sessionId)) {
      settleParallelTeam(teamId)
    } else {
      runtime.parallelPendingCount = 0
      runtime.parallelDoneCallback = null
    }
  }

  useEffect(() => {
    const cleanup = window.claude.onClaudeEvent((event) => {
      if (event.type === 'stream-start') {
        const context = resolveAgentContext(event.sessionId, event.requestId)
        if (!context) return

        sessionToAgentRef.current.set(event.sessionId, context)
        deleteIfMatches(requestToAgentRef.current, event.requestId, context)
        storeRef.current.setAgentClaudeSessionId(context.teamId, context.agentId, event.sessionId)
        return
      }

      const context = resolveAgentContext(event.sessionId ?? null, event.requestId)
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
          clearContextMappings(context, event.sessionId, event.requestId)

          const team = teamsRef.current.find((candidate) => candidate.id === teamId)
          if (!team) break

          if (team.mode === 'parallel') {
            settleParallelTeam(teamId)
          } else {
            drainExecQueue(teamId)
          }
          break
        }

        case 'error':
          clearContextMappings(context, event.sessionId, event.requestId)
          failTeam(teamId, agentId, event.error, event.requestId, event.sessionId)
          break
      }
    })

    return cleanup
  }, [])

  function buildRoleHint(hint: string | null | undefined): string {
    return hint?.trim() ? `${t('team.prompt.roleHint', { hint: hint.trim() })}\n\n` : ''
  }

  function buildInitialPrompt(agent: TeamAgent, taskPrompt: string, priorAgents: TeamAgent[]): string {
    const priorResponses = priorAgents
      .map((item) => {
        const last = item.messages[item.messages.length - 1]
        if (!last?.text?.trim()) return null
        const agentCopy = resolveTeamAgentStrings(item, language)
        return t('team.prompt.agentView', {
          name: agentCopy.name,
          role: agentCopy.role,
          text: last.text.trim(),
        })
      })
      .filter(Boolean)

    const agentCopy = resolveTeamAgentStrings(agent, language)
    let prompt = buildRoleHint(agentCopy.systemPrompt)
    prompt += `${t('team.prompt.taskHeading')}\n${taskPrompt}\n`

    if (priorResponses.length > 0) {
      prompt += `\n${t('team.prompt.otherResponsesHeading')}\n${priorResponses.join('\n\n')}`
      prompt += `\n\n${t('team.prompt.sequentialInstructions', {
        name: agentCopy.name,
        role: agentCopy.role,
      })}`
    }
    return prompt
  }

  function buildParallelPrompt(agent: TeamAgent, taskPrompt: string): string {
    const agentCopy = resolveTeamAgentStrings(agent, language)
    let prompt = buildRoleHint(agentCopy.systemPrompt)
    prompt += `${t('team.prompt.taskHeading')}\n${taskPrompt}\n\n`
    prompt += t('team.prompt.parallelInstructions', {
      name: agentCopy.name,
      role: agentCopy.role,
    })
    return prompt
  }

  function buildParallelRoundPrompt(agent: TeamAgent, taskPrompt: string, allAgents: TeamAgent[], round: number): string {
    const others = allAgents.filter((item) => item.id !== agent.id)
    const responses = others
      .map((item) => {
        const last = item.messages[item.messages.length - 1]
        if (!last?.text?.trim()) return null
        const agentCopy = resolveTeamAgentStrings(item, language)
        return t('team.prompt.agentRoundView', {
          name: agentCopy.name,
          role: agentCopy.role,
          round: Math.max(1, round - 1),
          text: last.text.trim(),
        })
      })
      .filter(Boolean)

    const agentCopy = resolveTeamAgentStrings(agent, language)
    let prompt = buildRoleHint(agentCopy.systemPrompt)
    prompt += `${t('team.prompt.originalTaskHeading')}\n${taskPrompt}\n\n`
    prompt += `${t('team.prompt.parallelRoundHeading', { round })}\n`
    if (responses.length > 0) {
      prompt += responses.join('\n\n')
      prompt += `\n\n${t('team.prompt.parallelRoundInstructions')}`
    }
    return prompt
  }

  function buildMeetingPrompt(agent: TeamAgent, taskPrompt: string, allAgents: TeamAgent[], round: number): string {
    const isFirst = round === 1
    const others = allAgents.filter((item) => item.id !== agent.id)

    const responses = others
      .map((item) => {
        const last = item.messages[item.messages.length - 1]
        if (!last?.text?.trim()) return null
        const agentCopy = resolveTeamAgentStrings(item, language)
        return t('team.prompt.agentRoundView', {
          name: agentCopy.name,
          role: agentCopy.role,
          round: Math.max(1, round - 1),
          text: last.text.trim(),
        })
      })
      .filter(Boolean)

    const agentCopy = resolveTeamAgentStrings(agent, language)
    let prompt = buildRoleHint(agentCopy.systemPrompt)
    prompt += `${t('team.prompt.topicHeading')}\n${taskPrompt}\n\n`

    if (isFirst) {
      prompt += t('team.prompt.meetingOpening', {
        name: agentCopy.name,
        role: agentCopy.role,
      })
    } else {
      prompt += `${t('team.prompt.meetingContinueHeading', { round })}\n`
      if (responses.length > 0) {
        prompt += `${t('team.prompt.otherParticipantsSaidHeading')}\n\n${responses.join('\n\n')}\n\n`
      }
      prompt += `${t('team.prompt.meetingRespondAs', {
        name: agentCopy.name,
        role: agentCopy.role,
      })}\n`
      prompt += `${t('team.prompt.meetingBulletAgree')}\n`
      prompt += `${t('team.prompt.meetingBulletNewAngles')}\n`
      if (round >= 3) {
        prompt += t('team.prompt.meetingBulletConclusion')
      }
    }
    return prompt
  }

  async function sendToAgentAwaited(
    team: AgentTeam,
    agent: TeamAgent,
    prompt: string,
    attachments?: SelectedFile[],
  ): Promise<void> {
    return new Promise((resolve) => {
      const runtime = getTeamRuntime(team.id)
      const msgId = storeRef.current.startAgentMessage(team.id, agent.id)
      const requestId = nanoid()
      const context: AgentStreamContext = {
        teamId: team.id,
        agentId: agent.id,
        msgId,
        requestId,
      }

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
        clearContextMappings(context, agent.claudeSessionId, requestId)
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
      const runtime = getTeamRuntime(team.id)
      runtime.parallelPendingCount = agents.length
      runtime.parallelDoneCallback = resolve

      agents.forEach((agent, index) => {
        const msgId = storeRef.current.startAgentMessage(team.id, agent.id)
        const requestId = nanoid()
        const context: AgentStreamContext = {
          teamId: team.id,
          agentId: agent.id,
          msgId,
          requestId,
        }

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
          clearContextMappings(context, agent.claudeSessionId, requestId)
          failTeam(team.id, agent.id, String(error), requestId, agent.claudeSessionId)
        })
      })
    })
  }

  const startSequential = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (!team) return

    resetTeamRuntimeState(teamId)
    const taskPrompt = buildPromptWithAttachments(task, files, language)
    storeRef.current.setTeamTask(teamId, task, taskPrompt, toAttachedFiles(files))
    storeRef.current.setTeamStatus(teamId, 'running')

    team.agents.forEach((agent, index) => {
      enqueueExec(teamId, () => {
        const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
        if (!currentTeam) {
          drainExecQueue(teamId)
          return
        }
        const prior = currentTeam.agents.slice(0, index)
        const prompt = buildInitialPrompt(agent, taskPrompt, prior)
        void sendToAgentAwaited(currentTeam, agent, prompt, files)
      })
    })

    enqueueExec(teamId, () => {
      const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
      if (currentTeam?.status === 'running') {
        storeRef.current.setTeamStatus(teamId, 'done')
      }
      drainExecQueue(teamId)
    })
  }, [language])

  const startParallel = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (!team) return

    resetTeamRuntimeState(teamId)
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

    resetTeamRuntimeState(teamId)
    const taskPrompt = buildPromptWithAttachments(task, files, language)
    storeRef.current.setTeamTask(teamId, task, taskPrompt, toAttachedFiles(files))
    storeRef.current.setTeamStatus(teamId, 'running')

    team.agents.forEach((agent) => {
      enqueueExec(teamId, () => {
        const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
        if (!currentTeam) {
          drainExecQueue(teamId)
          return
        }
        const prompt = buildMeetingPrompt(agent, taskPrompt, currentTeam.agents, 1)
        void sendToAgentAwaited(currentTeam, agent, prompt, files)
      })
    })

    enqueueExec(teamId, () => {
      const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
      if (currentTeam?.status === 'running') {
        storeRef.current.setTeamStatus(teamId, 'done')
      }
      drainExecQueue(teamId)
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

    resetTeamRuntimeState(teamId)
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
        enqueueExec(teamId, () => {
          const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
          if (!currentTeam) {
            drainExecQueue(teamId)
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
      enqueueExec(teamId, () => {
        const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
        if (currentTeam?.status === 'running') {
          storeRef.current.setTeamStatus(teamId, 'done')
        }
        drainExecQueue(teamId)
      })
      return
    }

    team.agents.forEach((agent, index) => {
      enqueueExec(teamId, () => {
        const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
        if (!currentTeam) {
          drainExecQueue(teamId)
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
    enqueueExec(teamId, () => {
      const currentTeam = teamsRef.current.find((candidate) => candidate.id === teamId)
      if (currentTeam?.status === 'running') {
        storeRef.current.setTeamStatus(teamId, 'done')
      }
      drainExecQueue(teamId)
    })
  }, [language])

  const abortDiscussion = useCallback(async (teamId: string) => {
    const team = teamsRef.current.find((candidate) => candidate.id === teamId)
    if (!team) return

    const runtime = getTeamRuntime(teamId)
    runtime.execQueue = []
    runtime.isQueueRunning = false
    const resolve = runtime.pendingResolve
    runtime.pendingResolve = null
    resolve?.()
    runtime.parallelPendingCount = 0
    runtime.parallelDoneCallback = null

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
