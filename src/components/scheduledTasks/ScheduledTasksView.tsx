import { useEffect, useMemo, useState } from 'react'
import { ScheduledTaskForm } from '../ScheduledTaskForm'
import { useI18n } from '../../hooks/useI18n'
import { useSessionsStore } from '../../store/sessions'
import {
  useScheduledTasksStore,
  type ScheduledTask,
  type ScheduledTaskInput,
} from '../../store/scheduledTasks'
import { ScheduledTaskDetails } from './ScheduledTaskDetails'
import { ScheduledTasksHeader } from './ScheduledTasksHeader'
import { ScheduledTaskInbox } from './ScheduledTaskInbox'
import { ScheduledTaskSidebar } from './ScheduledTaskSidebar'
import { buildInboxItem } from './utils'

type Props = {
  defaultProjectPath: string
  onClose: () => void
  onSelectSession: (sessionId: string) => void
}

export function ScheduledTasksView({
  defaultProjectPath,
  onClose,
  onSelectSession,
}: Props) {
  const { language } = useI18n()
  const tasks = useScheduledTasksStore((state) => state.tasks)
  const sessions = useSessionsStore((state) => state.sessions)
  const addTask = useScheduledTasksStore((state) => state.addTask)
  const updateTask = useScheduledTasksStore((state) => state.updateTask)
  const deleteTask = useScheduledTasksStore((state) => state.deleteTask)
  const toggleTaskEnabled = useScheduledTasksStore((state) => state.toggleTaskEnabled)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [runNowLoadingId, setRunNowLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showCreate || editingTask) return
      if (inboxOpen) {
        setInboxOpen(false)
        return
      }
      onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [editingTask, inboxOpen, onClose, showCreate])

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTaskId(null)
      return
    }

    if (!selectedTaskId || !tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(tasks[0].id)
    }
  }, [selectedTaskId, tasks])

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      if (a.nextRunAt == null && b.nextRunAt != null) return 1
      if (a.nextRunAt != null && b.nextRunAt == null) return -1
      return (a.nextRunAt ?? a.updatedAt) - (b.nextRunAt ?? b.updatedAt)
    }),
    [tasks],
  )

  const selectedTask = selectedTaskId
    ? sortedTasks.find((task) => task.id === selectedTaskId) ?? null
    : null

  const activeTaskCount = sortedTasks.filter((task) => task.enabled && task.frequency !== 'manual').length
  const sessionIds = useMemo(() => new Set(sessions.map((session) => session.id)), [sessions])
  const sessionById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session] as const)),
    [sessions],
  )
  const inboxItems = useMemo(
    () => tasks
      .flatMap((task) =>
        task.runHistory.map((record) =>
          buildInboxItem(task, record, record.sessionTabId ? sessionById.get(record.sessionTabId) ?? null : null, language),
        ),
      )
      .sort((a, b) => b.record.runAt - a.record.runAt)
      .slice(0, 8),
    [language, sessionById, tasks],
  )
  const inboxCounts = useMemo(
    () => ({
      running: inboxItems.filter((item) => item.state === 'running' || item.state === 'approval').length,
      failed: inboxItems.filter((item) => item.state === 'failed').length,
      completed: inboxItems.filter((item) => item.state === 'completed').length,
    }),
    [inboxItems],
  )
  const inboxBadgeCount = inboxCounts.running + inboxCounts.failed + inboxCounts.completed

  const handleCreate = (input: ScheduledTaskInput) => {
    const taskId = addTask(input)
    setSelectedTaskId(taskId)
    setShowCreate(false)
  }

  const handleUpdate = (input: ScheduledTaskInput) => {
    if (!editingTask) return
    updateTask(editingTask.id, input)
    setEditingTask(null)
  }

  const handleRunNow = async (taskId: string) => {
    setRunNowLoadingId(taskId)
    try {
      await window.claude.runScheduledTaskNow({ taskId })
    } finally {
      setRunNowLoadingId(null)
    }
  }

  const openCreateModal = () => {
    setEditingTask(null)
    setShowCreate(true)
  }

  const handleDeleteTask = (taskId: string) => {
    deleteTask(taskId)
    setSelectedTaskId((current) => (current === taskId ? null : current))
  }

  const handleOpenInboxTask = (taskId: string) => {
    setSelectedTaskId(taskId)
    setInboxOpen(false)
  }

  const handleOpenInboxSession = (sessionId: string) => {
    onSelectSession(sessionId)
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-claude-bg">
      <ScheduledTasksHeader
        activeTaskCount={activeTaskCount}
        inboxBadgeCount={inboxBadgeCount}
        onOpenInbox={() => setInboxOpen(true)}
        onClose={onClose}
      />

      <div className="flex min-h-0 flex-1">
        <ScheduledTaskSidebar
          selectedTaskId={selectedTaskId}
          tasks={sortedTasks}
          onCreate={openCreateModal}
          onDelete={handleDeleteTask}
          onSelect={setSelectedTaskId}
        />
        <ScheduledTaskDetails
          runNowLoadingId={runNowLoadingId}
          selectedTask={selectedTask}
          sessionIds={sessionIds}
          onDelete={handleDeleteTask}
          onEdit={setEditingTask}
          onRunNow={handleRunNow}
          onSelectSession={onSelectSession}
          onToggleEnabled={toggleTaskEnabled}
        />
      </div>

      <ScheduledTaskInbox
        inboxCounts={inboxCounts}
        inboxItems={inboxItems}
        open={inboxOpen}
        sessionIds={sessionIds}
        onClose={() => setInboxOpen(false)}
        onOpenSession={handleOpenInboxSession}
        onOpenTask={handleOpenInboxTask}
      />

      {(showCreate || editingTask) && (
        <div className="absolute inset-0 z-40 bg-black/55 backdrop-blur-sm">
          <div className="flex h-full w-full items-start justify-center overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <div className="w-full max-w-3xl flex-shrink-0">
              <ScheduledTaskForm
                initialTask={editingTask}
                defaultProjectPath={defaultProjectPath}
                onCancel={() => {
                  setShowCreate(false)
                  setEditingTask(null)
                }}
                onSubmit={editingTask ? handleUpdate : handleCreate}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
