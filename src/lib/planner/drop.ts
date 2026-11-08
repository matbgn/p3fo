import { addDays, addDaysToKey, toDateKey } from './dates';
import type { PlannerTaskLike } from './types';

export type WeekDirection = -1 | 1;

export function edgeDropDate(
  active: PlannerTaskLike,
  windowStart: Date,
  direction: WeekDirection,
): string {
  if (active.plannedDate) return addDaysToKey(active.plannedDate, direction * 7);

  return toDateKey(addDays(windowStart, direction * 7));
}
