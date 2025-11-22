import { DatabaseSync } from 'node:sqlite';
import { DbClient } from './index';
import {
  TaskEntity,
  UserSettingsEntity,
  AppSettingsEntity,
  QolSurveyResponseEntity,
  FilterStateEntity
} from '../../src/lib/persistence-types';

// Default values
const DEFAULT_USER_SETTINGS: UserSettingsEntity = {
  userId: 'default-user',
  username: 'User',
  logo: '',
  has_completed_onboarding: false,
  workload_percentage: 60,
  split_time: '13:00',
};

const DEFAULT_APP_SETTINGS: AppSettingsEntity = {
  split_time: 40,
  user_workload_percentage: 80,
  weeks_computation: 4,
  high_impact_task_goal: 5,
  failure_rate_goal: 10,
  qli_goal: 7,
  new_capabilities_goal: 3,
};

interface TaskRow {
  id: string;
  parent_id: string | null;
  title: string;
  created_at: string;
  triage_status: string;
  urgent: number;
  impact: number;
  major_incident: number;
  difficulty: number;
  timer: string | null;
  category: string;
  termination_date: string | null;
  comment: string | null;
  duration_in_minutes: number | null;
  priority: number | null;
  user_id: string | null;
}

interface UserSettingsRow {
  user_id: string;
  username: string;
  logo: string;
  has_completed_onboarding: number;
  workload_percentage: number;
  split_time: string;
}

interface AppSettingsRow {
  split_time: number;
  user_workload_percentage: number;
  weeks_computation: number;
  high_impact_task_goal: number;
  failure_rate_goal: number;
  qli_goal: number;
  new_capabilities_goal: number;
}

interface JsonRow {
  data?: string;
  responses?: string;
}

export async function createSqliteClient(dbFile: string = './p3fo.db'): Promise<DbClient> {
  const db = new DatabaseSync(dbFile);

  // Enable WAL mode for better concurrency
  db.exec('PRAGMA journal_mode = WAL;');

  return new SqliteClient(db);
}

class SqliteClient implements DbClient {
  constructor(private db: DatabaseSync) { }

