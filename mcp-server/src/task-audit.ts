import type { TaskRecord } from './task-types.js';
import { hasFinitePriority, toMillis } from './task-types.js';
import { isGeneralCategory, isKnownCategory } from './categories.js';
import { extractReferenceNumber } from './task-search.js';

export interface AuditOptions {
  includeTerminal?: boolean;
  staleDays?: number;
  now?: number;
  limitPerSection?: number;
  /** Full snapshot ids used for orphan detection when tasks are filtered locally. */
  knownTaskIds?: Iterable<string>;
}

export interface CountMap {
  [key: string]: number;
}

export interface AuditRow {
  id: string;
  title: string;
  triageStatus: string | null;
  priority: number | null;
  category: string | null;
  userId: string | null;
  parentId: string | null;
  updatedAt: string | number | null;
  referenceNumber: string | null;
}

export interface TaskStats {
  scanned: number;
  generatedAt: string;
  byStatus: CountMap;
  byCategory: CountMap;
  byUser: CountMap;
  structure: { roots: number; children: number };
  priority: {
    null: number;
    zero: number;
    negative: number;
    duplicateGroups: number;
    duplicateTasks: number;
  };
  category: { general: number; unknown: number };
  assignment: { unassigned: number };
  stale: { thresholdDays: number; count: number };
}

export interface DuplicateGroup {
  userId: string | null;
  parentId: string | null;
  priority: number;
  taskCount: number;
  tasks: AuditRow[];
}

export interface PriorityAudit {
  summary: TaskStats;
  nullPriority: AuditRow[];
  zeroPriority: AuditRow[];
  duplicates: DuplicateGroup[];
  generalCategory: AuditRow[];
  unknownCategory: AuditRow[];
  unassigned: AuditRow[];
  staleTasks: AuditRow[];
  orphanedChildren: AuditRow[];
  truncated: {
    nullPriority: boolean;
    zeroPriority: boolean;
    duplicates: boolean;
    generalCategory: boolean;
    unknownCategory: boolean;
    unassigned: boolean;
    staleTasks: boolean;
    orphanedChildren: boolean;
  };
}

interface AuditData {
  stats: TaskStats;
  nullPriority: TaskRecord[];
  zeroPriority: TaskRecord[];
  duplicateGroups: DuplicateGroup[];
  generalCategory: TaskRecord[];
  unknownCategory: TaskRecord[];
  unassigned: TaskRecord[];
  stale: TaskRecord[];
  orphanedChildren: TaskRecord[];
}

