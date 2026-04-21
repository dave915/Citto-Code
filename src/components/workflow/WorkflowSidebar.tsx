import { useMemo, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import type { Workflow, WorkflowExecution } from '../../store/workflowTypes'
import { AppButton, cx } from '../ui/appDesignSystem'
import {
  describeWorkflowTrigger,
  formatWorkflowDateTime,
  formatWorkflowRelativeTime,
  getWorkflowExecutionStatusClassName,
  getWorkflowExecutionStatusLabel,
} from './utils'

type Props = {
  workflows: Workflow[]
  executions: WorkflowExecution[]
  selectedWorkflowId: string | null
  onCreate: () => void
  onSelect: (workflowId: string) => void
}

export function WorkflowSidebar({
  workflows,
  executions,
  selectedWorkflowId,
  onCreate,
  onSelect,
}: Props) {
  const { language, t } = useI18n()
  const [query, setQuery] = useState('')
  const filteredWorkflows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return workflows
    return workflows.filter((workflow) => workflow.name.toLowerCase().includes(normalized))
  }, [query, workflows])
  const recentExecutions = executions.slice(0, 3)

  return (
    <aside className="flex h-full w-[260px] flex-shrink-0 flex-col border-r border-claude-border bg-claude-sidebar">
      <div className="border-b border-claude-border px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold text-claude-text">{t('workflow.header.title')}</h2>
          <span className="text-[11px] text-claude-muted/70">
            {t('workflow.sidebar.totalCount', { count: workflows.length })}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="흐름 검색"
            className="h-[34px] min-w-0 flex-1 rounded-md border border-claude-border bg-claude-bg px-2.5 text-[11px] text-claude-text outline-none placeholder:text-claude-muted focus:border-claude-orange/40 focus:ring-1 focus:ring-claude-orange/15"
          />
          <AppButton onClick={onCreate} tone="accent" className="h-[34px] w-[78px] px-1.5 text-[11px]">
            {t('workflow.header.add')}
          </AppButton>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px]">
          {['전체', '최근 실행', '초안'].map((label, index) => (
            <button
              key={label}
              type="button"
              className={cx(
                'h-6 rounded-md px-2 transition-colors',
                index === 0
                  ? 'bg-claude-surface text-claude-text'
                  : 'text-claude-muted hover:bg-claude-panel hover:text-claude-text',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1 grid grid-cols-[minmax(0,1fr)_40px_48px] items-center gap-2 px-2 text-[10px] font-medium text-claude-muted/60">
          <span>목록</span>
          <span>상태</span>
          <span>최근 수정</span>
        </div>

        {filteredWorkflows.length === 0 ? (
          <div className="px-2 py-5 text-[13px]">
            <p className="font-medium text-claude-text">{t('workflow.sidebar.emptyTitle')}</p>
            <p className="mt-2 leading-5 text-claude-muted">{t('workflow.sidebar.emptyDescription')}</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredWorkflows.map((workflow) => {
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
                    'min-h-[54px] w-full rounded-md px-2.5 py-2 text-left transition-colors',
                    isSelected
                      ? 'bg-claude-surface text-claude-text'
                      : 'bg-transparent text-claude-muted hover:bg-claude-panel hover:text-claude-text',
                  )}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_40px_48px] items-start gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-claude-text">{workflow.name}</p>
                      <p className="mt-1 text-[11px] text-claude-muted">
                        {describeWorkflowTrigger(workflow, language)}
                      </p>
                    </div>
                    {statusLabel ? (
                      <span className={`rounded-full px-1.5 py-0.5 text-center text-[10px] font-medium ${getWorkflowExecutionStatusClassName(latestExecution!.status)}`}>
                        {statusLabel}
                      </span>
                    ) : <span />}
                    <span className="truncate text-right text-[11px] text-claude-muted">
                      {formatWorkflowRelativeTime(workflow.updatedAt, language)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {recentExecutions.length > 0 ? (
          <div className="mt-5">
            <div className="mb-1 flex items-center justify-between px-2 text-[10px] font-medium text-claude-muted/60">
              <span>최근 실행</span>
              <span>결과</span>
              <span>시간</span>
            </div>
            <div className="space-y-0.5">
              {recentExecutions.map((execution) => {
                const workflow = workflows.find((item) => item.id === execution.workflowId)
                return (
                  <button
                    key={execution.id}
                    type="button"
                    onClick={() => {
                      if (workflow) onSelect(workflow.id)
                    }}
                    className="flex min-h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                  >
                    <span className="min-w-0 flex-1 truncate">{workflow?.name ?? execution.workflowId}</span>
                    <span>{getWorkflowExecutionStatusLabel(execution.status, language)}</span>
                    <span>{formatWorkflowDateTime(execution.firedAt, language)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
