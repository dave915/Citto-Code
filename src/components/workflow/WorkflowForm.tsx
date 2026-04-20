import { useMemo, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type {
  Workflow,
  WorkflowConditionOperator,
  WorkflowInput,
  WorkflowStep,
  WorkflowTriggerFrequency,
} from '../../store/workflowTypes'
import { ScheduledTaskSelect } from '../scheduledTaskForm/ScheduledTaskSelect'
import {
  CONDITION_OPERATORS,
  createAgentStep,
  createStepByType,
  workflowToInput,
} from './editorShared'
import { getConditionOperatorLabel, getStepDisplayLabel } from './utils'
import { AppButton, AppSwitch, appFieldClassName, cx } from '../ui/appDesignSystem'

type Props = {
  initialWorkflow?: Workflow | null
  defaultProjectPath: string
  onCancel: () => void
  onSubmit: (input: WorkflowInput) => void
}

const DAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export function WorkflowForm({
  initialWorkflow,
  defaultProjectPath,
  onCancel,
  onSubmit,
}: Props) {
  const { language, t } = useI18n()
  const [draft, setDraft] = useState<WorkflowInput>(() => buildInitialWorkflow(initialWorkflow, defaultProjectPath))
  const [error, setError] = useState<string | null>(null)

  const stepOptions = useMemo(
    () => draft.steps.map((step, index) => ({
      id: step.id,
      label: getStepDisplayLabel(step, index, language),
      type: step.type,
    })),
    [draft.steps, language],
  )

  const agentStepOptions = stepOptions.filter((step) => step.type === 'agent')

  const updateStep = (index: number, updater: (step: WorkflowStep) => WorkflowStep) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => (stepIndex === index ? updater(step) : step)),
    }))
  }

  const addStep = (type: WorkflowStep['type']) => {
    setDraft((current) => ({
      ...current,
      steps: [
        ...current.steps,
        createStepByType(type, defaultProjectPath),
      ],
    }))
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.steps.length) return current
      const nextSteps = [...current.steps]
      const [moved] = nextSteps.splice(index, 1)
      nextSteps.splice(nextIndex, 0, moved)
      return { ...current, steps: nextSteps }
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!draft.name.trim()) {
      setError(t('workflow.form.validation.name'))
      return
    }

    if (draft.steps.length === 0) {
      setError(t('workflow.form.validation.steps'))
      return
    }

    for (const step of draft.steps) {
      if (step.type !== 'agent') continue
      if (!step.cwd.trim()) {
        setError(t('workflow.form.validation.agentCwd'))
        return
      }
      if (!step.prompt.trim()) {
        setError(t('workflow.form.validation.agentPrompt'))
        return
      }
    }

    const stepIds = new Set(draft.steps.map((step) => step.id))
    const normalizedInput: WorkflowInput = {
      ...draft,
      name: draft.name.trim(),
      active: draft.trigger.type === 'schedule' ? draft.active : false,
      steps: draft.steps.map((step) => {
        if (step.type === 'agent') {
          return {
            ...step,
            label: step.label.trim(),
            cwd: step.cwd.trim() || defaultProjectPath,
            model: step.model?.trim() ? step.model.trim() : null,
            systemPrompt: step.systemPrompt,
            prompt: step.prompt,
          }
        }
        if (step.type === 'condition') {
          return {
            ...step,
            label: step.label.trim(),
            trueBranchStepId: step.trueBranchStepId && stepIds.has(step.trueBranchStepId) ? step.trueBranchStepId : null,
            falseBranchStepId: step.falseBranchStepId && stepIds.has(step.falseBranchStepId) ? step.falseBranchStepId : null,
          }
        }
        return {
          ...step,
          label: step.label.trim(),
          maxIterations: Math.max(1, Math.min(20, Math.floor(step.maxIterations))),
          bodyStepIds: step.bodyStepIds.filter((stepId) => stepIds.has(stepId)),
          breakCondition: step.breakCondition
            ? {
                operator: step.breakCondition.operator,
                value: step.breakCondition.value,
              }
            : null,
        }
      }),
    }

    setError(null)
    onSubmit(normalizedInput)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-lg border border-claude-border bg-claude-panel/90 shadow-[0_16px_36px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-claude-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-claude-text">
            {initialWorkflow ? t('workflow.form.editTitle') : t('workflow.form.addTitle')}
          </h2>
          <p className="mt-1 text-sm text-claude-muted">{t('workflow.form.description')}</p>
        </div>
        <AppButton onClick={onCancel} tone="ghost">
          {t('workflow.form.cancel')}
        </AppButton>
      </div>

      <div className="max-h-[85vh] space-y-6 overflow-y-auto px-5 py-5">
        <section className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.name')}</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder={t('workflow.form.namePlaceholder')}
              className={`${appFieldClassName} h-10 bg-claude-bg`}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.triggerType')}</span>
            <ScheduledTaskSelect
              value={draft.trigger.type}
              onChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  trigger: value === 'schedule'
                    ? {
                        type: 'schedule',
                        frequency: 'daily',
                        hour: 9,
                        minute: 0,
                        dayOfWeek: 1,
                      }
                    : { type: 'manual' },
                  active: value === 'schedule' ? current.active : false,
                }))
              }}
            >
              <option value="manual">{t('workflow.trigger.manual')}</option>
              <option value="schedule">{t('workflow.trigger.schedule')}</option>
            </ScheduledTaskSelect>
          </label>

          {draft.trigger.type === 'schedule' ? (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.frequency')}</span>
                <ScheduledTaskSelect
                  value={draft.trigger.frequency}
                  onChange={(value) => {
                    setDraft((current) => (
                      current.trigger.type === 'schedule'
                        ? {
                            ...current,
                            trigger: {
                              ...current.trigger,
                              frequency: value as WorkflowTriggerFrequency,
                            },
                          }
                        : current
                    ))
                  }}
                >
                  <option value="hourly">{t('workflow.frequency.hourly')}</option>
                  <option value="daily">{t('workflow.frequency.daily')}</option>
                  <option value="weekdays">{t('workflow.frequency.weekdays')}</option>
                  <option value="weekly">{t('workflow.frequency.weekly')}</option>
                </ScheduledTaskSelect>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.active')}</span>
                <div
                  className={cx(
                    'flex min-h-[44px] items-center justify-between gap-3 rounded-lg border px-3 py-2',
                    draft.active
                      ? 'border-emerald-500/24 bg-emerald-500/10'
                      : 'border-claude-border bg-claude-bg',
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-claude-text">
                      {draft.active ? t('workflow.details.active') : t('workflow.details.inactive')}
                    </div>
                    <div className="mt-0.5 text-[11px] text-claude-muted">
                      {t('workflow.form.activeDescription')}
                    </div>
                  </div>
                  <AppSwitch
                    checked={draft.active}
                    onClick={() => setDraft((current) => ({ ...current, active: !current.active }))}
                  />
                </div>
              </label>

              {draft.trigger.frequency !== 'hourly' ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.hour')}</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={draft.trigger.hour}
                    onChange={(event) => {
                      const nextHour = Number(event.target.value)
                      setDraft((current) => (
                        current.trigger.type === 'schedule'
                          ? {
                              ...current,
                              trigger: {
                                ...current.trigger,
                                hour: Number.isFinite(nextHour) ? nextHour : 0,
                              },
                            }
                          : current
                      ))
                    }}
                    className={`${appFieldClassName} h-10 bg-claude-bg`}
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.minute')}</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={draft.trigger.minute}
                  onChange={(event) => {
                    const nextMinute = Number(event.target.value)
                    setDraft((current) => (
                      current.trigger.type === 'schedule'
                        ? {
                            ...current,
                            trigger: {
                              ...current.trigger,
                              minute: Number.isFinite(nextMinute) ? nextMinute : 0,
                            },
                          }
                        : current
                    ))
                  }}
                  className={`${appFieldClassName} h-10 bg-claude-bg`}
                />
              </label>

              {draft.trigger.frequency === 'weekly' ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.dayOfWeek')}</span>
                  <ScheduledTaskSelect
                    value={String(draft.trigger.dayOfWeek)}
                    onChange={(value) => {
                      const nextDay = Number(value)
                      setDraft((current) => (
                        current.trigger.type === 'schedule'
                          ? {
                              ...current,
                              trigger: {
                                ...current.trigger,
                                dayOfWeek: Number.isFinite(nextDay) ? nextDay : 0,
                              },
                            }
                          : current
                      ))
                    }}
                  >
                    {DAY_OPTIONS.map((dayIndex) => {
                      const dayKey = DAY_KEYS[dayIndex]
                      return (
                        <option key={dayIndex} value={String(dayIndex)}>
                          {t(`scheduled.day.${dayKey}.label`)}
                        </option>
                      )
                    })}
                  </ScheduledTaskSelect>
                </label>
              ) : null}
            </>
          ) : null}
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-claude-text">{t('workflow.form.steps')}</h3>
              <p className="mt-1 text-sm text-claude-muted">{t('workflow.form.stepsDescription')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppButton onClick={() => addStep('agent')}>
                {t('workflow.form.addAgent')}
              </AppButton>
              <AppButton onClick={() => addStep('condition')}>
                {t('workflow.form.addCondition')}
              </AppButton>
              <AppButton onClick={() => addStep('loop')}>
                {t('workflow.form.addLoop')}
              </AppButton>
            </div>
          </div>

          {draft.steps.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-claude-border bg-claude-surface/35 px-4 py-6 text-sm text-claude-muted">
              {t('workflow.form.noSteps')}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {draft.steps.map((step, index) => (
                <div key={step.id} className="rounded-lg border border-claude-border bg-claude-surface/55 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-claude-text">{getStepDisplayLabel(step, index, language)}</p>
                      <p className="mt-1 text-xs text-claude-muted">{step.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AppButton
                        onClick={() => moveStep(index, -1)}
                        disabled={index === 0}
                        className="h-7 px-2.5 text-[11px]"
                      >
                        {t('workflow.form.moveUp')}
                      </AppButton>
                      <AppButton
                        onClick={() => moveStep(index, 1)}
                        disabled={index === draft.steps.length - 1}
                        className="h-7 px-2.5 text-[11px]"
                      >
                        {t('workflow.form.moveDown')}
                      </AppButton>
                      <AppButton
                        onClick={() => {
                          setDraft((current) => ({
                            ...current,
                            steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
                          }))
                        }}
                        tone="danger"
                        className="h-7 px-2.5 text-[11px]"
                      >
                        {t('workflow.form.removeStep')}
                      </AppButton>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.stepLabel')}</span>
                      <input
                        value={step.label}
                        onChange={(event) => updateStep(index, (current) => ({ ...current, label: event.target.value }))}
                        className={`${appFieldClassName} h-10 bg-claude-bg`}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.stepType')}</span>
                      <ScheduledTaskSelect
                        value={step.type}
                        onChange={(value) => {
                          const label = step.label
                          updateStep(index, () => createStepByType(value as WorkflowStep['type'], defaultProjectPath, step.id, label))
                        }}
                      >
                        <option value="agent">{t('workflow.step.agent')}</option>
                        <option value="condition">{t('workflow.step.condition')}</option>
                        <option value="loop">{t('workflow.step.loop')}</option>
                      </ScheduledTaskSelect>
                    </label>

                    {step.type === 'agent' ? (
                      <>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.cwd')}</span>
                          <input
                            value={step.cwd}
                            onChange={(event) => updateStep(index, (current) => current.type === 'agent' ? { ...current, cwd: event.target.value } : current)}
                            className={`${appFieldClassName} h-10 bg-claude-bg`}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.model')}</span>
                          <input
                            value={step.model ?? ''}
                            onChange={(event) => updateStep(index, (current) => current.type === 'agent' ? { ...current, model: event.target.value } : current)}
                            placeholder={t('workflow.form.modelPlaceholder')}
                            className={`${appFieldClassName} h-10 bg-claude-bg`}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.permissionMode')}</span>
                          <ScheduledTaskSelect
                            value={step.permissionMode}
                            onChange={(value) => updateStep(index, (current) => current.type === 'agent'
                              ? {
                                  ...current,
                                  permissionMode: value as 'default' | 'acceptEdits' | 'bypassPermissions',
                                }
                              : current)}
                          >
                            <option value="default">{t('scheduled.permission.default.label')}</option>
                            <option value="acceptEdits">{t('scheduled.permission.acceptEdits.label')}</option>
                            <option value="bypassPermissions">{t('scheduled.permission.bypass.label')}</option>
                          </ScheduledTaskSelect>
                        </label>

                        <label className="block md:col-span-2">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.systemPrompt')}</span>
                          <textarea
                            value={step.systemPrompt}
                            onChange={(event) => updateStep(index, (current) => current.type === 'agent' ? { ...current, systemPrompt: event.target.value } : current)}
                            rows={3}
                            className={`${appFieldClassName} min-h-[88px] resize-y bg-claude-bg`}
                          />
                        </label>

                        <label className="block md:col-span-2">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.prompt')}</span>
                          <textarea
                            value={step.prompt}
                            onChange={(event) => updateStep(index, (current) => current.type === 'agent' ? { ...current, prompt: event.target.value } : current)}
                            rows={5}
                            className={`${appFieldClassName} min-h-[132px] resize-y bg-claude-bg`}
                          />
                        </label>
                      </>
                    ) : null}

                    {step.type === 'condition' ? (
                      <>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.operator')}</span>
                          <ScheduledTaskSelect
                            value={step.operator}
                            onChange={(value) => updateStep(index, (current) => current.type === 'condition'
                              ? {
                                  ...current,
                                  operator: value as WorkflowConditionOperator,
                                }
                              : current)}
                          >
                            {CONDITION_OPERATORS.map((operator) => (
                              <option key={operator} value={operator}>
                                {getConditionOperatorLabel(operator, language)}
                              </option>
                            ))}
                          </ScheduledTaskSelect>
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.conditionValue')}</span>
                          <input
                            value={step.value}
                            disabled={step.operator === 'always_true'}
                            onChange={(event) => updateStep(index, (current) => current.type === 'condition' ? { ...current, value: event.target.value } : current)}
                            className={`${appFieldClassName} h-10 bg-claude-bg disabled:cursor-not-allowed disabled:opacity-50`}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.trueBranch')}</span>
                          <ScheduledTaskSelect
                            value={step.trueBranchStepId ?? ''}
                            onChange={(value) => updateStep(index, (current) => current.type === 'condition'
                              ? {
                                  ...current,
                                  trueBranchStepId: value || null,
                                }
                              : current)}
                          >
                            <option value="">{t('workflow.form.sequentialFallback')}</option>
                            {stepOptions
                              .filter((option) => option.id !== step.id)
                              .map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                          </ScheduledTaskSelect>
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.falseBranch')}</span>
                          <ScheduledTaskSelect
                            value={step.falseBranchStepId ?? ''}
                            onChange={(value) => updateStep(index, (current) => current.type === 'condition'
                              ? {
                                  ...current,
                                  falseBranchStepId: value || null,
                                }
                              : current)}
                          >
                            <option value="">{t('workflow.form.sequentialFallback')}</option>
                            {stepOptions
                              .filter((option) => option.id !== step.id)
                              .map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                          </ScheduledTaskSelect>
                        </label>
                      </>
                    ) : null}

                    {step.type === 'loop' ? (
                      <>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.maxIterations')}</span>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={step.maxIterations}
                            onChange={(event) => updateStep(index, (current) => current.type === 'loop'
                              ? {
                                  ...current,
                                  maxIterations: Number(event.target.value) || 1,
                                }
                              : current)}
                            className={`${appFieldClassName} h-10 bg-claude-bg`}
                          />
                        </label>

                        <div className="block md:col-span-2">
                          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.bodySteps')}</span>
                          {agentStepOptions.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-claude-border bg-claude-bg px-3 py-3 text-sm text-claude-muted">
                              {t('workflow.form.noAgentSteps')}
                            </div>
                          ) : (
                            <div className="grid gap-2 md:grid-cols-2">
                              {agentStepOptions.map((option) => {
                                const checked = step.bodyStepIds.includes(option.id)
                                return (
                                  <label
                                    key={option.id}
                                    className={cx(
                                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                                      checked
                                        ? 'border-claude-orange/32 bg-claude-orange/10 text-claude-text'
                                        : 'border-claude-border bg-claude-bg text-claude-text',
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(event) => {
                                        updateStep(index, (current) => {
                                          if (current.type !== 'loop') return current
                                          const bodyStepIds = event.target.checked
                                            ? [...current.bodyStepIds, option.id]
                                            : current.bodyStepIds.filter((stepId) => stepId !== option.id)
                                          return { ...current, bodyStepIds }
                                        })
                                      }}
                                    />
                                    <span>{option.label}</span>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        <div className="block md:col-span-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-claude-text">{t('workflow.form.breakCondition')}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-claude-muted">
                                {step.breakCondition ? t('workflow.form.enabled') : t('workflow.form.disabled')}
                              </span>
                              <AppSwitch
                                checked={Boolean(step.breakCondition)}
                                onClick={() => updateStep(index, (current) => current.type === 'loop'
                                  ? {
                                      ...current,
                                      breakCondition: current.breakCondition
                                        ? null
                                        : { operator: 'contains', value: '' },
                                    }
                                  : current)}
                              />
                            </div>
                          </div>

                          {step.breakCondition ? (
                            <div className="mt-3 grid gap-4 md:grid-cols-2">
                              <label className="block">
                                <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.operator')}</span>
                                <ScheduledTaskSelect
                                  value={step.breakCondition.operator}
                                  onChange={(value) => updateStep(index, (current) => current.type === 'loop' && current.breakCondition
                                    ? {
                                        ...current,
                                        breakCondition: {
                                          ...current.breakCondition,
                                          operator: value as WorkflowConditionOperator,
                                        },
                                      }
                                    : current)}
                                >
                                  {CONDITION_OPERATORS.map((operator) => (
                                    <option key={operator} value={operator}>
                                      {getConditionOperatorLabel(operator, language)}
                                    </option>
                                  ))}
                                </ScheduledTaskSelect>
                              </label>

                              <label className="block">
                                <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.conditionValue')}</span>
                                <input
                                  value={step.breakCondition.value}
                                  onChange={(event) => updateStep(index, (current) => current.type === 'loop' && current.breakCondition
                                    ? {
                                        ...current,
                                        breakCondition: {
                                          ...current.breakCondition,
                                          value: event.target.value,
                                        },
                                      }
                                    : current)}
                                  className={`${appFieldClassName} h-10 bg-claude-bg`}
                                />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {error ? (
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-claude-border px-5 py-4">
        <AppButton onClick={onCancel}>
          {t('workflow.form.cancel')}
        </AppButton>
        <AppButton type="submit" tone="success">
          {initialWorkflow ? t('workflow.form.save') : t('workflow.form.create')}
        </AppButton>
      </div>
    </form>
  )
}

function buildInitialWorkflow(initialWorkflow: Workflow | null | undefined, defaultProjectPath: string): WorkflowInput {
  if (initialWorkflow) {
    return workflowToInput(initialWorkflow)
  }

  return {
    name: '',
    steps: [createAgentStep(defaultProjectPath)],
    trigger: { type: 'manual' },
    active: false,
    nodePositions: undefined,
  }
}
