import { useEffect, useRef } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { useWorkflowStore } from '../../store/workflowStore'
import type { Workflow } from '../../store/workflowTypes'

type Props = {
  workflows: Workflow[]
  selectedWorkflow: Workflow | null
  onSelect: (workflowId: string) => void
  onCreate: () => void
  onDuplicate: (workflowId: string) => void
}

function TriggerBadge({ workflow }: { workflow: Workflow }) {
  const { t } = useI18n()
  const label = workflow.trigger.type === 'schedule'
    ? t('workflow.trigger.schedule')
    : t('workflow.trigger.manual')

  return (
    <span className="rounded border border-claude-border bg-claude-bg px-1.5 py-0.5 text-[10px] font-medium text-claude-muted">
      {label}
    </span>
  )
}

export function WorkflowList({
  workflows,
  selectedWorkflow,
  onSelect,
  onCreate,
  onDuplicate,
}: Props) {
  const { t } = useI18n()
  const selectorOpen = useWorkflowStore((state) => state.selectorOpen)
  const setSelectorOpen = useWorkflowStore((state) => state.setSelectorOpen)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!selectorOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setSelectorOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [selectorOpen, setSelectorOpen])

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setSelectorOpen(!selectorOpen)}
        className={`inline-flex h-8 min-w-[220px] max-w-[280px] items-center justify-between gap-1.5 rounded-lg border border-claude-border px-2 py-1 text-left text-[11px] text-claude-text transition-colors ${
          selectorOpen ? 'bg-claude-surface-2' : 'bg-claude-surface hover:bg-claude-surface-2'
        }`}
      >
        <div className="min-w-0 truncate font-medium">
          {selectedWorkflow?.name || t('workflow.selector.empty')}
        </div>
        <svg className={`h-3.5 w-3.5 flex-shrink-0 text-claude-muted transition-transform ${selectorOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 011.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-claude-border bg-claude-surface px-2.5 py-1 text-[11px] font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
      >
        <svg className="h-3.5 w-3.5 text-claude-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 4v12M4 10h12" />
        </svg>
        {t('workflow.actions.new')}
      </button>

      {selectorOpen ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-[320px] rounded-md border border-claude-border bg-claude-panel p-1 shadow-xl">
          {workflows.length === 0 ? (
            <div className="px-3 py-6 text-sm text-claude-muted">
              {t('workflow.selector.emptyDescription')}
            </div>
          ) : workflows.map((workflow) => {
            const active = workflow.id === selectedWorkflow?.id
            return (
              <div
                key={workflow.id}
                className={`flex items-center gap-2 rounded-md border px-2 py-2 transition-colors ${
                  active
                    ? 'border-claude-border bg-claude-surface'
                    : 'border-transparent hover:bg-claude-surface/80'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(workflow.id)
                    setSelectorOpen(false)
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-claude-text">{workflow.name}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <TriggerBadge workflow={workflow} />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDuplicate(workflow.id)
                    setSelectorOpen(false)
                  }}
                  className="rounded-md border border-claude-border bg-claude-surface px-2 py-1 text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2"
                >
                  {t('workflow.actions.duplicate')}
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
