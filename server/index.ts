import './telemetry.js';
import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import cors from 'cors';
import crypto from 'node:crypto';
import { createDbClient } from './db/index.js';
import { DbClient } from './db/index.js';
import { VoteKind, VoteLoop, VoteModerator, VoteResponseEntity, VoteRankingSubmission, PomodoroSession } from '../src/lib/persistence-types.js';
import type { TaskEntity, VoteRankingBallot, VoteEntity, VoteRankingResult } from '../src/lib/persistence-types.js';
import type { SprintStateEntity } from '../src/lib/sprint-types.js';
import { isVoteAnonymous, redactRankingSubmissionForBackup } from '../src/lib/vote-ranking.js';
import {
  WHO5_QUESTIONS,
  applyClose,
  buildScopeSnapshot,
  buildWellbeingAggregate,
  createEmptySprintState,
  isTerminalTask,
  previousClosedTargetPoints,
  startSprint,
} from '../src/lib/sprint-types.js';
import { startSprintScheduler, toSprintTasks } from './sprint-scheduler.js';
import { withSprintStateLock } from './sprint-state-lock.js';
import { z } from 'zod';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { setupWSConnection, getYDoc } from 'y-websocket/bin/utils';
import * as Y from 'yjs';

import {
  activeProposalIds,
  areRankingResultsVisible,
  buildVoteRankingResult,
  computeBallotCoverage,
  DEFAULT_RANKING_ENGINE,
  deriveBallotParticipationFromStats,
  MAX_RANKED_ITEMS,
  resolveFinalizedWinner,
  voteAllowsTies,
} from '../src/lib/vote-ranking.js';

const YJS_ROOM = 'p3fo-room';

function entityToClientTask(entity: TaskEntity): Record<string, unknown> {
  const toMillis = (value: unknown): number | undefined => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };
  const blockedSince = (entity as TaskEntity & { blockedSince?: string | null }).blockedSince;
  const terminationDate = toMillis(entity.terminationDate);
  const triageStatus = entity.triageStatus;
  return {
    ...entity,
    createdAt: toMillis(entity.createdAt) ?? Date.now(),
    updatedAt: toMillis(entity.updatedAt) ?? Date.now(),
    terminationDate,
    // Legacy rows stored the deadline for active tasks and the completion time
    // for Done tasks in terminationDate only; mirror convertEntitiesToTasks so
    // a live Yjs broadcast does not clear the derived value.
    dueDate: toMillis(entity.dueDate)
      ?? (triageStatus !== 'Done' ? terminationDate : undefined),
    completedAt: toMillis(entity.completedAt)
      ?? (triageStatus === 'Done' ? terminationDate : undefined),
    deletedAt: toMillis(entity.deletedAt),
    blockedSince: toMillis(blockedSince),
    children: [],
  };
}

// Push a task update into the Yjs doc so connected clients receive it
// in real-time via WebSocket, without needing to reload the browser.
function broadcastTaskToYjs(task: unknown) {
  try {
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    const yTasks = doc.getMap('tasks');
    // Persistence entities store timestamps as ISO strings, while the client
    // Task shape uses epoch milliseconds. Broadcasting the raw entity made
    // consumers crash (e.g. TimePickerDialog) and could drop live updates.
    const clientTask = entityToClientTask(task as TaskEntity);
    yTasks.set(clientTask.id as string, clientTask);
  } catch {
    // Yjs doc may not exist yet (no connected clients) — safe to skip
  }
}

// Notify connected clients that a task was deleted.
function broadcastTaskDeletionToYjs(taskId: string) {
  try {
    const doc = getYDoc(YJS_ROOM) as Y.Doc;
    const yTasks = doc.getMap('tasks');
    yTasks.delete(taskId);
  } catch {
    // Yjs doc may not exist yet — safe to skip
  }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5172;

// Environment variables
const DB_CLIENT = process.env.P3FO_DB_CLIENT || 'sqlite'; // 'sqlite' or 'pg'
const DB_URL = process.env.P3FO_DB_URL;
const DB_SQLITE_FILE = process.env.P3FO_DB_SQLITE_FILE || './p3fo.db';

// Middleware
// Compress responses above 1 KiB. This is critical for the production SPA:
// without it the main index chunk ships ~2.8 MiB uncompressed on every cold
// load, which dominates first paint on slow links.
app.use(compression({ threshold: 1024 }));
app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'traceparent', 'tracestate', 'X-API-Key', 'Authorization', 'X-Voter-Token', 'X-Moderator-Token'],
  exposedHeaders: ['traceparent', 'tracestate'],
}));
app.use(express.json({ limit: '10mb' }));

// --- MCP API-key auth + /mcp path rewrite ---
// Routes mounted under /mcp are protected by a shared API key (P3FO_API_KEY)
// instead of the OIDC cookie auth handled by oauth2-proxy for /api routes.
// When P3FO_API_KEY is unset the middleware is a no-op (local dev).
const P3FO_API_KEY = process.env.P3FO_API_KEY;
const MCP_PREFIX = '/mcp';

app.use((req, res, next) => {
  if (!req.path.startsWith(MCP_PREFIX + '/')) return next();

  if (P3FO_API_KEY) {
    const provided =
      req.get('X-API-Key') ||
      (req.get('Authorization')?.startsWith('Bearer ')
        ? req.get('Authorization')!.slice(7)
        : undefined);
    const providedBuf = Buffer.from(provided ?? '');
    const expectedBuf = Buffer.from(P3FO_API_KEY);
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
    }
  }

  // Strip the /mcp prefix so existing /api routes match.
  req.url = req.url.replace(MCP_PREFIX, '');
  next();
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Serve static files from the dist directory
  // __dirname is dist/server/server
  const staticPath = path.resolve(__dirname, '../../');
  console.log(`Serving static files from: ${staticPath}`);

  const baseUrl = process.env.VITE_BASE_URL || '/';
  console.log(`Mounting static files at: ${baseUrl}`);

  const assetsDir = `${path.sep}assets${path.sep}`;
  // Vite content-hashed filenames look like `index-Cc2a6xB8.js` or
  // `calendar-vendor-DEpV2Nr3.css`. Only those may be immutable: the hash is
  // the cache key, so a new build produces a new URL and the old entry is
  // simply never requested again. Anything else under /assets falls back to
  // ETag revalidation so it cannot go stale for a year.
  const hashedAsset = /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
  app.use(baseUrl, express.static(staticPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (!filePath.includes(assetsDir)) return;
      if (hashedAsset.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    },
  }));
}

// Initialize database client
let db: DbClient;

async function initializeDb() {
  console.log(`Initializing database: ${DB_CLIENT}`);
  db = await createDbClient(DB_CLIENT, DB_URL, DB_SQLITE_FILE);
  await db.initialize();
  console.log('Database initialized successfully');
}

// API Routes
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    // Test database connection
    await db.testConnection();
    res.json({
      ok: true,
      mode: DB_CLIENT,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      ok: false,
      error: 'Database connection failed',
      mode: DB_CLIENT
    });
  }
});

// Tasks routes
app.get('/api/tasks', async (req: Request, res: Response) => {
  try {
    const userId = req.query.user_id as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const rawExcludeStatuses = req.query.exclude_statuses;
    const excludeStatuses: string[] | undefined = rawExcludeStatuses
      ? (Array.isArray(rawExcludeStatuses)
          ? (rawExcludeStatuses as string[])
          : (rawExcludeStatuses as string).split(','))
      : undefined;

    const rawTriageStatuses = req.query.triage_statuses;
    const triageStatuses: string[] | undefined = rawTriageStatuses
      ? (Array.isArray(rawTriageStatuses)
          ? (rawTriageStatuses as string[])
          : (rawTriageStatuses as string).split(','))
      : undefined;

    // include_subtasks defaults to true for backward-compatible REST behavior.
    const includeSubtasks = req.query.include_subtasks === undefined
      ? true
      : String(req.query.include_subtasks) === 'true' || String(req.query.include_subtasks) === '1';

    // Optional text search on title (case-insensitive contains).
    const search = typeof req.query.search === 'string' && req.query.search.trim() !== ''
      ? req.query.search.trim()
      : undefined;

    // active=true sugar: restrict to actionable triage statuses only.
    const active = String(req.query.active) === 'true' || req.query.active === '1';

    // Soft-deleted tombstones are hidden by default. The app client opts in via
    // include_deleted=true because recurrence expansion needs them to suppress
    // deleted occurrences; MCP and other consumers get the live task list.
    const includeDeleted = String(req.query.include_deleted) === 'true' || String(req.query.include_deleted) === '1';

    const pagination = (limit !== undefined || offset !== undefined)
      ? { limit, offset }
      : undefined;

    const result = await db.getTasks(userId, pagination, excludeStatuses, triageStatuses, includeSubtasks, { search, active, includeDeleted });
    res.json(result);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', async (req: Request, res: Response) => {
  try {
    const task = await db.createTask(req.body);
    broadcastTaskToYjs(task as unknown);
    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.get('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    const task = await db.getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(50).json({ error: 'Failed to fetch task' });
  }
});

app.patch('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    console.log('API: Update task request received:', {
      id: req.params.id,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    const task = await db.updateTask(req.params.id, req.body);

    if (!task) {
      console.log('API: Task not found:', req.params.id);
      return res.status(404).json({ error: 'Task not found' });
    }

    console.log('API: Task updated successfully:', task);
    broadcastTaskToYjs(task as unknown);
    res.json(task);
  } catch (error) {
    console.error('API: Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task', details: (error as Error).message });
  }
});

