import { useMemo } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { TranslationKey } from '../../lib/i18n'
import type { Workflow, WorkflowExecution } from '../../store/workflowTypes'
import { AppButton, AppChip, AppPanel, cx } from '../ui/appDesignSystem'
import {
  describeWorkflowTrigger,
  formatWorkflowDateTime,
  getConditionOperatorLabel,
  getStepDisplayLabel,
  getWorkflowExecutionStatusClassName,
  getWorkflowExecutionStatusLabel,
  getWorkflowStepTypeLabel,
  truncateWorkflowOutput,
} from './utils'

type Props = {
  workflow: Workflow | null
  executions: WorkflowExecution[]
  actionError: string | null
  busyWorkflowId: string | null
  onEdit: (workflow: Workflow) => void
  onDelete: (workflow: Workflow) => void
  onToggleActive: (workflowId: string) => void
  onRunNow: (workflowId: string) => Promise<void>
  onCancel: (workflowId: string) => Promise<void>
}

export function WorkflowDetails({
  workflow,
  executions,
  actionError,
  busyWorkflowId,
  onEdit,
  onDelete,
  onToggleActive,
  onRunNow,
  onCancel,
}: Props) {
  const { language, t } = useI18n()

  const workflowExecutions = useMemo(
    () => (workflow ? executions.filter((execution) => execution.workflowId === workflow.id) : []),
    [executions, workflow],
  )

  if (!workflow) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-claude-bg px-8">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-claude-text">{t('workflow.details.selectTitle')}</p>
          <p className="mt-2 text-sm text-claude-muted">{t('workflow.details.selectDescription')}</p>
        </div>
      </div>
    )
  }

  const stepLabelById = new Map(
    workflow.steps.map((step, index) => [step.id, getStepDisplayLabel(step, index, language)] as const),
  )
  const runningExecution = workflowExecutions.find((execution) => execution.status === 'running') ?? null
  const isBusy = busyWorkflowId === workflow.id
  const scheduleActive = workflow.trigger.type === 'schedule' && workflow.active

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-claude-bg">
      <div className="border-b border-claude-border px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-claude-text">{workflow.name}</h2>
              <AppChip tone={scheduleActive ? 'success' : 'neutral'}>
                {scheduleActive ? t('workflow.details.active') : t('workflow.details.inactive')}
              </AppChip>
              {workflow.trigger.type === 'manual' ? (
                <AppChip tone="neutral">
                  {t('workflow.details.manualOnly')}
                </AppChip>
              ) : null}
              {runningExecution ? (
                <AppChip
                  className={cx('border-transparent', getWorkflowExecutionStatusClassName(runningExecution.status))}
                >
                  {getWorkflowExecutionStatusLabel(runningExecution.status, language)}
                </AppChip>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-claude-muted">{describeWorkflowTrigger(workflow, language)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {runningExecution ? (
              <AppButton
                disabled={isBusy}
                onClick={() => void onCancel(workflow.id)}
                className="border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/18"
              >
                {t('workflow.details.cancel')}
              </AppButton>
            ) : (
              <AppButton
                disabled={isBusy}
                onClick={() => void onRunNow(workflow.id)}
                tone="accent"
              >
                {t('workflow.details.runNow')}
              </AppButton>
            )}
            <AppButton
              onClick={() => onToggleActive(workflow.id)}
              disabled={workflow.trigger.type !== 'schedule'}
            >
              {scheduleActive ? t('workflow.details.disable') : t('workflow.details.enable')}
            </AppButton>
            <AppButton onClick={() => onEdit(workflow)}>
              {t('workflow.details.edit')}
            </AppButton>
            <AppButton onClick={() => onDelete(workflow)} tone="danger">
              {t('workflow.details.delete')}
            </AppButton>
          </div>
        </div>

        {actionError ? (
          <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {actionError}
          </div>
        ) : null}

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AppPanel className="bg-claude-surface/60 px-4 py-3 shadow-none">
            <dt className="text-xs uppercase tracking-wide text-claude-muted">{t('workflow.details.trigger')}</dt>
            <dd className="mt-1 text-sm font-medium text-claude-text">{describeWorkflowTrigger(workflow, language)}</dd>
          </AppPanel>
          <AppPanel className="bg-claude-surface/60 px-4 py-3 shadow-none">
            <dt className="text-xs uppercase tracking-wide text-claude-muted">{t('workflow.details.nextRun')}</dt>
            <dd className="mt-1 text-sm font-medium text-claude-text">{formatWorkflowDateTime(workflow.nextRunAt, language)}</dd>
          </AppPanel>
          <AppPanel className="bg-claude-surface/60 px-4 py-3 shadow-none">
            <dt className="text-xs uppercase tracking-wide text-claude-muted">{t('workflow.details.lastRun')}</dt>
            <dd className="mt-1 text-sm font-medium text-claude-text">{formatWorkflowDateTime(workflow.lastRunAt, language)}</dd>
          </AppPanel>
          <AppPanel className="bg-claude-surface/60 px-4 py-3 shadow-none">
            <dt className="text-xs uppercase tracking-wide text-claude-muted">{t('workflow.details.stepCount')}</dt>
            <dd className="mt-1 text-sm font-medium text-claude-text">{workflow.steps.length}</dd>
          </AppPanel>
        </dl>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-claude-text">{t('workflow.details.steps')}</h3>
              <div className="mt-3 space-y-3">
                {workflow.steps.map((step, index) => (
                  <AppPanel key={step.id} className="bg-claude-surface/55 px-4 py-4 shadow-none">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-claude-text">{getStepDisplayLabel(step, index, language)}</p>
                        <p className="mt-1 text-xs text-claude-muted">{getWorkflowStepTypeLabel(step, language)}</p>
                      </div>
                      <AppChip tone="neutral">
                        {step.id}
                      </AppChip>
                    </div>

                    {step.type === 'agent' ? (
                      <div className="mt-3 space-y-2 text-sm text-claude-muted">
                        <p><span className="text-claude-text">{t('workflow.form.cwd')}:</span> {step.cwd}</p>
                        <p><span className="text-claude-text">{t('workflow.form.nextNode')}:</span> {step.nextStepId === null ? t('workflow.form.disconnectNext') : step.nextStepId ? stepLabelById.get(step.nextStepId) ?? step.nextStepId : t('workflow.form.sequentialFallback')}</p>
                        <p><span className="text-claude-text">{t('workflow.form.model')}:</span> {step.model ?? t('workflow.details.defaultModel')}</p>
                        <p><span className="text-claude-text">{t('workflow.form.permissionMode')}:</span> {translatePermission(step.permissionMode, t)}</p>
                        {step.systemPrompt.trim() ? (
                          <p><span className="text-claude-text">{t('workflow.form.systemPrompt')}:</span> {truncateWorkflowOutput(step.systemPrompt, 200)}</p>
                        ) : null}
                        <p><span className="text-claude-text">{t('workflow.form.prompt')}:</span> {truncateWorkflowOutput(step.prompt, 320)}</p>
                      </div>
                    ) : null}

                    {step.type === 'condition' ? (
                      <div className="mt-3 space-y-2 text-sm text-claude-muted">
                        <p><span className="text-claude-text">{t('workflow.form.operator')}:</span> {getConditionOperatorLabel(step.operator, language)}</p>
                        <p><span className="text-claude-text">{t('workflow.form.conditionValue')}:</span> {step.value || '-'}</p>
                        <p><span className="text-claude-text">{t('workflow.form.nextNodeFallback')}:</span> {step.nextStepId === null ? t('workflow.form.disconnectNext') : step.nextStepId ? stepLabelById.get(step.nextStepId) ?? step.nextStepId : t('workflow.form.sequentialFallback')}</p>
                        <p><span className="text-claude-text">{t('workflow.form.trueBranch')}:</span> {step.trueBranchStepId ? stepLabelById.get(step.trueBranchStepId) ?? step.trueBranchStepId : t('workflow.form.followDefaultNext')}</p>
                        <p><span className="text-claude-text">{t('workflow.form.falseBranch')}:</span> {step.falseBranchStepId ? stepLabelById.get(step.falseBranchStepId) ?? step.falseBranchStepId : t('workflow.form.followDefaultNext')}</p>
                      </div>
                    ) : null}

                    {step.type === 'loop' ? (
                      <div className="mt-3 space-y-2 text-sm text-claude-muted">
                        <p><span className="text-claude-text">{t('workflow.form.maxIterations')}:</span> {step.maxIterations}</p>
                        <p><span className="text-claude-text">{t('workflow.form.nextNode')}:</span> {step.nextStepId === null ? t('workflow.form.disconnectNext') : step.nextStepId ? stepLabelById.get(step.nextStepId) ?? step.nextStepId : t('workflow.form.sequentialFallback')}</p>
                        <p>
                          <span className="text-claude-text">{t('workflow.form.bodySteps')}:</span>{' '}
                          {step.bodyStepIds.length > 0
                            ? step.bodyStepIds.map((stepId) => stepLabelById.get(stepId) ?? stepId).join(', ')
                            : '-'}
                        </p>
                        <p>
                          <span className="text-claude-text">{t('workflow.form.breakCondition')}:</span>{' '}
                          {step.breakCondition
                            ? `${getConditionOperatorLabel(step.breakCondition.operator, language)} · ${step.breakCondition.value || '-'}`
                            : t('workflow.form.none')}
                        </p>
                      </div>
                    ) : null}
                  </AppPanel>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto border-t border-claude-border px-6 py-5 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-claude-text">{t('workflow.details.history')}</h3>
              <p className="mt-1 text-xs text-claude-muted">{t('workflow.details.historyDescription')}</p>
            </div>
          </div>

          {workflowExecutions.length === 0 ? (
            <AppPanel className="mt-4 border-dashed bg-claude-surface/35 px-4 py-6 text-sm shadow-none">
              <p className="font-medium text-claude-text">{t('workflow.details.noHistory')}</p>
              <p className="mt-2 text-claude-muted">{t('workflow.details.noHistoryDescription')}</p>
            </AppPanel>
          ) : (
            <div className="mt-4 space-y-3">
              {workflowExecutions.slice(0, 12).map((execution) => (
                <AppPanel key={execution.id} className="bg-claude-surface/55 px-4 py-4 shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-claude-text">{formatWorkflowDateTime(execution.firedAt, language)}</p>
                      <p className="mt-1 text-xs text-claude-muted">
                        {t('workflow.details.triggeredBy')}: {t(`workflow.execution.${execution.triggeredBy}`)}
                      </p>
                    </div>
                    <AppChip className={cx('border-transparent', getWorkflowExecutionStatusClassName(execution.status))}>
                      {getWorkflowExecutionStatusLabel(execution.status, language)}
                    </AppChip>
                  </div>

                  {execution.stepResults.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {execution.stepResults.map((result) => (
                        <div key={`${execution.id}:${result.stepId}`} className="rounded-md border border-claude-border bg-claude-bg/80 px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-medium text-claude-text">
                              {stepLabelById.get(result.stepId) ?? result.stepId}
                            </p>
                            <AppChip
                              className={cx(
                                'border-transparent text-[10px]',
                                result.status === 'done'
                                  ? 'bg-emerald-500/15 text-emerald-200'
                                  : result.status === 'error'
                                    ? 'bg-red-500/15 text-red-200'
                                    : result.status === 'running'
                                      ? 'bg-sky-500/15 text-sky-200'
                                      : 'bg-amber-500/15 text-amber-200',
                              )}
                            >
                              {t(`workflow.status.${result.status}`)}
                            </AppChip>
                          </div>
                          {result.output.trim() ? (
                            <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-claude-muted">
                              {truncateWorkflowOutput(result.output, 900)}
                            </pre>
                          ) : null}
                          {result.error ? (
                            <p className="mt-2 text-xs text-red-200">{result.error}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </AppPanel>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function translatePermission(
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions',
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  if (permissionMode === 'acceptEdits') return t('scheduled.permission.acceptEdits.label')
  if (permissionMode === 'bypassPermissions') return t('scheduled.permission.bypass.label')
  return t('scheduled.permission.default.label')
}
