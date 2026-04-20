import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { nanoid } from '../../store/nanoid'
import { useWorkflowStore } from '../../store/workflowStore'
import type {
  Workflow,
  WorkflowExecution,
  WorkflowNodePosition,
  WorkflowStep,
} from '../../store/workflowTypes'
import { AppButton, AppPanel } from '../ui/appDesignSystem'
import {
  getConditionOperatorLabel,
  getStepDisplayLabel,
  getWorkflowExecutionStatusLabel,
} from './utils'

const NODE_WIDTH = 214
const NODE_HEIGHT = 84
const START_NODE_SIZE = 40
const ZOOM_MIN = 0.35
const ZOOM_MAX = 2.25
const ZOOM_STEP = 0.15

type Props = {
  workflow: Workflow | null
  executions: WorkflowExecution[]
  defaultProjectPath: string
  onEdit: (workflow: Workflow) => void
  onEditStep: (stepId: string) => void
  onCanvasBlankClick: () => void
  onOpenHistory: () => void
  onRunNow: () => void
  onCancelRun: () => void
  isRunning: boolean
  isBusy: boolean
}

type CanvasPoint = {
  x: number
  y: number
}

type DragState = {
  selectedIds: string[]
  startPoint: CanvasPoint
  startPositions: Record<string, WorkflowNodePosition>
}

type SelectionBoxState = {
  startPoint: CanvasPoint
  currentPoint: CanvasPoint
  additive: boolean
}

function isTextEntryTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  const tagName = element.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || element.isContentEditable
}

function clampZoom(value: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(value.toFixed(2))))
}

function createStep(type: WorkflowStep['type'], defaultProjectPath: string): WorkflowStep {
  if (type === 'condition') {
    return {
      type: 'condition',
      id: nanoid(),
      label: '',
      operator: 'contains',
      value: '',
      trueBranchStepId: null,
      falseBranchStepId: null,
    }
  }

  if (type === 'loop') {
    return {
      type: 'loop',
      id: nanoid(),
      label: '',
      maxIterations: 3,
      bodyStepIds: [],
      breakCondition: null,
    }
  }

  return {
    type: 'agent',
    id: nanoid(),
    label: '',
    prompt: '',
    cwd: defaultProjectPath,
    model: null,
    permissionMode: 'default',
    systemPrompt: '',
  }
}

function summarizeStep(step: WorkflowStep, language: 'ko' | 'en') {
  if (step.type === 'agent') {
    return step.prompt.trim() || step.cwd
  }

  if (step.type === 'condition') {
    return `${getConditionOperatorLabel(step.operator, language)} ${step.value}`.trim()
  }

  return language === 'ko'
    ? `최대 ${step.maxIterations}회 반복`
    : `Repeat up to ${step.maxIterations} times`
}

function resolveConfiguredNextTarget(
  step: WorkflowStep,
  sequentialTarget: string | null | undefined,
): string | null {
  const fallbackTarget = sequentialTarget ?? null
  return step.nextStepId === undefined ? fallbackTarget : step.nextStepId
}

function buildConnections(workflow: Workflow | null) {
  if (!workflow) return []

  const orderedIds = workflow.steps.map((step) => step.id)
  const nextById = new Map<string, string | null>()

  orderedIds.forEach((stepId, index) => {
    nextById.set(stepId, orderedIds[index + 1] ?? null)
  })

  return workflow.steps.flatMap((step) => {
    if (step.type === 'condition') {
      const fallbackTarget = resolveConfiguredNextTarget(step, nextById.get(step.id))
      const trueTarget = step.trueBranchStepId ?? fallbackTarget
      const falseTarget = step.falseBranchStepId ?? fallbackTarget

      if (trueTarget && falseTarget && trueTarget === falseTarget) {
        return [{ from: step.id, to: trueTarget, label: '' }]
      }

      return [
        trueTarget ? { from: step.id, to: trueTarget, label: 'T' } : null,
        falseTarget ? { from: step.id, to: falseTarget, label: 'F' } : null,
      ].filter((entry): entry is { from: string; to: string; label: string } => Boolean(entry))
    }

    if (step.type === 'loop') {
      return [
        ...step.bodyStepIds.map((stepId, index) => ({
          from: index === 0 ? step.id : step.bodyStepIds[index - 1] ?? step.id,
          to: stepId,
          label: index === 0 ? 'Loop' : '',
        })),
        step.bodyStepIds.length > 0
          ? {
              from: step.bodyStepIds[step.bodyStepIds.length - 1] ?? step.id,
              to: resolveConfiguredNextTarget(step, nextById.get(step.id)),
              label: '',
            }
          : resolveConfiguredNextTarget(step, nextById.get(step.id))
            ? { from: step.id, to: resolveConfiguredNextTarget(step, nextById.get(step.id)) as string, label: '' }
            : null,
      ].filter((entry): entry is { from: string; to: string; label: string } => Boolean(entry?.to))
    }

    const next = resolveConfiguredNextTarget(step, nextById.get(step.id))
    return next ? [{ from: step.id, to: next, label: '' }] : []
  })
}

