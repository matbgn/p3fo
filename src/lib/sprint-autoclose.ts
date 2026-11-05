import {
  SprintEntity,
  SprintStateEntity,
  SprintTaskLike,
  applyClose,
  addDaysToDateOnly,
  buildNextDraft,
  computeCapacity,
  countWeekdays,
  daysBetweenInclusive,
  nextWorkingDay,
  parseDateOnly,
  planAutoClose,
  previousClosedTargetPoints,
  toDateOnly,
} from './sprint-types.js';

export const MAX_AUTO_CLOSE_STALENESS_MS = 48 * 60 * 60 * 1000;
const MAX_AUTO_CLOSE_STALENESS_HOURS = MAX_AUTO_CLOSE_STALENESS_MS / 3_600_000;

function currentOrNextWorkingDay(dateOnly: string): string {
  const date = parseDateOnly(dateOnly);
  if (!date) return dateOnly;
  const day = date.getUTCDay();
  return day === 0 || day === 6 ? nextWorkingDay(dateOnly) : dateOnly;
}

export interface AutoCloseSweepResult {
  state: SprintStateEntity;
  changed: boolean;
  closedSprintIds: string[];
  createdDraftId: string | null;
  notifications: string[];
  taskFlagUpdates: Record<string, boolean>;
}

function makeNextDraft(
  closedSprint: SprintEntity,
  carriedTaskIds: string[],
  tasks: SprintTaskLike[],
  now: string,
  timeZone: string,
): SprintEntity | null {
  if (carriedTaskIds.length === 0) return null;
  const derivedStart = nextWorkingDay(closedSprint.endDate);
  const today = toDateOnly(new Date(now));
  // A catch-up close must not create a draft dated in the past.
  const startDate = derivedStart < today ? currentOrNextWorkingDay(today) : derivedStart;
  const duration = Math.max(1, daysBetweenInclusive(closedSprint.startDate, closedSprint.endDate));
  const endDate = addDaysToDateOnly(startDate, duration - 1);
  const workingDays = countWeekdays(startDate, endDate);
  const capacity =
    closedSprint.autoClose?.nextDraftCapacity ??
    computeCapacity({
      theoreticalPoints: closedSprint.capacity.theoreticalPoints,
      practicePct: closedSprint.capacity.practicePct,
      eftCount: closedSprint.capacity.eftCount,
      workingDays,
      impediments: [],
    });
  return buildNextDraft(closedSprint, carriedTaskIds, tasks, capacity, now, timeZone);
}

/**
 * Apply every due auto-close. Pure: returns the next state plus the task flags
 * the caller must persist. Runs on the server scheduler and in the browser
 * catch-up path.
 */
export function sweepSprintState(
  state: SprintStateEntity,
  tasks: SprintTaskLike[],
  nowMs: number = Date.now(),
  timeZone = 'Europe/Zurich',
): AutoCloseSweepResult {
  const now = new Date(nowMs).toISOString();
  const closedSprintIds: string[] = [];
  const notifications: string[] = [];
  const taskFlagUpdates: Record<string, boolean> = {};
  const drafts: SprintEntity[] = [];
  let createdDraftId: string | null = state.draftSprintId;
  let changed = false;

  const sprints = state.sprints.map((sprint) => {
    if (!sprint.autoClose || !sprint.autoClose.enabled) return sprint;

    if (sprint.status === 'draft') return sprint;
    if (sprint.status !== 'active') {
      if (sprint.autoClose.status === 'armed') {
        changed = true;
        return {
          ...sprint,
          autoClose: { ...sprint.autoClose, status: 'skipped' as const, lastRunAt: now, lastRunBy: 'auto' },
        };
      }
      return sprint;
    }

    if (sprint.autoClose.status !== 'armed') return sprint;

    const dueAt = sprint.autoClose.dueAt;
    if (!Number.isFinite(dueAt)) {
      // Invalid persisted deadlines must never be treated as due; otherwise a
      // malformed state would auto-close historical sprints on the next sweep.
      changed = true;
      return {
        ...sprint,
        updatedAt: now,
        autoClose: { ...sprint.autoClose, status: 'skipped' as const, lastRunAt: now, lastRunBy: 'auto' },
      };
    }

    if (nowMs < dueAt) return sprint;

    if (nowMs - dueAt > MAX_AUTO_CLOSE_STALENESS_MS) {
      changed = true;
      if (sprint.autoClose.notify) {
        notifications.push(
          `Sprint ${sprint.name} auto-close was skipped because it is overdue by more than ${MAX_AUTO_CLOSE_STALENESS_HOURS} hours. Close it manually.`,
        );
      }
      return {
        ...sprint,
        updatedAt: now,
        autoClose: { ...sprint.autoClose, status: 'skipped' as const, lastRunAt: now, lastRunBy: 'auto' },
      };
    }

    const plan = planAutoClose(sprint, tasks, { policy: sprint.autoClose.policy, timeZone });
    const previousTarget = previousClosedTargetPoints(state, sprint);
    const closed = applyClose(sprint, tasks, plan.outcomes, previousTarget, 'auto', now, timeZone);
    closedSprintIds.push(sprint.id);
    changed = true;

    const draft = sprint.autoClose.createNextDraft
      ? makeNextDraft(closed, plan.carriedTaskIds, tasks, now, timeZone)
      : null;
    if (draft) {
      createdDraftId = draft.id;
      drafts.push(draft);
    }

    closed.scope.forEach((item) => {
      taskFlagUpdates[item.taskId] = item.outcome === 'carried';
    });
    if (draft) {
      draft.scope.forEach((item) => {
        taskFlagUpdates[item.taskId] = true;
      });
    }

    if (sprint.autoClose.notify) {
      notifications.push(
        `Sprint ${sprint.name} auto-closed (${plan.carriedPoints} pts carried, ${plan.backlogPoints} pts back to backlog).`,
      );
    }

    return closed;
  });

  const nextSprints = [...sprints, ...drafts];
  const activeSprintId = nextSprints.find((sprint) => sprint.status === 'active')?.id ?? null;

  return {
    state: changed
      ? {
          ...state,
          sprints: nextSprints,
          activeSprintId,
          draftSprintId: createdDraftId,
          updatedAt: now,
        }
      : state,
    changed,
    closedSprintIds,
    createdDraftId,
    notifications,
    taskFlagUpdates,
  };
}