function increment(map: CountMap, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function isTerminal(status: string | null | undefined): boolean {
  return status === 'Done' || status === 'Dropped' || status === 'Archived';
}

function toRow(task: TaskRecord): AuditRow {
  return {
    id: task.id,
    title: task.title ?? '',
    triageStatus: task.triageStatus ?? null,
    priority: task.priority ?? null,
    category: task.category ?? null,
    userId: task.userId ?? null,
    parentId: task.parentId ?? null,
    updatedAt: task.updatedAt ?? task.createdAt ?? null,
    referenceNumber: extractReferenceNumber(task),
  };
}

function safeLimit(value: number | undefined): number {
  return Math.max(1, Math.min(value ?? 25, 200));
}

function computeAudit(tasks: TaskRecord[], options: AuditOptions = {}): AuditData {
  const includeTerminal = options.includeTerminal ?? false;
  const staleDays = Math.max(1, options.staleDays ?? 90);
  const now = options.now ?? Date.now();
  const staleCutoff = now - staleDays * 24 * 60 * 60 * 1000;

  const byStatus: CountMap = {};
  const byCategory: CountMap = {};
  const byUser: CountMap = {};
  const idSet = new Set(options.knownTaskIds ?? tasks.map((task) => task.id));

  let roots = 0;
  let children = 0;
  let nullPriority = 0;
  let zeroPriority = 0;
  let negativePriority = 0;
  let generalCategory = 0;
  let unknownCategory = 0;
  let unassigned = 0;
  let staleCount = 0;

  const nullPriorityTasks: TaskRecord[] = [];
  const zeroPriorityTasks: TaskRecord[] = [];
  const generalCategoryTasks: TaskRecord[] = [];
  const unknownCategoryTasks: TaskRecord[] = [];
  const unassignedTasks: TaskRecord[] = [];
  const staleTasks: TaskRecord[] = [];
  const orphanedTasks: TaskRecord[] = [];
  const groups = new Map<string, TaskRecord[]>();

  for (const task of tasks) {
    increment(byStatus, task.triageStatus ?? 'unknown');
    increment(byCategory, task.category ?? 'unassigned');
    increment(byUser, task.userId ?? 'unassigned');

    if (task.parentId == null) roots++;
    else children++;

    if (task.priority == null) {
      nullPriority++;
      nullPriorityTasks.push(task);
    } else if (task.priority === 0) {
      zeroPriority++;
      zeroPriorityTasks.push(task);
    } else if (typeof task.priority === 'number' && task.priority < 0) {
      negativePriority++;
    }

    if (isGeneralCategory(task.category)) {
      generalCategory++;
      generalCategoryTasks.push(task);
    } else if (task.category && !isKnownCategory(task.category)) {
      unknownCategory++;
      unknownCategoryTasks.push(task);
    }

    if (!task.userId) {
      unassigned++;
      unassignedTasks.push(task);
    }

    if (!isTerminal(task.triageStatus)) {
      const taskTime = toMillis(task.updatedAt) ?? toMillis(task.createdAt);
      if (taskTime === null || taskTime < staleCutoff) {
        staleCount++;
        staleTasks.push(task);
      }
    }

    if (task.parentId != null && !idSet.has(task.parentId)) {
      orphanedTasks.push(task);
    }

    if (!hasFinitePriority(task)) continue;
    if (!includeTerminal && isTerminal(task.triageStatus)) continue;
    const key = `${task.userId ?? 'unassigned'}|${task.parentId ?? 'root'}|${task.priority}`;
    const group = groups.get(key);
    if (group) group.push(task);
    else groups.set(key, [task]);
  }

  const duplicateGroups: DuplicateGroup[] = [];
  let duplicateTasks = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    duplicateTasks += group.length;
    duplicateGroups.push({
      userId: group[0].userId ?? null,
      parentId: group[0].parentId ?? null,
      priority: group[0].priority as number,
      taskCount: group.length,
      tasks: group.map(toRow),
    });
  }

  const stats: TaskStats = {
    scanned: tasks.length,
    generatedAt: new Date(now).toISOString(),
    byStatus,
    byCategory,
    byUser,
    structure: { roots, children },
    priority: {
      null: nullPriority,
      zero: zeroPriority,
      negative: negativePriority,
      duplicateGroups: duplicateGroups.length,
      duplicateTasks,
    },
    category: { general: generalCategory, unknown: unknownCategory },
    assignment: { unassigned },
    stale: { thresholdDays: staleDays, count: staleCount },
  };

  return {
    stats,
    nullPriority: nullPriorityTasks,
    zeroPriority: zeroPriorityTasks,
    duplicateGroups,
    generalCategory: generalCategoryTasks,
    unknownCategory: unknownCategoryTasks,
    unassigned: unassignedTasks,
    stale: staleTasks,
    orphanedChildren: orphanedTasks,
  };
}

export function buildTaskStats(tasks: TaskRecord[], options: AuditOptions = {}): TaskStats {
  return computeAudit(tasks, options).stats;
}

export function buildPriorityAudit(tasks: TaskRecord[], options: AuditOptions = {}): PriorityAudit {
  const data = computeAudit(tasks, options);
  const limit = safeLimit(options.limitPerSection);

  const take = (rows: TaskRecord[]) => rows.slice(0, limit).map(toRow);

  return {
    summary: data.stats,
    nullPriority: take(data.nullPriority),
    zeroPriority: take(data.zeroPriority),
    duplicates: data.duplicateGroups.slice(0, limit).map((group) => ({
      ...group,
      tasks: group.tasks.slice(0, limit),
    })),
    generalCategory: take(data.generalCategory),
    unknownCategory: take(data.unknownCategory),
    unassigned: take(data.unassigned),
    staleTasks: take(data.stale),
    orphanedChildren: take(data.orphanedChildren),
    truncated: {
      nullPriority: data.nullPriority.length > limit,
      zeroPriority: data.zeroPriority.length > limit,
      duplicates:
        data.duplicateGroups.length > limit ||
        data.duplicateGroups.some((group) => group.tasks.length > limit),
      generalCategory: data.generalCategory.length > limit,
      unknownCategory: data.unknownCategory.length > limit,
      unassigned: data.unassigned.length > limit,
      staleTasks: data.stale.length > limit,
      orphanedChildren: data.orphanedChildren.length > limit,
    },
  };
}