function getCanvasBounds(workflow: Workflow | null, positions: Record<string, WorkflowNodePosition>) {
  if (!workflow || workflow.steps.length === 0) {
    return { width: 1440, height: 860 }
  }

  const maxX = workflow.steps.reduce((value, step) => Math.max(value, positions[step.id]?.x ?? 0), 0)
  const maxY = workflow.steps.reduce((value, step) => Math.max(value, positions[step.id]?.y ?? 0), 0)

  return {
    width: Math.max(1440, maxX + NODE_WIDTH + 280),
    height: Math.max(860, maxY + NODE_HEIGHT + 260),
  }
}

function getStartPosition(workflow: Workflow | null, positions: Record<string, WorkflowNodePosition>) {
  const firstStep = workflow?.steps[0]
  if (!firstStep) {
    return { x: 160, y: 320 }
  }

  const firstStepPosition = positions[firstStep.id]
  if (!firstStepPosition) {
    return { x: 160, y: 320 }
  }

  return {
    x: Math.max(72, firstStepPosition.x - 180),
    y: firstStepPosition.y + ((NODE_HEIGHT - START_NODE_SIZE) / 2),
  }
}

function toCanvasPoint(
  surface: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  zoom: number,
): CanvasPoint | null {
  if (!surface) return null
  const rect = surface.getBoundingClientRect()
  return {
    x: (clientX - rect.left) / zoom,
    y: (clientY - rect.top) / zoom,
  }
}

function StepTypeIcon({ step }: { step: WorkflowStep }) {
  if (step.type === 'loop') {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a5 5 0 10.5 6.9M15 7h-3.5M15 7v3.5" />
      </svg>
    )
  }

  if (step.type === 'condition') {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 4l6 6-6 6-6-6 6-6z" />
      </svg>
    )
  }

  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="5" height="5" rx="1" />
      <rect x="11" y="5" width="5" height="5" rx="1" />
      <rect x="7.5" y="11" width="5" height="5" rx="1" />
    </svg>
  )
}

function getNodePalette(step: WorkflowStep, selected: boolean, hasError: boolean): CSSProperties {
  const accent = hasError
    ? 'rgb(239 68 68)'
    : step.type === 'loop'
      ? 'rgb(168 85 247)'
      : step.type === 'condition'
        ? 'rgb(96 165 250)'
        : 'rgb(var(--claude-orange))'

  return {
    background: selected
      ? `color-mix(in srgb, rgb(var(--claude-surface-2)) 68%, ${accent} 32%)`
      : `color-mix(in srgb, rgb(var(--claude-surface)) 90%, ${accent} 10%)`,
    borderColor: selected
      ? `color-mix(in srgb, rgb(var(--claude-border)) 24%, ${accent} 76%)`
      : `color-mix(in srgb, rgb(var(--claude-border)) 76%, ${accent} 24%)`,
    boxShadow: selected
      ? `0 0 0 1px color-mix(in srgb, rgb(var(--claude-text)) 14%, ${accent} 86%), 0 12px 24px rgb(0 0 0 / 0.14)`
      : '0 8px 18px rgb(0 0 0 / 0.08)',
  }
}

