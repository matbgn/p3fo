import type { Task } from '@/hooks/useTasks';
import { MAX_EVERY_DAYS, type Recurrence } from './types';
import { addDays, addDaysToKey, addDaysToTimestamp, parseDateKey, toDateKey } from '@/lib/planner/dates';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
// Hard stop for pathological ranges: expansion must never scan indefinitely.
const MAX_EXPANDED_DAYS = 4000;

export function occurrenceId(seriesId: string, date: string): string {
  return `${seriesId}:${date}`;
}

export function isSeriesTemplate(task: Pick<Task, 'recurrence' | 'seriesId'>): boolean {
  return Boolean(task.recurrence) && !task.seriesId;
}

export function isOccurrence(task: Pick<Task, 'seriesId' | 'occurrenceDate'>): boolean {
  return Boolean(task.seriesId) && Boolean(task.occurrenceDate);
}

function utcDay(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((utcDay(b) - utcDay(a)) / 86_400_000);
}

export function isoWeekday(key: string): number {
  const day = parseDateKey(key).getDay();
  return day === 0 ? 7 : day;
}

export function dayOfMonth(key: string): number {
  return Number(key.slice(8, 10));
}

export function daysInMonth(key: string): number {
  const date = parseDateKey(key);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function isValidEvery(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= MAX_EVERY_DAYS
  );
}

export function normalizeRecurrence(recurrence: Recurrence, anchorDate: string): Recurrence {
  const until = recurrence.until ?? null;

  if (until !== null && (!DATE_KEY.test(until) || until < anchorDate)) {
    throw new Error(`Invalid until date: ${until}.`);
  }

  const end = until === null ? {} : { until };

  if (recurrence.type === 'daily') {
    if (!isValidEvery(recurrence.every)) {
      throw new Error(`A daily rule needs a number of days from 1 to ${MAX_EVERY_DAYS}.`);
    }
    return { type: 'daily', every: recurrence.every, ...end };
  }

  if (recurrence.type === 'weekly') {
    const weekdays = [...new Set(recurrence.weekdays)].sort((a, b) => a - b);
    if (weekdays.length === 0 || weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw new Error('A weekly rule needs ISO weekdays from 1 to 7.');
    }
    return { type: 'weekly', weekdays, ...end };
  }

  if (!Number.isInteger(recurrence.day) || recurrence.day < 1 || recurrence.day > 31) {
    throw new Error('A monthly rule needs a day from 1 to 31.');
  }

  return { type: 'monthly', day: recurrence.day, ...end };
}

/**
 * Parse a recurrence value that came from persistence, Yjs, MCP or an import.
 * Returns null for malformed values so UI code can fall back safely instead of
 * crashing on e.g. a weekly rule without weekdays.
 */
export function parseStoredRecurrence(value: unknown): Recurrence | null {
  let candidate: unknown = value;

  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!candidate || typeof candidate !== 'object') return null;

  const type = (candidate as { type?: unknown }).type;
  if (type !== 'daily' && type !== 'weekly' && type !== 'monthly') return null;

  try {
    // A very old anchor keeps the `until` validation from rejecting stored rules
    // while still validating the rule shape itself.
    return normalizeRecurrence(candidate as Recurrence, '1970-01-01');
  } catch {
    return null;
  }
}

export function matchesRule(recurrence: Recurrence, anchor: string, date: string): boolean {
  if (recurrence.type === 'daily') {
    const days = daysBetween(anchor, date);
    return days >= 0 && days % recurrence.every === 0;
  }

  if (recurrence.type === 'weekly') {
    return recurrence.weekdays.includes(isoWeekday(date));
  }

  return dayOfMonth(date) === Math.min(recurrence.day, daysInMonth(date));
}

export function firstRuleDate(
  rule: Recurrence,
  anchor: string,
  searchStart: string = anchor,
): string | null {
  let date = searchStart > anchor ? searchStart : anchor;

  for (let index = 0; index <= MAX_EVERY_DAYS; index++) {
    if (rule.until && date > rule.until) return null;
    if (matchesRule(rule, anchor, date)) return date;
    date = addDaysToKey(date, 1);
  }
  return null;
}

/** Next date on which this series occurs on or after `from`. */
export function nextOccurrenceDate(
  series: Pick<Task, 'recurrence' | 'plannedDate' | 'triageStatus'>,
  from: string,
): string | null {
  if (!series.recurrence || !series.plannedDate || series.triageStatus === 'Done') return null;
  const start = series.plannedDate > from ? series.plannedDate : from;
  return firstRuleDate(series.recurrence, series.plannedDate, start);
}

/**
 * Offset in days between a series' planned date and its deadline. Exposed so
 * range padding (calendar) and generated due dates share one rule.
 */
export function dueOffsetForSeries(series: Pick<Task, 'plannedDate' | 'dueDate'>): number | undefined {
  if (!series.dueDate || !series.plannedDate) return undefined;
  const offset = daysBetween(series.plannedDate, toDateKey(new Date(series.dueDate)));
  return Number.isFinite(offset) ? offset : undefined;
}

export function dueDateForOccurrence(series: Task, date: string): number | undefined {
  if (!series.dueDate || !series.plannedDate) return undefined;
  const offset = dueOffsetForSeries(series);
  if (offset === undefined) return undefined;
  // Start from the occurrence date + offset, then restore the series deadline's
  // time-of-day so timed deadlines are preserved (and keep local wall time
  // across DST instead of rebuilding the value from an ISO string).
  const seriesDue = new Date(series.dueDate);
  const occurrenceDue = addDays(parseDateKey(date), offset);
  occurrenceDue.setHours(
    seriesDue.getHours(),
    seriesDue.getMinutes(),
    seriesDue.getSeconds(),
    seriesDue.getMilliseconds(),
  );
  return occurrenceDue.getTime();
}

