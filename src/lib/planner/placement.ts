import { toDateKey } from './dates';
import type { PlannerTaskLike } from './types';

export type PlannerPlacementTask = PlannerTaskLike & { completedAt?: number | string | null };

/**
 * The day column a card belongs to.
 *
 * A scheduled card normally lives on its planned date, but once it is Done it
 * belongs to the day it was actually completed. This keeps the planner honest
 * when a task planned for the future is finished early: the card shows up on
 * today instead of lingering in its future slot. The stored `plannedDate` is
 * left untouched, so un-completing the card restores the original plan.
 *
 * Unscheduled tasks keep their existing behaviour (they never appear in a day
 * column), so this returns null when there is no planned date.
 */
export function plannerPlacementDate(task: PlannerPlacementTask): string | null {
  if (!task.plannedDate) return null;
  if (task.triageStatus !== 'Done' || task.completedAt == null) return task.plannedDate;

  const completed = new Date(task.completedAt);
  if (Number.isNaN(completed.getTime())) return task.plannedDate;

  return toDateKey(completed);
}
