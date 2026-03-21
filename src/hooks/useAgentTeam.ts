import { useEffect, useRef, useCallback } from 'react'
import type { SelectedFile } from '../../electron/preload'
import { useTeamStore } from '../store/teamStore'
import type { AgentTeam, TeamAgent, DiscussionMode } from '../store/teamTypes'
import { buildPromptWithAttachments, toAttachedFiles } from '../lib/attachmentPrompts'
import { translate, type AppLanguage, type TranslationKey } from '../lib/i18n'
import { resolveTeamAgentStrings } from '../lib/teamAgentPresets'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PendingAgent = {
  teamId: string
  agentId: string
  msgId: string
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentTeamStream(
  envVars: Record<string, string>,
  claudeBinaryPath?: string,
  language: AppLanguage = 'ko',
) {
  const store = useTeamStore()
  const teamsRef = useRef(store.teams)
  teamsRef.current = store.teams
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(language, key, params)

  /** claudeSessionId → agent info */
  const sessionToAgentRef = useRef<Map<string, { teamId: string; agentId: string; msgId: string }>>(new Map())

  /**
   * For SEQUENTIAL / MEETING: single pending slot (one agent at a time).
   * For PARALLEL: a FIFO queue — agents are spawned in quick succession and
   * each incoming stream-start pops the front of the queue.
   */
  const pendingQueueRef = useRef<PendingAgent[]>([])

  /** Resolve fn for the currently-awaited sendToAgent call (sequential/meeting) */
  const pendingResolveRef = useRef<(() => void) | null>(null)

  /** Sequential execution queue */
  const execQueueRef = useRef<Array<() => void>>([])
  const isRunningRef = useRef(false)

  /** How many parallel agents are still streaming (used in parallel mode) */
  const parallelPendingCountRef = useRef(0)
  const parallelDoneCallbackRef = useRef<(() => void) | null>(null)

  const storeRef = useRef(store)
  storeRef.current = store
  const envVarsRef = useRef(envVars)
  envVarsRef.current = envVars
  const claudePathRef = useRef(claudeBinaryPath)
  claudePathRef.current = claudeBinaryPath

  // ---------------------------------------------------------------------------
  // Sequential queue helpers
  // ---------------------------------------------------------------------------

  function drainExecQueue() {
    // Resolve the previous awaited sendToAgent
    const resolve = pendingResolveRef.current
    pendingResolveRef.current = null
    resolve?.()

    const next = execQueueRef.current.shift()
    if (next) {
      next()
    } else {
      isRunningRef.current = false
    }
  }

  function enqueueExec(fn: () => void) {
    execQueueRef.current.push(fn)
    if (!isRunningRef.current) {
      isRunningRef.current = true
      const next = execQueueRef.current.shift()
      next?.()
    }
  }

  // ---------------------------------------------------------------------------
  // Global Claude event listener
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const cleanup = window.claude.onClaudeEvent((event) => {
      // Map stream-start → pending agent (FIFO from pendingQueueRef)
      if (event.type === 'stream-start') {
        const pending = pendingQueueRef.current.shift()
        if (pending) {
          sessionToAgentRef.current.set(event.sessionId, {
            teamId: pending.teamId,
            agentId: pending.agentId,
            msgId: pending.msgId,
          })
          storeRef.current.setAgentClaudeSessionId(pending.teamId, pending.agentId, event.sessionId)
        }
        return
      }

      const sessionId = event.sessionId ?? ''
      const agentInfo = sessionToAgentRef.current.get(sessionId)
      if (!agentInfo) return

      const { teamId, agentId, msgId } = agentInfo

      switch (event.type) {
        case 'thinking-chunk':
          storeRef.current.appendAgentThinking(teamId, agentId, msgId, event.text)
          break

        case 'text-chunk':
          storeRef.current.appendAgentText(teamId, agentId, msgId, event.text)
          break

        case 'stream-end': {
          storeRef.current.finalizeAgentMessage(teamId, agentId)
          sessionToAgentRef.current.delete(sessionId)

          const team = teamsRef.current.find((t) => t.id === teamId)
          if (!team) break

          if (team.mode === 'parallel') {
            // Count down; when all done → trigger post-parallel callback
            parallelPendingCountRef.current -= 1
            if (parallelPendingCountRef.current <= 0) {
              parallelPendingCountRef.current = 0
              const cb = parallelDoneCallbackRef.current
              parallelDoneCallbackRef.current = null
              cb?.()
            }
          } else {
            // Sequential / meeting: drain exec queue
            drainExecQueue()
          }
          break
        }

        case 'error':
          storeRef.current.setAgentError(teamId, agentId, event.error)
          sessionToAgentRef.current.delete(sessionId)
          storeRef.current.setTeamStatus(teamId, 'error')
          isRunningRef.current = false
          pendingResolveRef.current = null
          parallelDoneCallbackRef.current = null
          break
      }
    })
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Prompt builders
  // ---------------------------------------------------------------------------

  function buildRoleHint(hint: string | null | undefined): string {
    return hint?.trim() ? `${t('team.prompt.roleHint', { hint: hint.trim() })}\n\n` : ''
  }

  function buildInitialPrompt(agent: TeamAgent, taskPrompt: string, priorAgents: TeamAgent[]): string {
    const priorResponses = priorAgents
      .map((a) => {
        const last = a.messages[a.messages.length - 1]
        if (!last?.text?.trim()) return null
        const agentCopy = resolveTeamAgentStrings(a, language)
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
    const others = allAgents.filter((a) => a.id !== agent.id)
    const responses = others
      .map((a) => {
        const last = a.messages[a.messages.length - 1]
        if (!last?.text?.trim()) return null
        const agentCopy = resolveTeamAgentStrings(a, language)
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
    const others = allAgents.filter((a) => a.id !== agent.id)

    const responses = others
      .map((a) => {
        const last = a.messages[a.messages.length - 1]
        if (!last?.text?.trim()) return null
        const agentCopy = resolveTeamAgentStrings(a, language)
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

  // ---------------------------------------------------------------------------
  // Core: send one agent's message and await completion (sequential/meeting)
  // ---------------------------------------------------------------------------

  async function sendToAgentAwaited(team: AgentTeam, agent: TeamAgent, prompt: string): Promise<void> {
    return new Promise((resolve) => {
      const msgId = storeRef.current.startAgentMessage(team.id, agent.id)
      pendingQueueRef.current.push({ teamId: team.id, agentId: agent.id, msgId })
      pendingResolveRef.current = resolve

      void window.claude.sendMessage({
        sessionId: agent.claudeSessionId,
        prompt,
        cwd: team.cwd,
        permissionMode: 'bypassPermissions',
        envVars: envVarsRef.current,
        ...(claudePathRef.current ? { claudePath: claudePathRef.current } : {}),
      }).catch((err) => {
        storeRef.current.setAgentError(team.id, agent.id, String(err))
        storeRef.current.setTeamStatus(team.id, 'error')
        pendingQueueRef.current = pendingQueueRef.current.filter(
          (p) => !(p.teamId === team.id && p.agentId === agent.id),
        )
        pendingResolveRef.current = null
        resolve()
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Core: fire all agents simultaneously (parallel)
  // ---------------------------------------------------------------------------

  async function sendAllParallel(team: AgentTeam, agents: TeamAgent[], prompts: string[]): Promise<void> {
    return new Promise((resolve) => {
      parallelPendingCountRef.current = agents.length
      parallelDoneCallbackRef.current = resolve

      agents.forEach((agent, i) => {
        const msgId = storeRef.current.startAgentMessage(team.id, agent.id)
        pendingQueueRef.current.push({ teamId: team.id, agentId: agent.id, msgId })

        void window.claude.sendMessage({
          sessionId: agent.claudeSessionId,
          prompt: prompts[i],
          cwd: team.cwd,
          permissionMode: 'bypassPermissions',
          envVars: envVarsRef.current,
          ...(claudePathRef.current ? { claudePath: claudePathRef.current } : {}),
        }).catch((err) => {
          storeRef.current.setAgentError(team.id, agent.id, String(err))
          parallelPendingCountRef.current -= 1
          if (parallelPendingCountRef.current <= 0) {
            parallelDoneCallbackRef.current = null
            resolve()
          }
        })
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const startSequential = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((t) => t.id === teamId)
    if (!team) return
    const taskPrompt = buildPromptWithAttachments(task, files, language)
    storeRef.current.setTeamTask(teamId, task, taskPrompt, toAttachedFiles(files))
    storeRef.current.setTeamStatus(teamId, 'running')

    const agents = team.agents
    agents.forEach((agent, index) => {
      enqueueExec(() => {
        const currentTeam = teamsRef.current.find((t) => t.id === teamId)!
        const prior = currentTeam.agents.slice(0, index)
        const prompt = buildInitialPrompt(agent, taskPrompt, prior)
        void sendToAgentAwaited(currentTeam, agent, prompt)
      })
    })
    enqueueExec(() => {
      storeRef.current.setTeamStatus(teamId, 'done')
      drainExecQueue()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  const startParallel = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((t) => t.id === teamId)
    if (!team) return
    const taskPrompt = buildPromptWithAttachments(task, files, language)
    storeRef.current.setTeamTask(teamId, task, taskPrompt, toAttachedFiles(files))
    storeRef.current.setTeamStatus(teamId, 'running')

    const agents = team.agents
    const prompts = agents.map((a) => buildParallelPrompt(a, taskPrompt))
    await sendAllParallel(team, agents, prompts)
    storeRef.current.setTeamStatus(teamId, 'done')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  const startMeeting = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((t) => t.id === teamId)
    if (!team) return
    const taskPrompt = buildPromptWithAttachments(task, files, language)
    storeRef.current.setTeamTask(teamId, task, taskPrompt, toAttachedFiles(files))
    storeRef.current.setTeamStatus(teamId, 'running')

    const agents = team.agents
    agents.forEach((agent) => {
      enqueueExec(() => {
        const currentTeam = teamsRef.current.find((t) => t.id === teamId)!
        const prompt = buildMeetingPrompt(agent, taskPrompt, currentTeam.agents, 1)
        void sendToAgentAwaited(currentTeam, agent, prompt)
      })
    })
    enqueueExec(() => {
      storeRef.current.setTeamStatus(teamId, 'done')
      drainExecQueue()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  const startDiscussion = useCallback(async (teamId: string, task: string, files: SelectedFile[] = []) => {
    const team = teamsRef.current.find((t) => t.id === teamId)
    if (!team || team.agents.length < 2) return
    const mode: DiscussionMode = team.mode ?? 'sequential'
    if (mode === 'parallel') return startParallel(teamId, task, files)
    if (mode === 'meeting') return startMeeting(teamId, task, files)
    return startSequential(teamId, task, files)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSequential, startParallel, startMeeting])

  const continueDiscussion = useCallback(async (teamId: string) => {
    const team = teamsRef.current.find((t) => t.id === teamId)
    if (!team || team.status !== 'done') return

    storeRef.current.incrementRound(teamId)
    storeRef.current.setTeamStatus(teamId, 'running')

    const newRound = team.roundNumber + 1
    const agents = team.agents
    const mode: DiscussionMode = team.mode ?? 'sequential'

    if (mode === 'parallel') {
      const prompts = agents.map((a) => buildParallelRoundPrompt(
        a,
        team.currentTaskPrompt || team.currentTask,
        agents,
        newRound,
      ))
      const currentTeam = teamsRef.current.find((t) => t.id === teamId)!
      await sendAllParallel(currentTeam, agents, prompts)
      storeRef.current.setTeamStatus(teamId, 'done')
    } else if (mode === 'meeting') {
      agents.forEach((agent) => {
        enqueueExec(() => {
          const currentTeam = teamsRef.current.find((t) => t.id === teamId)!
          const prompt = buildMeetingPrompt(
            agent,
            currentTeam.currentTaskPrompt || currentTeam.currentTask,
            currentTeam.agents,
            newRound,
          )
          void sendToAgentAwaited(currentTeam, agent, prompt)
        })
      })
      enqueueExec(() => {
        storeRef.current.setTeamStatus(teamId, 'done')
        drainExecQueue()
      })
    } else {
      agents.forEach((agent, index) => {
        enqueueExec(() => {
          const currentTeam = teamsRef.current.find((t) => t.id === teamId)!
          const prior = currentTeam.agents.slice(0, index)
          const prompt = buildInitialPrompt(agent, currentTeam.currentTaskPrompt || currentTeam.currentTask, prior)
          void sendToAgentAwaited(currentTeam, agent, prompt)
        })
      })
      enqueueExec(() => {
        storeRef.current.setTeamStatus(teamId, 'done')
        drainExecQueue()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const abortDiscussion = useCallback(async (teamId: string) => {
    const team = teamsRef.current.find((t) => t.id === teamId)
    if (!team) return

    execQueueRef.current = []
    isRunningRef.current = false
    pendingQueueRef.current = []
    pendingResolveRef.current = null
    parallelPendingCountRef.current = 0
    parallelDoneCallbackRef.current = null

    for (const agent of team.agents) {
      if (agent.claudeSessionId) {
        try { await window.claude.abort({ sessionId: agent.claudeSessionId }) } catch { /* ignore */ }
      }
    }
    storeRef.current.setTeamStatus(teamId, 'idle')
  }, [])

  return { startDiscussion, continueDiscussion, abortDiscussion }
}
