import type { P3foClient } from './client.js';
import { P3foApiError } from './client.js';
import type { TaskRecord, Timestamp } from './task-types.js';
import { toMillis } from './task-types.js';

const FETCH_CACHE_TTL_MS = 15_000;
const FETCH_CACHE_MAX_ENTRIES = 100;
const fetchCache = new Map<string, { expires: number; result: TaskFetchResult }>();

export function clearTaskCache(): void {
  fetchCache.clear();
}

export type StringList = string[] | string | undefined;

export function normalizeStringList(value: StringList): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface TaskFetchFilters {
  userId?: string;
  statuses?: StringList;
  excludeStatuses?: StringList;
  includeArchived?: boolean;
  includeSubtasks?: boolean;
  search?: string;
  active?: boolean;
}

export interface TaskFetchOptions {
  pageSize?: number;
  maxTasks?: number;
  /** Bypass the short read cache for accuracy-sensitive audits. */
  fresh?: boolean;
}

export interface TaskFetchResult {
  data: TaskRecord[];
  total: number;
}

/**
 * Fetch every task matching the server-side filters.
 *
 * The MCP server is the only caller; it pages internally so the LLM never sees
 * a full export. The page cap prevents accidental unbounded scans.
 */
export async function fetchAllTasks(
  client: P3foClient,
  filters: TaskFetchFilters = {},
  options: TaskFetchOptions = {},
): Promise<TaskFetchResult> {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 500, 1000));
  const maxTasks = Math.max(1, options.maxTasks ?? 5000);

  const cacheKey = JSON.stringify({
    filters,
    options: { pageSize: options.pageSize, maxTasks: options.maxTasks },
  });
  const now = Date.now();
  for (const [key, entry] of fetchCache) {
    if (entry.expires <= now) fetchCache.delete(key);
  }
  const cached = !options.fresh ? fetchCache.get(cacheKey) : undefined;
  if (cached && cached.expires > now) {
    return cached.result;
  }

  const statuses = normalizeStringList(filters.statuses);
  const excluded = normalizeStringList(filters.excludeStatuses) ?? [];
  if (filters.includeArchived === false && !statuses?.includes('Archived')) {
    excluded.push('Archived');
  }

  const collected: TaskRecord[] = [];
  let total = 0;
  let offset = 0;

  for (let page = 0; page < Math.ceil(maxTasks / pageSize) + 1; page++) {
    const result = (await client.getTasks({
      userId: filters.userId,
      limit: pageSize,
      offset,
      excludeStatuses: excluded.length > 0 ? excluded : undefined,
      triageStatuses: statuses,
      includeSubtasks: filters.includeSubtasks,
      search: filters.search,
      active: filters.active,
    })) as TaskFetchResult;

    total = result.total;
    if (result.data.length === 0) break;

    collected.push(...result.data);

    if (collected.length >= total) break;
    if (collected.length > maxTasks) {
      throw new Error(
        `Task scan exceeded ${maxTasks} rows (total ${total}). Narrow the filters (userId/statuses/includeArchived) and retry.`,
      );
    }

    offset += result.data.length;
  }

  if (total > maxTasks) {
    throw new Error(
      `Task scan would read ${total} rows, above the ${maxTasks}-row safety cap. Narrow the filters (userId/statuses/includeArchived) and retry.`,
    );
  }

  const result = { data: collected, total };
  if (fetchCache.size >= FETCH_CACHE_MAX_ENTRIES) {
    const oldestKey = fetchCache.keys().next().value;
    if (oldestKey !== undefined) fetchCache.delete(oldestKey);
  }
  fetchCache.set(cacheKey, { expires: Date.now() + FETCH_CACHE_TTL_MS, result });
  return result;
}

export interface FetchTasksByIdsOptions {
  /** Follow parentId chains (needed for import validation). */
  followParents?: boolean;
  maxDepth?: number;
}

const LOOKUP_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let failed = false;
  let failure: unknown;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index]);
      } catch (error) {
        failed = true;
        failure = error;
        return;
      }
    }
  });
  await Promise.all(workers);
  if (failed) throw failure;
  return results;
}

/**
 * Fetch specific tasks by id instead of scanning the whole table.
 *
 * Lookups are always per id (bounded concurrency), so large batches cannot
 * turn into a full-table scan or hit the `fetchAllTasks` row cap. Import calls
 * use `followParents` so existing parent chains are available for
 * cycle/ancestor validation.
 */
export async function fetchTasksByIds(
  client: P3foClient,
  ids: string[],
  options: FetchTasksByIdsOptions = {},
): Promise<TaskRecord[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const found = new Map<string, TaskRecord>();
  const queue = [...unique];
  const maxDepth = Math.max(1, options.maxDepth ?? 50);

  for (let depth = 0; queue.length > 0 && depth <= maxDepth; depth++) {
    const batch = [...new Set(queue.splice(0, queue.length))].filter((id) => !found.has(id));
    const loaded = await mapWithConcurrency(batch, LOOKUP_CONCURRENCY, async (id) => {
      try {
        return (await client.getTaskById(id)) as TaskRecord | null;
      } catch (error) {
        if (error instanceof P3foApiError && error.status === 404) return null;
        throw error;
      }
    });

    for (const task of loaded) {
      if (!task || found.has(task.id)) continue;
      found.set(task.id, task);
      if (options.followParents && task.parentId && !found.has(task.parentId)) {
        queue.push(task.parentId);
      }
    }
  }

  return [...found.values()];
}

export interface LocalTaskFilters {
  userId?: string;
  statuses?: StringList;
  excludeStatuses?: StringList;
  includeArchived?: boolean;
  includeSubtasks?: boolean;
  hasParent?: boolean;
  priorityIsNull?: boolean;
  priorityIsZero?: boolean;
  updatedSince?: Timestamp;
  category?: string;
  search?: string;
  active?: boolean;
}

export function filterTasks(tasks: TaskRecord[], filters: LocalTaskFilters = {}): TaskRecord[] {
  const statuses = normalizeStringList(filters.statuses);
  const excluded = new Set(normalizeStringList(filters.excludeStatuses) ?? []);
  if (filters.includeArchived === false && !statuses?.includes('Archived')) {
    excluded.add('Archived');
  }
  const updatedSince = toMillis(filters.updatedSince);
  const search = filters.search?.trim().toLowerCase();

  return tasks.filter((task) => {
    if (filters.userId && task.userId !== filters.userId) return false;

    const status = task.triageStatus ?? '';

    if (statuses && statuses.length > 0) {
      if (!statuses.includes(status)) return false;
    } else if (excluded.size > 0 && excluded.has(status)) {
      return false;
    }

    if (filters.active && !['WIP', 'Ready', 'Blocked'].includes(status)) return false;

    if (filters.includeSubtasks === false && task.parentId != null) return false;

    if (filters.hasParent === true && task.parentId == null) return false;
    if (filters.hasParent === false && task.parentId != null) return false;

    if (filters.priorityIsNull === true && task.priority != null) return false;
    if (filters.priorityIsNull === false && task.priority == null) return false;
    if (filters.priorityIsZero === true && task.priority !== 0) return false;
    if (filters.priorityIsZero === false && task.priority === 0) return false;

    if (filters.category && (task.category ?? '') !== filters.category) return false;

    if (updatedSince !== null) {
      const taskTime = toMillis(task.updatedAt) ?? toMillis(task.createdAt) ?? 0;
      if (taskTime < updatedSince) return false;
    }

    if (search && !(task.title ?? '').toLowerCase().includes(search)) return false;

    return true;
  });
}
