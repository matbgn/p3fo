/**
 * P3FO MCP tool registry.
 *
 * Every tool mirrors a P3FO REST endpoint. Each handler receives a single
 * `params` object and returns JSON.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { P3foClient, P3foApiError } from './client.js';
import type { TaskRecord } from './task-types.js';
import { clearTaskCache, fetchAllTasks, fetchTasksByIds, filterTasks, normalizeStringList } from './task-fetch.js';
import { extractReferenceNumber, rankTasks } from './task-search.js';
import { renderCommentText } from './comment-text.js';
import { sortTasksByMode, type SortMode } from './task-sorting.js';
import { buildPriorityAudit, buildTaskStats } from './task-audit.js';
import { ALLOWED_TRIAGE_STATUSES, applyBulkUpdates, type BulkItem } from './bulk-update.js';
import { prepareTaskImport, type ImportTaskInput } from './import-tasks.js';
import { adjustRecurrenceForAnchorMove, validateRecurrenceAnchor } from './task-recurrence.js';

const stringOrUndefined = z.string().optional();
const recordSchema = z.record(z.string(), z.unknown()).optional();

/** Accept both a JSON array and a comma-separated string (some MCP clients drop nested arrays). */
const stringListSchema = z.union([z.array(z.string()), z.string()]).optional();

function toList(value: string[] | string | undefined): string[] | undefined {
  return normalizeStringList(value);
}

const DEFAULT_FIELDS = ['id', 'title', 'triageStatus', 'priority', 'updatedAt'];
const SUPPORT_OPS_FIELDS = [
  'id',
  'title',
  'triageStatus',
  'priority',
  'category',
  'urgent',
  'impact',
  'parentId',
  'userId',
  'updatedAt',
  'referenceNumber',
];


