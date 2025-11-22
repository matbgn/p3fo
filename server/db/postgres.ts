import { Pool, PoolClient } from 'pg';
import { DbClient } from './index.js';
import {
  TaskEntity,
  UserSettingsEntity,
  AppSettingsEntity,
  QolSurveyResponseEntity,
  FilterStateEntity
} from '../../src/lib/persistence-types.js';

// Default values
const DEFAULT_USER_SETTINGS: UserSettingsEntity = {
  userId: 'default-user',
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

export async function createPostgresClient(connectionString?: string): Promise<DbClient> {
  // Use connection string from parameter or environment variable
  const dbUrl = connectionString || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('Database connection string not provided. Set DATABASE_URL environment variable or pass as parameter.');
  }

  const pool = new Pool({
    connectionString: dbUrl,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  });

  return new PostgresClient(pool);
}

class PostgresClient implements DbClient {
  constructor(private pool: Pool) { }

  async initialize(): Promise<void> {
    // Create tasks table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        title TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        triage_status TEXT NOT NULL,
        urgent BOOLEAN DEFAULT false,
        impact BOOLEAN DEFAULT false,
        major_incident BOOLEAN DEFAULT false,
        difficulty REAL DEFAULT 1,
        timer JSONB, -- JSONB for efficient JSON operations
        category TEXT DEFAULT 'General',
        termination_date TIMESTAMP WITH TIME ZONE,
        comment TEXT,
        duration_in_minutes INTEGER,
        priority INTEGER,
        user_id TEXT,
        FOREIGN KEY (parent_id) REFERENCES tasks (id) ON DELETE SET NULL
      )
    `);

    // Create user_settings table (single row)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        username TEXT NOT NULL,
        logo TEXT,
        has_completed_onboarding BOOLEAN DEFAULT false,
        workload_percentage REAL DEFAULT 60,
        split_time TEXT DEFAULT '13:00'
      )
    `);

    // Migration: Add columns if they don't exist
    try {
      await this.pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='workload_percentage') THEN 
            ALTER TABLE user_settings ADD COLUMN workload_percentage REAL DEFAULT 60; 
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='split_time') THEN 
            ALTER TABLE user_settings ADD COLUMN split_time TEXT DEFAULT '13:00'; 
          END IF;
        END $$;
      `);
    } catch (error) {
      console.error('PostgreSQL: Error checking/migrating schema:', error);
    }

    // Insert default user settings if not exists
    const userSettingsResult = await this.pool.query('SELECT COUNT(*) as count FROM user_settings');
    if (parseInt(userSettingsResult.rows[0].count) === 0) {
      await this.pool.query(`
        INSERT INTO user_settings (id, username, logo, has_completed_onboarding, workload_percentage, split_time) 
        VALUES (1, $1, $2, $3, $4, $5)
      `, [DEFAULT_USER_SETTINGS.username, DEFAULT_USER_SETTINGS.logo, DEFAULT_USER_SETTINGS.has_completed_onboarding, 60, '13:00']);
    }

    // Create app_settings table (single row)
    await this.pool.query(`
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
    const appSettingsResult = await this.pool.query('SELECT COUNT(*) as count FROM app_settings');
    if (parseInt(appSettingsResult.rows[0].count) === 0) {
      await this.pool.query(`
        INSERT INTO app_settings (id, split_time, user_workload_percentage, weeks_computation, 
                                  high_impact_task_goal, failure_rate_goal, qli_goal, new_capabilities_goal) 
        VALUES (1, $1, $2, $3, $4, $5, $6, $7)
      `, [
        DEFAULT_APP_SETTINGS.split_time,
        DEFAULT_APP_SETTINGS.user_workload_percentage,
        DEFAULT_APP_SETTINGS.weeks_computation,
        DEFAULT_APP_SETTINGS.high_impact_task_goal,
        DEFAULT_APP_SETTINGS.failure_rate_goal,
        DEFAULT_APP_SETTINGS.qli_goal,
        DEFAULT_APP_SETTINGS.new_capabilities_goal
      ]);
    }

    // Create qol_survey table (single row)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS qol_survey (
        id INTEGER PRIMARY KEY DEFAULT 1,
        responses JSONB -- JSONB for efficient JSON operations
      )
    `);

    // Create filters table (single row)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS filters (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data JSONB -- JSONB for efficient JSON operations
      )
    `);
  }

  async testConnection(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Tasks
  async getTasks(): Promise<TaskEntity[]> {
    const result = await this.pool.query(`
      SELECT * FROM tasks ORDER BY priority DESC NULLS LAST, created_at ASC
    `);

    return result.rows.map(row => ({
      id: row.id,
      parent_id: row.parent_id,
      title: row.title,
      created_at: row.created_at,
      triage_status: row.triage_status,
      urgent: row.urgent,
      impact: row.impact,
      major_incident: row.major_incident,
      difficulty: row.difficulty,
      timer: row.timer || { startTime: null, elapsedTime: 0, isRunning: false },
      category: row.category,
      termination_date: row.termination_date,
      comment: row.comment,
      duration_in_minutes: row.duration_in_minutes,
      priority: row.priority,
      user_id: row.user_id,
    }));
  }

  async getTaskById(id: string): Promise<TaskEntity | null> {
    const result = await this.pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      parent_id: row.parent_id,
      title: row.title,
      created_at: row.created_at,
      triage_status: row.triage_status,
      urgent: row.urgent,
      impact: row.impact,
      major_incident: row.major_incident,
      difficulty: row.difficulty,
      timer: row.timer || { startTime: null, elapsedTime: 0, isRunning: false },
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

    await this.pool.query(`
      INSERT INTO tasks (id, parent_id, title, created_at, triage_status, urgent, impact, major_incident, 
                         difficulty, timer, category, termination_date, comment, duration_in_minutes, priority, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      newTask.id,
      newTask.parent_id,
      newTask.title,
      newTask.created_at,
      newTask.triage_status,
      newTask.urgent,
      newTask.impact,
      newTask.major_incident,
      newTask.difficulty,
      newTask.timer,
      newTask.category,
      newTask.termination_date,
      newTask.comment,
      newTask.duration_in_minutes,
      newTask.priority,
      newTask.user_id,
    ]);

    return newTask;
  }

  async updateTask(id: string, data: Partial<TaskEntity>): Promise<TaskEntity | null> {
    console.log('PostgreSQL: updateTask called with:', { id, data });

    // First get the current task
    const currentTask = await this.getTaskById(id);
    if (!currentTask) {
      console.error('PostgreSQL: Task not found:', id);
      return null;
    }

    // Merge with existing task
    const updatedTask = { ...currentTask, ...data };
    console.log('PostgreSQL: Updated task object:', updatedTask);

    const params = [
      updatedTask.parent_id,
      updatedTask.title,
      updatedTask.triage_status,
      updatedTask.urgent,
      updatedTask.impact,
      updatedTask.major_incident,
      updatedTask.difficulty,
      updatedTask.timer,
      updatedTask.category,
      updatedTask.termination_date,
      updatedTask.comment,
      updatedTask.duration_in_minutes,
      updatedTask.priority,
      updatedTask.user_id,
      id
    ];

    console.log('PostgreSQL: Executing update with params:', JSON.stringify(params, null, 2));

    const result = await this.pool.query(`
      UPDATE tasks
      SET parent_id = $1, title = $2, triage_status = $3, urgent = $4,
          impact = $5, major_incident = $6, difficulty = $7, timer = $8,
          category = $9, termination_date = $10, comment = $11,
          duration_in_minutes = $12, priority = $13, user_id = $14
      WHERE id = $15
    `, params);

    console.log('PostgreSQL: Update result:', result);
    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    await this.pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  }

  async bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void> {
    // Use a transaction to update all priorities at once
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const { id, priority } of items) {
        await client.query(
          'UPDATE tasks SET priority = $1 WHERE id = $2',
          [priority, id]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async clearAllTasks(): Promise<void> {
    await this.pool.query('DELETE FROM tasks');
  }

  async importTasks(tasks: TaskEntity[]): Promise<void> {
    // Use a transaction to import all tasks at once
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const task of tasks) {
        await client.query(`
          INSERT INTO tasks (id, parent_id, title, created_at, triage_status, urgent, impact, major_incident, 
                             difficulty, timer, category, termination_date, comment, duration_in_minutes, priority, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            title = EXCLUDED.title,
            triage_status = EXCLUDED.triage_status,
            urgent = EXCLUDED.urgent,
            impact = EXCLUDED.impact,
            major_incident = EXCLUDED.major_incident,
            difficulty = EXCLUDED.difficulty,
            timer = EXCLUDED.timer,
            category = EXCLUDED.category,
            termination_date = EXCLUDED.termination_date,
            comment = EXCLUDED.comment,
            duration_in_minutes = EXCLUDED.duration_in_minutes,
            priority = EXCLUDED.priority,
            user_id = EXCLUDED.user_id
        `, [
          task.id,
          task.parent_id,
          task.title,
          task.created_at,
          task.triage_status,
          task.urgent,
          task.impact,
          task.major_incident,
          task.difficulty,
          task.timer,
          task.category,
          task.termination_date,
          task.comment,
          task.duration_in_minutes,
          task.priority,
          task.user_id,
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // User settings
  async getUserSettings(userId: string): Promise<UserSettingsEntity | null> {
    const result = await this.pool.query('SELECT * FROM user_settings WHERE id = 1'); // TODO: Use userId when table supports it
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        userId: userId, // Return requested userId as we don't store it yet in this table schema
        username: row.username,
        logo: row.logo,
        has_completed_onboarding: row.has_completed_onboarding,
        workload_percentage: row.workload_percentage,
        split_time: row.split_time,
      };
    }
    return null;
  }

  async updateUserSettings(userId: string, data: Partial<UserSettingsEntity>): Promise<UserSettingsEntity> {
    const current = await this.getUserSettings(userId) || { ...DEFAULT_USER_SETTINGS, userId };
    const updated = { ...current, ...data, userId };

    await this.pool.query(`
      INSERT INTO user_settings (id, username, logo, has_completed_onboarding, workload_percentage, split_time)
      VALUES (1, $1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        logo = EXCLUDED.logo,
        has_completed_onboarding = EXCLUDED.has_completed_onboarding,
        workload_percentage = EXCLUDED.workload_percentage,
        split_time = EXCLUDED.split_time
    `, [
      updated.username,
      updated.logo,
      updated.has_completed_onboarding,
      updated.workload_percentage,
      updated.split_time
    ]);

    return updated;
  }

  // App settings
  async getAppSettings(): Promise<AppSettingsEntity> {
    const result = await this.pool.query('SELECT * FROM app_settings WHERE id = 1');
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        split_time: row.split_time,
        user_workload_percentage: row.user_workload_percentage,
        weeks_computation: row.weeks_computation,
        high_impact_task_goal: row.high_impact_task_goal,
        failure_rate_goal: row.failure_rate_goal,
        qli_goal: row.qli_goal,
        new_capabilities_goal: row.new_capabilities_goal,
      };
    }
    return DEFAULT_APP_SETTINGS;
  }

  async updateAppSettings(data: Partial<AppSettingsEntity>): Promise<AppSettingsEntity> {
    const current = await this.getAppSettings();
    const updated = { ...current, ...data };

    await this.pool.query(`
      INSERT INTO app_settings (id, split_time, user_workload_percentage, weeks_computation, 
                                high_impact_task_goal, failure_rate_goal, qli_goal, new_capabilities_goal)
      VALUES (1, $1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        split_time = EXCLUDED.split_time,
        user_workload_percentage = EXCLUDED.user_workload_percentage,
        weeks_computation = EXCLUDED.weeks_computation,
        high_impact_task_goal = EXCLUDED.high_impact_task_goal,
        failure_rate_goal = EXCLUDED.failure_rate_goal,
        qli_goal = EXCLUDED.qli_goal,
        new_capabilities_goal = EXCLUDED.new_capabilities_goal
    `, [
      updated.split_time,
      updated.user_workload_percentage,
      updated.weeks_computation,
      updated.high_impact_task_goal,
      updated.failure_rate_goal,
      updated.qli_goal,
      updated.new_capabilities_goal
    ]);

    return updated;
  }

  async listUsers(): Promise<UserSettingsEntity[]> {
    const result = await this.pool.query('SELECT * FROM user_settings');
    return result.rows.map(row => ({
      userId: row.user_id, // Note: Postgres returns column names as is
      username: row.username,
      logo: row.logo,
      has_completed_onboarding: row.has_completed_onboarding,
    }));
  }

  async migrateUser(oldUserId: string, newUserId: string): Promise<void> {
    // 1. Migrate tasks
    await this.pool.query('UPDATE tasks SET user_id = $1 WHERE user_id = $2', [newUserId, oldUserId]);

    // 2. Migrate user settings
    // Since we only have 1 row in user_settings currently, we don't really "migrate" rows.

    console.log(`PostgreSQL: Migrated data from ${oldUserId} to ${newUserId}`);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
  }

  async clearAllUsers(): Promise<void> {
    await this.pool.query('DELETE FROM user_settings');
  }

  // QoL survey
  async getQolSurveyResponse(): Promise<QolSurveyResponseEntity | null> {
    const result = await this.pool.query('SELECT responses FROM qol_survey WHERE id = 1');
    if (result.rows.length > 0 && result.rows[0].responses) {
      return result.rows[0].responses;
    }
    return null;
  }

  async saveQolSurveyResponse(data: QolSurveyResponseEntity): Promise<void> {
    await this.pool.query(`
      INSERT INTO qol_survey (id, responses)
      VALUES (1, $1)
      ON CONFLICT (id) DO UPDATE SET responses = EXCLUDED.responses
    `, [data]);
  }

  // Filters
  async getFilters(): Promise<FilterStateEntity | null> {
    const result = await this.pool.query('SELECT data FROM filters WHERE id = 1');
    if (result.rows.length > 0 && result.rows[0].data) {
      return result.rows[0].data;
    }
    return null;
  }

  async saveFilters(data: FilterStateEntity): Promise<void> {
    await this.pool.query(`
      INSERT INTO filters (id, data)
      VALUES (1, $1)
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
    `, [data]);
  }

  async clearFilters(): Promise<void> {
    await this.pool.query('DELETE FROM filters WHERE id = 1');
  }
}