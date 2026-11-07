/**
 * Recurrence rules are anchored to a planned date. The app's
 * normalizeRecurrence in src/lib/recurrence/engine.ts rejects a rule without
 * an anchor or with an `until` before the anchor; MCP writes must enforce the
 * same cross-field invariants so they cannot create a series that the planner
 * hides but never expands.
 */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parseDateKey(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function addDaysToKey(key: string, days: number): string {
  const date = new Date(parseDateKey(key) + days * DAY_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseDateKey(b) - parseDateKey(a)) / DAY_MS);
}

function parseRule(recurrence: unknown): Record<string, unknown> | null {
  if (typeof recurrence === 'string') {
    try {
      const parsed = JSON.parse(recurrence) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return recurrence && typeof recurrence === 'object' && !Array.isArray(recurrence)
    ? (recurrence as Record<string, unknown>)
    : null;
}

/**
 * Mirror the planner's `adjustSeriesForAnchorMove` for MCP patches.
 *
 * The app treats a series' planned date as its anchor: moving it shifts the
 * rule's end date, and clearing it clears the rule. Rejecting those patches in
 * MCP would make a series reschedulable from the planner but not from
 * `p3fo_update_task`.
 */
export function adjustRecurrenceForAnchorMove(
  recurrence: unknown,
  previousPlannedDate: unknown,
  nextPlannedDate: unknown,
): unknown {
  if (recurrence === undefined || recurrence === null) return recurrence;
  if (nextPlannedDate === null) return null;
  if (typeof previousPlannedDate !== 'string' || !DATE_KEY.test(previousPlannedDate)) return recurrence;
  if (typeof nextPlannedDate !== 'string' || !DATE_KEY.test(nextPlannedDate)) return recurrence;

  const parsed = parseRule(recurrence);
  if (!parsed) return recurrence;

  let adjusted = parsed;
  const until = parsed.until;
  if (typeof until === 'string' && DATE_KEY.test(until)) {
    const delta = daysBetween(previousPlannedDate, nextPlannedDate);
    if (delta !== 0) adjusted = { ...parsed, until: addDaysToKey(until, delta) };
  }

  // Stored rows may already violate the invariant (legacy or partial writes).
  if (typeof adjusted.until === 'string' && nextPlannedDate > adjusted.until) {
    adjusted = { ...adjusted, until: nextPlannedDate };
  }

  return typeof recurrence === 'string' ? JSON.stringify(adjusted) : adjusted;
}

export function validateRecurrenceAnchor(
  plannedDate: unknown,
  recurrence: unknown,
): string | null {
  if (recurrence === undefined || recurrence === null) return null;

  let parsed: unknown = recurrence;
  if (typeof recurrence === 'string') {
    try {
      parsed = JSON.parse(recurrence);
    } catch {
      return 'Expected a valid JSON recurrence rule';
    }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'Expected a valid recurrence rule';
  }

  if (typeof plannedDate !== 'string' || !DATE_KEY.test(plannedDate)) {
    return 'recurrence requires plannedDate';
  }

  const until = (parsed as { until?: unknown }).until;
  if (typeof until === 'string' && until < plannedDate) {
    return `recurrence.until (${until}) must be on or after plannedDate (${plannedDate})`;
  }

  return null;
}