function asText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorText(err: unknown) {
  if (err instanceof P3foApiError) {
    return { content: [{ type: 'text' as const, text: `P3FO API error ${err.status}: ${err.message}` }], isError: true };
  }
  return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message ?? String(err)}` }], isError: true };
}

function validationText(errors: string[], warnings: string[] = []) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ ok: false, errors, warnings }, null, 2),
      },
    ],
    isError: true,
  };
}

function projectTask(
  task: TaskRecord | Record<string, unknown>,
  fields: string[],
  includeCommentText: boolean,
): Record<string, unknown> {
  const record = task as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const selected = includeCommentText && !fields.includes('commentText')
    ? [...fields, 'commentText']
    : fields;

  for (const field of selected) {
    if (field === 'referenceNumber') {
      out[field] = extractReferenceNumber({
        id: String(record.id ?? ''),
        title: String(record.title ?? ''),
      });
    } else if (field === 'commentText') {
      out[field] = renderCommentText(record.comment);
    } else {
      out[field] = record[field];
    }
  }
  return out;
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const value = Number(Buffer.from(cursor, 'base64').toString('utf8'));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function makeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64');
}

// Reusable param schemas ------------------------------------------------------
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
// Fractional-index keys start with an A-Z/a-z head and use base-62 digits.
// The planner additionally tolerates legacy malformed keys at read time.
const FRACTIONAL_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const TASK_COLOR_VALUES = [
  'none', 'pink', 'yellow', 'black', 'grey', 'cornflower', 'mango', 'green', 'lilac',
] as const;
const MAX_RECURRENCE_EVERY_DAYS = 365;
const recurrenceSchema = z.string().refine((value) => {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;

    const until = parsed.until;
    if (until !== undefined && until !== null) {
      if (typeof until !== 'string' || !DATE_KEY_PATTERN.test(until)) return false;
    }

    // Keep these constraints in lockstep with normalizeRecurrence in
    // src/lib/recurrence/engine.ts; a rule the app rejects must not be stored.
    if (parsed.type === 'daily') {
      const every = parsed.every;
      return (
        typeof every === 'number' &&
        Number.isInteger(every) &&
        every >= 1 &&
        every <= MAX_RECURRENCE_EVERY_DAYS
      );
    }

    if (parsed.type === 'weekly') {
      const weekdays = parsed.weekdays;
      return (
        Array.isArray(weekdays) &&
        weekdays.length > 0 &&
        weekdays.every(
          (day) => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 7,
        )
      );
    }

    if (parsed.type === 'monthly') {
      const day = parsed.day;
      return typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;
    }

    return false;
  } catch {
    return false;
  }
}, 'Expected a valid JSON recurrence rule');

const taskSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.string().optional(),
  triageStatus: z.string().optional(),
  urgent: z.boolean().optional(),
  impact: z.boolean().optional(),
  majorIncident: z.boolean().optional(),
  sprintTarget: z.boolean().optional(),
  difficulty: z.number().optional(),
  timer: z.array(z.unknown()).optional(),
  category: z.string().optional(),
  terminationDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  durationInMinutes: z.number().nullable().optional(),
  priority: z.number().nullable().optional(),
  userId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  children: z.array(z.string()).optional(),
  updatedAt: z.string().nullable().optional(),
  linkedVoteIds: z.array(z.string()).optional(),
  blockedSince: z.string().nullable().optional(),
  plannedDate: z.string().regex(DATE_KEY_PATTERN, 'Expected YYYY-MM-DD').nullable().optional(),
  plannedTime: z.string().regex(TIME_OF_DAY_PATTERN, 'Expected HH:MM').nullable().optional(),
  plannedPosition: z.string().regex(FRACTIONAL_KEY_PATTERN, 'Expected a fractional index key').nullable().optional(),
  color: z.enum(TASK_COLOR_VALUES).nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  seriesId: z.string().nullable().optional(),
  occurrenceDate: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
}).passthrough();

const importTaskSchema = taskSchema.extend({
  createdAt: z.union([z.string(), z.number()]).optional(),
  updatedAt: z.union([z.string(), z.number()]).nullable().optional(),
  terminationDate: z.union([z.string(), z.number()]).nullable().optional(),
  dueDate: z.union([z.string(), z.number()]).nullable().optional(),
  completedAt: z.union([z.string(), z.number()]).nullable().optional(),
  blockedSince: z.union([z.string(), z.number()]).nullable().optional(),
  deletedAt: z.union([z.string(), z.number()]).nullable().optional(),
});

const reminderSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  taskId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  read: z.boolean().optional(),
  persistent: z.boolean().optional(),
  triggerDate: z.string().optional(),
  offsetMinutes: z.number().optional(),
  snoozeDurationMinutes: z.number().optional(),
  originalTriggerDate: z.string().optional(),
  state: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

const circleSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.string().nullable().optional(),
  nodeType: z.string().optional(),
  modifier: z.string().optional(),
  color: z.string().optional(),
  size: z.number().optional(),
  purpose: z.string().optional(),
  missions: z.string().optional(),
  authorityScope: z.string().optional(),
  order: z.number().optional(),
  assignments: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

const frameworkSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  frameworkType: z.string().optional(),
  parentId: z.string().nullable().optional(),
  categories: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

const voteSchema = z.object({
  id: z.string().optional(),
  slug: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  ownerId: z.string().optional(),
  proposals: z.array(z.unknown()).optional(),
  config: z.unknown().optional(),
  outcome: z.unknown().optional(),
  moderationTokens: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  linkedTaskId: z.string().optional(),
}).passthrough();

const pomodoroSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().optional(),
  userId: z.string().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  phase: z.string().optional(),
  duration: z.number().optional(),
  completed: z.boolean().optional(),
  kind: z.string().optional(),
}).passthrough();

export function registerTools(server: McpServer, client: P3foClient) {
  // ---- System ----
  server.tool('p3fo_health', {}, async () => {
    try { return asText(await client.health()); } catch (e) { return errorText(e); }
  });

  server.tool('p3fo_clear_all_data', {}, async () => {
    try {
      const result = await client.clearAllData();
      clearTaskCache();
      return asText(result);
    } catch (e) { return errorText(e); }
  });

  // ---- Tasks ----
  server.tool(
    'p3fo_list_tasks',
    {
      params: z.object({
        userId: stringOrUndefined,
        limit: z.number().int().min(1).optional(),
        offset: z.number().int().min(0).optional(),
        excludeStatuses: stringListSchema,
        triageStatuses: stringListSchema,
        includeSubtasks: z.boolean().optional(),
        /** Include Archived tasks. Default false keeps the working list focused. */
        includeArchived: z.boolean().optional(),
        /** Case-insensitive substring match on title. */
        search: stringOrUndefined,
        /** Sugar: restrict to actionable triage statuses (WIP, Ready, Blocked). */
        active: z.boolean().optional(),
        /** Compact projection to save context. Default: id,title,triageStatus,priority,updatedAt. */
        fields: stringListSchema,
        /** Set false to return full task objects (includes comment blobs). */
        compact: z.boolean().optional(),
        /** Local-only filters. They switch the tool to a fetch-all + filter path. */
        priorityIsNull: z.boolean().optional(),
        priorityIsZero: z.boolean().optional(),
        hasParent: z.boolean().optional(),
        updatedSince: z.union([z.string(), z.number()]).optional(),
        /** Board ordering. "board" is an alias for the TaskBoard comparator. Default: "plan" (storyboard order). */
        sort: z.enum(['default', 'board', 'plan', 'taskboard', 'kanban', 'priority']).optional(),
        /** Field preset. "supportOps" includes category/urgent/impact/parent/user/reference. */
        preset: z.enum(['default', 'supportOps']).optional(),
        /** Opaque pagination cursor returned as nextCursor. */
        cursor: z.string().optional(),
        /** Add a derived plain-text comment field without changing the stored comment. */
        includeCommentText: z.boolean().optional(),
      }).optional(),
    },
    async (args) => {
      const p = args.params ?? {};
      const compact = p.compact ?? true;
      const includeSubtasks = p.includeSubtasks ?? false;
      const effectiveIncludeSubtasks = p.hasParent === true ? true : includeSubtasks;
      const includeArchived = p.includeArchived ?? false;
      const includeCommentText = p.includeCommentText ?? false;
      const preset = p.preset ?? 'default';
      const fields = toList(p.fields) ?? (preset === 'supportOps' ? SUPPORT_OPS_FIELDS : DEFAULT_FIELDS);
      const sort = (p.sort ?? 'plan') as SortMode;

      const needsLocalScan =
        p.priorityIsNull !== undefined ||
        p.priorityIsZero !== undefined ||
        p.hasParent !== undefined ||
        p.updatedSince !== undefined ||
        sort !== 'default';

      const requestedStatuses = toList(p.triageStatuses);
      const requestedExcluded = toList(p.excludeStatuses) ?? [];
      // Archived is expressible server-side, so keep the paginated path when
      // it is the only filter. An explicit "Archived" status still wins.
      const excludedStatuses =
        includeArchived === false && !requestedStatuses?.includes('Archived')
          ? [...new Set([...requestedExcluded, 'Archived'])]
          : requestedExcluded;

      try {
        if (!needsLocalScan) {
          // A cursor produced by this branch is a plain server offset. Continue
          // it through the paginated endpoint instead of re-scanning locally.
          const offset = p.cursor ? parseCursor(p.cursor) : p.offset;
          const result = (await client.getTasks({
            userId: p.userId,
            limit: p.limit,
            offset,
            excludeStatuses: excludedStatuses.length > 0 ? excludedStatuses : undefined,
            triageStatuses: requestedStatuses,
            includeSubtasks,
            search: p.search,
            active: p.active,
          })) as { data: Record<string, unknown>[]; total: number };

          if (!compact) {
            const data = includeCommentText
              ? result.data.map((task) => ({
                  ...task,
                  commentText: renderCommentText((task as Record<string, unknown>).comment),
                }))
              : result.data;
            const nextOffset = (offset ?? 0) + result.data.length;
            const hasMore = p.limit !== undefined && result.data.length > 0 && nextOffset < result.total;
            return asText({
              data,
              total: result.total,
              hasMore,
              nextCursor: hasMore ? makeCursor(nextOffset) : undefined,
            });
          }

          const data = result.data.map((task) =>
            projectTask(task, fields, includeCommentText),
          );
          const nextOffset = (offset ?? 0) + result.data.length;
          const hasMore = p.limit !== undefined && result.data.length > 0 && nextOffset < result.total;
          return asText({
            data,
            total: result.total,
            hasMore,
            nextCursor: hasMore ? makeCursor(nextOffset) : undefined,
          });
        }

        const fetched = await fetchAllTasks(client, {
          userId: p.userId,
          statuses: p.triageStatuses,
          excludeStatuses: p.excludeStatuses,
          includeArchived,
          includeSubtasks: effectiveIncludeSubtasks,
          search: p.search,
          active: p.active,
        });

        let data = filterTasks(fetched.data, {
          userId: p.userId,
          statuses: p.triageStatuses,
          excludeStatuses: p.excludeStatuses,
          includeArchived,
          includeSubtasks: effectiveIncludeSubtasks,
          hasParent: p.hasParent,
          priorityIsNull: p.priorityIsNull,
          priorityIsZero: p.priorityIsZero,
          updatedSince: p.updatedSince,
          search: p.search,
          active: p.active,
        });

        data = sortTasksByMode(data, sort);

        const total = data.length;
        const offset = p.cursor ? parseCursor(p.cursor) : Math.max(0, Math.trunc(p.offset ?? 0));
        const limit = p.limit ?? total;
        const page = data.slice(offset, offset + limit);
        const hasMore = page.length > 0 && offset + page.length < total;
        const projected = compact
          ? page.map((task) => projectTask(task, fields, includeCommentText))
          : includeCommentText
            ? page.map((task) => ({
                ...task,
                commentText: renderCommentText(task.comment),
              }))
            : page;

        return asText({
          data: projected,
          total,
          hasMore,
          nextCursor: hasMore ? makeCursor(offset + page.length) : undefined,
        });
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_find_tasks',
    {
      params: z.object({
        query: z.string(),
        userId: stringOrUndefined,
        statuses: stringListSchema,
        /** Search archived tasks too. Default true. */
        includeArchived: z.boolean().optional(),
        /** Search subtasks too. Default true. */
        includeSubtasks: z.boolean().optional(),
        limit: z.number().optional(),
        minScore: z.number().min(0).max(1).optional(),
        /** fuzzy = near matches for all queries (default); exact = exact reference/id/title only. */
        mode: z.enum(['exact', 'fuzzy']).optional(),
        includeCommentText: z.boolean().optional(),
      }),
    },
    async (args) => {
      const p = args.params;
      const query = p.query.trim();
      if (!query) return validationText(['query must not be empty']);

      try {
        const fetched = await fetchAllTasks(client, {
          userId: p.userId,
          statuses: p.statuses,
          includeArchived: p.includeArchived ?? true,
          includeSubtasks: p.includeSubtasks ?? true,
        });

        const { scored, matched, referenceQuery, mode } = rankTasks(fetched.data, query, {
          minScore: p.minScore,
          limit: p.limit,
          mode: p.mode,
        });

        const data = scored.map(({ task, score, matchedBy, referenceNumber }) => {
          const row: Record<string, unknown> = {
            id: task.id,
            title: task.title ?? '',
            triageStatus: task.triageStatus ?? null,
            priority: task.priority ?? null,
            category: task.category ?? null,
            userId: task.userId ?? null,
            parentId: task.parentId ?? null,
            referenceNumber,
            score: Number(score.toFixed(4)),
            matchedBy,
            updatedAt: task.updatedAt ?? task.createdAt ?? null,
          };
          if (p.includeCommentText) row.commentText = renderCommentText(task.comment);
          return row;
        });

        return asText({
          query,
          mode,
          referenceQuery,
          scanned: fetched.data.length,
          matched,
          returned: data.length,
          data,
        });
      } catch (e) { return errorText(e); }
    },
  );

  const auditParams = z.object({
    userId: stringOrUndefined,
    statuses: stringListSchema,
    includeArchived: z.boolean().optional(),
    includeSubtasks: z.boolean().optional(),
    category: stringOrUndefined,
    hasParent: z.boolean().optional(),
    updatedSince: z.union([z.string(), z.number()]).optional(),
    staleDays: z.number().optional(),
    includeTerminal: z.boolean().optional(),
  });

  server.tool(
    'p3fo_task_stats',
    { params: auditParams },
    async (args) => {
      const p = args.params;
      const includeSubtasks = p.hasParent === true ? true : (p.includeSubtasks ?? true);
      try {
        const fetched = await fetchAllTasks(client, {
          userId: p.userId,
          statuses: p.statuses,
          includeArchived: p.includeArchived ?? false,
          includeSubtasks,
        }, { fresh: true });
        const tasks = filterTasks(fetched.data, {
          userId: p.userId,
          statuses: p.statuses,
          includeArchived: p.includeArchived ?? false,
          includeSubtasks,
          category: p.category,
          hasParent: p.hasParent,
          updatedSince: p.updatedSince,
        });
        return asText(buildTaskStats(tasks, {
          includeTerminal: p.includeTerminal,
          staleDays: p.staleDays,
        }));
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_audit_priorities',
    { params: auditParams.extend({ limitPerSection: z.number().optional() }) },
    async (args) => {
      const p = args.params;
      const includeSubtasks = p.hasParent === true ? true : (p.includeSubtasks ?? true);
      try {
        // Fetch the full snapshot so orphan detection can see parents outside
        // the current user/status/archive filters; audit filters apply below.
        const fetched = await fetchAllTasks(client, {
          includeArchived: true,
          includeSubtasks: true,
        }, { fresh: true });
        const tasks = filterTasks(fetched.data, {
          userId: p.userId,
          statuses: p.statuses,
          includeArchived: p.includeArchived ?? false,
          includeSubtasks,
          category: p.category,
          hasParent: p.hasParent,
          updatedSince: p.updatedSince,
        });
        return asText(buildPriorityAudit(tasks, {
          includeTerminal: p.includeTerminal,
          staleDays: p.staleDays,
          limitPerSection: p.limitPerSection,
          knownTaskIds: fetched.data.map((task) => task.id),
        }));
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_task',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try {
        const task = (await client.getTaskById(args.params.id)) as Record<string, unknown> | null;
        if (!task) return asText(task);
        return asText({ ...task, commentText: renderCommentText((task as Record<string, unknown>).comment) });
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_task_by_title',
    {
      params: z.object({
        title: z.string().describe('Exact (case-insensitive) or substring title to look up'),
        exact: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        const result = (await client.getTasks({ search: args.params.title, limit: args.params.exact ? 200 : 20 })) as { data: { title?: string }[]; total: number };
        let data = result.data;
        if (args.params.exact) {
          const wanted = args.params.title.trim().toLowerCase();
          data = data.filter((t) => (t.title ?? '').trim().toLowerCase() === wanted);
        }
        return asText({ data, total: data.length });
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_task',
    { params: z.object({ task: taskSchema }) },
    async (args) => {
      try {
        const recurrenceError = validateRecurrenceAnchor(
          args.params.task.plannedDate,
          args.params.task.recurrence,
        );
        if (recurrenceError) return validationText([recurrenceError]);

        const result = await client.createTask(args.params.task);
        clearTaskCache();
        return asText(result);
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_task',
    { params: z.object({ id: z.string(), patch: taskSchema.partial() }) },
    async (args) => {
      try {
        const { id, patch } = args.params;

        // A recurrence patch may rely on the stored plannedDate (and vice
        // versa), so merge with the current task before validating the rule.
        if (patch.recurrence !== undefined || patch.plannedDate !== undefined) {
          let existing: TaskRecord | null = null;
          if (patch.recurrence === undefined || patch.plannedDate === undefined) {
            existing = await client.getTaskById(id) as TaskRecord | null;
          }

          // If one side is a patch and the other must come from storage, only
          // validate when the task (and therefore the merged value) exists.
          if (existing || (patch.recurrence !== undefined && patch.plannedDate !== undefined)) {
            // Mirror the planner: moving/clearing a series' anchor adjusts (or
            // clears) the stored rule instead of rejecting a valid reschedule.
            if (patch.plannedDate !== undefined && patch.recurrence === undefined && existing) {
              patch.recurrence = adjustRecurrenceForAnchorMove(
                existing.recurrence ?? null,
                existing.plannedDate ?? null,
                patch.plannedDate ?? null,
              ) as typeof patch.recurrence;
            }

            const recurrenceError = validateRecurrenceAnchor(
              patch.plannedDate !== undefined ? patch.plannedDate : existing?.plannedDate ?? null,
              patch.recurrence !== undefined ? patch.recurrence : existing?.recurrence ?? null,
            );
            if (recurrenceError) return validationText([recurrenceError]);
          }
        }

        const result = await client.updateTask(id, patch);
        clearTaskCache();
        return asText(result);
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_task',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try {
        const result = await client.deleteTask(args.params.id);
        clearTaskCache();
        return asText(result);
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_bulk_update_priorities',
    { params: z.object({ items: z.array(z.object({ id: z.string(), priority: z.number().optional() })) }) },
    async (args) => {
      const items = args.params.items.map((i) => ({ id: i.id, priority: i.priority }));
      try {
        const result = await client.bulkUpdateTaskPriorities(items);
        clearTaskCache();
        return asText(result);
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_bulk_update_tasks',
    {
      params: z.object({
        items: z.array(z.object({
          id: z.string(),
          patch: z.object({
            priority: z.number().nullable().optional(),
            triageStatus: z.enum(ALLOWED_TRIAGE_STATUSES).optional(),
            category: z.string().optional(),
            urgent: z.boolean().optional(),
            impact: z.boolean().optional(),
          }).strict(),
        })),
        dryRun: z.boolean().optional(),
        stopOnError: z.boolean().optional(),
      }),
    },
    async (args) => {
      if (args.params.items.length === 0) {
        return validationText(['items must not be empty']);
      }
      const ids = args.params.items.map((item) => item.id);
      const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
      if (duplicateIds.length > 0) {
        return validationText([`items contains duplicate ids: ${duplicateIds.join(', ')}`]);
      }
      try {
        const existing = await fetchTasksByIds(client, ids);
        const result = await applyBulkUpdates(
          client,
          existing,
          args.params.items as BulkItem[],
          {
            dryRun: args.params.dryRun ?? true,
            stopOnError: args.params.stopOnError ?? true,
          },
        );
        clearTaskCache();
        return asText(result);
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_import_tasks',
    {
      params: z.object({
        tasks: z.array(importTaskSchema),
        /** Import valid rows and report rejected rows instead of all-or-nothing. */
        skipInvalid: z.boolean().optional(),
      }),
    },
    async (args) => {
      const inputs = args.params.tasks as unknown as ImportTaskInput[];
      const skipInvalid = args.params.skipInvalid ?? false;

      try {
        // Fetch both the imported ids and any parent target they reference, so
        // a new task or a reparented task can point at an existing parent that
        // is not part of the batch.
        const lookupIds = inputs
          .flatMap((input) => [input.id, input.parentId])
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
        const existing = await fetchTasksByIds(client, lookupIds, {
          followParents: true,
        });
        const prepared = prepareTaskImport(inputs, existing);

        if (prepared.errors.length > 0 && !skipInvalid) {
          return validationText(prepared.errors, prepared.warnings);
        }

        if (prepared.normalized.length === 0) {
          return validationText(
            prepared.errors.length > 0 ? prepared.errors : ['no valid tasks to import'],
            prepared.warnings,
          );
        }

        await client.importTasks(prepared.normalized);
        clearTaskCache();

        return asText({
          ok: true,
          imported: prepared.normalized.length,
          created: prepared.created,
          updated: prepared.updated,
          rejected: prepared.rejected,
          ids: prepared.normalized.map((task) => task.id),
          warnings: prepared.warnings,
          errors: prepared.errors,
        });
      } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_tasks', {}, async () => {
    try {
      const result = await client.clearAllTasks();
      clearTaskCache();
      return asText(result);
    } catch (e) { return errorText(e); }
  });

  // ---- Users & user settings ----
  server.tool(
    'p3fo_list_users',
    {
      params: z.object({
        /** Project only userId, username, and trigram. */
        compact: z.boolean().optional(),
        fields: stringListSchema,
      }).optional(),
    },
    async (args) => {
      try {
        const users = (await client.listUsers()) as Record<string, unknown>[];
        const p = args?.params ?? {};
        if (p.compact) {
          return asText(users.map((user) => ({
            userId: user.userId,
            username: user.username,
            trigram: user.trigram,
          })));
        }
        const fields = toList(p.fields);
        if (fields && fields.length > 0) {
          return asText(users.map((user) => projectTask(user, fields, false)));
        }
        return asText(users);
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_user_settings',
    { params: z.object({ userId: z.string() }) },
    async (args) => {
      try { return asText(await client.getUserSettings(args.params.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_user_settings',
    { params: z.object({ userId: z.string(), patch: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateUserSettings(args.params.userId, args.params.patch ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_migrate_user',
    { params: z.object({ oldUserId: z.string(), newUserId: z.string() }) },
    async (args) => {
      try {
        const result = await client.migrateUser(args.params.oldUserId, args.params.newUserId);
        clearTaskCache();
        return asText(result);
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_user',
    { params: z.object({ userId: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteUser(args.params.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_users', {}, async () => {
    try { return asText(await client.clearAllUsers()); } catch (e) { return errorText(e); }
  });

  // ---- App settings ----
  server.tool('p3fo_get_app_settings', {}, async () => {
    try { return asText(await client.getAppSettings()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_update_app_settings',
    { params: z.object({ patch: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateAppSettings(args.params.patch ?? {})); } catch (e) { return errorText(e); }
    },
  );

  // ---- QoL survey ----
  server.tool('p3fo_list_qol_responses', {}, async () => {
    try { return asText(await client.getAllQolSurveyResponses()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_get_qol_response',
    { params: z.object({ userId: z.string() }) },
    async (args) => {
      try { return asText(await client.getQolSurveyResponse(args.params.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_save_qol_response',
    { params: z.object({ userId: z.string(), data: recordSchema }) },
    async (args) => {
      try { return asText(await client.saveQolSurveyResponse(args.params.userId, args.params.data ?? {})); } catch (e) { return errorText(e); }
    },
  );

  // ---- Filters ----
  server.tool('p3fo_get_filters', {}, async () => {
    try { return asText(await client.getFilters()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_save_filters',
    { params: z.object({ data: recordSchema }) },
    async (args) => {
      try { return asText(await client.saveFilters(args.params.data ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_filters', {}, async () => {
    try { return asText(await client.clearFilters()); } catch (e) { return errorText(e); }
  });

  // ---- Fertilization Board ----
  server.tool('p3fo_get_fertilization_board', {}, async () => {
    try { return asText(await client.getFertilizationBoardState()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_update_fertilization_board',
    { params: z.object({ state: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateFertilizationBoardState(args.params.state ?? {})); } catch (e) { return errorText(e); }
    },
  );

  // ---- Dream Board ----
  server.tool('p3fo_get_dream_board', {}, async () => {
    try { return asText(await client.getDreamBoardState()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_update_dream_board',
    { params: z.object({ state: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateDreamBoardState(args.params.state ?? {})); } catch (e) { return errorText(e); }
    },
  );

  // ---- Sprint ceremony ----
  server.tool('p3fo_get_sprint_state', {}, async () => {
    try { return asText(await client.getSprintState()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_update_sprint_state',
    { params: z.object({ state: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateSprintState(args.params.state ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_close_sprint',
    { params: z.object({ sprintId: z.string(), outcomes: recordSchema.optional() }) },
    async (args) => {
      try {
        const result = await client.closeSprint(args.params.sprintId, (args.params.outcomes ?? {}) as Record<string, string>);
        clearTaskCache();
        return asText(result);
      } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_start_sprint',
    { params: z.object({ sprintId: z.string(), taskIds: z.array(z.string()).optional() }) },
    async (args) => {
      try {
        const result = await client.startSprint(args.params.sprintId, args.params.taskIds);
        clearTaskCache();
        return asText(result);
      } catch (e) { return errorText(e); }
    },
  );

  // ---- Circles ----
  server.tool('p3fo_list_circles', {}, async () => {
    try { return asText(await client.listCircles()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_get_circle',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.getCircleById(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_circle',
    { params: z.object({ circle: circleSchema }) },
    async (args) => {
      try { return asText(await client.createCircle(args.params.circle)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_circle',
    { params: z.object({ id: z.string(), patch: circleSchema.partial() }) },
    async (args) => {
      try { return asText(await client.updateCircle(args.params.id, args.params.patch)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_circle',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteCircle(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_circles', {}, async () => {
    try { return asText(await client.clearAllCircles()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_import_circles',
    { params: z.object({ circles: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importCircles(args.params.circles)); } catch (e) { return errorText(e); }
    },
  );

  // ---- Frameworks ----
  server.tool(
    'p3fo_list_frameworks',
    { params: z.object({ frameworkType: stringOrUndefined }).optional() },
    async (args) => {
      try { return asText(await client.listFrameworks(args?.params?.frameworkType)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_framework',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.getFrameworkById(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_framework',
    { params: z.object({ framework: frameworkSchema }) },
    async (args) => {
      try { return asText(await client.createFramework(args.params.framework)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_framework',
    { params: z.object({ id: z.string(), patch: frameworkSchema.partial() }) },
    async (args) => {
      try { return asText(await client.updateFramework(args.params.id, args.params.patch)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_framework',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteFramework(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_import_frameworks',
    { params: z.object({ frameworks: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importFrameworks(args.params.frameworks)); } catch (e) { return errorText(e); }
    },
  );

  // ---- Votes ----
  server.tool(
    'p3fo_list_votes',
    {
      params: z.object({
        linkedTaskId: stringOrUndefined,
        ownerId: stringOrUndefined,
        kind: stringOrUndefined,
      }).optional(),
    },
    async (args) => {
      try { return asText(await client.listVotes(args?.params ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_vote',
    { params: z.object({ idOrSlug: z.string() }) },
    async (args) => {
      try { return asText(await client.getVoteByIdOrSlug(args.params.idOrSlug)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_vote',
    { params: z.object({ vote: voteSchema }) },
    async (args) => {
      try { return asText(await client.createVote(args.params.vote)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_vote',
    { params: z.object({ id: z.string(), patch: voteSchema.partial() }) },
    async (args) => {
      try { return asText(await client.updateVote(args.params.id, args.params.patch)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_finalize_vote',
    { params: z.object({ id: z.string(), outcome: recordSchema }) },
    async (args) => {
      try { return asText(await client.finalizeVote(args.params.id, args.params.outcome ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_vote',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteVote(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_reset_vote',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.resetVote(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_vote_results',
    { params: z.object({ idOrSlug: z.string() }) },
    async (args) => {
      try { return asText(await client.getVoteResults(args.params.idOrSlug)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_submit_vote_response',
    { params: z.object({ idOrSlug: z.string(), response: recordSchema }) },
    async (args) => {
      try { return asText(await client.createVoteResponse(args.params.idOrSlug, args.params.response ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_withdraw_vote_response',
    { params: z.object({ idOrSlug: z.string(), voterToken: z.string(), proposalId: stringOrUndefined, loopId: stringOrUndefined }) },
    async (args) => {
      try { return asText(await client.deleteVoteResponse(args.params.idOrSlug, args.params.voterToken, args.params.proposalId, args.params.loopId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_list_vote_loops',
    { params: z.object({ voteId: z.string() }) },
    async (args) => {
      try { return asText(await client.listVoteLoops(args.params.voteId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_vote_loop',
    { params: z.object({ voteId: z.string(), loop: recordSchema }) },
    async (args) => {
      try { return asText(await client.createVoteLoop(args.params.voteId, args.params.loop ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_close_vote_loop',
    { params: z.object({ loopId: z.string() }) },
    async (args) => {
      try { return asText(await client.closeVoteLoop(args.params.loopId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_vote_loop',
    { params: z.object({ loopId: z.string(), patch: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateVoteLoop(args.params.loopId, args.params.patch ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_list_vote_moderators',
    { params: z.object({ voteId: z.string() }) },
    async (args) => {
      try { return asText(await client.listVoteModerators(args.params.voteId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_add_vote_moderator',
    { params: z.object({ voteId: z.string(), input: recordSchema }) },
    async (args) => {
      try { return asText(await client.addVoteModerator(args.params.voteId, args.params.input ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_revoke_vote_moderator',
    { params: z.object({ voteId: z.string(), moderatorId: z.string() }) },
    async (args) => {
      try { return asText(await client.revokeVoteModerator(args.params.voteId, args.params.moderatorId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_resolve_vote_moderator_token',
    { params: z.object({ token: z.string() }) },
    async (args) => {
      try { return asText(await client.resolveVoteModeratorToken(args.params.token)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_import_votes',
    { params: z.object({ items: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importVotes(args.params.items)); } catch (e) { return errorText(e); }
    },
  );

  // ---- Reminders ----
  server.tool(
    'p3fo_list_reminders',
    { params: z.object({ userId: stringOrUndefined }).optional() },
    async (args) => {
      try { return asText(await client.listReminders(args?.params?.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_reminder',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.getReminderById(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_reminder',
    { params: z.object({ reminder: reminderSchema }) },
    async (args) => {
      try { return asText(await client.createReminder(args.params.reminder)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_reminder',
    { params: z.object({ id: z.string(), patch: reminderSchema.partial() }) },
    async (args) => {
      try { return asText(await client.updateReminder(args.params.id, args.params.patch)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_reminder',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteReminder(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_reminders_by_task',
    { params: z.object({ taskId: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteRemindersByTaskId(args.params.taskId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_reminders', {}, async () => {
    try { return asText(await client.clearAllReminders()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_import_reminders',
    { params: z.object({ reminders: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importReminders(args.params.reminders)); } catch (e) { return errorText(e); }
    },
  );

  // ---- Pomodoro sessions ----
  server.tool(
    'p3fo_list_pomodoro_sessions',
    {
      params: z.object({
        userId: stringOrUndefined,
        since: z.number().optional(),
      }).optional(),
    },
    async (args) => {
      try { return asText(await client.listPomodoroSessions(args?.params?.userId, args?.params?.since)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_pomodoro_session',
    { params: z.object({ session: pomodoroSchema }) },
    async (args) => {
      try { return asText(await client.createPomodoroSession(args.params.session)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_pomodoro_session',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deletePomodoroSession(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_pomodoro_sessions', {}, async () => {
    try { return asText(await client.clearAllPomodoroSessions()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_delete_pomodoro_sessions_by_user',
    { params: z.object({ userId: z.string() }) },
    async (args) => {
      try { return asText(await client.deletePomodoroSessionsByUser(args.params.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_import_pomodoro_sessions',
    { params: z.object({ sessions: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importPomodoroSessions(args.params.sessions)); } catch (e) { return errorText(e); }
    },
  );
}