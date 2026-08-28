import type { Task } from '@/hooks/useTasks';

/** Statuses in which a task can still be activated/worked on. */
const ACTIVE_STATUSES = ['Backlog', 'Ready', 'WIP', 'Blocked'];

/**
 * True when drilling into this task still offers activable work:
 * - a leaf task qualifies by its own status (Backlog/Ready/WIP/Blocked);
 * - a task with children qualifies only when at least one child has
 *   activable content. Parents whose entire subtree is Done/Dropped/Archived
 *   have nothing left to activate or show, so views like flow and subfocus
 *   hide them entirely instead of rendering ghost cards.
 */
export function hasActivableContent(
  task: Task,
  map: Record<string, Task>,
  seen: Set<string> = new Set(),
): boolean {
  if (seen.has(task.id)) return false; // cycle guard
  seen.add(task.id);
  if (task.children && task.children.length > 0) {
    return task.children.some(id => {
      const child = map[id];
      return !!child && hasActivableContent(child, map, seen);
    });
  }
  return ACTIVE_STATUSES.includes(task.triageStatus);
}