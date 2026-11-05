import type { TaskRecord } from './task-types.js';
import { toMillis } from './task-types.js';

/**
 * Board sorting for the MCP list tool.
 *
 * Mirrors the pure comparator logic in src/utils/taskSorting.ts. Keep the
 * relative ordering rules in sync with the app's Plan/TaskBoard/Kanban views.
 */

type SortableTask = TaskRecord;

function createdAt(task: SortableTask): number {
  return toMillis(task.createdAt) ?? 0;
}

function priorityValue(task: SortableTask): number {
  // The app maps priority null/undefined to 0 in convertEntitiesToTasks before
  // sorting, so mirror that here instead of treating null as "no priority".
  return typeof task.priority === 'number' && Number.isFinite(task.priority) ? task.priority : 0;
}

function hasActiveTimer(task: SortableTask): boolean {
  return Array.isArray(task.timer) && task.timer.some((entry) => entry?.endTime === 0);
}

function calculateUrgencyImpactScore(task: SortableTask): number {
  return (task.urgent ? 2 : 0) + (task.impact ? 1 : 0);
}

function sortByActiveTimer(a: SortableTask, b: SortableTask): number {
  const aIsTimeclocked = hasActiveTimer(a);
  const bIsTimeclocked = hasActiveTimer(b);
  if (aIsTimeclocked && !bIsTimeclocked) return -1;
  if (!aIsTimeclocked && bIsTimeclocked) return 1;
  return 0;
}

function sortByDoneStatus(a: SortableTask, b: SortableTask): number {
  const aDone = a.triageStatus === 'Done' || a.triageStatus === 'Dropped';
  const bDone = b.triageStatus === 'Done' || b.triageStatus === 'Dropped';
  if (aDone && !bDone) return 1;
  if (!aDone && bDone) return -1;
  if (aDone && bDone) {
    const aDate = toMillis(a.terminationDate) ?? createdAt(a);
    const bDate = toMillis(b.terminationDate) ?? createdAt(b);
    return bDate - aDate;
  }
  return 0;
}

function sortByBlockedStatus(a: SortableTask, b: SortableTask): number {
  const aBlocked = a.triageStatus === 'Blocked';
  const bBlocked = b.triageStatus === 'Blocked';
  if (aBlocked && !bBlocked) return 1;
  if (!aBlocked && bBlocked) return -1;
  return 0;
}

function isActionableStatus(status: string | null | undefined): boolean {
  return status === 'Ready' || status === 'WIP';
}

function sortByActionability(a: SortableTask, b: SortableTask): number {
  return (isActionableStatus(a.triageStatus) ? 0 : 1) - (isActionableStatus(b.triageStatus) ? 0 : 1);
}

function sortByPriority(a: SortableTask, b: SortableTask): number {
  return priorityValue(a) - priorityValue(b);
}

function sortByDeadlines(a: SortableTask, b: SortableTask): number {
  const aTime = toMillis(a.terminationDate);
  const bTime = toMillis(b.terminationDate);
  const aHas = aTime !== null && aTime !== 0;
  const bHas = bTime !== null && bTime !== 0;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  return 0;
}

export function comparePriority(a: SortableTask, b: SortableTask): number {
  const result = sortByPriority(a, b);
  if (result !== 0) return result;
  return createdAt(a) - createdAt(b);
}

function sortPlanTasks(a: SortableTask, b: SortableTask): number {
  const actionability = sortByActionability(a, b);
  if (actionability !== 0) return actionability;

  const aPriority = priorityValue(a);
  const bPriority = priorityValue(b);
  if (aPriority !== bPriority) return aPriority - bPriority;

  if (a.urgent && !b.urgent) return -1;
  if (!a.urgent && b.urgent) return 1;
  if (a.impact && !b.impact) return -1;
  if (!a.impact && b.impact) return 1;

  return createdAt(a) - createdAt(b);
}

function createUnifiedSorter(config: {
  prioritizeTimers: boolean;
  prioritizeDeadlines: boolean;
  priorityHandling: 'none' | 'standard' | 'explicit-only';
  statusHandling: 'standard' | 'none';
}) {
  return (a: SortableTask, b: SortableTask): number => {
    if (config.prioritizeTimers) {
      const timerResult = sortByActiveTimer(a, b);
      if (timerResult !== 0) return timerResult;
    }

    if (config.statusHandling !== 'none') {
      const doneResult = sortByDoneStatus(a, b);
      if (doneResult !== 0) return doneResult;
    }

    if (config.prioritizeDeadlines) {
      const deadlineResult = sortByDeadlines(a, b);
      if (deadlineResult !== 0) return deadlineResult;
    }

    if (config.priorityHandling !== 'none') {
      const priorityResult = sortByPriority(a, b);
      if (priorityResult !== 0) return priorityResult;
    }

    if (config.statusHandling !== 'none') {
      const blockedResult = sortByBlockedStatus(a, b);
      if (blockedResult !== 0) return blockedResult;
    }

    const aScore = calculateUrgencyImpactScore(a);
    const bScore = calculateUrgencyImpactScore(b);
    if (aScore !== bScore) return bScore - aScore;

    return createdAt(a) - createdAt(b);
  };
}

const sortTaskBoardTasks = createUnifiedSorter({
  prioritizeTimers: true,
  prioritizeDeadlines: false,
  priorityHandling: 'standard',
  statusHandling: 'standard',
});

const sortKanbanTasks = createUnifiedSorter({
  prioritizeTimers: true,
  prioritizeDeadlines: true,
  priorityHandling: 'standard',
  statusHandling: 'standard',
});

export const sortTasks = {
  plan: sortPlanTasks,
  taskboard: sortTaskBoardTasks,
  kanban: sortKanbanTasks,
  priority: comparePriority,
};

export type SortMode = 'default' | 'board' | 'plan' | 'taskboard' | 'kanban' | 'priority';

export function sortTasksByMode(tasks: TaskRecord[], mode: SortMode | undefined): TaskRecord[] {
  if (!mode || mode === 'default') return tasks;
  const comparator =
    mode === 'priority'
      ? sortTasks.priority
      : mode === 'plan'
        ? sortTasks.plan
        : mode === 'kanban'
          ? sortTasks.kanban
          : sortTasks.taskboard;
  return [...tasks].sort(comparator);
}
