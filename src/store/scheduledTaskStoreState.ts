import type { StateCreator } from 'zustand'
import { nanoid } from './nanoid'
import {
  HISTORY_LIMIT,
  buildRunNote,
  computeNextRunAt,
  normalizeInput,
  normalizeTask,
} from './scheduledTaskUtils'
import type {
  ScheduledTask,
  ScheduledTaskRunRecord,
  ScheduledTasksStore,
} from './scheduledTaskTypes'

type StoreSet = Parameters<StateCreator<ScheduledTasksStore>>[0]

export function createScheduledTaskStoreState(set: StoreSet): ScheduledTasksStore {
  return {
    tasks: [],

    addTask: (input) => {
      const now = Date.now()
      const normalized = normalizeInput(input)
      const task: ScheduledTask = {
        id: nanoid(),
        ...normalized,
        nextRunAt: computeNextRunAt(normalized, now),
        lastRunAt: null,
        createdAt: now,
        updatedAt: now,
        runHistory: [],
      }

      set((state) => ({ tasks: [task, ...state.tasks] }))
      return task.id
    },

    updateTask: (taskId, input) => {
      const now = Date.now()
      const normalized = normalizeInput(input)
      set((state) => ({
        tasks: state.tasks.map((task) => (
          task.id === taskId
            ? {
                ...task,
                ...normalized,
                updatedAt: now,
                nextRunAt: computeNextRunAt(normalized, Math.max(now, task.lastRunAt ?? now)),
              }
            : task
        )),
      }))
    },

    deleteTask: (taskId) => {
      set((state) => ({ tasks: state.tasks.filter((task) => task.id !== taskId) }))
    },

    toggleTaskEnabled: (taskId) => {
      const now = Date.now()
      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== taskId) return task
          const enabled = !task.enabled
          return {
            ...task,
            enabled,
            updatedAt: now,
            nextRunAt: enabled ? computeNextRunAt({ ...task, enabled }, now) : null,
          }
        }),
      }))
    },

    applyAdvance: (payload) => {
      set((state) => ({
        tasks: state.tasks.map((task) => {
          if (task.id !== payload.taskId) return task

          const nextRunAt = computeNextRunAt(task, payload.firedAt + 1000)
          const runRecord: ScheduledTaskRunRecord = {
            id: nanoid(),
            runAt: payload.firedAt,
            outcome: payload.skipped ? 'skipped' : 'executed',
            note: buildRunNote(payload),
            catchUp: Boolean(payload.catchUp),
            manual: Boolean(payload.manual),
            sessionTabId: payload.sessionTabId ?? null,
            status: payload.skipped ? null : 'running',
            summary: null,
            changedPaths: [],
            cost: null,
          }

          return {
            ...task,
            updatedAt: Date.now(),
            lastRunAt: payload.skipped ? task.lastRunAt : payload.firedAt,
            nextRunAt: task.enabled && task.frequency !== 'manual' ? nextRunAt : null,
            runHistory: [runRecord, ...task.runHistory].slice(0, HISTORY_LIMIT),
          }
        }),
      }))
    },

    updateRunRecordSnapshot: (taskId, runAt, snapshot) => {
      const normalizedChangedPaths = snapshot.changedPaths
        .filter((path) => path.trim().length > 0)
      const normalizedSummary = snapshot.summary?.trim() ? snapshot.summary.trim() : null
      const normalizedCost = typeof snapshot.cost === 'number' && Number.isFinite(snapshot.cost) ? snapshot.cost : null

      set((state) => {
        let changed = false

        const tasks = state.tasks.map((task) => {
          if (task.id !== taskId) return task

          const runHistory = task.runHistory.map((record) => {
            if (record.runAt !== runAt) return record

            const samePaths = record.changedPaths.length === normalizedChangedPaths.length
              && record.changedPaths.every((path, index) => path === normalizedChangedPaths[index])

            if (
              record.status === snapshot.status
              && record.summary === normalizedSummary
              && samePaths
              && record.cost === normalizedCost
            ) {
              return record
            }

            changed = true
            return {
              ...record,
              status: snapshot.status,
              summary: normalizedSummary,
              changedPaths: normalizedChangedPaths,
              cost: normalizedCost,
            }
          })

          return changed ? { ...task, runHistory } : task
        })

        return changed ? { tasks } : state
      })
    },

    recomputeAll: () => {
      set((state) => ({
        tasks: state.tasks.map((task) => ({
          ...normalizeTask(task),
          updatedAt: task.updatedAt,
          createdAt: task.createdAt,
        })),
      }))
    },
  }
}
