import { addDays, parseDateKey, toDateKey, weekdayIndex } from './dates';
import type { PlannerTaskLike } from './types';

export type WeekDirection = -1 | 1;

export function edgeDropDate(
  active: PlannerTaskLike,
  shownWeekStart: Date,
  direction: WeekDirection,
  weekStartDay: 0 | 1 = 1,
): string {
  const weekday = active.plannedDate
    ? weekdayIndex(parseDateKey(active.plannedDate), weekStartDay)
    : 0;

  return toDateKey(addDays(shownWeekStart, direction * 7 + weekday));
}
