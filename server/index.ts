import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createDbClient } from './db';
import { DbClient } from './db';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const DB_CLIENT = process.env.P3FO_DB_CLIENT || 'sqlite'; // 'sqlite' or 'pg'
const DB_URL = process.env.P3FO_DB_URL;
const DB_SQLITE_FILE = process.env.P3FO_DB_SQLITE_FILE || './p3fo.db';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
    const tasks = await db.getTasks(userId);
    res.json(tasks);
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
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', async (req: Request, res: Response) => {
  try {
    await db.deleteTask(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
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
app.get('/api/qol', async (req: Request, res: Response) => {
  try {
    const response = await db.getQolSurveyResponse();
    res.json(response);
  } catch (error) {
    console.error('Error fetching QoL survey response:', error);
    res.status(500).json({ error: 'Failed to fetch QoL survey response' });
  }
});

app.put('/api/qol', async (req: Request, res: Response) => {
  try {
    await db.saveQolSurveyResponse(req.body);
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

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

import { WebSocketServer } from 'ws';
// @ts-ignore - y-websocket types are not perfect
import { setupWSConnection } from 'y-websocket/bin/utils';

// Initialize database and start server
async function startServer() {
  try {
    await initializeDb();

    // Check if tasks exist, if not, the frontend will call the init-defaults endpoint
    const tasks = await db.getTasks();
    if (tasks.length === 0) {
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
      const handleAuth = (ws: any) => {
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