// POST-based alias for task updates, so MCP clients behind HTTP/1.1 proxies
// that don't forward PATCH (e.g. Caddy routing HTTP/1.1 to a uvicorn backend)
// can still update tasks via POST.
app.post('/api/tasks/:id/update', async (req: Request, res: Response) => {
  try {
    const task = await db.updateTask(req.params.id, req.body);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    broadcastTaskToYjs(task as unknown);
    res.json(task);
  } catch (error) {
    console.error('API: Error updating task (POST alias):', error);
    res.status(500).json({ error: 'Failed to update task', details: (error as Error).message });
  }
});

app.delete('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteTask(req.params.id);
    broadcastTaskDeletionToYjs(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task', details: (error as Error).message });
  }
});

// POST-based alias for task deletion (same rationale as the update alias).
app.post('/api/tasks/:id/delete', async (req: Request, res: Response) => {
  try {
    await db.deleteTask(req.params.id);
    broadcastTaskDeletionToYjs(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task (POST alias):', error);
    res.status(500).json({ error: 'Failed to delete task', details: (error as Error).message });
  }
});

app.post('/api/tasks/bulk-priorities', async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    await db.bulkUpdateTaskPriorities(items);
    res.json({ success: true });
  } catch (error) {
    console.error('Error bulk updating task priorities:', error);
    res.status(500).json({ error: 'Failed to bulk update task priorities' });
  }
});

app.post('/api/tasks/bulk-sprint-targets', async (req: Request, res: Response) => {
  try {
    const items = req.body?.items;
    const valid =
      Array.isArray(items) &&
      items.every((item: unknown) => {
        const candidate = item as { id?: unknown; sprintTarget?: unknown };
        return typeof candidate.id === 'string' && typeof candidate.sprintTarget === 'boolean';
      });
    if (!valid) {
      res.status(400).json({ error: 'items must be an array of { id, sprintTarget }' });
      return;
    }
    await db.bulkUpdateSprintTargets(items);
    for (const item of items) {
      const task = await db.getTaskById(item.id);
      if (task) broadcastTaskToYjs(task);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error bulk updating sprint targets:', error);
    res.status(500).json({ error: 'Failed to bulk update sprint targets' });
  }
});

app.post('/api/tasks/import', async (req: Request, res: Response) => {
  try {
    const tasks = req.body;
    await db.importTasks(tasks);
    res.json({ success: true });
  } catch (error) {
    console.error('Error importing tasks:', error);
    res.status(500).json({ error: 'Failed to import tasks' });
  }
});

app.post('/api/tasks/clear', async (req: Request, res: Response) => {
  try {
    await db.clearAllTasks();
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing tasks:', error);
    res.status(500).json({ error: 'Failed to clear tasks' });
  }
});

app.post('/api/tasks/init-defaults', async (req: Request, res: Response) => {
  try {
    // This endpoint will be called from the frontend if no tasks exist.
    // The actual creation of default tasks is handled by the `useTasks` hook.
    console.log('API: Initialize default tasks endpoint hit');
    res.json({ success: true, message: 'Default tasks initialization triggered' });
  } catch (error) {
    console.error('Error triggering default tasks initialization:', error);
    res.status(500).json({ error: 'Failed to trigger default tasks initialization' });
  }
});

// User settings
app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const users = await db.listUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/user-settings/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const settings = await db.getUserSettings(userId);
    if (settings) {
      res.json(settings);
    } else {
      res.status(404).json({ error: 'User settings not found' });
    }
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

app.post('/api/user-settings/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const settings = await db.updateUserSettings(userId, req.body);
    res.json(settings);
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

app.post('/api/users/migrate', async (req: Request, res: Response) => {
  try {
    const { oldUserId, newUserId } = req.body;
    if (!oldUserId || !newUserId) {
      return res.status(400).json({ error: 'Missing oldUserId or newUserId' });
    }
    await db.migrateUser(oldUserId, newUserId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error migrating user:', error);
    res.status(500).json({ error: 'Failed to migrate user' });
  }
});

app.delete('/api/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await db.deleteUser(userId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.post('/api/users/clear', async (req: Request, res: Response) => {
  try {
    if (db.clearAllUsers) {
      await db.clearAllUsers();
      res.json({ success: true });
    } else {
      res.status(501).json({ error: 'Not implemented' });
    }
  } catch (error) {
    console.error('Error clearing users:', error);
    res.status(500).json({ error: 'Failed to clear users' });
  }
});

app.post('/api/admin/clear-all-data', async (req: Request, res: Response) => {
  try {
    if (db.clearAllData) {
      await db.clearAllData();
      res.json({ success: true });
    } else {
      res.status(501).json({ error: 'Not implemented' });
    }
  } catch (error) {
    console.error('Error clearing all data:', error);
    res.status(500).json({ error: 'Failed to clear all data' });
  }
});

// App settings routes
app.get('/api/settings', async (req: Request, res: Response) => {
  try {
    const settings = await db.getAppSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching app settings:', error);
    res.status(500).json({ error: 'Failed to fetch app settings' });
  }
});

app.patch('/api/settings', async (req: Request, res: Response) => {
  try {
    const settings = await db.updateAppSettings(req.body);
    res.json(settings);
  } catch (error) {
    console.error('Error updating app settings:', error);
    res.status(500).json({ error: 'Failed to update app settings' });
  }
});

// QoL survey routes
app.get('/api/qol/all', async (req: Request, res: Response) => {
  try {
    if (db.getAllQolSurveyResponses) {
      const responses = await db.getAllQolSurveyResponses();
      res.json(responses);
    } else {
      res.status(501).json({ error: 'Not implemented' });
    }
  } catch (error) {
    console.error('Error fetching all QoL survey responses:', error);
    res.status(500).json({ error: 'Failed to fetch all QoL survey responses' });
  }
});

app.get('/api/qol/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const response = await db.getQolSurveyResponse(userId);
    res.json(response);
  } catch (error) {
    console.error('Error fetching QoL survey response:', error);
    res.status(500).json({ error: 'Failed to fetch QoL survey response' });
  }
});

app.put('/api/qol/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await db.saveQolSurveyResponse(userId, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving QoL survey response:', error);
    res.status(500).json({ error: 'Failed to save QoL survey response' });
  }
});

// Filters routes
app.get('/api/filters', async (req: Request, res: Response) => {
  try {
    const filters = await db.getFilters();
    res.json(filters);
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

app.put('/api/filters', async (req: Request, res: Response) => {
  try {
    await db.saveFilters(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving filters:', error);
    res.status(500).json({ error: 'Failed to save filters' });
  }
});

app.delete('/api/filters', async (req: Request, res: Response) => {
  try {
    await db.clearFilters();
    res.status(204).send();
  } catch (error) {
    console.error('Error clearing filters:', error);
    res.status(500).json({ error: 'Failed to clear filters' });
  }
});

// Fertilization Board routes
app.get('/api/fertilization-board', async (req: Request, res: Response) => {
  try {
    const state = await db.getFertilizationBoardState();
    res.json(state);
  } catch (error: unknown) {
    console.error('Error fetching fertilization board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch fertilization board state', details: message });
  }
});

app.put('/api/fertilization-board', async (req: Request, res: Response) => {
  try {
    await db.updateFertilizationBoardState(req.body);
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating fertilization board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update fertilization board state', details: message });
  }
});

// Dream Board routes
app.get('/api/dream-board', async (req: Request, res: Response) => {
  try {
    const state = await db.getDreamBoardState();
    res.json(state);
  } catch (error: unknown) {
    console.error('Error fetching dream board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch dream board state', details: message });
  }
});

app.put('/api/dream-board', async (req: Request, res: Response) => {
  try {
    await db.updateDreamBoardState(req.body);
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating dream board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update dream board state', details: message });
  }
});

// Salary Board routes
app.get('/api/salary-board', async (req: Request, res: Response) => {
  try {
    const state = await db.getSalaryBoardState();
    res.json(state);
  } catch (error: unknown) {
    console.error('Error fetching salary board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch salary board state', details: message });
  }
});

app.put('/api/salary-board', async (req: Request, res: Response) => {
  try {
    await db.updateSalaryBoardState(req.body);
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating salary board state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update salary board state', details: message });
  }
});

// Sprint ceremony routes
app.get('/api/sprint-state', async (_req: Request, res: Response) => {
  try {
    const state = await db.getSprintState();
    res.json(state);
  } catch (error: unknown) {
    console.error('Error fetching sprint state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch sprint state', details: message });
  }
});

