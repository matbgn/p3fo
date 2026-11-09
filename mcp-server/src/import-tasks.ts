import { randomUUID } from 'node:crypto';
import type { TaskRecord } from './task-types.js';
import { ALLOWED_TRIAGE_STATUSES } from './bulk-update.js';
import { GENERAL_CATEGORY, isGeneralCategory, isKnownCategory } from './categories.js';
import { applyTemporalMirror, type TemporalTaskFields } from './task-temporal.js';
import { combineDueDateAndTime, existingDueDateFor, normalizeDateInput, normalizeDueTimeInput } from './task-dates.js';
import { validateRecurrenceAnchor } from './task-recurrence.js';

export interface ImportTaskInput {
  id?: string;
  title?: string;
  createdAt?: string | number;
  updatedAt?: string | number | null;
  triageStatus?: string;
  urgent?: boolean;
  impact?: boolean;
  majorIncident?: boolean;
  sprintTarget?: boolean;
  difficulty?: number;
  timer?: unknown[];
  category?: string;
  terminationDate?: string | number | null;
  dueDate?: string | number | null;
  dueTime?: string | null;
  completedAt?: string | number | null;
  deletedAt?: string | number | null;
  comment?: string | null;
  durationInMinutes?: number | null;
  priority?: number | null;
  userId?: string | null;
  parentId?: string | null;
  children?: string[];
  linkedVoteIds?: string[];
  blockedSince?: string | number | null;
  [key: string]: unknown;
}

