export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);

  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDaysToKey(key: string, days: number): string {
  return toDateKey(addDays(parseDateKey(key), days));
}

/** Shift an epoch timestamp by whole days while keeping its wall-clock time. */
export function addDaysToTimestamp(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function weekdayIndex(date: Date, weekStartDay: 0 | 1 = 1): number {
  const sundayBased = date.getDay();

  return weekStartDay === 1 ? (sundayBased + 6) % 7 : sundayBased;
}

export function startOfWeek(date: Date, weekStartDay: 0 | 1 = 1): Date {
  return addDays(date, -weekdayIndex(date, weekStartDay));
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function weekDateKeys(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, offset) =>
    toDateKey(addDays(weekStart, offset)),
  );
}

export function isoWeekNumber(date: Date): number {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNumber = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNumber = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNumber + 3);

  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604_800_000);
}


export function combineDateKeyAndTime(key: string, time: string | null | undefined): number {
  const date = parseDateKey(key);
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
  }
  return date.getTime();
}

export function timeFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (hours === 0 && minutes === 0) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Due time in HH:MM, or null when the due date is all-day. */
export function dueTimeFromTimestamp(timestamp: number): string | null {
  return timeFromTimestamp(timestamp) || null;
}

/**
 * Keep the due timestamp and its explicit time field in sync. `dueTime`
 * overrides the time embedded in the timestamp; `null` means all-day and
 * `undefined` derives it from the legacy timestamp.
 */
export function normalizeDueTimestamp(
  timestamp: number,
  dueTime?: string | null,
): { dueDate: number; dueTime: string | null } {
  const date = new Date(timestamp);
  const resolved = normalizeDueTime(dueTime, timestamp);
  return {
    dueDate: resolved
      ? combineDateKeyAndTime(toDateKey(date), resolved)
      : startOfDay(date).getTime(),
    dueTime: resolved,
  };
}

/**
 * Resolve an explicit due time, falling back to the time embedded in a legacy
 * due timestamp. `null` is authoritative (all-day); `undefined` means legacy
 * data that predates the split and should be derived.
 */
export function normalizeDueTime(
  dueTime: string | null | undefined,
  dueTimestamp: number | undefined,
): string | null {
  if (typeof dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) {
    return dueTime;
  }
  if (dueTime === null) return null;
  if (dueTimestamp === undefined) return null;
  return dueTimeFromTimestamp(dueTimestamp);
}

/**
 * Hydrate a task's due fields from stored values. Accepts epoch milliseconds or
 * ISO strings so the entity and live-Yjs paths share one rule: an explicit
 * dueTime wins, a missing one is derived from the legacy timestamp, and active
 * tasks fall back to the terminationDate deadline mirror. Returns undefined when
 * the task has no usable due date.
 */
export function resolveTaskDueFields(raw: {
  dueDate?: number | string | null;
  terminationDate?: number | string | null;
  triageStatus?: string | null;
  dueTime?: string | null;
}): { dueDate: number | undefined; dueTime: string | null | undefined } {
  const toMillis = (value: number | string | null | undefined): number | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const rawDueDate = toMillis(raw.dueDate)
    ?? (raw.triageStatus !== 'Done' ? toMillis(raw.terminationDate) : undefined);
  if (rawDueDate === undefined) return { dueDate: undefined, dueTime: undefined };

  const normalized = normalizeDueTimestamp(rawDueDate, raw.dueTime ?? undefined);
  return { dueDate: normalized.dueDate, dueTime: normalized.dueTime };
}


export function formatTimeFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
