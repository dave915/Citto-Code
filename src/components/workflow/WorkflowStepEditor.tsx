import { useEffect, useMemo, useState } from 'react'
import type { ModelInfo } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import type {
  Workflow,
  WorkflowConditionOperator,
  WorkflowStep,
} from '../../store/workflowTypes'
import { ScheduledTaskSelect } from '../scheduledTaskForm/ScheduledTaskSelect'
import {
  cloneWorkflowStep,
  CONDITION_OPERATORS,
} from './editorShared'
import { AppButton, AppPanel, appFieldClassName } from '../ui/appDesignSystem'
import { getConditionOperatorLabel, getStepDisplayLabel } from './utils'

type Props = {
  workflow: Workflow
  stepId: string
  defaultProjectPath: string
  onCancel: () => void
  onDelete: () => void
  onSubmit: (step: WorkflowStep) => void
}

const SEQUENTIAL_NEXT_VALUE = '__sequential__'
const DISCONNECT_NEXT_VALUE = '__disconnect__'

function normalizeNextStepId(
  stepId: string,
  nextStepId: string | null | undefined,
  stepIds: Set<string>,
): string | null | undefined {
  if (nextStepId === null) return null
  if (typeof nextStepId !== 'string') return undefined
  if (nextStepId === stepId || !stepIds.has(nextStepId)) return undefined
  return nextStepId
}

function normalizeStep(step: WorkflowStep, workflow: Workflow): WorkflowStep {
  const stepIds = new Set(workflow.steps.map((item) => item.id))
  const normalizedNextStepId = normalizeNextStepId(step.id, step.nextStepId, stepIds)

  if (step.type === 'agent') {
    return {
      ...step,
      label: step.label.trim(),
      nextStepId: normalizedNextStepId,
      cwd: step.cwd.trim(),
      model: step.model?.trim() ? step.model.trim() : null,
    }
  }

  if (step.type === 'condition') {
    return {
      ...step,
      label: step.label.trim(),
      nextStepId: normalizedNextStepId,
      value: step.operator === 'always_true' ? '' : step.value,
      trueBranchStepId: step.trueBranchStepId && stepIds.has(step.trueBranchStepId) ? step.trueBranchStepId : null,
      falseBranchStepId: step.falseBranchStepId && stepIds.has(step.falseBranchStepId) ? step.falseBranchStepId : null,
    }
  }

  return {
    ...step,
    label: step.label.trim(),
    nextStepId: normalizedNextStepId,
    maxIterations: Math.max(1, Math.min(20, Math.floor(step.maxIterations))),
    bodyStepIds: step.bodyStepIds.filter((targetStepId) => stepIds.has(targetStepId)),
    breakCondition: step.breakCondition
      ? {
          operator: step.breakCondition.operator,
          value: step.breakCondition.value,
        }
      : null,
  }
}

function getNextNodeSelectValue(step: WorkflowStep) {
  if (step.nextStepId === null) return DISCONNECT_NEXT_VALUE
  if (typeof step.nextStepId === 'string' && step.nextStepId) return step.nextStepId
  return SEQUENTIAL_NEXT_VALUE
}

function applyNextNodeSelection(step: WorkflowStep, value: string): WorkflowStep {
  if (value === SEQUENTIAL_NEXT_VALUE) {
    const { nextStepId: _ignored, ...rest } = step
    return rest
  }

  return {
    ...step,
    nextStepId: value === DISCONNECT_NEXT_VALUE ? null : value,
  }
}

function getValidationError(
  step: WorkflowStep,
  t: (key: 'workflow.form.validation.agentCwd' | 'workflow.form.validation.agentPrompt') => string,
) {
  if (step.type !== 'agent') return null
  if (!step.cwd.trim()) return t('workflow.form.validation.agentCwd')
  if (!step.prompt.trim()) return t('workflow.form.validation.agentPrompt')
  return null
}

