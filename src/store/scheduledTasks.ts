import { create } from 'zustand'
import { createScheduledTaskStoreState } from './scheduledTaskStoreState'
import type {
  ScheduledTask,
  ScheduledTaskAdvancePayload,
  ScheduledTaskDay,
  ScheduledTaskFrequency,
  ScheduledTaskInput,
  ScheduledTaskRunOutcome,
  ScheduledTaskRunRecord,
  ScheduledTaskRunSnapshotStatus,
  ScheduledTasksStore,
} from './scheduledTaskTypes'

export const useScheduledTasksStore = create<ScheduledTasksStore>()((set) => createScheduledTaskStoreState(set))

export type {
  ScheduledTask,
  ScheduledTaskAdvancePayload,
  ScheduledTaskDay,
  ScheduledTaskFrequency,
  ScheduledTaskInput,
  ScheduledTaskRunOutcome,
  ScheduledTaskRunRecord,
  ScheduledTaskRunSnapshotStatus,
  ScheduledTasksStore,
}

export {
  DAY_OPTIONS,
  advancePastExceptions,
  computeNextRunAt,
  getDayKey,
} from './scheduledTaskUtils'