const sprintStateBodySchema = z
  .object({
    activeSprintId: z.string().nullable(),
    draftSprintId: z.string().nullable(),
    sprints: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          goal: z.string(),
          status: z.enum(['draft', 'active', 'closed']),
          scope: z.array(z.unknown()),
          startDate: z.string(),
          endDate: z.string(),
          capacity: z
            .object({
              theoreticalPoints: z.number(),
              practicePct: z.number(),
              eftCount: z.number(),
              workingDays: z.number(),
              impediments: z.array(z.unknown()),
            })
            .passthrough(),
          metrics: z
            .object({
              committedPoints: z.number(),
              scopeDonePoints: z.number(),
              openPoints: z.number(),
              carriedPoints: z.number(),
              unplannedDonePoints: z.number(),
              achievedPoints: z.number(),
              lastTheoreticalPoints: z.number(),
              errorPct: z.number(),
              velocity: z.number(),
              completionPct: z.number(),
              remainingToTarget: z.number(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

app.put('/api/sprint-state', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const force = body.force === true;
    const baseUpdatedAt = typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt : undefined;
    const stateBody = { ...body };
    delete stateBody.force;
    delete stateBody.baseUpdatedAt;

    const parsed = sprintStateBodySchema.safeParse(stateBody);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid sprint state', details: parsed.error.flatten() });
      return;
    }
    const incoming = parsed.data as unknown as SprintStateEntity;

    await withSprintStateLock(async () => {
      const current = await db.getSprintState();
      if (current && !force) {
        if (current.updatedAt && baseUpdatedAt !== current.updatedAt) {
          res.status(409).json({ error: 'Sprint state changed since it was loaded' });
          return;
        }

        const currentIds = new Set(current.sprints.map((sprint) => sprint.id));
        const incomingById = new Map(incoming.sprints.map((sprint) => [sprint.id, sprint]));

        // Never let a stale client erase a sprint the scheduler just created.
        const missing = current.sprints.find((sprint) => !incomingById.has(sprint.id));
        if (missing) {
          res.status(409).json({ error: `Sprint ${missing.id} is missing from the incoming state` });
          return;
        }

        for (const sprint of incoming.sprints) {
          if (!currentIds.has(sprint.id) && sprint.status !== 'draft') {
            res.status(409).json({ error: `Sprint ${sprint.id} must be created as a draft` });
            return;
          }
        }

        for (const stored of current.sprints) {
          const next = incomingById.get(stored.id);
          if (!next) continue;
          if (next.status !== stored.status) {
            res.status(409).json({
              error: `Sprint ${stored.id} status can only change through the start/close endpoints`,
            });
            return;
          }
        }

        const activeSprints = incoming.sprints.filter((sprint) => sprint.status === 'active');
        if (activeSprints.length > 1) {
          res.status(409).json({ error: 'Only one sprint can be active at a time' });
          return;
        }
        if (incoming.activeSprintId && activeSprints[0]?.id !== incoming.activeSprintId) {
          res.status(409).json({ error: 'activeSprintId must reference the active sprint' });
          return;
        }
        if (!incoming.activeSprintId && activeSprints.length > 0) {
          res.status(409).json({ error: 'An active sprint must be referenced by activeSprintId' });
          return;
        }
        if (incoming.draftSprintId) {
          const draft = incoming.sprints.find((sprint) => sprint.id === incoming.draftSprintId);
          if (!draft || draft.status !== 'draft') {
            res.status(409).json({ error: 'draftSprintId must reference a draft sprint' });
            return;
          }
        }
      }

      await db.updateSprintState(incoming);
      res.json({ success: true });
    });
  } catch (error: unknown) {
    console.error('Error updating sprint state:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update sprint state', details: message });
  }
});

app.post('/api/sprint-state/close', async (req: Request, res: Response) => {
  try {
    await withSprintStateLock(async () => {
      const state: SprintStateEntity = (await db.getSprintState()) ?? createEmptySprintState();
      const { sprintId, outcomes = {} } = req.body as {
        sprintId?: string;
        outcomes?: Record<string, 'done' | 'carried' | 'backlog' | 'dropped'>;
      };
      const sprint = state.sprints.find((candidate) => candidate.id === sprintId);
      if (!sprint) {
        res.status(404).json({ error: 'Sprint not found' });
        return;
      }
      if (sprint.status !== 'active') {
        res.status(409).json({ error: 'Only an active sprint can be closed' });
        return;
      }
      const entities = (await db.getTasks()).data;
      const tasks = toSprintTasks(entities);
      const appSettings = await db.getAppSettings();
      const timeZone = appSettings?.timezone ?? 'Europe/Zurich';
      const closed = applyClose(
        sprint,
        tasks,
        outcomes,
        previousClosedTargetPoints(state, sprint),
        'manual',
        new Date().toISOString(),
        timeZone,
      );
      const next: SprintStateEntity = {
        ...state,
        sprints: state.sprints.map((candidate) => (candidate.id === sprint.id ? closed : candidate)),
        activeSprintId: state.activeSprintId === sprint.id ? null : state.activeSprintId,
        updatedAt: new Date().toISOString(),
      };
      const byId = new Map(entities.map((entity) => [entity.id, entity]));
      const updates = closed.scope
        .map((item) => ({
          id: item.taskId,
          sprintTarget: item.outcome === 'carried',
        }))
        .filter((update) => Boolean(byId.get(update.id)?.sprintTarget) !== update.sprintTarget);
      if (updates.length > 0) {
        await db.bulkUpdateSprintTargets(updates);
        for (const update of updates) {
          const entity = byId.get(update.id);
          if (entity) broadcastTaskToYjs({ ...entity, sprintTarget: update.sprintTarget });
        }
      }
      await db.updateSprintState(next);
      res.json(next);
    });
  } catch (error: unknown) {
    console.error('Error closing sprint:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to close sprint', details: message });
  }
});

app.get('/api/sprint-wellbeing/:sprintId', async (req: Request, res: Response) => {
  try {
    const { sprintId } = req.params;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    const state = await db.getSprintState();
    if (!state?.sprints.some((sprint) => sprint.id === sprintId)) {
      res.status(404).json({ error: 'Sprint not found' });
      return;
    }
    const answers = await db.getSprintWellbeing(sprintId);
    const answered = answers.some((entry) => entry.userId === userId);
    res.json({
      answered,
      // Small samples stay hidden so nobody can derive an individual score.
      aggregate: buildWellbeingAggregate(answers.map((entry) => entry.answers)),
    });
  } catch (error: unknown) {
    console.error('Error reading sprint well-being:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to read sprint well-being', details: message });
  }
});

app.post('/api/sprint-wellbeing/:sprintId', async (req: Request, res: Response) => {
  try {
    const { sprintId } = req.params;
    const { userId, answers } = req.body as { userId?: string; answers?: unknown };
    const resolvedUserId = typeof userId === 'string' ? userId : '';
    const valid =
      Boolean(resolvedUserId) &&
      Array.isArray(answers) &&
      answers.length === WHO5_QUESTIONS.length &&
      answers.every((value) => Number.isInteger(value) && value >= 0 && value <= 5);
    if (!valid) {
      res.status(400).json({ error: 'A userId and five integer answers between 0 and 5 are required' });
      return;
    }
    const state = await db.getSprintState();
    if (!state?.sprints.some((sprint) => sprint.id === sprintId)) {
      res.status(404).json({ error: 'Sprint not found' });
      return;
    }
    await db.submitSprintWellbeing(sprintId, resolvedUserId, answers as number[]);
    const stored = await db.getSprintWellbeing(sprintId);
    res.json({
      answered: true,
      aggregate: buildWellbeingAggregate(stored.map((entry) => entry.answers)),
    });
  } catch (error: unknown) {
    console.error('Error submitting sprint well-being:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to submit sprint well-being', details: message });
  }
});

