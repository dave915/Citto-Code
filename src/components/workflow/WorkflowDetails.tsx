import { useMemo } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { TranslationKey } from '../../lib/i18n'
import type { Workflow, WorkflowExecution } from '../../store/workflowTypes'
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
      <div className="border-b border-white/5 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-claude-text">{workflow.name}</h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${scheduleActive ? 'bg-emerald-500/15 text-emerald-200' : 'bg-claude-panel text-claude-muted'}`}>
                {scheduleActive ? t('workflow.details.active') : t('workflow.details.inactive')}
              </span>
              {workflow.trigger.type === 'manual' ? (
                <span className="rounded-full bg-claude-panel px-2 py-0.5 text-[11px] font-medium text-claude-muted">
                  {t('workflow.details.manualOnly')}
                </span>
              ) : null}
              {runningExecution ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getWorkflowExecutionStatusClassName(runningExecution.status)}`}>
                  {getWorkflowExecutionStatusLabel(runningExecution.status, language)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-claude-muted">{describeWorkflowTrigger(workflow, language)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {runningExecution ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onCancel(workflow.id)}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('workflow.details.cancel')}
              </button>
            ) : (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onRunNow(workflow.id)}
                className="rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-sm font-medium text-claude-text transition-colors hover:bg-claude-sidebar-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('workflow.details.runNow')}
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggleActive(workflow.id)}
              disabled={workflow.trigger.type !== 'schedule'}
              className="rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-sm font-medium text-claude-text transition-colors hover:bg-claude-sidebar-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scheduleActive ? t('workflow.details.disable') : t('workflow.details.enable')}
            </button>
            <button
              type="button"
              onClick={() => onEdit(workflow)}
              className="rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-sm font-medium text-claude-text transition-colors hover:bg-claude-sidebar-hover"
            >
              {t('workflow.details.edit')}
            </button>
            <button
              type="button"
              onClick={() => onDelete(workflow)}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/20"
            >
              {t('workflow.details.delete')}
            </button>
          </div>
        </div>

        {actionError ? (
          <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {actionError}
          </div>
        ) : null}

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-white/5 bg-claude-panel/60 px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-claude-muted">{t('workflow.details.trigger')}</dt>
            <dd className="mt-1 text-sm font-medium text-claude-text">{describeWorkflowTrigger(workflow, language)}</dd>
          </div>
          <div className="rounded-lg border border-white/5 bg-claude-panel/60 px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-claude-muted">{t('workflow.details.nextRun')}</dt>
            <dd className="mt-1 text-sm font-medium text-claude-text">{formatWorkflowDateTime(workflow.nextRunAt, language)}</dd>
          </div>
          <div className="rounded-lg border border-white/5 bg-claude-panel/60 px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-claude-muted">{t('workflow.details.lastRun')}</dt>
            <dd className="mt-1 text-sm font-medium text-claude-text">{formatWorkflowDateTime(workflow.lastRunAt, language)}</dd>
          </div>
          <div className="rounded-lg border border-white/5 bg-claude-panel/60 px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-claude-muted">{t('workflow.details.stepCount')}</dt>
            <dd className="mt-1 text-sm font-medium text-claude-text">{workflow.steps.length}</dd>
          </div>
        </dl>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-claude-text">{t('workflow.details.steps')}</h3>
              <div className="mt-3 space-y-3">
                {workflow.steps.map((step, index) => (
                  <div key={step.id} className="rounded-lg border border-white/5 bg-claude-panel/50 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-claude-text">{getStepDisplayLabel(step, index, language)}</p>
                        <p className="mt-1 text-xs text-claude-muted">{getWorkflowStepTypeLabel(step, language)}</p>
                      </div>
                      <span className="rounded-full bg-claude-bg px-2 py-0.5 text-[11px] text-claude-muted">
                        {step.id}
                      </span>
                    </div>

                    {step.type === 'agent' ? (
                      <div className="mt-3 space-y-2 text-sm text-claude-muted">
                        <p><span className="text-claude-text">{t('workflow.form.cwd')}:</span> {step.cwd}</p>
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
                        <p><span className="text-claude-text">{t('workflow.form.trueBranch')}:</span> {step.trueBranchStepId ? stepLabelById.get(step.trueBranchStepId) ?? step.trueBranchStepId : t('workflow.form.sequentialFallback')}</p>
                        <p><span className="text-claude-text">{t('workflow.form.falseBranch')}:</span> {step.falseBranchStepId ? stepLabelById.get(step.falseBranchStepId) ?? step.falseBranchStepId : t('workflow.form.sequentialFallback')}</p>
                      </div>
                    ) : null}

                    {step.type === 'loop' ? (
                      <div className="mt-3 space-y-2 text-sm text-claude-muted">
                        <p><span className="text-claude-text">{t('workflow.form.maxIterations')}:</span> {step.maxIterations}</p>
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
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto border-t border-white/5 px-6 py-5 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-claude-text">{t('workflow.details.history')}</h3>
              <p className="mt-1 text-xs text-claude-muted">{t('workflow.details.historyDescription')}</p>
            </div>
          </div>

          {workflowExecutions.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-claude-border bg-claude-panel/40 px-4 py-6 text-sm">
              <p className="font-medium text-claude-text">{t('workflow.details.noHistory')}</p>
              <p className="mt-2 text-claude-muted">{t('workflow.details.noHistoryDescription')}</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {workflowExecutions.slice(0, 12).map((execution) => (
                <div key={execution.id} className="rounded-lg border border-white/5 bg-claude-panel/50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-claude-text">{formatWorkflowDateTime(execution.firedAt, language)}</p>
                      <p className="mt-1 text-xs text-claude-muted">
                        {t('workflow.details.triggeredBy')}: {t(`workflow.execution.${execution.triggeredBy}`)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getWorkflowExecutionStatusClassName(execution.status)}`}>
                      {getWorkflowExecutionStatusLabel(execution.status, language)}
                    </span>
                  </div>

                  {execution.stepResults.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {execution.stepResults.map((result) => (
                        <div key={`${execution.id}:${result.stepId}`} className="rounded-lg bg-claude-bg/70 px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-medium text-claude-text">
                              {stepLabelById.get(result.stepId) ?? result.stepId}
                            </p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${result.status === 'done' ? 'bg-emerald-500/15 text-emerald-200' : result.status === 'error' ? 'bg-red-500/15 text-red-200' : result.status === 'running' ? 'bg-sky-500/15 text-sky-200' : 'bg-amber-500/15 text-amber-200'}`}>
                              {t(`workflow.status.${result.status}`)}
                            </span>
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
                </div>
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
