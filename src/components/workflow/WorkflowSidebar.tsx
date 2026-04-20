import { useI18n } from '../../hooks/useI18n'
import type { Workflow, WorkflowExecution } from '../../store/workflowTypes'
import { AppButton, AppChip, cx } from '../ui/appDesignSystem'
import {
  describeWorkflowTrigger,
  formatWorkflowDateTime,
  getWorkflowExecutionStatusClassName,
  getWorkflowExecutionStatusLabel,
} from './utils'

type Props = {
  workflows: Workflow[]
  executions: WorkflowExecution[]
  selectedWorkflowId: string | null
  activeWorkflowCount: number
  onCreate: () => void
  onSelect: (workflowId: string) => void
}

export function WorkflowSidebar({
  workflows,
  executions,
  selectedWorkflowId,
  activeWorkflowCount,
  onCreate,
  onSelect,
}: Props) {
  const { language, t } = useI18n()

  return (
    <aside className="flex h-full w-[288px] flex-shrink-0 flex-col border-r border-claude-border bg-claude-sidebar">
      <div className="border-b border-claude-border px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-claude-text">{t('workflow.header.title')}</h2>
            <p className="mt-1 text-xs text-claude-muted">
              {t('workflow.header.activeCount', { count: activeWorkflowCount })}
            </p>
          </div>
          <AppButton onClick={onCreate} tone="accent">
            {t('workflow.header.add')}
          </AppButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {workflows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-claude-border bg-claude-panel/40 px-4 py-6 text-sm">
            <p className="font-medium text-claude-text">{t('workflow.sidebar.emptyTitle')}</p>
            <p className="mt-2 text-claude-muted">{t('workflow.sidebar.emptyDescription')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {workflows.map((workflow) => {
              const latestExecution = executions.find((execution) => execution.workflowId === workflow.id) ?? null
              const isSelected = workflow.id === selectedWorkflowId
              const statusLabel = latestExecution
                ? getWorkflowExecutionStatusLabel(latestExecution.status, language)
                : null

              return (
                <button
                  key={workflow.id}
                  type="button"
                  onClick={() => onSelect(workflow.id)}
                  className={cx(
                    'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-claude-border bg-claude-panel'
                      : 'border-transparent bg-transparent hover:border-claude-border/50 hover:bg-claude-panel/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-claude-text">{workflow.name}</p>
                      <p className="mt-1 text-xs text-claude-muted">
                        {describeWorkflowTrigger(workflow, language)}
                      </p>
                    </div>
                    {statusLabel ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getWorkflowExecutionStatusClassName(latestExecution!.status)}`}>
                        {statusLabel}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-claude-muted">
                    <span className="text-claude-muted">
                      {workflow.trigger.type === 'schedule'
                        ? t('workflow.sidebar.nextRun')
                        : t('workflow.sidebar.manual')}
                    </span>
                    <span className="truncate text-right text-claude-text">
                      {workflow.trigger.type === 'schedule'
                        ? formatWorkflowDateTime(workflow.nextRunAt, language)
                        : t('workflow.details.manualOnly')}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <AppChip className="px-2 py-0.5 text-[10px]">
                      {workflow.steps.length} {t('workflow.details.steps')}
                    </AppChip>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