app.post('/api/sprint-state/start', async (req: Request, res: Response) => {
  try {
    await withSprintStateLock(async () => {
      const state: SprintStateEntity = (await db.getSprintState()) ?? createEmptySprintState();
      const { sprintId, taskIds } = req.body as { sprintId?: string; taskIds?: string[] };
      const sprint = state.sprints.find((candidate) => candidate.id === sprintId);
      if (!sprint) {
        res.status(404).json({ error: 'Sprint not found' });
        return;
      }
      if (sprint.status !== 'draft') {
        res.status(409).json({ error: 'Only a draft sprint can be started' });
        return;
      }
      if (state.activeSprintId && state.activeSprintId !== sprint.id) {
        res.status(409).json({ error: 'Another sprint is already active' });
        return;
      }
      const entities = (await db.getTasks()).data;
      const tasks = toSprintTasks(entities);
      const sprintTasksById = new Map(tasks.map((task) => [task.id, task]));
      const candidateIds = (taskIds ?? sprint.scope.map((item) => item.taskId)).filter(
        (taskId) => !isTerminalTask(sprintTasksById.get(taskId)),
      );
      const scope = buildScopeSnapshot(candidateIds, tasks);
      const appSettings = await db.getAppSettings();
      const timeZone = appSettings?.timezone ?? 'Europe/Zurich';
      const started = startSprint(
        sprint,
        scope,
        tasks,
        previousClosedTargetPoints(state, sprint),
        new Date().toISOString(),
        timeZone,
      );
      const next: SprintStateEntity = {
        ...state,
        sprints: state.sprints.map((candidate) => (candidate.id === sprint.id ? started : candidate)),
        activeSprintId: started.id,
        draftSprintId: null,
        updatedAt: new Date().toISOString(),
      };
      const scopeIds = new Set(scope.map((item) => item.taskId));
      const updates = entities
        .filter((entity) => Boolean(entity.sprintTarget) !== scopeIds.has(entity.id))
        .map((entity) => ({ id: entity.id, sprintTarget: scopeIds.has(entity.id) }));
      if (updates.length > 0) {
        await db.bulkUpdateSprintTargets(updates);
        const byId = new Map(entities.map((entity) => [entity.id, entity]));
        for (const update of updates) {
          const entity = byId.get(update.id);
          if (entity) broadcastTaskToYjs({ ...entity, sprintTarget: update.sprintTarget });
        }
      }
      await db.updateSprintState(next);
      res.json(next);
    });
  } catch (error: unknown) {
    console.error('Error starting sprint:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to start sprint', details: message });
  }
});

// Circles routes (EasyCIRCLE)
app.get('/api/circles', async (req: Request, res: Response) => {
  try {
    const circles = await db.getCircles();
    res.json(circles);
  } catch (error: unknown) {
    console.error('Error fetching circles:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch circles', details: message });
  }
});

app.post('/api/circles', async (req: Request, res: Response) => {
  try {
    const circle = await db.createCircle(req.body);
    res.status(201).json(circle);
  } catch (error: unknown) {
    console.error('Error creating circle:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create circle', details: message });
  }
});

app.get('/api/circles/:id', async (req: Request, res: Response) => {
  try {
    const circle = await db.getCircleById(req.params.id);
    if (!circle) {
      return res.status(404).json({ error: 'Circle not found' });
    }
    res.json(circle);
  } catch (error: unknown) {
    console.error('Error fetching circle:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch circle', details: message });
  }
});

app.patch('/api/circles/:id', async (req: Request, res: Response) => {
  try {
    const circle = await db.updateCircle(req.params.id, req.body);
    if (!circle) {
      return res.status(404).json({ error: 'Circle not found' });
    }
    res.json(circle);
  } catch (error: unknown) {
    console.error('Error updating circle:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update circle', details: message });
  }
});

app.delete('/api/circles/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteCircle(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting circle:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete circle', details: message });
  }
});

app.post('/api/circles/clear', async (req: Request, res: Response) => {
  try {
    await db.clearAllCircles();
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error clearing circles:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to clear circles', details: message });
  }
});

app.post('/api/circles/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const circles = req.body;
    if (!Array.isArray(circles)) {
      return res.status(400).json({ error: 'Expected an array of circles' });
    }
    await db.importCircles(circles);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error('Failed to import circles:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import circles', details: message });
  }
});

// Frameworks routes
app.get('/api/frameworks', async (req: Request, res: Response) => {
  try {
    const frameworkType = req.query.frameworkType as string | undefined;
    const frameworks = await db.getFrameworks(frameworkType);
    res.json(frameworks);
  } catch (error: unknown) {
    console.error('Error fetching frameworks:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch frameworks', details: message });
  }
});

app.post('/api/frameworks', async (req: Request, res: Response) => {
  try {
    const framework = await db.createFramework(req.body);
    res.status(201).json(framework);
  } catch (error: unknown) {
    console.error('Error creating framework:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create framework', details: message });
  }
});

app.get('/api/frameworks/:id', async (req: Request, res: Response) => {
  try {
    const framework = await db.getFrameworkById(req.params.id);
    if (!framework) {
      return res.status(404).json({ error: 'Framework not found' });
    }
    res.json(framework);
  } catch (error: unknown) {
    console.error('Error fetching framework:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch framework', details: message });
  }
});

app.patch('/api/frameworks/:id', async (req: Request, res: Response) => {
  try {
    const framework = await db.updateFramework(req.params.id, req.body);
    if (!framework) {
      return res.status(404).json({ error: 'Framework not found' });
    }
    res.json(framework);
  } catch (error: unknown) {
    console.error('Error updating framework:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update framework', details: message });
  }
});

app.delete('/api/frameworks/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteFramework(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting framework:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete framework', details: message });
  }
});

app.post('/api/frameworks/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const frameworks = req.body;
    if (!Array.isArray(frameworks)) {
      return res.status(400).json({ error: 'Expected an array of frameworks' });
    }
    await db.importFrameworks(frameworks);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error('Failed to import frameworks:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import frameworks', details: message });
  }
});

// Votes routes
app.get('/api/votes', async (req: Request, res: Response) => {
  try {
    const opts: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind } = {};
    if (req.query.linkedTaskId) opts.linkedTaskId = req.query.linkedTaskId as string;
    if (req.query.ownerId) opts.ownerId = req.query.ownerId as string;
    if (req.query.kind) opts.kind = req.query.kind as VoteKind;
    const votes = await db.getVotes(opts);
    res.json(votes);
  } catch (error: unknown) {
    console.error('Error fetching votes:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch votes', details: message });
  }
});

app.post('/api/votes', async (req: Request, res: Response) => {
  try {
    const vote = await db.createVote(req.body);
    res.status(201).json(vote);
  } catch (error: unknown) {
    console.error('Error creating vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create vote', details: message });
  }
});

app.get('/api/votes/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    let vote = await db.getVoteById(idOrSlug);
    if (!vote) {
      vote = await db.getVoteBySlug(idOrSlug);
    }
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    res.json(vote);
  } catch (error: unknown) {
    console.error('Error fetching vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch vote', details: message });
  }
});

app.put('/api/votes/:id', async (req: Request, res: Response) => {
  try {
    const vote = await db.updateVote(req.params.id, req.body);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    // Turning anonymity on must also scrub identities captured while the vote
    // was non-anonymous. The decision is state-based, not transition-based, and
    // runs only after the anonymity change is persisted, so a failed update can
    // never irreversibly destroy identities while the vote stays non-anonymous.
    // Deriving it from the stored state means a failed scrub (or a crash between
    // the two statements) is repaired by the next save instead of never running
    // again, and the existence check keeps the table-wide scrub off the
    // per-keystroke save path because it is false once identities are gone.
    if (
      isVoteAnonymous(vote.config) &&
      (await db.hasVoteRankingSubmissionIdentities(vote.id))
    ) {
      try {
        await db.scrubVoteRankingSubmissionIdentities(vote.id);
      } catch (error: unknown) {
        console.error('Error scrubbing vote ranking identities:', error);
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({
          error: 'Vote was updated but ballot identities could not be scrubbed',
          details: message,
        });
      }
    }
    res.json(vote);
  } catch (error: unknown) {
    console.error('Error updating vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update vote', details: message });
  }
});

app.post('/api/votes/:id/finalize', async (req: Request, res: Response) => {
  try {
    const vote = await db.getVoteById(req.params.id);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.kind !== 'decision') {
      return res.status(400).json({ error: 'Only decision votes can be finalized' });
    }

    let outcome = req.body;
    if (vote.config.mode === 'COMPARATIVE_PRIORITIZATION') {
      // Finalizing requires naming the ranking's winner, but a hidden vote's
      // results are not readable yet, so the moderator could not know it. The
      // only way out of that dead end is to close the vote (results become
      // visible) or to have opted into showing results before close.
      if (!areRankingResultsVisible(vote)) {
        return res.status(400).json({
          error: 'Close the vote before finalizing so the ranking winner is available',
        });
      }
      const submissions = await db.getVoteRankingSubmittedBallots(vote.id);
      const ranking = getVoteRankingResult(vote, submissions);
      if (!ranking || ranking.groups.length === 0) {
        return res.status(400).json({ error: 'No submitted ballots to finalize' });
      }
      const topGroup = ranking.groups[0].proposalIds;
      const allowTies = voteAllowsTies(vote.config);
      const requestedWinner = typeof req.body?.winningProposalId === 'string'
        ? req.body.winningProposalId
        : null;

      const resolution = resolveFinalizedWinner(topGroup, allowTies, requestedWinner);
      if (resolution.error) {
        return res.status(400).json({
          error: resolution.error === 'tied-requires-tie'
            ? 'Top group is tied; finalize as a tie or disable allowTies'
            : 'Top group is tied; select one proposal from the top group',
        });
      }
      // The client writes `summary` from its own selection, so persisting a
      // server-derived winner that differs from that selection would store an
      // outcome whose text contradicts `winningProposalId`. Require the
      // moderator to confirm the ranking's winner instead of silently
      // overriding the request (the dialog defaults to "tie").
      if (resolution.winningProposalId !== requestedWinner) {
        return res.status(400).json({
          error: requestedWinner === null
            ? 'The ranking has a winner; select it in the finalize dialog'
            : 'The selected proposal is not the ranking winner',
        });
      }
      const winningProposalId = resolution.winningProposalId;

      outcome = {
        ...req.body,
        winningProposalId,
        ranking,
        finalizedAt: req.body?.finalizedAt || new Date().toISOString(),
        finalizedByUserId: req.body?.finalizedByUserId || vote.ownerId,
      };
    }

    const finalized = await db.finalizeVote(req.params.id, outcome);
    res.json(finalized);
  } catch (error: unknown) {
    console.error('Error finalizing vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to finalize vote', details: message });
  }
});