export interface ImportPreparation {
  normalized: Record<string, unknown>[];
  errors: string[];
  warnings: string[];
  created: number;
  updated: number;
  rejected: number;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Date(value).toISOString() : null;
  }
  if (typeof value === 'string') {
    const normalized = normalizeDateInput(value);
    if (normalized === null || normalized === undefined) return null;
    const parsed = Date.parse(normalized);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

function toOptionalIso(value: unknown): string | null {
  if (value === 0 || value === '0') return null;
  return toIso(value);
}

function normalizeCategory(value: string | null | undefined): string {
  if (value === null || value === undefined) return GENERAL_CATEGORY;
  const trimmed = value.trim();
  if (!trimmed || isGeneralCategory(trimmed)) return GENERAL_CATEGORY;
  return trimmed;
}

/**
 * Validate and normalize import payloads before they reach /api/tasks/import.
 *
 * The endpoint is an upsert keyed by id, so this returns created/updated counts
 * by comparing against the existing snapshot. Existing rows are merged with the
 * incoming fields so a partial import does not wipe unspecified values.
 */
export function prepareTaskImport(
  inputs: ImportTaskInput[],
  existingTasks: TaskRecord[],
): ImportPreparation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalized: (Record<string, unknown> & { id: string; parentId: string | null })[] = [];
  const seenIds = new Set<string>();
  const duplicateBuckets = new Map<string, { priority: number; ids: string[] }>();
  const cycleIds = new Set<string>();

  const existingIds = new Set(existingTasks.map((task) => task.id));
  const existingById = new Map(existingTasks.map((task) => [task.id, task]));
  const parentById = new Map<string, string | null>();
  for (const task of existingTasks) parentById.set(task.id, task.parentId ?? null);

  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index];
    const label = `tasks[${index}]`;
    const taskErrors: string[] = [];
    const taskWarnings: string[] = [];

    const id = (input.id ?? '').trim() || randomUUID();
    const existing = existingById.get(id);
    const title = (input.title ?? existing?.title ?? '').trim();
    if (!title) taskErrors.push(`${label}.title is required`);
    if (seenIds.has(id)) {
      taskErrors.push(`${label}.id duplicates another task in this batch: ${id}`);
    }
    seenIds.add(id);

    const triageStatus = input.triageStatus ?? existing?.triageStatus ?? 'Backlog';
    if (!ALLOWED_TRIAGE_STATUSES.includes(triageStatus as typeof ALLOWED_TRIAGE_STATUSES[number])) {
      taskErrors.push(`${label}.triageStatus "${triageStatus}" is invalid`);
    }

    const rawCategory = input.category !== undefined
      ? input.category
      : existing?.category ?? GENERAL_CATEGORY;
    const category = normalizeCategory(rawCategory);
    if (category === GENERAL_CATEGORY) {
      taskWarnings.push(
        `${label}.category is "${GENERAL_CATEGORY}" (server default, not in the known category list)`,
      );
    } else if (!isKnownCategory(category)) {
      taskErrors.push(`${label}.category "${category}" is not a known P3FO category`);
    }

    let priority: number | null = existing?.priority ?? null;
    if (input.priority !== undefined) {
      if (input.priority === null) {
        priority = null;
      } else if (typeof input.priority !== 'number' || !Number.isFinite(input.priority)) {
        taskErrors.push(`${label}.priority must be a finite number or null`);
      } else {
        priority = input.priority;
        if (priority === 0) {
          taskWarnings.push(
            `${label}.priority is 0 (allowed, but P3FO normally uses null, fractional, or negative values)`,
          );
        }
      }
    }

    const difficulty = input.difficulty ?? existing?.difficulty ?? 1;
    if (typeof difficulty !== 'number' || !Number.isFinite(difficulty)) {
      taskErrors.push(`${label}.difficulty must be a finite number`);
    }

    const rawParentId = input.parentId !== undefined ? input.parentId : existing?.parentId ?? null;
    const parentId = typeof rawParentId === 'string' ? (rawParentId.trim() || null) : rawParentId;
    const userId = input.userId !== undefined ? input.userId : (existing?.userId ?? null);
    if (parentId && parentId === id) {
      taskErrors.push(`${label}.parentId cannot reference the task itself`);
    }

    const task: Record<string, unknown> & { id: string; parentId: string | null } = {
      ...(existing ?? {}),
      ...input,
      id,
      title,
      createdAt: toIso(input.createdAt) ?? toIso(existing?.createdAt) ?? new Date().toISOString(),
      updatedAt: input.updatedAt !== undefined
        ? toOptionalIso(input.updatedAt)
        : toOptionalIso(existing?.updatedAt),
      triageStatus,
      urgent: input.urgent ?? existing?.urgent ?? false,
      impact: input.impact ?? existing?.impact ?? false,
      majorIncident: input.majorIncident ?? existing?.majorIncident ?? false,
      sprintTarget: input.sprintTarget ?? existing?.sprintTarget ?? false,
      difficulty,
      timer: input.timer ?? existing?.timer ?? [],
      category,
      comment: input.comment !== undefined ? input.comment : (existing?.comment ?? null),
      durationInMinutes: input.durationInMinutes !== undefined
        ? input.durationInMinutes
        : (existing?.durationInMinutes ?? null),
      priority,
      userId,
      parentId,
      children: input.children ?? existing?.children ?? [],
      blockedSince: input.blockedSince !== undefined
        ? toOptionalIso(input.blockedSince)
        : toOptionalIso(existing?.blockedSince),
    };

    // Temporal fields need the same merge + mirror behavior as REST writes:
    // only fields the caller actually provides may change, and a provided
    // dueDate/completedAt must update its legacy terminationDate counterpart.
    // The shared helper keeps this in lockstep with server writes and detects
    // status transitions (e.g. reopening DONE clears its completion marker).
    const providedTermination = input.terminationDate !== undefined
      ? toOptionalIso(input.terminationDate)
      : undefined;
    const providedCompleted = input.completedAt !== undefined ? toOptionalIso(input.completedAt) : undefined;
    const storedValue = (value: unknown) =>
      value !== undefined && value !== null ? toOptionalIso(value) : undefined;

    let providedDue = input.dueDate !== undefined ? toOptionalIso(input.dueDate) : undefined;
    const providedDueTime = input.dueTime !== undefined ? normalizeDueTimeInput(input.dueTime) : undefined;
    if (providedDue === undefined && providedDueTime !== undefined) {
      // A dueTime-only update needs a date. A supplied deadline mirror is the
      // freshest source for active tasks; otherwise fall back to the stored due
      // date (active tasks may still hold their deadline only in the mirror).
      const fallbackDue = triageStatus !== 'Done' && providedTermination !== undefined
        ? providedTermination
        : storedValue(existingDueDateFor(existing));
      if (fallbackDue) providedDue = combineDueDateAndTime(fallbackDue, providedDueTime ?? null);
    }
    if (providedDue !== undefined && providedDue !== null && providedDueTime !== undefined) {
      providedDue = combineDueDateAndTime(providedDue, providedDueTime ?? null);
    }

    // For active tasks the legacy terminationDate mirrors the deadline, so an
    // applied due time must reach the mirror too; otherwise it stays at the
    // time-less supplied value (e.g. local midnight) while dueDate carries the
    // requested time.
    const combinedTermination =
      providedTermination !== undefined &&
      triageStatus !== 'Done' &&
      providedDueTime !== undefined &&
      providedDue != null
        ? providedDue
        : undefined;

    task.terminationDate = combinedTermination !== undefined
      ? combinedTermination
      : providedTermination !== undefined
        ? providedTermination
        : storedValue(existing?.terminationDate) ?? null;
    task.dueDate = providedDue !== undefined ? providedDue : storedValue(existing?.dueDate) ?? null;
    // The dedicated due time is owned by applyTemporalMirror below: an explicit
    // value wins (`null` means all-day) and a date change without one clears it,
    // exactly like REST writes. Deriving it here would encode a second policy in
    // the server process timezone and silently override the mirror.
    task.dueTime = providedDueTime !== undefined
      ? providedDueTime ?? null
      : (existing?.dueTime ?? null);
    task.completedAt = providedCompleted !== undefined
      ? providedCompleted
      : storedValue(existing?.completedAt) ?? null;

    const providedTemporal: Partial<TemporalTaskFields> = {};
    if (input.triageStatus !== undefined) providedTemporal.triageStatus = input.triageStatus;
    if (providedTermination !== undefined) providedTemporal.terminationDate = combinedTermination ?? providedTermination;
    if (providedDue !== undefined) providedTemporal.dueDate = providedDue;
    if (providedDueTime !== undefined) providedTemporal.dueTime = providedDueTime;
    if (providedCompleted !== undefined) providedTemporal.completedAt = providedCompleted;

    applyTemporalMirror(task as TemporalTaskFields, providedTemporal, existing?.triageStatus ?? null);

    // The mirror guarantees an effective due date for active tasks, and Done
    // tasks keep their terminationDate as the completion time, never a deadline.
    const dueDateValue = typeof task.dueDate === 'string' ? task.dueDate : null;
    if (typeof providedDueTime === 'string' && !dueDateValue) {
      // The create/update tools reject this combination; surface it here
      // instead of silently discarding the requested time.
      taskWarnings.push(`${label}.dueTime was ignored because the task has no due date`);
    }

    // Keep the keys present even when there is no value. The import endpoint
    // binds every column and node:sqlite rejects undefined parameters (a
    // deleted key binds as undefined); `null` is the "no value" marker.
    task.terminationDate = task.terminationDate ?? null;
    task.dueDate = task.dueDate ?? null;
    task.dueTime = task.dueTime ?? null;
    task.completedAt = task.completedAt ?? null;
    task.deletedAt = input.deletedAt !== undefined
      ? toOptionalIso(input.deletedAt) ?? null
      : storedValue(existing?.deletedAt) ?? null;

    const recurrenceError = validateRecurrenceAnchor(task.plannedDate, task.recurrence);
    if (recurrenceError) taskErrors.push(`${label}.${recurrenceError}`);

    parentById.set(id, parentId);

    errors.push(...taskErrors);
    if (taskErrors.length === 0) {
      warnings.push(...taskWarnings);
      normalized.push(task);

      if (priority !== null) {
        const key = `${userId ?? 'unassigned'}|${parentId ?? 'root'}|${priority}`;
        const bucket = duplicateBuckets.get(key);
        if (bucket) bucket.ids.push(id);
        else duplicateBuckets.set(key, { priority, ids: [id] });
      }
    }
  }

  // Cycle detection after all parents are known.
  for (const task of normalized) {
    let cursor = task.parentId;
    const seen = new Set<string>([task.id]);
    while (cursor) {
      if (seen.has(cursor)) {
        cycleIds.add(task.id);
        errors.push(`task ${task.id}: parent cycle detected at ${cursor}`);
        break;
      }
      seen.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  for (const bucket of duplicateBuckets.values()) {
    if (bucket.ids.length > 1) {
      warnings.push(
        `duplicate priority ${bucket.priority} in the same parent/user scope: ${bucket.ids.join(', ')}`,
      );
    }
  }

  const normalizedIds = new Set(normalized.map((task) => task.id));
  const blockedIds = new Set<string>(cycleIds);

  for (const task of normalized) {
    if (task.parentId && !existingIds.has(task.parentId) && !normalizedIds.has(task.parentId)) {
      blockedIds.add(task.id);
      errors.push(
        `task ${task.id}: parent ${task.parentId} does not exist in this batch or the current task table`,
      );
    }
  }

  // A task whose ancestor is blocked must not be imported either.
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of normalized) {
      if (blockedIds.has(task.id)) continue;
      if (task.parentId && blockedIds.has(task.parentId)) {
        blockedIds.add(task.id);
        errors.push(`task ${task.id}: blocked by invalid ancestor ${task.parentId}`);
        changed = true;
      }
    }
  }

  const importable = normalized.filter((task) => !blockedIds.has(task.id));
  const created = importable.filter((task) => !existingIds.has(task.id)).length;

  return {
    normalized: importable,
    errors,
    warnings,
    created,
    updated: importable.length - created,
    rejected: inputs.length - importable.length,
  };
}