  async initialize(): Promise<void> {
    // Create tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        triage_status TEXT NOT NULL,
        urgent BOOLEAN DEFAULT 0,
        impact BOOLEAN DEFAULT 0,
        major_incident BOOLEAN DEFAULT 0,
        difficulty REAL DEFAULT 1,
        timer TEXT, -- JSON string
        category TEXT DEFAULT 'General',
        termination_date TEXT,
        comment TEXT,
        duration_in_minutes INTEGER,
        priority INTEGER,
        user_id TEXT,
        FOREIGN KEY (parent_id) REFERENCES tasks (id)
      )
    `);

    // Create user_settings table (single row)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        logo TEXT,
        has_completed_onboarding BOOLEAN DEFAULT 0,
        workload_percentage REAL DEFAULT 60,
        split_time TEXT DEFAULT '13:00'
      )
    `);

    // Migration: Add workload_percentage if it doesn't exist
    try {
      const columns = this.db.prepare("PRAGMA table_info(user_settings)").all() as { name: string }[];
      const hasWorkload = columns.some(c => c.name === 'workload_percentage');
      const hasSplitTime = columns.some(c => c.name === 'split_time');

      if (!hasWorkload) {
        console.log('SQLite: Migrating user_settings, adding workload_percentage');
        this.db.exec("ALTER TABLE user_settings ADD COLUMN workload_percentage REAL DEFAULT 60");
      }

      if (!hasSplitTime) {
        console.log('SQLite: Migrating user_settings, adding split_time');
        this.db.exec("ALTER TABLE user_settings ADD COLUMN split_time TEXT DEFAULT '13:00'");
      }
    } catch (error) {
      console.error('SQLite: Error checking/migrating schema:', error);
    }

    // Create app_settings table (single row)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        split_time REAL DEFAULT 40,
        user_workload_percentage REAL DEFAULT 80,
        weeks_computation REAL DEFAULT 4,
        high_impact_task_goal REAL DEFAULT 5,
        failure_rate_goal REAL DEFAULT 10,
        qli_goal REAL DEFAULT 7,
        new_capabilities_goal REAL DEFAULT 3
      )
    `);

    // Insert default app settings if not exists
    const appSettingsCount = this.db.prepare('SELECT COUNT(*) as count FROM app_settings').get() as { count: number };
    if (appSettingsCount.count === 0) {
      this.db.prepare(`
        INSERT INTO app_settings (id, split_time, user_workload_percentage, weeks_computation, 
                                  high_impact_task_goal, failure_rate_goal, qli_goal, new_capabilities_goal) 
        VALUES (1, @split_time, @user_workload_percentage, @weeks_computation, 
                @high_impact_task_goal, @failure_rate_goal, @qli_goal, @new_capabilities_goal)
      `).run(DEFAULT_APP_SETTINGS as unknown as Record<string, string | number | null>);
    }

    // Create qol_survey table (single row)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS qol_survey (
        id INTEGER PRIMARY KEY DEFAULT 1,
        responses TEXT -- JSON string
      )
    `);

    // Create filters table (single row)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS filters (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data TEXT -- JSON string
      )
    `);
  }

  async testConnection(): Promise<void> {
    this.db.prepare('SELECT 1').run();
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // Tasks
  async getTasks(userId?: string): Promise<TaskEntity[]> {
    let query = 'SELECT * FROM tasks';
    const params: (string | number)[] = [];

    if (userId) {
      query += ' WHERE user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY priority DESC, created_at ASC';

    const rows = this.db.prepare(query).all(...params) as unknown as TaskRow[];

    return rows.map(row => ({
      id: row.id,
      parent_id: row.parent_id,
      title: row.title,
      created_at: row.created_at,
      triage_status: row.triage_status,
      urgent: Boolean(row.urgent),
      impact: Boolean(row.impact),
      major_incident: Boolean(row.major_incident),
      difficulty: row.difficulty,
      timer: row.timer ? JSON.parse(row.timer) : [],
      category: row.category,
      termination_date: row.termination_date,
      comment: row.comment,
      duration_in_minutes: row.duration_in_minutes,
      priority: row.priority,
      user_id: row.user_id,
    }));
  }

  async getTaskById(id: string): Promise<TaskEntity | null> {
    console.log('SQLite: getTaskById called with id:', id);

    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    console.log('SQLite: getTaskById result:', row);

    if (!row) {
      console.log('SQLite: Task not found in database:', id);
      return null;
    }

    const task = {
      id: row.id,
      parent_id: row.parent_id,
      title: row.title,
      created_at: row.created_at,
      triage_status: row.triage_status,
      urgent: Boolean(row.urgent),
      impact: Boolean(row.impact),
      major_incident: Boolean(row.major_incident),
      difficulty: row.difficulty,
      timer: row.timer ? JSON.parse(row.timer) : [],
      category: row.category,
      termination_date: row.termination_date,
      comment: row.comment,
      duration_in_minutes: row.duration_in_minutes,
      priority: row.priority,
      user_id: row.user_id,
    };

    console.log('SQLite: Task found:', task);
    return task;
  }

  async createTask(task: Partial<TaskEntity>): Promise<TaskEntity> {
    console.log('SQLite: createTask called with:', task);

    const newTask: TaskEntity = {
      id: task.id || crypto.randomUUID(),
      title: task.title || 'New Task',
      created_at: task.created_at || new Date().toISOString(),
      triage_status: task.triage_status || 'backlog',
      urgent: task.urgent || false,
      impact: task.impact || false,
      major_incident: task.major_incident || false,
      difficulty: task.difficulty || 1,
      timer: task.timer || [],
      category: task.category || 'General',
      termination_date: task.termination_date || null,
      comment: task.comment || null,
      duration_in_minutes: task.duration_in_minutes || null,
      priority: task.priority || null,
      user_id: task.user_id || null,
      parent_id: task.parent_id || null,
    };

    console.log('SQLite: Creating task:', newTask);

    const stmt = this.db.prepare(`
     INSERT INTO tasks (id, parent_id, title, created_at, triage_status, urgent, impact, major_incident,
                        difficulty, timer, category, termination_date, comment, duration_in_minutes, priority, user_id)
     VALUES (@id, @parent_id, @title, @created_at, @triage_status, @urgent, @impact, @major_incident,
             @difficulty, @timer, @category, @termination_date, @comment, @duration_in_minutes, @priority, @user_id)
   `);

    const params = {
      id: newTask.id,
      parent_id: newTask.parent_id,
      title: newTask.title,
      created_at: newTask.created_at,
      triage_status: newTask.triage_status,
      urgent: newTask.urgent ? 1 : 0,
      impact: newTask.impact ? 1 : 0,
      major_incident: newTask.major_incident ? 1 : 0,
      difficulty: newTask.difficulty,
      timer: JSON.stringify(newTask.timer),
      category: newTask.category,
      termination_date: newTask.termination_date,
      comment: newTask.comment,
      duration_in_minutes: newTask.duration_in_minutes,
      priority: newTask.priority,
      user_id: newTask.user_id,
    };

    console.log('SQLite: Executing insert with params:', JSON.stringify(params, null, 2));

    const result = stmt.run(params);
    console.log('SQLite: Insert result:', result);

    return newTask;
  }

  async updateTask(id: string, data: Partial<TaskEntity>): Promise<TaskEntity | null> {
    console.log('SQLite: updateTask called with:', { id, data });

    // First get the current task
    const currentTask = await this.getTaskById(id);
    if (!currentTask) {
      console.error('SQLite: Task not found:', id);
      return null;
    }

    // Merge with existing task
    const updatedTask = { ...currentTask, ...data };
    console.log('SQLite: Updated task object:', updatedTask);

    const stmt = this.db.prepare(`
      UPDATE tasks
      SET parent_id = @parent_id, title = @title, triage_status = @triage_status, urgent = @urgent,
          impact = @impact, major_incident = @major_incident, difficulty = @difficulty, timer = @timer,
          category = @category, termination_date = @termination_date, comment = @comment,
          duration_in_minutes = @duration_in_minutes, priority = @priority, user_id = @user_id
      WHERE id = @id
    `);

    const params = {
      id,
      parent_id: updatedTask.parent_id,
      title: updatedTask.title,
      triage_status: updatedTask.triage_status,
      urgent: updatedTask.urgent ? 1 : 0,
      impact: updatedTask.impact ? 1 : 0,
      major_incident: updatedTask.major_incident ? 1 : 0,
      difficulty: updatedTask.difficulty,
      timer: JSON.stringify(updatedTask.timer),
      category: updatedTask.category,
      termination_date: updatedTask.termination_date,
      comment: updatedTask.comment,
      duration_in_minutes: updatedTask.duration_in_minutes,
      priority: updatedTask.priority,
      user_id: updatedTask.user_id,
    };

    console.log('SQLite: Executing update with params:', JSON.stringify(params, null, 2));

    const result = stmt.run(params);
    console.log('SQLite: Update result:', result);

    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    console.log('SQLite: deleteTask called with id:', id);

    const deleteRecursive = (taskId: string) => {
      const children = this.db.prepare('SELECT id FROM tasks WHERE parent_id = ?').all(taskId) as { id: string }[];
      if (children.length > 0) {
        console.log(`SQLite: Deleting children of task ${taskId}:`, children.map(c => c.id));
        for (const child of children) {
          deleteRecursive(child.id);
        }
      }

      const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
      console.log(`SQLite: Deleted task ${taskId}, result:`, result);
    };

    this.db.exec('BEGIN');
    try {
      deleteRecursive(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void> {
    const stmt = this.db.prepare('UPDATE tasks SET priority = ? WHERE id = ?');
    // node:sqlite doesn't have a transaction helper like better-sqlite3, so we use BEGIN/COMMIT
    this.db.exec('BEGIN');
    try {
      for (const { id, priority } of items) {
        stmt.run(priority ?? null, id);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async clearAllTasks(): Promise<void> {
    this.db.prepare('DELETE FROM tasks').run();
  }

  async importTasks(tasks: TaskEntity[]): Promise<void> {
    this.db.exec('BEGIN');
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO tasks (id, parent_id, title, created_at, triage_status, urgent, impact, major_incident, 
                         difficulty, timer, category, termination_date, comment, duration_in_minutes, priority, user_id)
        VALUES (@id, @parent_id, @title, @created_at, @triage_status, @urgent, @impact, @major_incident,
                @difficulty, @timer, @category, @termination_date, @comment, @duration_in_minutes, @priority, @user_id)
      `);

      for (const task of tasks) {
        stmt.run({
          id: task.id,
          parent_id: task.parent_id,
          title: task.title,
          created_at: task.created_at,
          triage_status: task.triage_status,
          urgent: task.urgent ? 1 : 0,
          impact: task.impact ? 1 : 0,
          major_incident: task.major_incident ? 1 : 0,
          difficulty: task.difficulty,
          timer: JSON.stringify(task.timer),
          category: task.category,
          termination_date: task.termination_date,
          comment: task.comment,
          duration_in_minutes: task.duration_in_minutes,
          priority: task.priority,
          user_id: task.user_id,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // User settings
  async getUserSettings(userId: string): Promise<UserSettingsEntity | null> {
    const row = this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as UserSettingsRow | undefined;
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      username: row.username,
      logo: row.logo,
      has_completed_onboarding: Boolean(row.has_completed_onboarding),
      workload_percentage: row.workload_percentage,
      split_time: row.split_time,
    };
  }

  async updateUserSettings(userId: string, data: Partial<UserSettingsEntity>): Promise<UserSettingsEntity> {
    const current = await this.getUserSettings(userId) || { ...DEFAULT_USER_SETTINGS, userId };
    const updated = { ...current, ...data, userId };

    this.db.prepare(`
      INSERT INTO user_settings (user_id, username, logo, has_completed_onboarding, workload_percentage, split_time)
      VALUES (@userId, @username, @logo, @has_completed_onboarding, @workload_percentage, @split_time)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        logo = excluded.logo,
        has_completed_onboarding = excluded.has_completed_onboarding,
        workload_percentage = excluded.workload_percentage,
        split_time = excluded.split_time
    `).run({
      userId: updated.userId,
      username: updated.username,
      logo: updated.logo,
      has_completed_onboarding: updated.has_completed_onboarding ? 1 : 0,
      workload_percentage: updated.workload_percentage ?? null,
      split_time: updated.split_time ?? null,
    });

    return updated;
  }

  async listUsers(): Promise<UserSettingsEntity[]> {
    const rows = this.db.prepare('SELECT * FROM user_settings').all() as unknown as UserSettingsRow[];
    return rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      logo: row.logo,
      has_completed_onboarding: Boolean(row.has_completed_onboarding),
      workload_percentage: row.workload_percentage,
      split_time: row.split_time,
    }));
  }

  async migrateUser(oldUserId: string, newUserId: string): Promise<void> {
    this.db.exec('BEGIN');
    try {
      // 1. Migrate tasks
      this.db.prepare('UPDATE tasks SET user_id = ? WHERE user_id = ?').run(newUserId, oldUserId);

      // 2. Migrate settings
      // Check if new user settings exist
      const newSettings = this.db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(newUserId);

      if (!newSettings) {
        // If new user settings don't exist, move old settings to new user
        this.db.prepare('UPDATE user_settings SET user_id = ? WHERE user_id = ?').run(newUserId, oldUserId);
      } else {
        // If new user settings exist, delete old settings (merging is complex, we assume target settings prevail)
        this.db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(oldUserId);
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async clearAllUsers(): Promise<void> {
    this.db.prepare('DELETE FROM user_settings').run();
  }

  // App settings
  async getAppSettings(): Promise<AppSettingsEntity> {
    const row = this.db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettingsRow | undefined;
    return row ? {
      split_time: row.split_time,
      user_workload_percentage: row.user_workload_percentage,
      weeks_computation: row.weeks_computation,
      high_impact_task_goal: row.high_impact_task_goal,
      failure_rate_goal: row.failure_rate_goal,
      qli_goal: row.qli_goal,
      new_capabilities_goal: row.new_capabilities_goal,
    } : DEFAULT_APP_SETTINGS;
  }

  async updateAppSettings(data: Partial<AppSettingsEntity>): Promise<AppSettingsEntity> {
    const current = await this.getAppSettings();
    const updated = { ...current, ...data };

    this.db.prepare(`
      UPDATE app_settings 
      SET split_time = @split_time, user_workload_percentage = @user_workload_percentage,
          weeks_computation = @weeks_computation, high_impact_task_goal = @high_impact_task_goal,
          failure_rate_goal = @failure_rate_goal, qli_goal = @qli_goal,
          new_capabilities_goal = @new_capabilities_goal
      WHERE id = 1
    `).run({
      split_time: updated.split_time,
      user_workload_percentage: updated.user_workload_percentage,
      weeks_computation: updated.weeks_computation,
      high_impact_task_goal: updated.high_impact_task_goal,
      failure_rate_goal: updated.failure_rate_goal,
      qli_goal: updated.qli_goal,
      new_capabilities_goal: updated.new_capabilities_goal,
    });

    return updated;
  }

  // QoL survey
  async getQolSurveyResponse(): Promise<QolSurveyResponseEntity | null> {
    const row = this.db.prepare('SELECT responses FROM qol_survey WHERE id = 1').get() as JsonRow | undefined;
    return row?.responses ? JSON.parse(row.responses) : null;
  }

  async saveQolSurveyResponse(data: QolSurveyResponseEntity): Promise<void> {
    // Check if row exists
    const exists = this.db.prepare('SELECT id FROM qol_survey WHERE id = 1').get();
    if (exists) {
      this.db.prepare('UPDATE qol_survey SET responses = ? WHERE id = 1').run(JSON.stringify(data));
    } else {
      this.db.prepare('INSERT INTO qol_survey (id, responses) VALUES (1, ?)').run(JSON.stringify(data));
    }
  }

  // Filters
  async getFilters(): Promise<FilterStateEntity | null> {
    const row = this.db.prepare('SELECT data FROM filters WHERE id = 1').get() as JsonRow | undefined;
    return row?.data ? JSON.parse(row.data) : null;
  }

  async saveFilters(data: FilterStateEntity): Promise<void> {
    // Check if row exists
    const exists = this.db.prepare('SELECT id FROM filters WHERE id = 1').get();
    if (exists) {
      this.db.prepare('UPDATE filters SET data = ? WHERE id = 1').run(JSON.stringify(data));
    } else {
      this.db.prepare('INSERT INTO filters (id, data) VALUES (1, ?)').run(JSON.stringify(data));
    }
  }

  async clearFilters(): Promise<void> {
    this.db.prepare('DELETE FROM filters WHERE id = 1').run();
  }
}