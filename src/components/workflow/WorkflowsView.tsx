import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { nanoid } from '../../store/nanoid'
import { useWorkflowStore } from '../../store/workflowStore'
import type { Workflow, WorkflowExecution, WorkflowInput, WorkflowStep } from '../../store/workflowTypes'
import { WorkflowCanvas } from './WorkflowCanvas'
import { workflowToInput } from './editorShared'
import { WorkflowSidebar } from './WorkflowSidebar'
import { WorkflowStepEditor } from './WorkflowStepEditor'
import { WorkflowTriggerEditor } from './WorkflowTriggerEditor'
import { AppButton, AppChip, AppPanel, appFieldClassName } from '../ui/appDesignSystem'
import {
  describeWorkflowTrigger,
  formatWorkflowDateTime,
  getStepDisplayLabel,
  getWorkflowExecutionStatusClassName,
  getWorkflowExecutionStatusLabel,
  truncateWorkflowOutput,
} from './utils'

type Props = {
  defaultProjectPath: string
  onClose: () => void
}

type TemplateId = 'blank' | 'code-review' | 'doc-summary'

function createTemplateWorkflow(templateId: TemplateId, name: string, defaultProjectPath: string): WorkflowInput {
  const createAgentStep = (label: string, prompt: string): Extract<WorkflowStep, { type: 'agent' }> => ({
    type: 'agent',
    id: nanoid(),
    label,
    prompt,
    cwd: defaultProjectPath,
    model: null,
    permissionMode: 'default',
    systemPrompt: '',
  })

  const steps = templateId === 'code-review'
    ? [
        createAgentStep(
          '코드 리뷰',
          '최근 변경사항을 검토하고, 회귀 위험과 빠진 검증을 중심으로 요약해줘.',
        ),
      ]
    : templateId === 'doc-summary'
      ? [
          createAgentStep(
            '문서 요약',
            '현재 작업 디렉터리의 핵심 문서를 읽고, 오늘 바로 참고할 만한 요점을 정리해줘.',
          ),
        ]
      : [createAgentStep('', '')]

  return {
    name,
    steps,
    trigger: { type: 'manual' },
    active: false,
    nodePositions: steps.reduce<Record<string, { x: number; y: number }>>((acc, step, index) => {
      acc[step.id] = { x: 280 + (index * 320), y: 300 }
      return acc
    }, {}),
  }
}

function buildWorkflowSummary(workflow: Workflow, language: 'ko' | 'en') {
  if (workflow.steps.length === 0) {
    return language === 'ko'
      ? '단계를 추가해 실행 흐름을 구성하세요.'
      : 'Add steps to define the execution flow.'
  }

  const labels = workflow.steps
    .slice(0, 4)
    .map((step, index) => getStepDisplayLabel(step, index, language))
  const route = labels.join(' → ')
  const loopStep = workflow.steps.find((step): step is Extract<WorkflowStep, { type: 'loop' }> => step.type === 'loop')

  if (language === 'ko') {
    if (loopStep) {
      return `${route} 흐름으로 실행되며 반복 단계는 최대 ${loopStep.maxIterations}회까지 수행됩니다.`
    }
    return `${route} 순서로 실행됩니다.`
  }

  if (loopStep) {
    return `Runs ${route} with the loop step repeating up to ${loopStep.maxIterations} times.`
  }
  return `Runs ${route} in sequence.`
}

function formatExecutionDuration(execution: WorkflowExecution, language: 'ko' | 'en') {
  if (!execution.finishedAt) return null
  const seconds = Math.max(1, Math.round((execution.finishedAt - execution.firedAt) / 1000))
  return language === 'ko' ? `${seconds}초` : `${seconds}s`
}

