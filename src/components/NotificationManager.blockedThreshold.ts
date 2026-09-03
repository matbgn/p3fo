// Blocked-card escalation threshold (README dimension 6, communication
// triggers). Tied to the aging cadence: a card should be blocked on a
// day-scale before escalating, not 30 minutes after the user themselves set
// the status. min(1 day, cardAgingBaseDays) keeps the reminder earlier than
// the first aging nudge; decimal baseDays (e.g. 0.005 ≈ 7 min) makes it
// testable, and 0 (aging disabled) falls back to a full day.
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function blockedThresholdMs(baseDays: number): number {
  const baseDaysMs = baseDays > 0 ? baseDays * MS_PER_DAY : MS_PER_DAY;
  return Math.min(MS_PER_DAY, baseDaysMs);
}