function CanvasActionButton({
  label,
  onClick,
  disabled,
  primary,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  children: ReactNode
}) {
  return (
    <AppButton
      onClick={onClick}
      disabled={disabled}
      tone={primary ? 'accent' : 'secondary'}
      className="h-10 px-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur"
    >
      {children}
      <span>{label}</span>
    </AppButton>
  )
}

export function WorkflowCanvas({
  workflow,
  executions,
  defaultProjectPath,
  onEdit,
  onEditStep,
  onCanvasBlankClick,
  onOpenHistory,
  onRunNow,
  onCancelRun,
  isRunning,
  isBusy,
}: Props) {
  const { language, t } = useI18n()
  const selectedStepIds = useWorkflowStore((state) => state.selectedStepIds)
  const setSelectedStepIds = useWorkflowStore((state) => state.setSelectedStepIds)
  const clearSelectedStepIds = useWorkflowStore((state) => state.clearSelectedStepIds)
  const appendStep = useWorkflowStore((state) => state.appendStep)
  const setWorkflowNodePositions = useWorkflowStore((state) => state.setWorkflowNodePositions)
  const deleteSelectedSteps = useWorkflowStore((state) => state.deleteSelectedSteps)
  const copySelectedSteps = useWorkflowStore((state) => state.copySelectedSteps)
  const pasteSteps = useWorkflowStore((state) => state.pasteSteps)
  const undo = useWorkflowStore((state) => state.undo)
  const redo = useWorkflowStore((state) => state.redo)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const stepMenuRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const dragMovedRef = useRef(false)
  const [localPositions, setLocalPositions] = useState<Record<string, WorkflowNodePosition>>({})
  const localPositionsRef = useRef<Record<string, WorkflowNodePosition>>({})
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null)
  const [zoom, setZoom] = useState(1)
  const [showStepMenu, setShowStepMenu] = useState(false)

  const latestExecution = executions[0] ?? null
  const latestStepResults = useMemo(
    () => new Map(latestExecution?.stepResults.map((result) => [result.stepId, result]) ?? []),
    [latestExecution],
  )
  const workflowNodePositionsSignature = useMemo(
    () => JSON.stringify(workflow?.nodePositions ?? {}),
    [workflow?.nodePositions],
  )

  useEffect(() => {
    const nextPositions = workflow?.nodePositions ? { ...workflow.nodePositions } : {}
    if (JSON.stringify(localPositionsRef.current) !== workflowNodePositionsSignature) {
      setLocalPositions(nextPositions)
    }
    setShowStepMenu((current) => (current ? false : current))
  }, [workflow?.id, workflowNodePositionsSignature])

  useEffect(() => {
    localPositionsRef.current = localPositions
  }, [localPositions])

  useEffect(() => {
    if (!showStepMenu) return undefined

    const handlePointerDown = (event: MouseEvent) => {
      if (!stepMenuRef.current?.contains(event.target as Node)) {
        setShowStepMenu(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [showStepMenu])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!workflow || isTextEntryTarget(event.target)) return

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        if (selectedStepIds.length === 0) return
        event.preventDefault()
        copySelectedSteps(workflow.id)
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteSteps(workflow.id, { x: 40, y: 40 })
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedStepIds.length === 0) return
        event.preventDefault()
        deleteSelectedSteps(workflow.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copySelectedSteps, deleteSelectedSteps, pasteSteps, redo, selectedStepIds.length, undo, workflow])

  useEffect(() => {
    if (!dragState) return undefined

    const handleMouseMove = (event: MouseEvent) => {
      const point = toCanvasPoint(surfaceRef.current, event.clientX, event.clientY, zoom)
      if (!point) return
      const dx = point.x - dragState.startPoint.x
      const dy = point.y - dragState.startPoint.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragMovedRef.current = true
      }

      setLocalPositions((current) => {
        const next = { ...current }
        for (const stepId of dragState.selectedIds) {
          const start = dragState.startPositions[stepId]
          if (!start) continue
          next[stepId] = {
            x: Math.max(36, start.x + dx),
            y: Math.max(48, start.y + dy),
          }
        }
        return next
      })
    }

    const handleMouseUp = () => {
      if (dragMovedRef.current) {
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
      if (workflow && dragMovedRef.current) {
        setWorkflowNodePositions(workflow.id, localPositionsRef.current)
      }
      setDragState(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp, { once: true })
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState, setWorkflowNodePositions, workflow, zoom])

  useEffect(() => {
    if (!selectionBox || !workflow) return undefined

    const handleMouseMove = (event: MouseEvent) => {
      const currentPoint = toCanvasPoint(surfaceRef.current, event.clientX, event.clientY, zoom)
      if (!currentPoint) return

      setSelectionBox((current) => current ? { ...current, currentPoint } : current)

      const left = Math.min(selectionBox.startPoint.x, currentPoint.x)
      const right = Math.max(selectionBox.startPoint.x, currentPoint.x)
      const top = Math.min(selectionBox.startPoint.y, currentPoint.y)
      const bottom = Math.max(selectionBox.startPoint.y, currentPoint.y)
      const enclosed = workflow.steps
        .filter((step) => {
          const position = localPositionsRef.current[step.id]
          if (!position) return false
          return (
            position.x < right
            && position.x + NODE_WIDTH > left
            && position.y < bottom
            && position.y + NODE_HEIGHT > top
          )
        })
        .map((step) => step.id)

      setSelectedStepIds(selectionBox.additive
        ? [...new Set([...selectedStepIds, ...enclosed])]
        : enclosed)
    }

    const handleMouseUp = () => {
      setSelectionBox(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp, { once: true })
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [selectedStepIds, selectionBox, setSelectedStepIds, workflow, zoom])

  const positions = workflow?.nodePositions ?? localPositions
  const resolvedPositions = Object.keys(localPositions).length > 0 ? localPositions : positions
  const bounds = useMemo(
    () => getCanvasBounds(workflow, resolvedPositions),
    [resolvedPositions, workflow],
  )
  const startPosition = useMemo(
    () => getStartPosition(workflow, resolvedPositions),
    [resolvedPositions, workflow],
  )
  const connections = useMemo(
    () => buildConnections(workflow),
    [workflow],
  )

  const alignViewport = useCallback((nextZoom: number) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!scrollRef.current) return
        scrollRef.current.scrollLeft = Math.max(0, ((bounds.width * nextZoom) - scrollRef.current.clientWidth) / 2)
        scrollRef.current.scrollTop = Math.max(0, ((bounds.height * nextZoom) - scrollRef.current.clientHeight) / 2)
      })
    })
  }, [bounds.height, bounds.width])

  const applyZoom = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
    const container = scrollRef.current
    if (!container) return

    const normalizedZoom = clampZoom(nextZoom)
    if (normalizedZoom === zoom) return

    if (typeof clientX !== 'number' || typeof clientY !== 'number') {
      setZoom(normalizedZoom)
      alignViewport(normalizedZoom)
      return
    }

    const rect = container.getBoundingClientRect()
    const offsetX = clientX - rect.left
    const offsetY = clientY - rect.top
    const canvasX = (container.scrollLeft + offsetX) / zoom
    const canvasY = (container.scrollTop + offsetY) / zoom

    setZoom(normalizedZoom)

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!scrollRef.current) return
        scrollRef.current.scrollLeft = Math.max(0, (canvasX * normalizedZoom) - offsetX)
        scrollRef.current.scrollTop = Math.max(0, (canvasY * normalizedZoom) - offsetY)
      })
    })
  }, [alignViewport, zoom])

  const fitCanvas = useCallback(() => {
    if (!workflow || !scrollRef.current) return
    const widthScale = (scrollRef.current.clientWidth - 120) / bounds.width
    const heightScale = (scrollRef.current.clientHeight - 120) / bounds.height
    const nextZoom = clampZoom(Math.min(widthScale, heightScale, 1))
    setZoom(nextZoom)
    alignViewport(nextZoom)
  }, [alignViewport, bounds.height, bounds.width, workflow])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return undefined

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const nextZoom = clampZoom(zoom * Math.exp(-event.deltaY * 0.0025))
      applyZoom(nextZoom, event.clientX, event.clientY)
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [applyZoom, zoom])

  useEffect(() => {
    if (!workflow) return
    fitCanvas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow?.id, workflow?.steps.length])

  if (!workflow) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden bg-claude-bg">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(var(--claude-border) / 0.24) 1px, transparent 0)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="relative max-w-sm px-6 text-center">
          <p className="text-base font-medium text-claude-text">{t('workflow.canvas.emptyTitle')}</p>
          <p className="mt-2 text-sm leading-6 text-claude-muted">{t('workflow.canvas.emptyDescription')}</p>
        </div>
      </div>
    )
  }

  const appendNewStep = (type: WorkflowStep['type']) => {
    const anchor = workflow.steps.reduce<WorkflowNodePosition>(
      (current, step) => {
        const position = resolvedPositions[step.id]
        if (!position) return current
        return position.x > current.x ? position : current
      },
      { x: 280, y: 300 },
    )

    appendStep(
      workflow.id,
      createStep(type, defaultProjectPath),
      { x: anchor.x + NODE_WIDTH + 120, y: anchor.y },
    )
    setShowStepMenu(false)
  }

  return (
    <div className="relative h-full overflow-hidden bg-claude-bg">
      <div
        className="absolute inset-0 opacity-80"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(var(--claude-border) / 0.24) 1px, transparent 0)',
          backgroundSize: '36px 36px',
        }}
      />

      <div
        ref={scrollRef}
        className="relative h-full w-full overflow-auto"
      >
        <div
          className="relative"
          style={{ width: bounds.width * zoom, height: bounds.height * zoom }}
        >
          <div
            ref={surfaceRef}
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: bounds.width, height: bounds.height, transform: `scale(${zoom})` }}
            onMouseDown={(event) => {
              if (event.button !== 0 || event.target !== event.currentTarget) return
              onCanvasBlankClick()
              const point = toCanvasPoint(event.currentTarget, event.clientX, event.clientY, zoom)
              if (!point) return
              if (!event.shiftKey) {
                clearSelectedStepIds()
              }
              setSelectionBox({
                startPoint: point,
                currentPoint: point,
                additive: event.shiftKey,
              })
            }}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <defs>
                <marker id="workflow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="rgb(var(--claude-muted) / 0.75)" />
                </marker>
              </defs>

              {workflow.steps[0] ? (
                <path
                  d={`M ${startPosition.x + START_NODE_SIZE} ${startPosition.y + (START_NODE_SIZE / 2)} C ${
                    startPosition.x + 100
                  } ${startPosition.y + (START_NODE_SIZE / 2)}, ${
                    (resolvedPositions[workflow.steps[0].id]?.x ?? 0) - 60
                  } ${startPosition.y + (START_NODE_SIZE / 2)}, ${
                    resolvedPositions[workflow.steps[0].id]?.x ?? 0
                  } ${(resolvedPositions[workflow.steps[0].id]?.y ?? 0) + (NODE_HEIGHT / 2)}`}
                  fill="none"
                  stroke="rgb(var(--claude-muted) / 0.56)"
                  strokeWidth="2"
                  markerEnd="url(#workflow-arrow)"
                />
              ) : null}

              {connections.map((connection, index) => {
                const from = resolvedPositions[connection.from]
                const to = resolvedPositions[connection.to]
                if (!from || !to) return null

                const startX = from.x + NODE_WIDTH
                const startY = from.y + (NODE_HEIGHT / 2)
                const endX = to.x
                const endY = to.y + (NODE_HEIGHT / 2)
                const midX = startX + ((endX - startX) / 2)

                return (
                  <g key={`${connection.from}-${connection.to}-${index}`}>
                    <path
                      d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                      fill="none"
                      stroke="rgb(var(--claude-muted) / 0.56)"
                      strokeWidth="2"
                      markerEnd="url(#workflow-arrow)"
                    />
                    {connection.label ? (
                      <text
                        x={midX}
                        y={((startY + endY) / 2) - 8}
                        textAnchor="middle"
                        fill="rgb(var(--claude-muted) / 0.9)"
                        className="text-[10px]"
                      >
                        {connection.label}
                      </text>
                    ) : null}
                  </g>
                )
              })}
            </svg>

            <div
              className="pointer-events-none absolute"
              style={{ left: startPosition.x, top: startPosition.y }}
            >
              <div className="relative flex flex-col items-center">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                  style={{
                    background: 'color-mix(in srgb, rgb(var(--claude-surface-2)) 54%, rgb(34 197 94) 46%)',
                    boxShadow: '0 0 22px color-mix(in srgb, rgb(var(--claude-surface-2)) 40%, rgb(34 197 94) 60%)',
                  }}
                >
                  <svg className="ml-0.5 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6 4.8c0-.74.82-1.2 1.46-.82l8.07 4.85a.95.95 0 010 1.64l-8.07 4.85A.95.95 0 016 14.5V4.8z" />
                  </svg>
                </div>
                <div className="mt-2 text-[11px] text-claude-muted">{t('workflow.canvas.start')}</div>
              </div>
            </div>

            {workflow.steps.map((step, index) => {
              const position = resolvedPositions[step.id]
              if (!position) return null

              const result = latestStepResults.get(step.id)
              const selected = selectedStepIds.includes(step.id)
              const hasError = Boolean(result?.error)

              return (
                <button
                  key={step.id}
                  type="button"
                  title={summarizeStep(step, language)}
                  className="absolute flex h-[84px] w-[214px] flex-col rounded-md border px-3 py-3 text-left text-claude-text transition-[background-color,border-color,box-shadow] duration-150"
                  style={{ left: position.x, top: position.y, ...getNodePalette(step, selected, hasError) }}
                  onMouseDown={(event) => {
                    event.stopPropagation()
                    dragMovedRef.current = false
                    suppressClickRef.current = false
                    const additive = event.shiftKey
                    const nextSelectedIds = additive
                      ? (selected ? selectedStepIds : [...selectedStepIds, step.id])
                      : (selected ? selectedStepIds : [step.id])

                    setSelectedStepIds(nextSelectedIds)

                    const startPoint = toCanvasPoint(surfaceRef.current, event.clientX, event.clientY, zoom)
                    if (!startPoint) return

                    setDragState({
                      selectedIds: nextSelectedIds,
                      startPoint,
                      startPositions: Object.fromEntries(
                        nextSelectedIds.map((stepId) => [stepId, resolvedPositions[stepId]]),
                      ),
                    })
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (event.shiftKey || suppressClickRef.current) return
                    onEditStep(step.id)
                  }}
                >
                  <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-claude-border bg-claude-bg" />
                  <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-claude-border bg-claude-bg" />

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border border-claude-border bg-claude-bg/70 text-claude-muted">
                        <StepTypeIcon step={step} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-claude-text">
                          {getStepDisplayLabel(step, index, language)}
                        </div>
                        <div className="mt-1 text-[11px] text-claude-muted">
                          {t(`workflow.step.${step.type}`)}
                        </div>
                      </div>
                    </div>

                    {result ? (
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                        result.status === 'error'
                          ? 'bg-red-500/[0.18] text-red-200'
                          : result.status === 'running'
                            ? 'bg-sky-500/[0.18] text-sky-200'
                            : 'bg-emerald-500/[0.18] text-emerald-200'
                      }`}
                      >
                        {getWorkflowExecutionStatusLabel(
                          result.status === 'skipped' ? 'cancelled' : result.status,
                          language,
                        )}
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })}

            {selectionBox ? (
              <div
                className="pointer-events-none absolute border border-claude-orange/60 bg-claude-orange/10"
                style={{
                  left: Math.min(selectionBox.startPoint.x, selectionBox.currentPoint.x),
                  top: Math.min(selectionBox.startPoint.y, selectionBox.currentPoint.y),
                  width: Math.abs(selectionBox.currentPoint.x - selectionBox.startPoint.x),
                  height: Math.abs(selectionBox.currentPoint.y - selectionBox.startPoint.y),
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-5 z-20 flex flex-col overflow-hidden rounded-md border border-claude-border bg-claude-surface shadow-lg">
        <button
          type="button"
          onClick={() => {
            applyZoom(zoom + ZOOM_STEP)
          }}
          className="flex h-9 w-9 items-center justify-center border-b border-claude-border text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          aria-label="Zoom in"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" d="M10 5v10M5 10h10" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => {
            applyZoom(zoom - ZOOM_STEP)
          }}
          className="flex h-9 w-9 items-center justify-center border-b border-claude-border text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          aria-label="Zoom out"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" d="M5 10h10" />
          </svg>
        </button>
        <button
          type="button"
          onClick={fitCanvas}
          className="flex h-9 w-9 items-center justify-center border-b border-claude-border text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          aria-label="Fit canvas"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 4H4v3M13 4h3v3M16 13v3h-3M4 13v3h3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => {
            applyZoom(1)
          }}
          className="flex h-9 w-9 items-center justify-center text-[10px] font-medium text-claude-muted transition-colors hover:bg-claude-surface-2 hover:text-claude-text"
          aria-label="Reset zoom"
        >
          1:1
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
        <div ref={stepMenuRef} className="pointer-events-auto relative">
          <CanvasActionButton
            label={t('workflow.canvas.action.addStep')}
            onClick={() => setShowStepMenu((current) => !current)}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" d="M10 5v10M5 10h10" />
            </svg>
          </CanvasActionButton>

          {showStepMenu ? (
            <AppPanel className="absolute bottom-[calc(100%+10px)] left-0 w-44 rounded-md p-1 shadow-xl">
              <button
                type="button"
                onClick={() => appendNewStep('agent')}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-claude-text transition-colors hover:bg-claude-surface"
              >
                <StepTypeIcon step={{ type: 'agent', id: '', label: '', prompt: '', cwd: '', model: null, permissionMode: 'default', systemPrompt: '' }} />
                {t('workflow.canvas.addAgent')}
              </button>
              <button
                type="button"
                onClick={() => appendNewStep('condition')}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-claude-text transition-colors hover:bg-claude-surface"
              >
                <StepTypeIcon step={{ type: 'condition', id: '', label: '', operator: 'contains', value: '', trueBranchStepId: null, falseBranchStepId: null }} />
                {t('workflow.canvas.addCondition')}
              </button>
              <button
                type="button"
                onClick={() => appendNewStep('loop')}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-claude-text transition-colors hover:bg-claude-surface"
              >
                <StepTypeIcon step={{ type: 'loop', id: '', label: '', maxIterations: 3, bodyStepIds: [], breakCondition: null }} />
                {t('workflow.canvas.addLoop')}
              </button>
            </AppPanel>
          ) : null}
        </div>

        <div className="pointer-events-auto">
          <CanvasActionButton
            label={t('workflow.canvas.action.trigger')}
            onClick={() => onEdit(workflow)}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 3v4m0 6v4M3 10h4m6 0h4M5.6 5.6l2.8 2.8m3.2 3.2l2.8 2.8m0-8.8l-2.8 2.8M8.4 11.6l-2.8 2.8" />
            </svg>
          </CanvasActionButton>
        </div>

        <div className="pointer-events-auto">
          <CanvasActionButton
            label={t('workflow.canvas.action.history')}
            onClick={onOpenHistory}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 4.75h8A1.25 1.25 0 0115.25 6v8A1.25 1.25 0 0114 15.25H6A1.25 1.25 0 014.75 14V6A1.25 1.25 0 016 4.75z" />
              <path strokeLinecap="round" d="M7.5 8h5M7.5 11h5" />
            </svg>
          </CanvasActionButton>
        </div>

        <div className="pointer-events-auto">
          <CanvasActionButton
            label={isRunning ? t('workflow.canvas.action.cancelRun') : t('workflow.canvas.action.runNow')}
            onClick={() => {
              if (isRunning) {
                onCancelRun()
              } else {
                onRunNow()
              }
            }}
            disabled={isBusy}
            primary
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill={isRunning ? 'none' : 'currentColor'} stroke={isRunning ? 'currentColor' : 'none'} strokeWidth="1.8">
              {isRunning ? (
                <rect x="6.5" y="6.5" width="7" height="7" rx="1.5" />
              ) : (
                <path d="M6 4.8c0-.74.82-1.2 1.46-.82l8.07 4.85a.95.95 0 010 1.64l-8.07 4.85A.95.95 0 016 14.5V4.8z" />
              )}
            </svg>
          </CanvasActionButton>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 z-20 text-[11px] text-claude-muted/70">
        {selectedStepIds.length > 0 ? `${t('workflow.canvas.selectedCount', { count: selectedStepIds.length })} · ` : ''}
        {t('workflow.canvas.shortcuts')}
      </div>
    </div>
  )
}
