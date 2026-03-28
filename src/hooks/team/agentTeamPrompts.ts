import type { AppLanguage, TranslationKey } from '../../lib/i18n'
import { resolveTeamAgentStrings } from '../../lib/teamAgentPresets'
import type { TeamAgent } from '../../store/teamTypes'

type TeamPromptTranslate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string

export function createAgentTeamPromptBuilder(
  language: AppLanguage,
  t: TeamPromptTranslate,
) {
  function buildRoleHint(hint: string | null | undefined): string {
    return hint?.trim() ? `${t('team.prompt.roleHint', { hint: hint.trim() })}\n\n` : ''
  }

  function buildRoundResponses(agents: TeamAgent[], round: number) {
    return agents
      .map((agent) => {
        const last = agent.messages[agent.messages.length - 1]
        if (!last?.text?.trim()) return null
        const agentCopy = resolveTeamAgentStrings(agent, language)
        return t('team.prompt.agentRoundView', {
          name: agentCopy.name,
          role: agentCopy.role,
          round: Math.max(1, round - 1),
          text: last.text.trim(),
        })
      })
      .filter(Boolean)
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

  function buildParallelRoundPrompt(
    agent: TeamAgent,
    taskPrompt: string,
    allAgents: TeamAgent[],
    round: number,
  ): string {
    const responses = buildRoundResponses(
      allAgents.filter((item) => item.id !== agent.id),
      round,
    )

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

  function buildMeetingPrompt(
    agent: TeamAgent,
    taskPrompt: string,
    allAgents: TeamAgent[],
    round: number,
  ): string {
    const agentCopy = resolveTeamAgentStrings(agent, language)
    const others = allAgents.filter((item) => item.id !== agent.id)
    const responses = buildRoundResponses(others, round)
    let prompt = buildRoleHint(agentCopy.systemPrompt)
    prompt += `${t('team.prompt.topicHeading')}\n${taskPrompt}\n\n`

    if (round === 1) {
      prompt += t('team.prompt.meetingOpening', {
        name: agentCopy.name,
        role: agentCopy.role,
      })
      return prompt
    }

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
    return prompt
  }

  return {
    buildInitialPrompt,
    buildParallelPrompt,
    buildParallelRoundPrompt,
    buildMeetingPrompt,
  }
}