app.delete('/api/votes/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteVote(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete vote', details: message });
  }
});

app.post('/api/votes/:id/reset', async (req: Request, res: Response) => {
  try {
    const reset = await db.resetVote(req.params.id);
    if (!reset) {
      res.status(404).json({ error: 'Vote not found' });
      return;
    }
    res.json(reset);
  } catch (error: unknown) {
    console.error('Error resetting vote:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to reset vote', details: message });
  }
});

async function findVoteByIdOrSlug(idOrSlug: string) {
  return (await db.getVoteById(idOrSlug)) || (await db.getVoteBySlug(idOrSlug));
}

function requestToken(
  req: Request,
  header: string,
  queryKey: string,
): string | undefined {
  // Prefer a custom header so bearer credentials do not land in access/proxy
  // logs and browser history; keep the query form for older clients.
  const headerValue = req.get(header);
  if (headerValue) return headerValue;
  const queryValue = req.query[queryKey];
  return typeof queryValue === 'string' ? queryValue : undefined;
}

/**
 * A `moderatorToken` is the only real secret in this codebase. `ownerId` is
 * returned by the public vote endpoint and is not authentication, so live
 * participation data (draft progress, last-seen, editing state) must require a
 * moderator session. `ownerId` is therefore never honoured here: a public
 * caller (the backup read included) only receives submitted ballots, and only
 * once results are visible. Submitted-ballot backups must still be possible for
 * votes that have no moderator yet, which is why the visibility rule rather
 * than a credential unlocks the public read for locked votes.
 */
async function canModerateVote(req: Request, vote: { id: string }): Promise<boolean> {
  const moderatorToken = requestToken(req, 'x-moderator-token', 'moderatorToken');
  if (!moderatorToken) return false;
  const resolved = await db.resolveVoteModeratorToken(moderatorToken);
  return Boolean(resolved && resolved.vote.id === vote.id);
}

const RANKING_RESULT_CACHE_LIMIT = 32;
const rankingResultCache = new Map<string, { signature: string; result: VoteRankingResult | null }>();

function rankingSignature(vote: VoteEntity, submissions: VoteRankingSubmission[]): string {
  let hash = 2166136261 >>> 0;
  const feed = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  };
  feed(vote.id);
  for (const proposal of vote.proposals) {
    feed(`${proposal.id}:${proposal.active ? 1 : 0}:${proposal.position};`);
  }
  for (const submission of submissions) {
    if (!submission.submitted) continue;
    // `submittedAt` is rewritten on every submit, so it versions the payload
    // without hashing (potentially large) ballot JSON on each request.
    feed(
      `${submission.voterToken}:${submission.submittedAt ?? ''}:` +
      `${submission.submitted.comparisons.length}:${submission.submitted.batchCount};`,
    );
  }
  return hash.toString(36);
}

/**
 * `estimatePartialRanking` is super-linear in the number of ranked proposals,
 * so the same submission set must not be recomputed on every results request.
 * Invalidate implicitly by hashing the inputs that affect the result.
 */
function getVoteRankingResult(
  vote: VoteEntity,
  submissions: VoteRankingSubmission[],
): VoteRankingResult | null {
  const signature = rankingSignature(vote, submissions);
  const cached = rankingResultCache.get(vote.id);
  if (cached && cached.signature === signature) return cached.result;
  const result = buildVoteRankingResult(vote, submissions);
  if (rankingResultCache.size >= RANKING_RESULT_CACHE_LIMIT) {
    const oldest = rankingResultCache.keys().next().value;
    if (oldest !== undefined) rankingResultCache.delete(oldest);
  }
  rankingResultCache.set(vote.id, { signature, result });
  return result;
}

type RankingBallotShapeError =
  | 'invalid-item-ids'
  | 'too-few-item-ids'
  | 'invalid-comparisons'
  | 'invalid-comparison-entry'
  | 'invalid-comparison-types'
  | 'invalid-comparison-pair'
  | 'invalid-comparison-winner';

const RANKING_BALLOT_SHAPE_ERRORS: Record<RankingBallotShapeError, string> = {
  'invalid-item-ids': 'itemIds must be an array of at most 100 ids',
  'too-few-item-ids': 'At least two item ids are required',
  'invalid-comparisons': 'comparisons must be an array of at most 20000 entries',
  'invalid-comparison-entry': 'Invalid comparison entry',
  'invalid-comparison-types': 'Comparison a, b and winner must be strings',
  'invalid-comparison-pair': 'Comparison contains an invalid proposal pair',
  'invalid-comparison-winner': 'Comparison winner must be one of the compared proposals',
};

/**
 * Shared shape validation for the two ballot ingest paths (participant submit
 * and backup import). Both must apply the same itemIds cap/stale-filter and the
 * same a/b/winner comparison rules; only the surrounding requirements differ
 * (status and a minimum item count when submitting, a required coverage summary
 * on import). Error codes let each route keep its own message text.
 */
function sanitizeRankingBallotShape(
  rawItemIds: unknown,
  rawComparisons: unknown,
  proposalIds: Set<string>,
  options: { minItemIds?: number; requireStringItemIds?: boolean } = {},
): {
  itemIds?: string[];
  comparisons?: VoteRankingBallot['comparisons'];
  error?: RankingBallotShapeError;
} {
  if (!Array.isArray(rawItemIds) || rawItemIds.length > MAX_RANKED_ITEMS) {
    return { error: 'invalid-item-ids' };
  }
  if (options.requireStringItemIds && !rawItemIds.every((id) => typeof id === 'string')) {
    return { error: 'invalid-item-ids' };
  }
  // A ballot is a snapshot: a proposal can be removed from the vote while it is
  // still OPEN, so an in-flight ballot may legitimately reference an id that no
  // longer exists. Drop those stale references (aggregation already ignores
  // them) instead of rejecting every subsequent autosave and submit.
  const itemIds = Array.from(
    new Set(rawItemIds.filter((id): id is string => typeof id === 'string')),
  ).filter((id) => proposalIds.has(id));
  if (options.minItemIds !== undefined && itemIds.length < options.minItemIds) {
    return { error: 'too-few-item-ids' };
  }
  if (!Array.isArray(rawComparisons) || rawComparisons.length > 20000) {
    return { error: 'invalid-comparisons' };
  }

  const comparisons: VoteRankingBallot['comparisons'] = [];
  for (const raw of rawComparisons) {
    if (!raw || typeof raw !== 'object') {
      return { error: 'invalid-comparison-entry' };
    }
    const entry = raw as Record<string, unknown>;
    const a = entry.a;
    const b = entry.b;
    const winner = entry.winner;
    if (typeof a !== 'string' || typeof b !== 'string' || typeof winner !== 'string') {
      return { error: 'invalid-comparison-types' };
    }
    if (a === b) {
      return { error: 'invalid-comparison-pair' };
    }
    if (!proposalIds.has(a) || !proposalIds.has(b)) {
      continue;
    }
    if (winner !== a && winner !== b) {
      return { error: 'invalid-comparison-winner' };
    }
    comparisons.push({ a, b, winner });
  }

  return { itemIds, comparisons };
}

function validateRankingBallot(
  vote: VoteEntity,
  body: Record<string, unknown>,
): { ballot?: VoteRankingBallot; status?: 'in_progress' | 'submitted'; error?: string } {
  const status = body.status;
  if (status !== 'in_progress' && status !== 'submitted') {
    return { error: 'status must be in_progress or submitted' };
  }
  if (typeof body.voterToken !== 'string' || body.voterToken.trim() === '') {
    return { error: 'voterToken is required' };
  }
  const proposalIds = new Set(vote.proposals.map((proposal) => proposal.id));
  const shape = sanitizeRankingBallotShape(body.itemIds, body.comparisons, proposalIds, {
    minItemIds: 2,
  });
  if (shape.error) {
    return { error: RANKING_BALLOT_SHAPE_ERRORS[shape.error] };
  }
  const itemIds = shape.itemIds!;
  const comparisons = shape.comparisons!;

  const engine = vote.config.rankingEngine ?? DEFAULT_RANKING_ENGINE;
  if (body.engine !== undefined && body.engine !== engine) {
    return { error: `This vote uses ${engine}` };
  }

  // Coverage must be measured against the server-known active proposal set, not
  // the client-supplied itemIds, otherwise a ballot can inflate its reported
  // coverage by declaring a tiny denominator. Reuse `activeProposalIds` so this
  // denominator cannot drift from the set result aggregation ranks.
  const activeIds = activeProposalIds(vote);
  const denominatorIds = activeIds.length >= 2 ? activeIds : itemIds;

  return {
    status,
    ballot: {
      itemIds,
      comparisons,
      batchCount: Number.isFinite(body.batchCount) ? Number(body.batchCount) : 0,
      coverage: computeBallotCoverage({ itemIds: denominatorIds, comparisons }),
      confidencePercent: Math.max(0, Math.min(100, Number(body.confidencePercent) || 0)),
      stopReason: typeof body.stopReason === 'string' ? body.stopReason : null,
      engine,
      engineVersion: typeof body.engineVersion === 'string' ? body.engineVersion : 'unknown',
    },
  };
}