export function WorkflowStepEditor({
  workflow,
  stepId,
  defaultProjectPath,
  onCancel,
  onDelete,
  onSubmit,
}: Props) {
  const { language, t } = useI18n()
  const currentStep = workflow.steps.find((step) => step.id === stepId) ?? null
  const stepIndex = workflow.steps.findIndex((step) => step.id === stepId)
  const [draft, setDraft] = useState<WorkflowStep | null>(() => currentStep ? cloneWorkflowStep(currentStep) : null)
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)

  useEffect(() => {
    setDraft(currentStep ? cloneWorkflowStep(currentStep) : null)
    setError(null)
  }, [currentStep])

  useEffect(() => {
    let cancelled = false
    setModelsLoading(true)

    void window.claude.getModels()
      .then((loadedModels) => {
        if (cancelled) return
        setModels(loadedModels)
      })
      .catch(() => {
        if (cancelled) return
        setModels([])
      })
      .finally(() => {
        if (cancelled) return
        setModelsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const stepOptions = useMemo(
    () => workflow.steps.map((step, index) => ({
      id: step.id,
      label: getStepDisplayLabel(step, index, language),
      type: step.type,
    })),
    [language, workflow.steps],
  )

  const branchOptions = stepOptions.filter((option) => option.id !== stepId)
  const agentStepOptions = stepOptions.filter((option) => option.type === 'agent' && option.id !== stepId)
  const modelOptions = useMemo(() => {
    if (!draft || draft.type !== 'agent') return models
    if (!draft.model || models.some((model) => model.id === draft.model)) return models
    return [
      {
        id: draft.model,
        displayName: draft.model,
        family: 'custom',
        provider: 'custom' as const,
        isLocal: false,
      },
      ...models,
    ]
  }, [draft, models])

  const currentStepSignature = useMemo(
    () => (currentStep ? JSON.stringify(currentStep) : null),
    [currentStep],
  )

  useEffect(() => {
    if (!draft || !currentStep) return

    const validationError = getValidationError(draft, t)
    const normalized = normalizeStep(draft, workflow)
    const normalizedSignature = JSON.stringify(normalized)

    setError(validationError)

    if (normalizedSignature === currentStepSignature) {
      return
    }

    onSubmit(normalized)
  }, [currentStep, currentStepSignature, draft, onSubmit, t, workflow])

  if (!currentStep || !draft || stepIndex < 0) return null

  return (
    <AppPanel className="absolute right-4 top-4 z-40 flex h-[min(640px,calc(100%-6rem))] w-[420px] flex-col overflow-hidden shadow-2xl">
      <div className="border-b border-claude-border px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-claude-text">
              {t('workflow.stepEditor.title')}
            </div>
            <div className="mt-1 truncate text-[12px] text-claude-muted">
              {getStepDisplayLabel(draft, stepIndex, language)}
            </div>
          </div>
          <AppButton onClick={onCancel} tone="ghost">
            {t('workflow.form.cancel')}
          </AppButton>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[11px] text-claude-muted">
          <span>{t(`workflow.step.${draft.type}`)}</span>
          <span>·</span>
          <span>{t('workflow.stepEditor.stepId')}: {draft.id}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.stepLabel')}</span>
          <input
            value={draft.label}
            onChange={(event) => setDraft((current) => current ? { ...current, label: event.target.value } : current)}
            className={`${appFieldClassName} h-10`}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-claude-text">
            {draft.type === 'condition' ? t('workflow.form.nextNodeFallback') : t('workflow.form.nextNode')}
          </span>
          <ScheduledTaskSelect
            value={getNextNodeSelectValue(draft)}
            onChange={(value) => setDraft((current) => current ? applyNextNodeSelection(current, value) : current)}
          >
            <option value={SEQUENTIAL_NEXT_VALUE}>{t('workflow.form.sequentialFallback')}</option>
            <option value={DISCONNECT_NEXT_VALUE}>{t('workflow.form.disconnectNext')}</option>
            {branchOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </ScheduledTaskSelect>
        </label>

        {draft.type === 'agent' ? (
          <>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.cwd')}</span>
              <div className="relative">
                <input
                  value={draft.cwd}
                  onChange={(event) => setDraft((current) => current?.type === 'agent'
                    ? { ...current, cwd: event.target.value }
                    : current)}
                  className={`${appFieldClassName} h-10 pr-11`}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const selectedFolder = await window.claude.selectFolder({
                      defaultPath: draft.cwd || defaultProjectPath,
                      title: t('scheduled.form.chooseFolder'),
                    })
                    if (!selectedFolder) return
                    setDraft((current) => current?.type === 'agent'
                      ? { ...current, cwd: selectedFolder }
                      : current)
                  }}
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md text-claude-muted transition-colors hover:text-claude-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  aria-label={t('scheduled.form.chooseFolder')}
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.75 5.75A1.75 1.75 0 014.5 4h3.1c.46 0 .9.183 1.225.509l.666.666c.326.325.767.509 1.227.509H15.5a1.75 1.75 0 011.75 1.75v6.066a1.75 1.75 0 01-1.75 1.75h-11A1.75 1.75 0 012.75 13.5V5.75z"
                    />
                  </svg>
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.model')}</span>
              <ScheduledTaskSelect
                value={draft.model ?? ''}
                onChange={(value) => setDraft((current) => current?.type === 'agent'
                  ? { ...current, model: value || null }
                  : current)}
              >
                <option value="">{t('input.modelPicker.defaultModel')}</option>
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id}>{model.displayName}</option>
                ))}
              </ScheduledTaskSelect>
              <div className="mt-2 text-[11px] text-claude-muted">
                {modelsLoading ? t('input.modelPicker.loading') : t('workflow.form.modelPlaceholder')}
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.permissionMode')}</span>
              <ScheduledTaskSelect
                value={draft.permissionMode}
                onChange={(value) => setDraft((current) => current?.type === 'agent'
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

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.prompt')}</span>
                <textarea
                  value={draft.prompt}
                  onChange={(event) => setDraft((current) => current?.type === 'agent'
                    ? { ...current, prompt: event.target.value }
                    : current)}
                  rows={7}
                  className={appFieldClassName}
                />
              </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.systemPrompt')}</span>
                <textarea
                  value={draft.systemPrompt}
                  onChange={(event) => setDraft((current) => current?.type === 'agent'
                    ? { ...current, systemPrompt: event.target.value }
                    : current)}
                  rows={3}
                  className={appFieldClassName}
                />
              </label>
          </>
        ) : null}

        {draft.type === 'condition' ? (
          <>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.operator')}</span>
              <ScheduledTaskSelect
                value={draft.operator}
                onChange={(value) => setDraft((current) => current?.type === 'condition'
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
                value={draft.value}
                disabled={draft.operator === 'always_true'}
                onChange={(event) => setDraft((current) => current?.type === 'condition'
                  ? { ...current, value: event.target.value }
                  : current)}
                className={`${appFieldClassName} h-10 disabled:cursor-not-allowed disabled:opacity-45`}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.trueBranch')}</span>
              <ScheduledTaskSelect
                value={draft.trueBranchStepId ?? ''}
                onChange={(value) => setDraft((current) => current?.type === 'condition'
                  ? { ...current, trueBranchStepId: value || null }
                  : current)}
              >
                <option value="">{t('workflow.form.followDefaultNext')}</option>
                {branchOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </ScheduledTaskSelect>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.falseBranch')}</span>
              <ScheduledTaskSelect
                value={draft.falseBranchStepId ?? ''}
                onChange={(value) => setDraft((current) => current?.type === 'condition'
                  ? { ...current, falseBranchStepId: value || null }
                  : current)}
              >
                <option value="">{t('workflow.form.followDefaultNext')}</option>
                {branchOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </ScheduledTaskSelect>
            </label>
          </>
        ) : null}

        {draft.type === 'loop' ? (
          <>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.maxIterations')}</span>
              <input
                type="number"
                min={1}
                max={20}
                value={draft.maxIterations}
                onChange={(event) => setDraft((current) => current?.type === 'loop'
                  ? { ...current, maxIterations: Number(event.target.value) || 1 }
                  : current)}
                className={`${appFieldClassName} h-10`}
              />
            </label>

            <div className="block">
              <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.bodySteps')}</span>
              {agentStepOptions.length === 0 ? (
                <div className="rounded-md border border-dashed border-claude-border bg-claude-bg/70 px-3 py-3 text-sm text-claude-muted">
                  {t('workflow.form.noAgentSteps')}
                </div>
              ) : (
                <div className="space-y-2">
                  {agentStepOptions.map((option) => {
                    const checked = draft.bodyStepIds.includes(option.id)
                    return (
                      <label
                        key={option.id}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                          checked
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                            : 'border-claude-border bg-claude-bg text-claude-text'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setDraft((current) => {
                              if (!current || current.type !== 'loop') return current
                              return {
                                ...current,
                                bodyStepIds: event.target.checked
                                  ? [...current.bodyStepIds, option.id]
                                  : current.bodyStepIds.filter((item) => item !== option.id),
                              }
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

            <div className="block">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-claude-text">{t('workflow.form.breakCondition')}</span>
                <button
                  type="button"
                  onClick={() => setDraft((current) => current?.type === 'loop'
                    ? {
                        ...current,
                        breakCondition: current.breakCondition
                          ? null
                          : { operator: 'contains', value: '' },
                      }
                    : current)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    draft.breakCondition
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                      : 'border-claude-border bg-claude-bg text-claude-text'
                  }`}
                >
                  {draft.breakCondition ? t('workflow.form.enabled') : t('workflow.form.disabled')}
                </button>
              </div>

              {draft.breakCondition ? (
                <div className="mt-3 space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-claude-text">{t('workflow.form.operator')}</span>
                    <ScheduledTaskSelect
                      value={draft.breakCondition.operator}
                      onChange={(value) => setDraft((current) => current?.type === 'loop' && current.breakCondition
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
                      value={draft.breakCondition.value}
                      onChange={(event) => setDraft((current) => current?.type === 'loop' && current.breakCondition
                        ? {
                            ...current,
                            breakCondition: {
                              ...current.breakCondition,
                              value: event.target.value,
                            },
                          }
                        : current)}
                      className={`${appFieldClassName} h-10`}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-claude-border px-4 py-4">
        <AppButton onClick={onDelete} tone="danger">
          {t('workflow.stepEditor.delete')}
        </AppButton>

        <AppButton onClick={onCancel} tone="ghost">
          {t('workflow.form.cancel')}
        </AppButton>
      </div>
    </AppPanel>
  )
}
