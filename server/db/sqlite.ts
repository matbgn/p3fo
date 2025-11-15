import Database from 'better-sqlite3';
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
  username: 'User',
  logo: '',
  has_completed_onboarding: false,
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

export async function createSqliteClient(dbFile: string = './p3fo.db'): Promise<DbClient> {
  const db = new Database(dbFile);

  // Enable WAL mode for better concurrency
  db.exec('PRAGMA journal_mode = WAL;');

  return new SqliteClient(db);
}

class SqliteClient implements DbClient {
  constructor(private db: Database.Database) {}

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
        has_completed_onboarding BOOLEAN DEFAULT 0
      )
    `);

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
      `).run(DEFAULT_APP_SETTINGS);
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
  async getTasks(): Promise<TaskEntity[]> {
    const rows = this.db.prepare(`
      SELECT * FROM tasks ORDER BY priority DESC, created_at ASC
    `).all() as any[];

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
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
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
  }

 async createTask(task: Partial<TaskEntity>): Promise<TaskEntity> {
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

    this.db.prepare(`
      INSERT INTO tasks (id, parent_id, title, created_at, triage_status, urgent, impact, major_incident, 
                         difficulty, timer, category, termination_date, comment, duration_in_minutes, priority, user_id)
      VALUES (@id, @parent_id, @title, @created_at, @triage_status, @urgent, @impact, @major_incident,
              @difficulty, @timer, @category, @termination_date, @comment, @duration_in_minutes, @priority, @user_id)
    `).run({
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
    });

    return newTask;
  }

  async updateTask(id: string, data: Partial<TaskEntity>): Promise<TaskEntity | null> {
    // First get the current task
    const currentTask = await this.getTaskById(id);
    if (!currentTask) return null;

    // Merge with existing task
    const updatedTask = { ...currentTask, ...data };

    this.db.prepare(`
      UPDATE tasks 
      SET parent_id = @parent_id, title = @title, triage_status = @triage_status, urgent = @urgent, 
          impact = @impact, major_incident = @major_incident, difficulty = @difficulty, timer = @timer,
          category = @category, termination_date = @termination_date, comment = @comment,
          duration_in_minutes = @duration_in_minutes, priority = @priority, user_id = @user_id
      WHERE id = @id
    `).run({
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
    });

    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    // Delete children first (in case of foreign key constraints with cascade)
    // Or delete all related tasks in a transaction
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
 }

  async bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void> {
    const stmt = this.db.prepare('UPDATE tasks SET priority = ? WHERE id = ?');
    const transaction = this.db.transaction((items) => {
      for (const { id, priority } of items) {
        stmt.run(priority, id);
      }
    });
    transaction(items);
  }

  async clearAllTasks(): Promise<void> {
    this.db.prepare('DELETE FROM tasks').run();
  }

  async importTasks(tasks: TaskEntity[]): Promise<void> {
    const transaction = this.db.transaction((tasks) => {
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
    });
    
    transaction(tasks);
  }

  // User settings
  async getUserSettings(userId: string): Promise<UserSettingsEntity | null> {
    const row = this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      username: row.username,
      logo: row.logo,
      has_completed_onboarding: Boolean(row.has_completed_onboarding),
    };
  }

  async updateUserSettings(userId: string, data: Partial<UserSettingsEntity>): Promise<UserSettingsEntity> {
    const current = await this.getUserSettings(userId) || { ...DEFAULT_USER_SETTINGS, userId };
    const updated = { ...current, ...data, userId };

    this.db.prepare(`
      INSERT INTO user_settings (user_id, username, logo, has_completed_onboarding)
      VALUES (@userId, @username, @logo, @has_completed_onboarding)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        logo = excluded.logo,
        has_completed_onboarding = excluded.has_completed_onboarding
    `).run({
      userId: updated.userId,
      username: updated.username,
      logo: updated.logo,
      has_completed_onboarding: updated.has_completed_onboarding ? 1 : 0,
    });

    return updated;
  }

  // App settings
 async getAppSettings(): Promise<AppSettingsEntity> {
    const row = this.db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as any;
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
    const row = this.db.prepare('SELECT responses FROM qol_survey WHERE id = 1').get() as any;
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
    const row = this.db.prepare('SELECT data FROM filters WHERE id = 1').get() as any;
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