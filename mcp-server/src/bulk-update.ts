import type { P3foClient } from './client.js';
import type { TaskRecord } from './task-types.js';
import { GENERAL_CATEGORY, isGeneralCategory, isKnownCategory } from './categories.js';

export const ALLOWED_TRIAGE_STATUSES = [
  'Backlog',
  'Ready',
  'WIP',
  'Blocked',
  'Done',
  'Dropped',
  'Archived',
] as const;

export type TriageStatus = (typeof ALLOWED_TRIAGE_STATUSES)[number];

export interface BulkPatch {
  priority?: number | null;
  triageStatus?: string;
  category?: string;
  urgent?: boolean;
  impact?: boolean;
}

export interface BulkItem {
  id: string;
  patch: BulkPatch;
}

export type FieldChange = { from: unknown; to: unknown };

export interface BulkResult {
  id: string;
  ok: boolean;
  changes?: Record<string, FieldChange>;
  warnings?: string[];
  error?: string;
}

export interface BulkUpdateOptions {
  dryRun?: boolean;
  stopOnError?: boolean;
}

export interface BulkUpdateResponse {
  dryRun: boolean;
  requested: number;
  applied: number;
  failed: number;
  warnings: string[];
  results: BulkResult[];
}

function isBlankPatch(patch: BulkPatch): boolean {
  return Object.keys(patch).length === 0;
}

function validatePatch(patch: BulkPatch): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isBlankPatch(patch)) {
    errors.push('patch is empty');
    return { errors, warnings };
  }

  if ('priority' in patch && patch.priority !== null && patch.priority !== undefined) {
    if (typeof patch.priority !== 'number' || !Number.isFinite(patch.priority)) {
      errors.push('priority must be a finite number or null');
    }
  }

  if (patch.triageStatus !== undefined) {
    if (!ALLOWED_TRIAGE_STATUSES.includes(patch.triageStatus as TriageStatus)) {
      errors.push(
        `triageStatus "${patch.triageStatus}" is invalid (expected ${ALLOWED_TRIAGE_STATUSES.join(', ')})`,
      );
    }
  }

  if (patch.category !== undefined) {
    if (isGeneralCategory(patch.category)) {
      warnings.push(`category "${GENERAL_CATEGORY}" is the server default and is not in the known category list`);
    } else if (!isKnownCategory(patch.category)) {
      errors.push(`category "${patch.category}" is not a known P3FO category`);
    }
  }

  if (patch.urgent !== undefined && typeof patch.urgent !== 'boolean') {
    errors.push('urgent must be a boolean');
  }

  if (patch.impact !== undefined && typeof patch.impact !== 'boolean') {
    errors.push('impact must be a boolean');
  }

  return { errors, warnings };
}

function isPriorityOnly(patch: BulkPatch): boolean {
  const keys = Object.keys(patch);
  return keys.length === 1 && keys[0] === 'priority';
}

function buildChangeSet(task: TaskRecord, patch: BulkPatch): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  for (const key of Object.keys(patch) as (keyof BulkPatch)[]) {
    const before = task[key];
    const after = patch[key];
    if (before !== after) {
      changes[key] = { from: before ?? null, to: after ?? null };
    }
  }
  return changes;
}

