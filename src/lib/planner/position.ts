import { generateKeyBetween } from 'fractional-indexing';
import type { PlannerTaskLike } from './types';

export function compareTaskOrder(
  a: Pick<PlannerTaskLike, 'plannedPosition' | 'id'>,
  b: Pick<PlannerTaskLike, 'plannedPosition' | 'id'>,
): number {
  const aPosition = a.plannedPosition ?? null;
  const bPosition = b.plannedPosition ?? null;

  if (aPosition !== bPosition) {
    // Unpositioned tasks (generated occurrences, imported cards) sort after
    // explicitly positioned cards so a drop above one of them is stable.
    if (aPosition === null) return 1;
    if (bPosition === null) return -1;
    return aPosition < bPosition ? -1 : 1;
  }

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function compareDayOrder(
  a: Pick<PlannerTaskLike, 'plannedTime' | 'plannedPosition' | 'id'>,
  b: Pick<PlannerTaskLike, 'plannedTime' | 'plannedPosition' | 'id'>,
): number {
  const aTime = a.plannedTime ?? null;
  const bTime = b.plannedTime ?? null;

  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return aTime < bTime ? -1 : 1;
  }

  if ((aTime === null) !== (bTime === null)) {
    return aTime === null ? 1 : -1;
  }

  return compareTaskOrder(a, b);
}

function isValidPositionKey(key: string): boolean {
  try {
    // The library rejects malformed keys (bad head, trailing fractional zero,
    // ...). Validate before using a stored value as a generation bound so an
    // imported/invalid key cannot make planner operations throw.
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

export function positionBetween(
  after: string | null | undefined,
  before: string | null | undefined,
  maxPosition?: string | null,
): string {
  const lowerCandidate = after && after.length > 0 ? after : null;
  const upperCandidate = before && before.length > 0 ? before : null;
  const lower = lowerCandidate && isValidPositionKey(lowerCandidate) ? lowerCandidate : null;
  const upper = upperCandidate && isValidPositionKey(upperCandidate) ? upperCandidate : null;

  if (lower !== null && upper !== null && lower >= upper) {
    // Duplicate or inverted stored keys leave no gap to insert into. New
    // duplicates are prevented at the source (duplicateTaskStructure clears
    // plannedPosition), so this is a last-resort fallback for imported or
    // legacy data and must still return a valid, unique key. Callers that can
    // hit this branch pass the greatest stored key so the fallback lands after
    // every existing card instead of colliding with a later key.
    const ceiling = maxPosition && isValidPositionKey(maxPosition) && maxPosition > lower
      ? maxPosition
      : lower;
    return generateKeyBetween(ceiling, null);
  }

  return generateKeyBetween(lower, upper);
}

/**
 * Greatest stored position across all ordering groups. Display order puts timed
 * cards before untimed ones, so the last displayed card is not necessarily the
 * one holding the greatest key. Invalid legacy/imported keys are ignored so
 * they cannot break key generation for the rest of the day.
 */
export function maxPlannedPosition(
  tasks: Pick<PlannerTaskLike, 'plannedPosition'>[],
): string | null {
  let max: string | null = null;
  for (const task of tasks) {
    const position = task.plannedPosition;
    if (position && isValidPositionKey(position) && (max === null || position > max)) {
      max = position;
    }
  }
  return max;
}

/** Append key that sorts after every existing position in `tasks`. */
export function appendPosition(
  tasks: Pick<PlannerTaskLike, 'plannedPosition'>[],
): string {
  return positionBetween(maxPlannedPosition(tasks), null);
}

/**
 * Resolve the position for a duplicated card. A positioned source keeps its
 * key and the copy is inserted directly after it. An unpositioned source gets
 * an appended key first, then the copy receives the next key, so neither card
 * can reuse another card's fractional index.
 */
export function duplicateTaskPosition(
  original: Pick<PlannerTaskLike, 'id' | 'plannedPosition' | 'plannedTime'>,
  dayTasks: Pick<PlannerTaskLike, 'id' | 'plannedPosition' | 'plannedTime'>[],
): { sourcePosition: string; copyPosition: string } {
  const originalIndex = dayTasks.findIndex((task) => task.id === original.id);
  const after = original.plannedPosition && original.plannedPosition.length > 0
    ? original.plannedPosition
    : null;
  const before = originalIndex >= 0 ? dayTasks[originalIndex + 1]?.plannedPosition ?? null : null;

  if (after !== null) {
    return {
      sourcePosition: after,
      copyPosition: positionBetween(after, before, maxPlannedPosition(dayTasks)),
    };
  }

  const sourcePosition = appendPosition(dayTasks);

  return {
    sourcePosition,
    copyPosition: positionBetween(sourcePosition, null, sourcePosition),
  };
}

/**
 * Resolve the fractional position for a drop expressed as "before id". The
 * bounds are taken from the nearest stored-position neighbours in the same
 * ordering group as the dragged card (same planned time, or both untimed),
 * because display order puts timed cards before untimed ones while
 * `plannedPosition` only orders a single group.
 *
 * `targetTasks` may be the displayed day order, including generated occurrences
 * that have no stored position; those still anchor the insertion point but are
 * skipped when looking for fractional bounds.
 */
export function positionForDrop(
  targetTasks: Pick<PlannerTaskLike, 'id' | 'plannedPosition' | 'plannedTime'>[],
  beforeId?: string | null,
  draggedPlannedTime: string | null = null,
): string {
  const sameGroup = (task: Pick<PlannerTaskLike, 'plannedTime'>) =>
    (task.plannedTime ?? null) === draggedPlannedTime;

  const beforeIndex = beforeId
    ? targetTasks.findIndex((task) => task.id === beforeId)
    : -1;
  const insertIndex = beforeIndex === -1 ? targetTasks.length : beforeIndex;

  let lower: string | null = null;
  for (let index = insertIndex - 1; index >= 0; index--) {
    const task = targetTasks[index];
    if (sameGroup(task) && task.plannedPosition) {
      lower = task.plannedPosition;
      break;
    }
  }

  let upper: string | null = null;
  for (let index = insertIndex; index < targetTasks.length; index++) {
    const task = targetTasks[index];
    if (sameGroup(task) && task.plannedPosition) {
      upper = task.plannedPosition;
      break;
    }
  }

  // No neighbour in the dragged card's own group: append after the last stored
  // position so the key cannot collide with an existing card.
  if (lower === null && upper === null) {
    return positionBetween(maxPlannedPosition(targetTasks), null);
  }

  return positionBetween(lower, upper, maxPlannedPosition(targetTasks));
}
