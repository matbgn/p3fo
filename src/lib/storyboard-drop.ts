import type { Task, TriageStatus } from '@/hooks/useTasks';

export type StoryboardActionabilityGroup = 'actionable' | 'non-actionable';

export interface StoryboardDropResolution {
  /** Insertion index in the order that excludes the dragged card. */
  index: number;
  /** Group the pointer is over but which cannot accept the dragged card. */
  lockedGroup: StoryboardActionabilityGroup | null;
}

/** Statuses the storyboard always sorts ahead of the rest. */
export const isActionableStatus = (status: TriageStatus): boolean =>
  status === 'Ready' || status === 'WIP';

/**
 * Map a raw pointer insertion index onto the only slot the storyboard sorter
 * accepts: Ready/WIP cards always stay ahead of every other status. Dropping
 * a Backlog/Blocked card inside the Ready/WIP block therefore clamps to the
 * first non-actionable slot, and vice versa.
 */
export function resolveStoryboardInsertion(
  rawIndex: number,
  baseTasks: Task[],
  draggedTask: Task,
): StoryboardDropResolution {
  const actionableCount = baseTasks.filter(task => isActionableStatus(task.triageStatus)).length;
  const draggedActionable = isActionableStatus(draggedTask.triageStatus);
  const index = draggedActionable
    ? Math.min(rawIndex, actionableCount)
    : Math.max(rawIndex, actionableCount);
  const lockedGroup: StoryboardActionabilityGroup | null =
    index === rawIndex ? null : draggedActionable ? 'non-actionable' : 'actionable';

  return { index, lockedGroup };
}

/** Insert `task` at `index` in `baseTasks`, clamping the index to the array. */
export function insertTaskAt<T extends { id: string }>(baseTasks: T[], task: T, index: number): T[] {
  const order = [...baseTasks];
  const clamped = Math.max(0, Math.min(index, order.length));
  order.splice(clamped, 0, task);
  return order;
}