export async function applyBulkUpdates(
  client: P3foClient,
  tasks: TaskRecord[],
  items: BulkItem[],
  options: BulkUpdateOptions = {},
): Promise<BulkUpdateResponse> {
  const dryRun = options.dryRun ?? true;
  const stopOnError = options.stopOnError ?? true;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const cleanedItems: BulkItem[] = items.map((item) => {
    const patch = Object.fromEntries(
      Object.entries(item.patch).filter(([, value]) => value !== undefined),
    ) as BulkPatch;
    if (typeof patch.category === 'string') {
      const category = patch.category.trim();
      patch.category = category === '' || isGeneralCategory(category) ? GENERAL_CATEGORY : category;
    }
    return { id: item.id, patch };
  });

  const results: BulkResult[] = [];
  const warnings: string[] = [];
  const seenItemIds = new Set<string>();

  for (const item of cleanedItems) {
    if (seenItemIds.has(item.id)) {
      results.push({ id: item.id, ok: false, error: `duplicate task id in items: ${item.id}` });
      continue;
    }
    seenItemIds.add(item.id);

    const task = byId.get(item.id);
    if (!task) {
      results.push({ id: item.id, ok: false, error: `task ${item.id} not found` });
      continue;
    }

    const validation = validatePatch(item.patch);
    warnings.push(...validation.warnings.map((warning) => `${item.id}: ${warning}`));

    if (validation.errors.length > 0) {
      results.push({
        id: item.id,
        ok: false,
        warnings: validation.warnings,
        error: validation.errors.join('; '),
      });
      continue;
    }

    results.push({
      id: item.id,
      ok: true,
      changes: buildChangeSet(task, item.patch),
      warnings: validation.warnings,
    });
  }

  const hasErrors = results.some((result) => !result.ok);
  if (hasErrors && stopOnError) {
    if (!dryRun) {
      // No write phase runs in this branch, so nothing may be reported as applied.
      for (const result of results) {
        if (result.ok) {
          result.ok = false;
          result.error = 'not attempted';
        }
      }
    }
    return {
      dryRun,
      requested: cleanedItems.length,
      applied: 0,
      failed: results.filter((result) => !result.ok).length,
      warnings,
      results,
    };
  }

  if (dryRun) {
    return {
      dryRun,
      requested: cleanedItems.length,
      applied: 0,
      failed: results.filter((result) => !result.ok).length,
      warnings,
      results,
    };
  }

  const validItems = cleanedItems.filter((_, index) => results[index]?.ok);
  const priorityOnly = validItems.filter((item) => isPriorityOnly(item.patch));
  const mixed = validItems.filter((item) => !isPriorityOnly(item.patch));

  const appliedIds = new Set<string>();
  const markApplied = (id: string) => {
    appliedIds.add(id);
    const result = results.find((entry) => entry.id === id);
    if (result) {
      result.ok = true;
      delete result.error;
    }
  };
  const markFailed = (id: string, message: string) => {
    const result = results.find((entry) => entry.id === id);
    if (result) {
      result.ok = false;
      result.error = message;
    }
  };
  const markNotAttempted = (items: BulkItem[]) => {
    for (const item of items) {
      const result = results.find((entry) => entry.id === item.id);
      if (result && result.ok) {
        result.ok = false;
        result.error = 'not attempted';
      }
    }
  };

  let priorityBatchFailed = false;
  if (priorityOnly.length > 0) {
    try {
      await client.bulkUpdateTaskPriorities(
        priorityOnly.map((item) => ({
          id: item.id,
          priority: item.patch.priority as number | null | undefined,
        })),
      );
      for (const item of priorityOnly) markApplied(item.id);
    } catch (error) {
      priorityBatchFailed = true;
      const message = (error as Error).message ?? String(error);
      for (const item of priorityOnly) markFailed(item.id, message);
    }
  }

  if (priorityBatchFailed && stopOnError) {
    markNotAttempted(mixed);
  } else {
    for (let index = 0; index < mixed.length; index++) {
      const item = mixed[index];
      try {
        await client.updateTask(item.id, item.patch as Record<string, unknown>);
        markApplied(item.id);
      } catch (error) {
        markFailed(item.id, (error as Error).message ?? String(error));
        if (stopOnError) {
          markNotAttempted(mixed.slice(index + 1));
          break;
        }
      }
    }
  }

  // Never report an item as applied unless its write was actually attempted
  // and completed successfully.
  for (const result of results) {
    if (result.ok && !appliedIds.has(result.id)) {
      result.ok = false;
      result.error = 'not attempted';
    }
  }

  return {
    dryRun,
    requested: cleanedItems.length,
    applied: appliedIds.size,
    failed: results.filter((result) => !result.ok).length,
    warnings,
    results,
  };
}
