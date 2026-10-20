import { getEntryKey } from './timeOverlap';

export interface TimetableGroupingEntry {
  taskId: string;
  index: number;
  startTime: number;
  endTime: number;
}

export interface TimetableGroupingTask {
  id: string;
  parentId?: string | null;
}

export type SubheaderKind = 'parent' | 'subparent';

export type CategoricalRow<
  E extends TimetableGroupingEntry,
  T extends TimetableGroupingTask
> =
  | { type: 'group-header'; topParentId: string; topParentTask: T | undefined; groupTotal: number }
  | { type: 'subtask-header'; parentId: string; parentTask: T | undefined; subtotal: number; depth: number; kind: SubheaderKind }
  | { type: 'entry'; entry: E; entryKey: string };

const entryDuration = (entry: TimetableGroupingEntry): number =>
  entry.endTime > 0 ? entry.endTime - entry.startTime : Date.now() - entry.startTime;

/**
 * Split a subtree's entries into entries attached to the node itself and the
 * entries attached to each direct child branch (walking up from the timed
 * task until the child of `parentId` is found).
 */
const partitionByChild = <E extends TimetableGroupingEntry, T extends TimetableGroupingTask>(
  parentId: string,
  entries: E[],
  taskMap: Record<string, T>,
): { ownEntries: E[]; childBranches: Map<string, E[]> } => {
  const ownEntries: E[] = [];
  const childBranches = new Map<string, E[]>();

  for (const entry of entries) {
    if (entry.taskId === parentId) {
      ownEntries.push(entry);
      continue;
    }

    let childId = entry.taskId;
    let current = taskMap[entry.taskId];
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.parentId === parentId) {
        childId = current.id;
        break;
      }
      if (!current.parentId) break;
      current = taskMap[current.parentId];
    }

    if (!childBranches.has(childId)) childBranches.set(childId, []);
    childBranches.get(childId)!.push(entry);
  }

  return { ownEntries, childBranches };
};

/**
 * Build the flat row list for the categorical timetable view.
 *
 * Each top-level ancestor keeps its header with the grand total of the whole
 * subtree (unchanged behavior). Below it the tree is walked depth-first so
 * entries stay inside the branch they belong to:
 * - a task that directly parents timed tasks keeps the existing sub-header
 *   (kind `parent`, the grey shade) with the total of its subtree;
 * - a sub-project that structures the time of several branches gets a lighter
 *   `subparent` sub-header with the total spent on it. It qualifies when it
 *   owns more than one timed child branch, or when it is one of several timed
 *   sibling branches of its parent (so each branch of a split project is
 *   labeled with its own hours). Single-branch chains stay collapsed.
 */
export const buildCategoricalRows = <E extends TimetableGroupingEntry, T extends TimetableGroupingTask>(
  entriesByTopParent: Record<string, E[]>,
  taskMap: Record<string, T>,
): CategoricalRow<E, T>[] => {
  const rows: CategoricalRow<E, T>[] = [];

  const emitNode = (taskId: string, entries: E[], depth: number, siblingBranches: number) => {
    const task = taskMap[taskId];
    const { ownEntries, childBranches } = partitionByChild(taskId, entries, taskMap);

    const hasDirectTimedChild = entries.some(
      (entry) => taskMap[entry.taskId]?.parentId === taskId,
    );
    const showParentHeader = !!task && hasDirectTimedChild;
    const showSubparentHeader =
      !!task && !showParentHeader && (childBranches.size >= 2 || siblingBranches >= 2);

    if (showParentHeader || showSubparentHeader) {
      const subtotal = entries.reduce((acc, entry) => acc + entryDuration(entry), 0);
      rows.push({
        type: 'subtask-header',
        parentId: taskId,
        parentTask: task,
        subtotal,
        depth,
        kind: showParentHeader ? 'parent' : 'subparent',
      });
    }

    for (const entry of ownEntries) {
      rows.push({ type: 'entry', entry, entryKey: getEntryKey(entry.taskId, entry.index) });
    }

    for (const [childId, childEntries] of childBranches) {
      emitNode(childId, childEntries, depth + 1, childBranches.size);
    }
  };

  for (const [topParentId, topEntries] of Object.entries(entriesByTopParent)) {
    const groupTotal = topEntries.reduce((acc, entry) => acc + entryDuration(entry), 0);
    rows.push({ type: 'group-header', topParentId, topParentTask: taskMap[topParentId], groupTotal });

    const { ownEntries, childBranches } = partitionByChild(topParentId, topEntries, taskMap);

    for (const entry of ownEntries) {
      rows.push({ type: 'entry', entry, entryKey: getEntryKey(entry.taskId, entry.index) });
    }

    for (const [childId, childEntries] of childBranches) {
      emitNode(childId, childEntries, 1, childBranches.size);
    }
  }

  return rows;
};