// Comparative prioritization ballots (participant self-read + bulk backup read)
app.get('/api/votes/:idOrSlug/ranking-submissions', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    // The credential travels in a header, so the response body varies by that
    // header even though the URL does not. Without no-store a shared cache
    // could serve one participant's ballot to a different voter requesting the
    // same URL.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Voter-Token, X-Moderator-Token');
    const voterToken = requestToken(req, 'x-voter-token', 'voterToken');
    if (voterToken) {
      // A participant reads back their own ballot with their bearer token.
      const submission = await db.getVoteRankingSubmission(vote.id, voterToken);
      // Do not echo the bearer credential back in the body; the caller already
      // holds it and the ballot payload is all it needs. `scope` proves the
      // header was honored so a client can distinguish this own-ballot read
      // from the tokenless bulk branch (e.g. an older server during rollout).
      return res.json({
        scope: 'self',
        submissions: submission ? [{ ...submission, voterToken: undefined }] : [],
      });
    }
    // Bulk read: the workspace backup path. Never expose the participant
    // credential and never leak per-ballot identities on anonymous votes; an
    // absent `isAnonymous` flag means anonymous, matching the rest of the app.
    // A hidden (OPEN) vote's ballots are its results, so they must not be
    // readable through a public value: only a moderator session may read them
    // before the results are visible, exactly like `/ranking-results`. Drafts
    // are live participation data and therefore also moderator-only; the public
    // path receives submitted ballots only and skips loading draft payloads.
    const isModerator = await canModerateVote(req, vote);
    if (!isModerator && !areRankingResultsVisible(vote)) {
      return res.json({ submissions: [] });
    }
    const submissions = isModerator
      ? await db.getVoteRankingSubmissions(vote.id)
      : await db.getVoteRankingSubmittedBallots(vote.id);
    const anonymous = isVoteAnonymous(vote.config);
    res.json({
      submissions: submissions.map((submission) =>
        redactRankingSubmissionForBackup(submission, anonymous),
      ),
    });
  } catch (error: unknown) {
    console.error('Error fetching ranking submissions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch ranking submissions', details: message });
  }
});

app.post('/api/votes/:idOrSlug/ranking-submissions', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (vote.config.mode !== 'COMPARATIVE_PRIORITIZATION') {
      return res.status(400).json({ error: 'Vote is not in comparative prioritization mode' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for ballots' });
    }

    const validation = validateRankingBallot(vote, req.body ?? {});
    if (!validation.ballot || !validation.status) {
      return res.status(400).json({ error: validation.error ?? 'Invalid ballot' });
    }

    // Only a vote that locks ballots needs the stored submission. The default
    // allows changes, and loading the full ballot on every autosave is costly.
    if (vote.config.allowVoteChangeUntilClose === false) {
      const existing = await db.getVoteRankingSubmission(vote.id, req.body.voterToken);
      if (existing?.submitted) {
        return res.status(400).json({ error: 'Ballot already submitted' });
      }
    }

    const now = new Date().toISOString();
    const isAnonymous = isVoteAnonymous(vote.config);
    const submission = await db.upsertVoteRankingSubmission(vote.id, {
      voterToken: req.body.voterToken,
      // Anonymous votes must not persist who cast the ballot.
      userId: isAnonymous ? null : (typeof req.body.userId === 'string' ? req.body.userId : null),
      displayName: isAnonymous
        ? null
        : (typeof req.body.displayName === 'string' ? req.body.displayName : null),
      draft: validation.ballot,
      draftUpdatedAt: now,
      submitted: validation.status === 'submitted' ? validation.ballot : undefined,
      submittedAt: validation.status === 'submitted' ? now : undefined,
      lastSeenAt: now,
    });
    // The client already holds the ballot it just uploaded; echo only the
    // canonical metadata instead of the full (up to 20k comparison) payload.
    res.status(201).json({
      id: submission.id,
      voteId: submission.voteId,
      submitted: submission.submitted !== null,
      submittedAt: submission.submittedAt,
      draftUpdatedAt: submission.draftUpdatedAt,
      lastSeenAt: submission.lastSeenAt,
    });
  } catch (error: unknown) {
    console.error('Error upserting ranking submission:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to save ranking ballot', details: message });
  }
});

app.delete('/api/votes/:idOrSlug/ranking-submissions', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    const voterToken = requestToken(req, 'x-voter-token', 'voterToken');
    if (!voterToken) return res.status(400).json({ error: 'voterToken is required' });
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for ballots' });
    }
    // Mirror the submit-side lock: a submitted ballot cannot be withdrawn when
    // the vote disallows changes until close.
    const existing = await db.getVoteRankingSubmission(vote.id, voterToken);
    if (existing?.submitted && vote.config.allowVoteChangeUntilClose === false) {
      return res.status(400).json({ error: 'Ballot already submitted' });
    }
    await db.deleteVoteRankingSubmission(vote.id, voterToken);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting ranking submission:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete ranking ballot', details: message });
  }
});

app.get('/api/votes/:idOrSlug/ranking-participation', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    // Moderator-authenticated payload selected by a header, not the URL: keep
    // shared caches from returning one facilitator's response to another.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Moderator-Token');
    if (!(await canModerateVote(req, vote))) {
      return res.status(403).json({ error: 'Facilitator access required' });
    }
    // Read only the summary fields: this endpoint is polled every few seconds and
    // deriving participation does not need each ballot's full comparison JSON.
    const stats = await db.getVoteRankingParticipationStats(vote.id);
    res.json(deriveBallotParticipationFromStats(vote.id, stats, isVoteAnonymous(vote.config)));
  } catch (error: unknown) {
    console.error('Error fetching ranking participation:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch ranking participation', details: message });
  }
});

app.get('/api/votes/:idOrSlug/ranking-results', async (req: Request, res: Response) => {
  try {
    const vote = await findVoteByIdOrSlug(req.params.idOrSlug);
    if (!vote) return res.status(404).json({ error: 'Vote not found' });
    if (!areRankingResultsVisible(vote)) {
      // Hidden results only need a participation count, not every ballot's
      // full comparison JSON (which can hold up to 20,000 entries each).
      const submittedCount = await db.countVoteRankingSubmittedBallots(vote.id);
      return res.json({ hidden: true, participantCount: submittedCount, result: null });
    }
    // Aggregation consumes only submitted ballots, so skip draft payloads
    // entirely instead of fetching, deserializing and discarding them.
    const submissions = await db.getVoteRankingSubmittedBallots(vote.id);
    const submittedCount = submissions.length;
    const result = getVoteRankingResult(vote, submissions);
    res.json({ hidden: false, participantCount: submittedCount, result });
  } catch (error: unknown) {
    console.error('Error computing ranking results:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to compute ranking results', details: message });
  }
});

