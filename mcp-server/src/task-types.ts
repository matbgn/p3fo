/**
 * Minimal task shape used by the MCP-side search/audit helpers.
 *
 * The REST API returns `TaskEntity` rows with ISO timestamps; the live task
 * feed can also contain epoch milliseconds. Keep both accepted here.
 */
export type Timestamp = string | number | null | undefined;

export interface TaskRecord {
  id: string;
  title?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  triageStatus?: string | null;
  urgent?: boolean;
  impact?: boolean;
  majorIncident?: boolean;
  sprintTarget?: boolean;
  difficulty?: number;
  timer?: { startTime?: number | null; endTime?: number | null }[] | null;
  category?: string | null;
  terminationDate?: Timestamp;
  comment?: string | null;
  durationInMinutes?: number | null;
  priority?: number | null;
  userId?: string | null;
  parentId?: string | null;
  children?: string[];
  linkedVoteIds?: string[];
  blockedSince?: Timestamp;
}

export function toMillis(value: Timestamp): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function hasFinitePriority(task: TaskRecord): boolean {
  return typeof task.priority === 'number' && Number.isFinite(task.priority);
}
