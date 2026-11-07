import { compareTaskOrder } from './position';
import { addDaysToKey } from './dates';
import type { PlannerTaskLike } from './types';

/**
 * Automatic carry-over only looks back one week. Older overdue cards stay on
 * their planned date (visible when navigating back) instead of silently
 * rewriting months of planning history when the planner is opened.
 */
export const CARRY_OVER_LOOKBACK_DAYS = 7;

export function isCarriedOver(
  task: PlannerTaskLike,
  today: string,
  lookbackDays: number = CARRY_OVER_LOOKBACK_DAYS,
): boolean {
  const earliest = addDaysToKey(today, -Math.max(0, lookbackDays));

  return (
    !task.parentId &&
    task.plannedDate != null &&
    task.plannedDate < today &&
    task.plannedDate >= earliest &&
    task.triageStatus !== 'Done' &&
    task.triageStatus !== 'Dropped' &&
    task.triageStatus !== 'Archived' &&
    !task.recurrence &&
    !task.seriesId
  );
}

export function compareCarryOverOrder(a: PlannerTaskLike, b: PlannerTaskLike): number {
  return (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') || compareTaskOrder(a, b);
}
