import './telemetry.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { createDbClient } from './db/index.js';
import { DbClient } from './db/index.js';
import { VoteKind, VoteLoop, VoteModerator, VoteResponseEntity, PomodoroSession } from '../src/lib/persistence-types.js';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5172;

// Environment variables
const DB_CLIENT = process.env.P3FO_DB_CLIENT || 'sqlite'; // 'sqlite' or 'pg'
const DB_URL = process.env.P3FO_DB_URL;
const DB_SQLITE_FILE = process.env.P3FO_DB_SQLITE_FILE || './p3fo.db';

// Middleware
app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'traceparent', 'tracestate', 'X-API-Key', 'Authorization'],
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

  app.use(baseUrl, express.static(staticPath, { index: false }));
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

    const pagination = (limit !== undefined || offset !== undefined)
      ? { limit, offset }
      : undefined;

    const result = await db.getTasks(userId, pagination, excludeStatuses, triageStatuses, includeSubtasks);
    res.json(result);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', async (req: Request, res: Response) => {
  try {
    const task = await db.createTask(req.body);
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
    res.json(task);
  } catch (error) {
    console.error('API: Error updating task (POST alias):', error);
    res.status(500).json({ error: 'Failed to update task', details: (error as Error).message });
  }
});

app.delete('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteTask(req.params.id);
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
    const outcome = req.body;
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
    const safeResponses = vote.config.isAnonymous
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