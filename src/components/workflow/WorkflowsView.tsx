import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { useWorkflowStore } from '../../store/workflowStore'
import type { Workflow } from '../../store/workflowTypes'
import { WorkflowDetails } from './WorkflowDetails'
import { WorkflowForm } from './WorkflowForm'
import { WorkflowSidebar } from './WorkflowSidebar'

type Props = {
  defaultProjectPath: string
  onClose: () => void
}

export function WorkflowsView({
  defaultProjectPath,
  onClose,
}: Props) {
  const { t } = useI18n()
  const workflows = useWorkflowStore((state) => state.workflows)
  const executions = useWorkflowStore((state) => state.executions)
  const addWorkflow = useWorkflowStore((state) => state.addWorkflow)
  const updateWorkflow = useWorkflowStore((state) => state.updateWorkflow)
  const deleteWorkflow = useWorkflowStore((state) => state.deleteWorkflow)
  const toggleWorkflowActive = useWorkflowStore((state) => state.toggleWorkflowActive)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [busyWorkflowId, setBusyWorkflowId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const sortedWorkflows = useMemo(
    () => [...workflows].sort((left, right) => {
      const leftScheduledActive = left.trigger.type === 'schedule' && left.active
      const rightScheduledActive = right.trigger.type === 'schedule' && right.active
      if (leftScheduledActive !== rightScheduledActive) return leftScheduledActive ? -1 : 1
      if ((left.nextRunAt ?? Number.POSITIVE_INFINITY) !== (right.nextRunAt ?? Number.POSITIVE_INFINITY)) {
        return (left.nextRunAt ?? Number.POSITIVE_INFINITY) - (right.nextRunAt ?? Number.POSITIVE_INFINITY)
      }
      return right.updatedAt - left.updatedAt
    }),
    [workflows],
  )

  const selectedWorkflow = selectedWorkflowId
    ? sortedWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null
    : null
  const editingWorkflow = editingWorkflowId
    ? workflows.find((workflow) => workflow.id === editingWorkflowId) ?? null
    : null
  const activeWorkflowCount = workflows.filter((workflow) => workflow.trigger.type === 'schedule' && workflow.active).length

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showCreate || editingWorkflowId) return
      onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [editingWorkflowId, onClose, showCreate])

  useEffect(() => {
    if (sortedWorkflows.length === 0) {
      setSelectedWorkflowId(null)
      return
    }

    if (!selectedWorkflowId || !sortedWorkflows.some((workflow) => workflow.id === selectedWorkflowId)) {
      setSelectedWorkflowId(sortedWorkflows[0].id)
    }
  }, [selectedWorkflowId, sortedWorkflows])

  const handleCreate = (input: Parameters<typeof addWorkflow>[0]) => {
    const workflowId = addWorkflow(input)
    setSelectedWorkflowId(workflowId)
    setShowCreate(false)
  }

  const handleUpdate = (input: Parameters<typeof updateWorkflow>[1]) => {
    if (!editingWorkflowId) return
    updateWorkflow(editingWorkflowId, input)
    setEditingWorkflowId(null)
  }

  const handleDelete = (workflow: Workflow) => {
    const confirmed = window.confirm(t('workflow.details.deleteConfirm', { name: workflow.name }))
    if (!confirmed) return
    deleteWorkflow(workflow.id)
    setActionError(null)
    setSelectedWorkflowId((current) => (current === workflow.id ? null : current))
  }

  const handleRunNow = async (workflowId: string) => {
    setBusyWorkflowId(workflowId)
    setActionError(null)
    try {
      const result = await window.claude.runWorkflowNow({ workflowId })
      if (!result.ok) {
        setActionError(result.error ?? t('workflow.error.runNow'))
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyWorkflowId(null)
    }
  }

  const handleCancel = async (workflowId: string) => {
    setBusyWorkflowId(workflowId)
    setActionError(null)
    try {
      const result = await window.claude.cancelWorkflow({ workflowId })
      if (!result.ok) {
        setActionError(result.error ?? t('workflow.error.cancel'))
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyWorkflowId(null)
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-claude-bg">
      <div className="flex min-h-0 flex-1">
        <WorkflowSidebar
          workflows={sortedWorkflows}
          executions={executions}
          selectedWorkflowId={selectedWorkflowId}
          activeWorkflowCount={activeWorkflowCount}
          onCreate={() => {
            setEditingWorkflowId(null)
            setShowCreate(true)
            setActionError(null)
          }}
          onSelect={(workflowId) => {
            setSelectedWorkflowId(workflowId)
            setActionError(null)
          }}
        />

        <WorkflowDetails
          workflow={selectedWorkflow}
          executions={executions}
          actionError={actionError}
          busyWorkflowId={busyWorkflowId}
          onEdit={(workflow) => {
            setShowCreate(false)
            setEditingWorkflowId(workflow.id)
            setActionError(null)
          }}
          onDelete={handleDelete}
          onToggleActive={(workflowId) => {
            toggleWorkflowActive(workflowId)
            setActionError(null)
          }}
          onRunNow={handleRunNow}
          onCancel={handleCancel}
        />
      </div>

      {(showCreate || editingWorkflow) ? (
        <div className="absolute inset-0 z-40 bg-black/55 backdrop-blur-sm">
          <div className="flex h-full w-full items-start justify-center overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <div className="w-full max-w-5xl flex-shrink-0">
              <WorkflowForm
                initialWorkflow={editingWorkflow}
                defaultProjectPath={defaultProjectPath}
                onCancel={() => {
                  setShowCreate(false)
                  setEditingWorkflowId(null)
                }}
                onSubmit={editingWorkflow ? handleUpdate : handleCreate}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