app.post('/api/vote-ranking-submissions/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    // The restore client sends `{ items, replaceVoteIds }` so a backup replaces
    // the covered votes' ballots instead of merging; a bare array is still
    // accepted for compatibility and is treated as a plain upsert.
    const body = req.body as
      | VoteRankingSubmission[]
      | { items?: VoteRankingSubmission[]; replaceVoteIds?: string[] };
    const rawItems = Array.isArray(body) ? body : body?.items;
    if (!Array.isArray(rawItems)) {
      return res.status(400).json({ error: 'Expected an array of ranking submissions' });
    }
    if (rawItems.length > 10000) {
      return res.status(413).json({ error: 'Too many ranking submissions in one import' });
    }
    const replaceVoteIds = Array.isArray(body) ? undefined : body?.replaceVoteIds;
    if (replaceVoteIds !== undefined && !Array.isArray(replaceVoteIds)) {
      return res.status(400).json({ error: 'replaceVoteIds must be an array' });
    }
    if (replaceVoteIds !== undefined && replaceVoteIds.length > 10000) {
      return res.status(413).json({ error: 'Too many replaceVoteIds in one import' });
    }
    // Restore data bypasses the participant submit route, so validate the
    // payload shape here to stop malformed or unbounded rows reaching the DB.
    // Restore runs after votes are imported, so resolve each referenced vote and
    // reject ballots for unknown votes or proposals instead of persisting rows
    // that could be used to tamper with an unrelated vote. Load the vote set once
    // instead of awaiting a lookup per item/replace id: both arrays are
    // user-controlled and a per-id await is an unbounded N+1.
    const votesById = new Map((await db.getVotes()).map((vote) => [vote.id, vote]));
    const resolveVote = (voteId: string): VoteEntity | null => votesById.get(voteId) ?? null;
    const items: VoteRankingSubmission[] = [];
    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') {
        return res.status(400).json({ error: 'Invalid ranking submission entry' });
      }
      const item = raw as Partial<VoteRankingSubmission>;
      if (
        typeof item.id !== 'string' ||
        typeof item.voteId !== 'string' ||
        typeof item.lastSeenAt !== 'string'
      ) {
        return res.status(400).json({ error: 'Ranking submission is missing id, voteId or lastSeenAt' });
      }
      const vote = resolveVote(item.voteId);
      if (!vote) {
        return res.status(400).json({ error: 'Ranking submission references an unknown vote' });
      }
      // Ballots may exist for a vote that has since left COMPARATIVE_PRIORITIZATION
      // mode, and the backup exports every vote so a restore cannot delete
      // omitted ballots. Accept those rows instead of failing the whole restore;
      // they stay inert until the vote returns to ranking mode.
      const proposalIds = new Set(vote.proposals.map((proposal) => proposal.id));
      for (const ballot of [item.draft, item.submitted]) {
        if (!ballot) continue;
        // Same shape rules as the participant submit route. A backup can
        // legitimately reference a proposal that was deactivated or removed
        // after the ballot was cast, so stale references are clamped out
        // (aggregation already ignores them) instead of rejecting the restore.
        const shape = sanitizeRankingBallotShape(
          ballot.itemIds,
          ballot.comparisons,
          proposalIds,
          { requireStringItemIds: true },
        );
        if (shape.error) {
          const error = shape.error === 'invalid-item-ids'
            ? 'Imported ballot has invalid itemIds'
            : shape.error === 'invalid-comparisons'
              ? 'Imported ballot has invalid comparisons'
              : 'Imported ballot has an invalid comparison';
          return res.status(400).json({ error });
        }
        ballot.itemIds = shape.itemIds!;
        ballot.comparisons = shape.comparisons!;
        // Downstream participation/aggregation code assumes a numeric coverage
        // percentage; reject payloads that would persist a malformed row.
        if (
          !ballot.coverage ||
          typeof ballot.coverage.percent !== 'number' ||
          !Number.isFinite(ballot.coverage.percent)
        ) {
          return res.status(400).json({ error: 'Imported ballot has invalid coverage' });
        }
        // The Postgres participation projection casts confidencePercent to
        // double precision, so persist only the same finite 0-100 value the
        // participant submit path stores; a string/object here would break
        // every participation poll for the vote.
        const confidencePercent = Number(ballot.confidencePercent);
        ballot.confidencePercent = Number.isFinite(confidencePercent)
          ? Math.max(0, Math.min(100, confidencePercent))
          : 0;
      }
      // Import bypasses the participant submit route, so apply the same
      // anonymity rule: an anonymous vote must never persist who voted, even if
      // a (possibly tampered) backup supplies identities.
      if (isVoteAnonymous(vote.config)) {
        item.userId = null;
        item.displayName = null;
      }
      items.push(item as VoteRankingSubmission);
    }
    // The restore client owns the decision of which votes it could read: it
    // omits votes whose ballots the matching backup could not contain (see
    // `incompleteRankingVoteIds`), so a complete backup still converges instead
    // of leaving stale ballots behind. The server only validates that the scope
    // references known votes; it cannot infer readability from result
    // visibility because a moderator-token backup includes hidden votes.
    let effectiveReplaceVoteIds = replaceVoteIds;
    if (replaceVoteIds && replaceVoteIds.length > 0) {
      const kept: string[] = [];
      for (const voteId of replaceVoteIds) {
        if (typeof voteId !== 'string') {
          return res.status(400).json({ error: 'replaceVoteIds must contain vote ids' });
        }
        if (!resolveVote(voteId)) continue;
        kept.push(voteId);
      }
      effectiveReplaceVoteIds = kept;
    }
    await db.importVoteRankingSubmissions(items, effectiveReplaceVoteIds);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing ranking submissions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import ranking submissions', details: message });
  }
});

// Vote responses (public)
app.post('/api/votes/:idOrSlug/responses', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    let vote = await db.getVoteById(idOrSlug);
    if (!vote) {
      vote = await db.getVoteBySlug(idOrSlug);
    }
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for responses' });
    }

    const { value } = req.body;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return res.status(400).json({ error: 'Invalid vote value: must be a finite number' });
    }

    const mode = vote.config.mode;
    const MAX_MJ = 5;
    const MIN_MJ = -1;
    let valueError: string | null = null;

    switch (mode) {
      case 'THUMBS_UP':
        if (value !== 1) valueError = 'THUMBS_UP votes must have value 1';
        break;
      case 'THUMBS_UD_NEUTRAL':
        if (![-1, 0, 1].includes(value)) valueError = 'THUMBS_UD_NEUTRAL votes must be -1, 0, or 1';
        break;
      case 'POINTS': {
        const maxPts = vote.config.maxPointsPerUser ?? 10;
        if (!Number.isInteger(value) || value < 0 || value > maxPts) {
          valueError = `POINTS votes must be an integer between 0 and ${maxPts}`;
        }
        break;
      }
      case 'MAJORITY_JUDGMENT':
        if (value < MIN_MJ || value > MAX_MJ || !Number.isInteger(value)) {
          valueError = 'MAJORITY_JUDGMENT votes must be an integer between -1 and 5';
        }
        break;
      case 'CONSENT_LOOP':
        if (value < MIN_MJ || value > MAX_MJ || !Number.isInteger(value)) {
          valueError = 'CONSENT_LOOP votes must be an integer between -1 and 5';
        }
        break;
      case 'COMPARATIVE_PRIORITIZATION':
        return res.status(400).json({ error: 'Use the ranking-submissions endpoint for this vote' });
      default:
        valueError = `Unknown vote mode: ${mode}`;
    }

    if (valueError) {
      return res.status(400).json({ error: valueError });
    }

    const response = await db.createVoteResponse(vote.id, req.body);
    res.status(201).json(response);
  } catch (error: unknown) {
    console.error('Error creating vote response:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to submit vote', details: message });
  }
});

app.delete('/api/votes/:idOrSlug/responses', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    const { voterToken, proposalId, loopId } = req.query;
    if (typeof voterToken !== 'string') {
      return res.status(400).json({ error: 'voterToken is required' });
    }
    let vote = await db.getVoteById(idOrSlug);
    if (!vote) {
      vote = await db.getVoteBySlug(idOrSlug);
    }
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    if (vote.config.phase !== 'OPEN') {
      return res.status(400).json({ error: 'Vote is not open for responses' });
    }
    await db.deleteVoteResponse(
      vote.id,
      voterToken,
      typeof proposalId === 'string' ? proposalId : null,
      typeof loopId === 'string' ? loopId : null,
    );
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting vote response:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to withdraw vote', details: message });
  }
});

// Vote results (public)
app.get('/api/votes/:idOrSlug/results', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    let vote = await db.getVoteById(idOrSlug);
    if (!vote) {
      vote = await db.getVoteBySlug(idOrSlug);
    }
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    const responses = await db.getVoteResponses(vote.id);
    const safeResponses = isVoteAnonymous(vote.config)
      ? responses.map(r => ({ ...r, userId: null }))
      : responses;
    res.json({ vote, responses: safeResponses, totalVotes: responses.length });
  } catch (error: unknown) {
    console.error('Error fetching vote results:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch results', details: message });
  }
});

// Vote loops (CONSENT_LOOP)
app.get('/api/votes/:id/loops', async (req: Request, res: Response) => {
  try {
    const loops = await db.getVoteLoops(req.params.id);
    res.json(loops);
  } catch (error: unknown) {
    console.error('Error fetching vote loops:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch loops', details: message });
  }
});

app.post('/api/votes/:id/loops', async (req: Request, res: Response) => {
  try {
    const loop = await db.createVoteLoop(req.params.id, req.body);
    res.status(201).json(loop);
  } catch (error: unknown) {
    console.error('Error creating vote loop:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create loop', details: message });
  }
});

app.post('/api/votes/loops/:loopId/close', async (req: Request, res: Response) => {
  try {
    const loop = await db.closeVoteLoop(req.params.loopId);
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' });
    }
    res.json(loop);
  } catch (error: unknown) {
    console.error('Error closing vote loop:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to close loop', details: message });
  }
});

app.put('/api/votes/loops/:loopId', async (req: Request, res: Response) => {
  try {
    const loop = await db.updateVoteLoop(req.params.loopId, req.body);
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' });
    }
    res.json(loop);
  } catch (error: unknown) {
    console.error('Error updating vote loop:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update loop', details: message });
  }
});

