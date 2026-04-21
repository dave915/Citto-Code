import { getIntlLocale, translate, type AppLanguage } from '../../lib/i18n'
import type { Workflow, WorkflowConditionOperator, WorkflowExecutionStatus, WorkflowStep } from '../../store/workflowTypes'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export function formatWorkflowDateTime(value: number | null, language: AppLanguage = 'ko') {
  if (!value) return translate(language, 'workflow.date.notScheduled')
  return new Date(value).toLocaleString(getIntlLocale(language), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatWorkflowRelativeTime(value: number | null, language: AppLanguage = 'ko') {
  if (!value) return translate(language, 'workflow.date.notScheduled')
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000))
  if (deltaSeconds < 60) return language === 'ko' ? '방금' : 'now'

  const deltaMinutes = Math.floor(deltaSeconds / 60)
  if (deltaMinutes < 60) return language === 'ko' ? `${deltaMinutes}분` : `${deltaMinutes}m`

  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) return language === 'ko' ? `${deltaHours}시간` : `${deltaHours}h`

  const deltaDays = Math.floor(deltaHours / 24)
  if (deltaDays < 7) return language === 'ko' ? `${deltaDays}일` : `${deltaDays}d`

  const deltaWeeks = Math.floor(deltaDays / 7)
  if (deltaWeeks < 5) return language === 'ko' ? `${deltaWeeks}주` : `${deltaWeeks}w`

  return new Date(value).toLocaleDateString(getIntlLocale(language), {
    month: 'short',
    day: 'numeric',
  })
}

export function describeWorkflowTrigger(workflow: Workflow, language: AppLanguage = 'ko') {
  const { trigger } = workflow
  if (trigger.type === 'manual') return translate(language, 'workflow.frequency.summary.manual')
  if (trigger.frequency === 'hourly') {
    return translate(language, 'workflow.frequency.summary.hourly', { minute: trigger.minute })
  }
  if (trigger.frequency === 'daily') {
    return translate(language, 'workflow.frequency.summary.daily', {
      hour: trigger.hour,
      minute: trigger.minute,
    })
  }
  if (trigger.frequency === 'weekdays') {
    return translate(language, 'workflow.frequency.summary.weekdays', {
      hour: trigger.hour,
      minute: trigger.minute,
    })
  }
  const dayKey = DAY_KEYS[trigger.dayOfWeek] ?? 'sun'
  return translate(language, 'workflow.frequency.summary.weekly', {
    day: translate(language, `scheduled.day.${dayKey}.label`),
    hour: trigger.hour,
    minute: trigger.minute,
  })
}

export function getWorkflowExecutionStatusLabel(status: WorkflowExecutionStatus, language: AppLanguage = 'ko') {
  return translate(language, `workflow.status.${status}`)
}

export function getWorkflowExecutionStatusClassName(status: WorkflowExecutionStatus) {
  if (status === 'running') return 'bg-sky-500/15 text-sky-200'
  if (status === 'done') return 'bg-emerald-500/15 text-emerald-200'
  if (status === 'error') return 'bg-red-500/15 text-red-200'
  return 'bg-amber-500/15 text-amber-200'
}

export function getWorkflowStepTypeLabel(step: WorkflowStep, language: AppLanguage = 'ko') {
  return translate(language, `workflow.step.${step.type}`)
}

export function getConditionOperatorLabel(operator: WorkflowConditionOperator, language: AppLanguage = 'ko') {
  return translate(language, `workflow.operator.${operator}`)
}

export function getStepDisplayLabel(step: WorkflowStep, index: number, language: AppLanguage = 'ko') {
  const label = step.label.trim()
  if (label) return label
  return translate(language, 'workflow.form.untitledStep', { index: index + 1 })
}

export function truncateWorkflowOutput(value: string, maxLength = 320) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}
