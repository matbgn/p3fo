export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function combineDueDateAndTime(iso: string, dueTime: string | null): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (dueTime) {
    const [hours, minutes] = dueTime.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date.toISOString();
}

/**
 * Normalize the temporal task inputs used by the MCP tools.
 *
 * P3FO stores a due date as a single timestamp (the effective due instant)
 * plus an explicit `dueTime` (HH:MM). `dueTime: null` means the deadline is
 * all-day; the timestamp is then local midnight. A bare `YYYY-MM-DD` is
 * expanded to local midnight, because `Date.parse` would otherwise treat it
 * as UTC and shift the date in non-UTC timezones. Full timestamps are kept as
 * instants and serialized to ISO. The due time is never derived here: the MCP
 * process may run in a different timezone than the app, so a date write that
 * omits `dueTime` clears it and readers derive the wall clock from the due
 * instant in their own timezone (the shared temporal-mirror rule).
 */
export function normalizeDateInput(value: string | number | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Date(value).toISOString() : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_KEY_PATTERN.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const isValid =
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;
    return isValid ? date.toISOString() : value;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

export function normalizeDueTimeInput(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return TIME_OF_DAY_PATTERN.test(trimmed) ? trimmed : value;
}

/**
 * The stored due date for a task, falling back to the legacy `terminationDate`
 * mirror for active tasks. For Done tasks `terminationDate` is the completion
 * timestamp, so it is never treated as a due date.
 */
export function existingDueDateFor(task: {
  dueDate?: string | number | null;
  terminationDate?: string | number | null;
  triageStatus?: string | null;
} | null | undefined): string | number | null | undefined {
  if (!task) return undefined;
  return task.dueDate ?? (task.triageStatus !== 'Done' ? task.terminationDate ?? null : null);
}

/**
 * Normalize the date fields that participate in the due/deadline mirror.
 * Undefined fields stay absent so partial updates do not overwrite storage.
 * `existingDueDate` lets a dueTime-only update keep the stored date, and
 * `existingStatus` tells the helper whether `terminationDate` is the deadline
 * mirror (active tasks) or the completion timestamp (Done tasks).
 */
export function normalizeTaskDateFields<T extends Record<string, unknown> & {
  dueDate?: string | null;
  dueTime?: string | null;
  terminationDate?: string | null;
}>(input: T, existingDueDate?: string | number | null, existingStatus?: string | null): T & {
  dueDate?: string | null;
  dueTime?: string | null;
  terminationDate?: string | null;
} {
  const next: Record<string, unknown> = { ...input };
  const hasDueDate = input.dueDate !== undefined;
  const hasDueTime = input.dueTime !== undefined;
  const status = (input.triageStatus as string | undefined) ?? existingStatus;
  const normalizedTermination = input.terminationDate !== undefined
    ? normalizeDateInput(input.terminationDate) ?? null
    : undefined;

  if (hasDueDate) {
    const normalized = normalizeDateInput(input.dueDate);
    if (normalized === null || normalized === undefined) {
      next.dueDate = normalized ?? null;
      next.dueTime = null;
    } else if (hasDueTime) {
      const dueTime = normalizeDueTimeInput(input.dueTime) ?? null;
      next.dueDate = combineDueDateAndTime(normalized, dueTime);
      next.dueTime = dueTime;
    } else {
      next.dueDate = normalized;
      // Do not derive the wall-clock time here: deriving it in the MCP process
      // timezone would persist a time the app may render differently. The
      // shared temporal-mirror rule clears it and readers derive it instead.
      next.dueTime = null;
    }
  } else if (hasDueTime) {
    const dueTime = normalizeDueTimeInput(input.dueTime) ?? null;
    // A supplied deadline mirror is the freshest date source for active tasks;
    // falling back to the stored due date would leave the row split across two
    // days when only terminationDate + dueTime were patched. For Done tasks
    // terminationDate is the completion timestamp, never a deadline.
    const dueDateSource = status !== 'Done' && normalizedTermination
      ? normalizedTermination
      : existingDueDate;
    const normalizedExisting = dueDateSource != null
      ? normalizeDateInput(dueDateSource)
      : null;
    if (normalizedExisting) {
      next.dueTime = dueTime;
      next.dueDate = combineDueDateAndTime(normalizedExisting, dueTime);
    } else {
      // A due time with no resolvable due date would violate the same
      // invariant the create path enforces; never persist an orphan time.
      delete next.dueTime;
    }
  }

  if (input.terminationDate !== undefined) {
    // For active tasks `terminationDate` mirrors the deadline stored in
    // `dueDate`. When a due time was applied above, the combined due instant is
    // the authoritative deadline, so mirror that instead of the time-less input
    // (e.g. local midnight), which would split the two fields across times.
    next.terminationDate =
      status !== 'Done' && hasDueTime && typeof next.dueDate === 'string'
        ? next.dueDate
        : normalizedTermination;
    // A deadline-mirror write without an explicit dueTime clears the stored
    // time like any other date change; readers derive it from the mirror
    // instant in their own timezone.
    if (!hasDueDate && !hasDueTime && status !== 'Done') {
      next.dueTime = null;
    }
  }

  return next as T & {
    dueDate?: string | null;
    dueTime?: string | null;
    terminationDate?: string | null;
  };
}