function WorkflowHistoryPanel({
  workflow,
  executions,
  onClose,
}: {
  workflow: Workflow
  executions: WorkflowExecution[]
  onClose: () => void
}) {
  const { language, t } = useI18n()
  const stepLabelMap = useMemo(
    () => new Map(workflow.steps.map((step, index) => [step.id, getStepDisplayLabel(step, index, language)])),
    [language, workflow.steps],
  )

  return (
    <AppPanel className="absolute right-4 top-4 z-30 flex h-[min(520px,calc(100%-6rem))] w-[360px] flex-col overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-claude-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-claude-text">{t('workflow.details.history')}</div>
          <div className="mt-1 text-[11px] text-claude-muted">{workflow.name}</div>
        </div>
        <AppButton onClick={onClose} tone="ghost">
          {t('workflow.create.cancel')}
        </AppButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {executions.length === 0 ? (
          <div className="rounded-md border border-dashed border-claude-border bg-claude-bg/60 px-4 py-5 text-sm text-claude-muted">
            <div className="font-medium text-claude-text">{t('workflow.details.noHistory')}</div>
            <div className="mt-2 text-xs leading-5 text-claude-muted">{t('workflow.details.noHistoryDescription')}</div>
          </div>
        ) : (
          <div className="space-y-3">
            {executions.map((execution) => {
              const duration = formatExecutionDuration(execution, language)
              return (
                <section
                  key={execution.id}
                  className="rounded-md border border-claude-border bg-claude-surface/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${getWorkflowExecutionStatusClassName(execution.status)}`}>
                          {getWorkflowExecutionStatusLabel(execution.status, language)}
                        </span>
                        <span className="text-[11px] text-claude-muted">
                          {t(`workflow.execution.${execution.triggeredBy}`)}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-claude-muted">
                        {formatWorkflowDateTime(execution.firedAt, language)}
                        {duration ? ` · ${duration}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {execution.stepResults.length === 0 ? (
                      <div className="text-xs text-claude-muted">
                        {t('workflow.status.running')}
                      </div>
                    ) : execution.stepResults.map((stepResult) => (
                      <div
                        key={`${execution.id}-${stepResult.stepId}`}
                        className="rounded-md border border-claude-border bg-claude-bg px-2.5 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-[12px] font-medium text-claude-text">
                            {stepLabelMap.get(stepResult.stepId) ?? stepResult.stepId}
                          </div>
                          <div className="text-[10px] text-claude-muted">
                            {getWorkflowExecutionStatusLabel(
                              stepResult.status === 'skipped' ? 'cancelled' : stepResult.status,
                              language,
                            )}
                          </div>
                        </div>
                        {stepResult.error ? (
                          <div className="mt-2 text-[11px] leading-5 text-red-300/90">
                            {truncateWorkflowOutput(stepResult.error, 120)}
                          </div>
                        ) : stepResult.output ? (
                          <div className="mt-2 text-[11px] leading-5 text-claude-muted">
                            {truncateWorkflowOutput(stepResult.output, 120)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </AppPanel>
  )
}

export function WorkflowsView({
  defaultProjectPath,
  onClose,
}: Props) {
  const { t, language } = useI18n()
  const workflows = useWorkflowStore((state) => state.workflows)
  const executions = useWorkflowStore((state) => state.executions)
  const selectedWorkflowId = useWorkflowStore((state) => state.selectedWorkflowId)
  const setSelectedWorkflowId = useWorkflowStore((state) => state.setSelectedWorkflowId)
  const addWorkflow = useWorkflowStore((state) => state.addWorkflow)
  const updateWorkflow = useWorkflowStore((state) => state.updateWorkflow)
  const updateWorkflowName = useWorkflowStore((state) => state.updateWorkflowName)
  const duplicateWorkflow = useWorkflowStore((state) => state.duplicateWorkflow)

  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('blank')
  const [busyWorkflowId, setBusyWorkflowId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)

  const sortedWorkflows = useMemo(
    () => [...workflows].sort((left, right) => right.updatedAt - left.updatedAt),
    [workflows],
  )

  const selectedWorkflow = selectedWorkflowId
    ? sortedWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null
    : null
  const editingWorkflow = editingWorkflowId
    ? workflows.find((workflow) => workflow.id === editingWorkflowId) ?? null
    : null
  const editingStep = editingStepId && selectedWorkflow
    ? selectedWorkflow.steps.find((step) => step.id === editingStepId) ?? null
    : null
  const workflowExecutions = useMemo(
    () => (
      selectedWorkflow
        ? executions
          .filter((execution) => execution.workflowId === selectedWorkflow.id)
          .sort((left, right) => right.firedAt - left.firedAt)
        : []
    ),
    [executions, selectedWorkflow],
  )
  const latestExecution = workflowExecutions[0] ?? null
  const isRunning = latestExecution?.status === 'running'

  useEffect(() => {
    if (!selectedWorkflowId && sortedWorkflows[0]) {
      setSelectedWorkflowId(sortedWorkflows[0].id)
    }
  }, [selectedWorkflowId, setSelectedWorkflowId, sortedWorkflows])

  useEffect(() => {
    if (!selectedWorkflow || editingName) return
    setDraftName(selectedWorkflow.name)
  }, [editingName, selectedWorkflow])

  useEffect(() => {
    setShowHistoryPanel(false)
  }, [selectedWorkflowId])

  useEffect(() => {
    if (!editingStepId || !selectedWorkflow) return
    if (!selectedWorkflow.steps.some((step) => step.id === editingStepId)) {
      setEditingStepId(null)
    }
  }, [editingStepId, selectedWorkflow])

  useEffect(() => {
    if (!actionError) return undefined
    const timer = window.setTimeout(() => setActionError(null), 5000)
    return () => window.clearTimeout(timer)
  }, [actionError])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (editingWorkflowId) {
        setEditingWorkflowId(null)
        return
      }
      if (showCreateModal || editingName) return
      if (editingStepId) {
        setEditingStepId(null)
        return
      }
      if (showHistoryPanel) {
        setShowHistoryPanel(false)
        return
      }
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editingName, editingStepId, editingWorkflowId, onClose, showCreateModal, showHistoryPanel])

  const handleCreateWorkflow = () => {
    const normalizedName = createName.trim()
    if (!normalizedName) {
      setActionError(t('workflow.create.validation.name'))
      return
    }

    const workflowId = addWorkflow(createTemplateWorkflow(selectedTemplate, normalizedName, defaultProjectPath))
    setSelectedWorkflowId(workflowId)
    setCreateName('')
    setSelectedTemplate('blank')
    setShowCreateModal(false)
    setActionError(null)
  }

  const handleRunNow = async () => {
    if (!selectedWorkflow) return
    setBusyWorkflowId(selectedWorkflow.id)
    setActionError(null)
    try {
      const result = await window.claude.runWorkflowNow({ workflowId: selectedWorkflow.id })
      if (!result.ok) {
        setActionError(result.error ?? t('workflow.error.runNow'))
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyWorkflowId(null)
    }
  }

  const handleCancel = async () => {
    if (!selectedWorkflow) return
    setBusyWorkflowId(selectedWorkflow.id)
    setActionError(null)
    try {
      const result = await window.claude.cancelWorkflow({ workflowId: selectedWorkflow.id })
      if (!result.ok) {
        setActionError(result.error ?? t('workflow.error.cancel'))
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyWorkflowId(null)
    }
  }

  const handleDuplicate = (workflowId: string) => {
    const duplicatedId = duplicateWorkflow(workflowId)
    if (duplicatedId) {
      setSelectedWorkflowId(duplicatedId)
      setActionError(null)
    }
  }

  const commitWorkflowName = () => {
    if (!selectedWorkflow) return
    const normalized = draftName.trim()
    if (!normalized) {
      setDraftName(selectedWorkflow.name)
      setEditingName(false)
      return
    }
    updateWorkflowName(selectedWorkflow.id, normalized)
    setEditingName(false)
  }

  const handleStepSave = (nextStep: WorkflowStep) => {
    if (!selectedWorkflow) return
    const currentStep = selectedWorkflow.steps.find((step) => step.id === nextStep.id)
    if (!currentStep) return
    if (JSON.stringify(currentStep) === JSON.stringify(nextStep)) return
    const input = workflowToInput(selectedWorkflow)
    updateWorkflow(selectedWorkflow.id, {
      ...input,
      steps: input.steps.map((step) => (step.id === nextStep.id ? nextStep : step)),
    })
  }

  const handleStepDelete = () => {
    if (!selectedWorkflow || !editingStepId) return
    const targetIndex = selectedWorkflow.steps.findIndex((step) => step.id === editingStepId)
    const target = targetIndex >= 0 ? selectedWorkflow.steps[targetIndex] : null
    if (!target) return
    const targetLabel = getStepDisplayLabel(target, targetIndex, language)

    const confirmed = window.confirm(
      t('workflow.stepEditor.deleteConfirm', { name: targetLabel }),
    )
    if (!confirmed) return

    const input = workflowToInput(selectedWorkflow)
    updateWorkflow(selectedWorkflow.id, {
      ...input,
      steps: input.steps.filter((step) => step.id !== editingStepId),
      nodePositions: input.nodePositions
        ? Object.fromEntries(
            Object.entries(input.nodePositions).filter(([stepId]) => stepId !== editingStepId),
          )
        : undefined,
    })
    setEditingStepId(null)
  }

  return (
    <div className="relative flex h-full overflow-hidden bg-claude-bg">
      <WorkflowSidebar
        workflows={sortedWorkflows}
        executions={executions}
        selectedWorkflowId={selectedWorkflowId}
        activeWorkflowCount={sortedWorkflows.filter((workflow) => workflow.active).length}
        onCreate={() => {
          setShowCreateModal(true)
          setCreateName('')
          setSelectedTemplate('blank')
          setActionError(null)
          setEditingStepId(null)
        }}
        onSelect={(workflowId) => {
          setSelectedWorkflowId(workflowId)
          setActionError(null)
        }}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-claude-border bg-claude-panel px-5 py-4">
          {selectedWorkflow ? (
            <div className="min-w-0">
              {editingName ? (
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={commitWorkflowName}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitWorkflowName()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setDraftName(selectedWorkflow.name)
                      setEditingName(false)
                    }
                  }}
                  className={`${appFieldClassName} max-w-[420px] py-2 text-lg font-semibold`}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="max-w-full truncate text-left text-lg font-semibold text-claude-text"
                >
                  {selectedWorkflow.name}
                </button>
              )}

              <p className="mt-2 max-w-2xl text-xs leading-5 text-claude-muted">
                {buildWorkflowSummary(selectedWorkflow, language)}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <AppChip>{describeWorkflowTrigger(selectedWorkflow, language)}</AppChip>
                <AppChip>{t('workflow.meta.lastRun')}: {formatWorkflowDateTime(selectedWorkflow.lastRunAt, language)}</AppChip>
                {selectedWorkflow.trigger.type === 'schedule' ? (
                  <AppChip>{t('workflow.meta.nextRun')}: {formatWorkflowDateTime(selectedWorkflow.nextRunAt, language)}</AppChip>
                ) : null}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-medium text-claude-text">{t('workflow.details.selectTitle')}</div>
              <p className="mt-2 text-xs leading-5 text-claude-muted">{t('workflow.details.selectDescription')}</p>
            </div>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {selectedWorkflow ? (
              <>
                <AppButton
                  tone="secondary"
                  onClick={() => {
                    setShowHistoryPanel((current) => !current)
                    setEditingWorkflowId(null)
                    setEditingStepId(null)
                  }}
                >
                  {t('workflow.details.history')}
                </AppButton>
                <AppButton
                  tone="secondary"
                  onClick={() => {
                    setEditingWorkflowId(selectedWorkflow.id)
                    setEditingStepId(null)
                    setShowHistoryPanel(false)
                  }}
                >
                  {t('workflow.canvas.action.trigger')}
                </AppButton>
                {isRunning ? (
                  <AppButton tone="danger" disabled={busyWorkflowId === selectedWorkflow.id} onClick={() => void handleCancel()}>
                    {t('workflow.details.cancel')}
                  </AppButton>
                ) : (
                  <AppButton tone="accent" disabled={busyWorkflowId === selectedWorkflow.id} onClick={() => void handleRunNow()}>
                    {t('workflow.details.runNow')}
                  </AppButton>
                )}
                <AppButton tone="secondary" onClick={() => handleDuplicate(selectedWorkflow.id)}>
                  {t('workflow.actions.duplicate')}
                </AppButton>
              </>
            ) : null}
            <AppButton onClick={onClose} size="icon" tone="ghost" aria-label={t('workflow.create.cancel')}>
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
              </svg>
            </AppButton>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
        <WorkflowCanvas
          workflow={selectedWorkflow}
          executions={workflowExecutions}
          defaultProjectPath={defaultProjectPath}
          onEdit={(workflow) => {
            setEditingWorkflowId(workflow.id)
            setEditingStepId(null)
            setShowHistoryPanel(false)
          }}
          onEditStep={(stepId) => {
            setEditingWorkflowId(null)
            setEditingStepId(stepId)
            setShowHistoryPanel(false)
          }}
          onCanvasBlankClick={() => {
            setEditingWorkflowId(null)
            setEditingStepId(null)
            setShowHistoryPanel(false)
          }}
          onOpenHistory={() => {
            setEditingWorkflowId(null)
            setEditingStepId(null)
            setShowHistoryPanel((current) => !current)
          }}
          onRunNow={() => void handleRunNow()}
          onCancelRun={() => void handleCancel()}
          isRunning={isRunning}
          isBusy={selectedWorkflow ? busyWorkflowId === selectedWorkflow.id : false}
        />

        {selectedWorkflow && showHistoryPanel ? (
          <WorkflowHistoryPanel
            workflow={selectedWorkflow}
            executions={workflowExecutions}
            onClose={() => setShowHistoryPanel(false)}
          />
        ) : null}

        {selectedWorkflow && editingStep ? (
          <WorkflowStepEditor
            workflow={selectedWorkflow}
            stepId={editingStep.id}
            defaultProjectPath={defaultProjectPath}
            onCancel={() => setEditingStepId(null)}
            onDelete={handleStepDelete}
            onSubmit={handleStepSave}
          />
        ) : null}

        {selectedWorkflow && editingWorkflow ? (
          <WorkflowTriggerEditor
            key={editingWorkflow.id}
            workflow={editingWorkflow}
            onCancel={() => setEditingWorkflowId(null)}
            onSubmit={({ trigger, active }) => {
              const input = workflowToInput(editingWorkflow)
              updateWorkflow(editingWorkflow.id, {
                ...input,
                trigger,
                active,
              })
              setEditingWorkflowId(null)
            }}
          />
        ) : null}

        {actionError ? (
          <div className="absolute right-4 top-4 z-40 max-w-sm rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200 shadow-lg">
            {actionError}
          </div>
        ) : null}
      </div>

      {showCreateModal ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <AppPanel className="w-full max-w-xl p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-claude-text">{t('workflow.create.title')}</h2>
            <div className="mt-4">
              <label className="block text-sm font-medium text-claude-text">
                {t('workflow.create.name')}
              </label>
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={t('workflow.create.namePlaceholder')}
                className={`${appFieldClassName} mt-2 h-10`}
              />
            </div>

            <div className="mt-5">
              <div className="text-sm font-medium text-claude-text">{t('workflow.create.templates')}</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {([
                  { id: 'blank', titleKey: 'workflow.create.template.blank.title', descKey: 'workflow.create.template.blank.description' },
                  { id: 'code-review', titleKey: 'workflow.create.template.review.title', descKey: 'workflow.create.template.review.description' },
                  { id: 'doc-summary', titleKey: 'workflow.create.template.docs.title', descKey: 'workflow.create.template.docs.description' },
                ] as const).map((template) => {
                  const active = selectedTemplate === template.id
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplate(template.id)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        active
                          ? 'border-claude-orange/40 bg-claude-orange/10'
                          : 'border-claude-border bg-claude-bg hover:bg-claude-surface'
                      }`}
                    >
                      <div className="text-sm font-medium text-claude-text">{t(template.titleKey)}</div>
                      <div className="mt-2 text-xs leading-5 text-claude-muted">{t(template.descKey)}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <AppButton onClick={() => setShowCreateModal(false)} tone="ghost">
                {t('workflow.create.cancel')}
              </AppButton>
              <AppButton onClick={handleCreateWorkflow} tone="accent">
                {t('workflow.create.submit')}
              </AppButton>
            </div>
          </AppPanel>
        </div>
      ) : null}

      </div>
    </div>
  )
}