/**
 * Keep a series coherent when its anchor (plannedDate) moves.
 *
 * The rule's end date and the deadline offset are both relative to the anchor;
 * moving the anchor without moving them would flip the due offset or leave a
 * rule whose `until` is before its anchor. Clearing the anchor clears the rule:
 * a recurrence without a planned date can never expand and the workflow filter
 * would hide the template permanently.
 */
export function adjustSeriesForAnchorMove(
  series: Pick<Task, 'plannedDate' | 'dueDate'>,
  recurrence: Recurrence,
  nextPlannedDate: string | null,
): { recurrence: Recurrence | null; dueDate: number | undefined } {
  if (!nextPlannedDate) {
    return { recurrence: null, dueDate: series.dueDate ?? undefined };
  }

  let adjusted = recurrence;
  let dueDate = series.dueDate ?? undefined;

  if (series.plannedDate) {
    const deltaDays = daysBetween(series.plannedDate, nextPlannedDate);
    if (Number.isFinite(deltaDays) && deltaDays !== 0) {
      if (adjusted.until) {
        adjusted = { ...adjusted, until: addDaysToKey(adjusted.until, deltaDays) };
      }
      if (dueDate !== undefined) {
        dueDate = addDaysToTimestamp(dueDate, deltaDays);
      }
    }
  }

  // Stored rows may already violate the invariant (legacy or partial writes).
  if (adjusted.until && nextPlannedDate > adjusted.until) {
    adjusted = { ...adjusted, until: nextPlannedDate };
  }

  return { recurrence: adjusted, dueDate };
}

function makeVirtualOccurrence(series: Task, date: string): Task {
  return {
    ...series,
    id: occurrenceId(series.id, date),
    plannedDate: date,
    plannedPosition: null,
    recurrence: series.recurrence,
    seriesId: series.id,
    occurrenceDate: date,
    triageStatus: 'Ready',
    completedAt: undefined,
    terminationDate: undefined,
    dueDate: dueDateForOccurrence(series, date),
    parentId: null,
    children: [],
  };
}

export function expandSeriesForRange(
  series: Task,
  exceptions: Task[],
  rangeStart: string,
  rangeEnd: string,
): Task[] {
  if (!series.recurrence || !series.plannedDate || series.deletedAt || series.triageStatus === 'Done') return [];

  if (
    !DATE_KEY.test(series.plannedDate) ||
    !DATE_KEY.test(rangeStart) ||
    !DATE_KEY.test(rangeEnd) ||
    (series.recurrence.until != null && !DATE_KEY.test(series.recurrence.until))
  ) {
    return [];
  }

  const byDate = new Map<string, Task>();
  for (const exception of exceptions) {
    if (exception.seriesId === series.id && exception.occurrenceDate) {
      const current = byDate.get(exception.occurrenceDate);
      if (!current || (exception.updatedAt ?? 0) >= (current.updatedAt ?? 0)) {
        byDate.set(exception.occurrenceDate, exception);
      }
    }
  }

  const items: Task[] = [];
  const first = series.plannedDate > rangeStart ? series.plannedDate : rangeStart;
  const until = series.recurrence.until ?? rangeEnd;
  const last = until < rangeEnd ? until : rangeEnd;

  let guard = 0;
  for (let date = first; date <= last; date = addDaysToKey(date, 1)) {
    if (++guard > MAX_EXPANDED_DAYS) break;
    if (!matchesRule(series.recurrence, series.plannedDate, date)) continue;
    // An exception replaces only its own occurrence (by occurrenceDate). A moved
    // exception keeps the target date's regular occurrence intact, so do not
    // suppress rule dates that merely equal some exception's plannedDate.
    if (byDate.has(date)) continue;
    items.push(makeVirtualOccurrence(series, date));
  }

  for (const exception of byDate.values()) {
    if (exception.deletedAt || !exception.plannedDate) continue;
    if (exception.plannedDate < rangeStart || exception.plannedDate > rangeEnd) continue;
    if (!items.some((item) => item.id === exception.id)) items.push(exception);
  }

  return items;
}

export function ruleSummary(recurrence: Recurrence | null | undefined): string {
  if (!recurrence) return 'Does not repeat';

  if (recurrence.type === 'daily') {
    return recurrence.every === 1 ? 'Every day' : `Every ${recurrence.every} days`;
  }

  if (recurrence.type === 'weekly') {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return `Every ${recurrence.weekdays.map((day) => labels[day - 1]).join(', ')}`;
  }

  return `Monthly on day ${recurrence.day}`;
}


export function filterWorkflowTasks(tasks: Task[]): Task[] {
  const unique = uniqueTasksById(tasks);
  const hidden = new Set<string>();

  for (const task of unique) {
    if (task.deletedAt || (task.recurrence && !task.seriesId)) hidden.add(task.id);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const task of unique) {
      if (task.parentId && hidden.has(task.parentId) && !hidden.has(task.id)) {
        hidden.add(task.id);
        changed = true;
      }
    }
  }

  return unique.filter((task) => !hidden.has(task.id));
}


export function uniqueTasksById(tasks: Task[]): Task[] {
  const byId = new Map<string, Task>();
  for (const task of tasks) byId.set(task.id, task);
  return Array.from(byId.values());
}