app.post('/api/vote-loops/import', async (req: Request, res: Response) => {
  try {
    const items: VoteLoop[] = req.body;
    await db.importVoteLoops(items);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing vote loops:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import vote loops', details: message });
  }
});

app.post('/api/vote-responses/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const items: VoteResponseEntity[] = req.body;
    await db.importVoteResponses(items);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing vote responses:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import vote responses', details: message });
  }
});

app.post('/api/vote-moderators/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const items: VoteModerator[] = req.body;
    await db.importVoteModerators(items);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing vote moderators:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import vote moderators', details: message });
  }
});

// Vote moderators
app.get('/api/votes/:id/moderators', async (req: Request, res: Response) => {
  try {
    const moderators = await db.getVoteModerators(req.params.id);
    res.json(moderators);
  } catch (error: unknown) {
    console.error('Error fetching vote moderators:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch moderators', details: message });
  }
});

app.post('/api/votes/:id/moderators', async (req: Request, res: Response) => {
  try {
    const moderator = await db.addVoteModerator(req.params.id, req.body);
    res.status(201).json(moderator);
  } catch (error: unknown) {
    console.error('Error adding vote moderator:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to add moderator', details: message });
  }
});

app.delete('/api/votes/:id/moderators/:moderatorId', async (req: Request, res: Response) => {
  try {
    await db.revokeVoteModerator(req.params.moderatorId);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error revoking vote moderator:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to revoke moderator', details: message });
  }
});

app.get('/api/votes/moderate/:token', async (req: Request, res: Response) => {
  try {
    const result = await db.resolveVoteModeratorToken(req.params.token);
    if (!result) {
      return res.status(404).json({ error: 'Invalid moderator token' });
    }
    res.json(result);
  } catch (error: unknown) {
    console.error('Error resolving moderator token:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to resolve moderator token', details: message });
  }
});

// Vote import
app.post('/api/votes/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Expected an array of votes' });
    }
    await db.importVotes(items);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error('Failed to import votes:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import votes', details: message });
  }
});

// Vote QR code endpoints
app.get('/api/votes/:slug/qr.svg', async (req: Request, res: Response) => {
  try {
    const vote = await db.getVoteBySlug(req.params.slug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    const url = `${req.protocol}://${req.get('host')}/v/${vote.slug}`;
    const svg = await QRCode.toString(url, { type: 'svg', width: 256, margin: 2 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(svg);
  } catch (error: unknown) {
    console.error('Error generating QR SVG:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to generate QR code', details: message });
  }
});

app.get('/api/votes/:slug/qr.png', async (req: Request, res: Response) => {
  try {
    const vote = await db.getVoteBySlug(req.params.slug);
    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    const url = `${req.protocol}://${req.get('host')}/v/${vote.slug}`;
    const png = await QRCode.toBuffer(url, { type: 'png', width: 512, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (error: unknown) {
    console.error('Error generating QR PNG:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to generate QR code', details: message });
  }
});

// Reminders routes
app.get('/api/reminders', async (req: Request, res: Response) => {
  try {
    const userId = req.query.user_id as string | undefined;
    const reminders = await db.listReminders(userId);
    res.json(reminders);
  } catch (error: unknown) {
    console.error('Error fetching reminders:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch reminders', details: message });
  }
});

app.post('/api/reminders', async (req: Request, res: Response) => {
  try {
    const reminder = await db.createReminder(req.body);
    res.status(201).json(reminder);
  } catch (error: unknown) {
    console.error('Error creating reminder:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create reminder', details: message });
  }
});

app.get('/api/reminders/:id', async (req: Request, res: Response) => {
  try {
    const reminder = await db.getReminderById(req.params.id);
    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    res.json(reminder);
  } catch (error: unknown) {
    console.error('Error fetching reminder:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch reminder', details: message });
  }
});

app.patch('/api/reminders/:id', async (req: Request, res: Response) => {
  try {
    const reminder = await db.updateReminder(req.params.id, req.body);
    res.json(reminder);
  } catch (error: unknown) {
    console.error('Error updating reminder:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to update reminder', details: message });
  }
});

app.delete('/api/reminders/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteReminder(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting reminder:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete reminder', details: message });
  }
});

app.delete('/api/reminders/task/:taskId', async (req: Request, res: Response) => {
  try {
    await db.deleteRemindersByTaskId(req.params.taskId);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting reminders by task ID:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete reminders', details: message });
  }
});

app.post('/api/reminders/clear', async (req: Request, res: Response) => {
  try {
    await db.clearAllReminders();
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error clearing reminders:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to clear reminders', details: message });
  }
});

app.post('/api/reminders/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const reminders = req.body;
    if (!Array.isArray(reminders)) {
      return res.status(400).json({ error: 'Expected an array of reminders' });
    }
    await db.importReminders(reminders);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error('Failed to import reminders:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import reminders', details: message });
  }
});

// Pomodoro session routes
app.get('/api/pomodoro-sessions', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const since = req.query.since ? Number(req.query.since) : undefined;
    const sessions = await db.listPomodoroSessions(userId, since);
    res.json({ data: sessions });
  } catch (error: unknown) {
    console.error('Error fetching pomodoro sessions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch pomodoro sessions', details: message });
  }
});

app.post('/api/pomodoro-sessions', async (req: Request, res: Response) => {
  try {
    const session = await db.createPomodoroSession(req.body);
    res.status(201).json(session);
  } catch (error: unknown) {
    console.error('Error creating pomodoro session:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to create pomodoro session', details: message });
  }
});

app.post('/api/pomodoro-sessions/import', express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const sessions: PomodoroSession[] = req.body;
    await db.importPomodoroSessions(sessions);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error importing pomodoro sessions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to import pomodoro sessions', details: message });
  }
});

app.delete('/api/pomodoro-sessions/:id', async (req: Request, res: Response) => {
  try {
    await db.deletePomodoroSession(req.params.id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting pomodoro session:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete pomodoro session', details: message });
  }
});

app.post('/api/pomodoro-sessions/clear', async (req: Request, res: Response) => {
  try {
    await db.clearAllPomodoroSessions();
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error clearing pomodoro sessions:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to clear pomodoro sessions', details: message });
  }
});

app.delete('/api/pomodoro-sessions/user/:userId', async (req: Request, res: Response) => {
  try {
    await db.deletePomodoroSessionsByUser(req.params.userId);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting pomodoro sessions by user:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to delete pomodoro sessions for user', details: message });
  }
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler - serve index.html for client-side routing in production
app.use('*', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const indexPath = path.resolve(__dirname, '../../index.html');

    // Only serve index.html for routes that match the base URL
    const baseUrl = process.env.VITE_BASE_URL || '/';

    // Never fall back to index.html for files that must exist as real assets.
    // After a redeploy, stale clients request old hashed chunks; serving HTML
    // here makes dynamic imports fail with a cryptic module-load TypeError
    // (and blank screen) instead of a clean 404 the SPA can recover from.
    const isAssetPath =
      req.originalUrl.startsWith('/assets/') ||
      req.originalUrl.includes('/assets/') ||
      /\.(js|mjs|css|json|map|wasm|woff2?|ttf|png|jpe?g|svg|gif|webp|ico|mp3|ogg|wav)$/.test(
        req.originalUrl.split('?')[0]
      );

    if (isAssetPath) {
      res.status(404).json({ error: 'Asset not found (stale build?)' });
      return;
    }

    if (req.originalUrl.startsWith(baseUrl)) {
      // Prevent stale index.html (and thus stale hashed chunk references) being cached
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Route not found' });
    }
  } else {
    res.status(404).json({ error: 'Route not found' });
  }
});
// Initialize database and start server
async function startServer() {
  try {
    await initializeDb();
    startSprintScheduler(db, broadcastTaskToYjs);

    // Check if tasks exist, if not, the frontend will call the init-defaults endpoint
    const tasksResult = await db.getTasks();
    if (tasksResult.total === 0) {
      console.log('No tasks found in the database. Frontend will initialize default tasks.');
    }

    const server = app.listen(PORT, () => {
      console.log(`P3FO Server listening on port ${PORT}`);
      console.log(`Database client: ${DB_CLIENT}`);
      if (DB_CLIENT === 'sqlite') {
        console.log(`SQLite file: ${DB_SQLITE_FILE}`);
      } else if (DB_CLIENT === 'pg' && DB_URL) {
        console.log(`PostgreSQL URL: ${DB_URL.replace(/\/\/[^@]*@/, '//***@')}`); // Mask credentials
      }
    });

    // Attach WebSocket server
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      // You can handle authentication here if needed
      const handleAuth = (ws: unknown) => {
        wss.emit('connection', ws, request);
      };
      wss.handleUpgrade(request, socket, head, handleAuth);
    });

    wss.on('connection', (ws, req) => {
      const docName = req.url?.slice(1).split('?')[0] || 'default-doc';
      setupWSConnection(ws, req, { docName });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (db && db.close) {
    await db.close();
  }
  process.exit(0);
});

startServer();