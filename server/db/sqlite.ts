import { DatabaseSync } from 'node:sqlite';
import { DbClient } from './index.js';
import type {
  TaskEntity,
  UserSettingsEntity,
  AppSettingsEntity,
  QolSurveyResponseEntity,
  FilterStateEntity,
  FertilizationBoardEntity,
  DreamBoardEntity
} from '../../src/lib/persistence-types.js';

// Default values
const DEFAULT_USER_SETTINGS: UserSettingsEntity = {
  userId: 'default-user',
  username: 'User',
  logo: '',
  has_completed_onboarding: false,
  workload: 60,
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
  hours_to_be_done_by_day: 8,
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
  workload?: number; // Added to match entity and migration
  split_time: string;
  monthly_balances: string; // JSON string
  card_compactness: number;
}

interface AppSettingsRow {
  split_time: number;
  user_workload_percentage: number;
  weeks_computation: number;
  high_impact_task_goal: number;
  failure_rate_goal: number;
  qli_goal: number;
  new_capabilities_goal: number;
  hours_to_be_done_by_day: number;
  vacation_limit_multiplier?: number;
  hourly_balance_limit_upper?: number;
  hourly_balance_limit_lower?: number;
  timezone?: string;
  country?: string;
  region?: string;
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
      CREATE TABLE IF NOT EXISTS tasks(
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
        FOREIGN KEY(parent_id) REFERENCES tasks(id)
      )
    `);

    // Create user_settings table (single row)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_settings(
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        logo TEXT,
        has_completed_onboarding BOOLEAN DEFAULT 0,
        workload_percentage REAL DEFAULT 60,
        workload REAL DEFAULT 60,
        split_time TEXT DEFAULT '13:00',
        monthly_balances TEXT, -- JSON string
        card_compactness INTEGER DEFAULT 0
      )
    `);

    // Migration: Add columns if they don't exist
    try {
      const columns = this.db.prepare("PRAGMA table_info(user_settings)").all() as { name: string }[];
      const hasWorkloadPercentage = columns.some(c => c.name === 'workload_percentage');
      const hasWorkload = columns.some(c => c.name === 'workload');
      const hasSplitTime = columns.some(c => c.name === 'split_time');
      const hasMonthlyBalances = columns.some(c => c.name === 'monthly_balances');
      const hasTimezone = columns.some(c => c.name === 'timezone');
      const hasCardCompactness = columns.some(c => c.name === 'card_compactness');

      if (!hasWorkloadPercentage) {
        console.log('SQLite: Migrating user_settings, adding workload_percentage');
        this.db.exec("ALTER TABLE user_settings ADD COLUMN workload_percentage REAL DEFAULT 60");
      }

      if (!hasWorkload) {
        console.log('SQLite: Migrating user_settings, adding workload');
        this.db.exec("ALTER TABLE user_settings ADD COLUMN workload REAL DEFAULT 60");
        // Migrate data from workload_percentage if it exists
        if (hasWorkloadPercentage) {
          this.db.exec("UPDATE user_settings SET workload = workload_percentage WHERE workload IS NULL");
        }
      }

      if (!hasSplitTime) {
        console.log('SQLite: Migrating user_settings, adding split_time');
        this.db.exec("ALTER TABLE user_settings ADD COLUMN split_time TEXT DEFAULT '13:00'");
      }

      if (!hasMonthlyBalances) {
        console.log('SQLite: Migrating user_settings, adding monthly_balances');
        this.db.exec("ALTER TABLE user_settings ADD COLUMN monthly_balances TEXT");
      }

      if (!hasTimezone) {
        console.log('SQLite: Migrating user_settings, adding timezone');
        this.db.exec("ALTER TABLE user_settings ADD COLUMN timezone TEXT");
      }

      if (!hasCardCompactness) {
        console.log('SQLite: Migrating user_settings, adding card_compactness');
        this.db.exec("ALTER TABLE user_settings ADD COLUMN card_compactness INTEGER DEFAULT 0");
      }
    } catch (error) {
      console.error('SQLite: Error checking/migrating schema:', error);
    }

    // Create app_settings table (single row)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings(
        id INTEGER PRIMARY KEY DEFAULT 1,
        split_time REAL DEFAULT 40,
        user_workload_percentage REAL DEFAULT 80,
        weeks_computation REAL DEFAULT 4,
        high_impact_task_goal REAL DEFAULT 5,
        failure_rate_goal REAL DEFAULT 10,
        qli_goal REAL DEFAULT 7,
        new_capabilities_goal REAL DEFAULT 3,
        hours_to_be_done_by_day REAL DEFAULT 8,
        vacation_limit_multiplier REAL DEFAULT 1.5,
        hourly_balance_limit_upper REAL DEFAULT 0.5,
        hourly_balance_limit_lower REAL DEFAULT -0.5,
        timezone TEXT DEFAULT 'Europe/Zurich',
        country TEXT DEFAULT 'CH',
        region TEXT DEFAULT 'BE'
      )
    `);

    // Migration: Add hours_to_be_done_by_day to app_settings if it doesn't exist
    try {
      const appColumns = this.db.prepare("PRAGMA table_info(app_settings)").all() as { name: string }[];
      const hasHoursToBeDone = appColumns.some(c => c.name === 'hours_to_be_done_by_day');
      const hasVacationLimit = appColumns.some(c => c.name === 'vacation_limit_multiplier');
      const hasHourlyUpper = appColumns.some(c => c.name === 'hourly_balance_limit_upper');
      const hasHourlyLower = appColumns.some(c => c.name === 'hourly_balance_limit_lower');
      const hasAppTimezone = appColumns.some(c => c.name === 'timezone');
      const hasAppCountry = appColumns.some(c => c.name === 'country');
      const hasAppRegion = appColumns.some(c => c.name === 'region');

      if (!hasHoursToBeDone) {
        console.log('SQLite: Migrating app_settings, adding hours_to_be_done_by_day');
        this.db.exec("ALTER TABLE app_settings ADD COLUMN hours_to_be_done_by_day REAL DEFAULT 8");
      }

      if (!hasVacationLimit) {
        console.log('SQLite: Migrating app_settings, adding vacation_limit_multiplier');
        this.db.exec("ALTER TABLE app_settings ADD COLUMN vacation_limit_multiplier REAL DEFAULT 1.5");
      }

      if (!hasHourlyUpper) {
        console.log('SQLite: Migrating app_settings, adding hourly_balance_limit_upper');
        this.db.exec("ALTER TABLE app_settings ADD COLUMN hourly_balance_limit_upper REAL DEFAULT 0.5");
      }

      if (!hasHourlyLower) {
        console.log('SQLite: Migrating app_settings, adding hourly_balance_limit_lower');
        this.db.exec("ALTER TABLE app_settings ADD COLUMN hourly_balance_limit_lower REAL DEFAULT -0.5");
      }

      if (!hasAppTimezone) {
        console.log('SQLite: Migrating app_settings, adding timezone');
        this.db.exec("ALTER TABLE app_settings ADD COLUMN timezone TEXT DEFAULT 'Europe/Zurich'");
      }

      if (!hasAppCountry) {
        console.log('SQLite: Migrating app_settings, adding country');
        this.db.exec("ALTER TABLE app_settings ADD COLUMN country TEXT DEFAULT 'CH'");
      }

      if (!hasAppRegion) {
        console.log('SQLite: Migrating app_settings, adding region');
        this.db.exec("ALTER TABLE app_settings ADD COLUMN region TEXT DEFAULT 'BE'");
      }
    } catch (error) {
      console.error('SQLite: Error checking/migrating app_settings schema:', error);
    }

    // Insert default app settings if not exists
    const appSettingsCount = this.db.prepare('SELECT COUNT(*) as count FROM app_settings').get() as { count: number };
    if (appSettingsCount.count === 0) {
      this.db.prepare(`
        INSERT INTO app_settings(id, split_time, user_workload_percentage, weeks_computation,
          high_impact_task_goal, failure_rate_goal, qli_goal, new_capabilities_goal, hours_to_be_done_by_day)
        VALUES(1, @split_time, @user_workload_percentage, @weeks_computation,
          @high_impact_task_goal, @failure_rate_goal, @qli_goal, @new_capabilities_goal, @hours_to_be_done_by_day)
      `).run(DEFAULT_APP_SETTINGS as unknown as Record<string, string | number | null>);
    }

    // Create qol_survey table
    // Check if we need to migrate from the old single-row schema
    const qolColumns = this.db.prepare("PRAGMA table_info(qol_survey)").all() as { name: string }[];
    const hasUserId = qolColumns.some(c => c.name === 'user_id');

    if (qolColumns.length > 0 && !hasUserId) {
      console.log('SQLite: Dropping old qol_survey table to migrate to per-user schema');
      this.db.exec('DROP TABLE qol_survey');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS qol_survey(
        user_id TEXT PRIMARY KEY,
        responses TEXT -- JSON string
      )
    `);

    // Create filters table (single row)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS filters(
        id INTEGER PRIMARY KEY DEFAULT 1,
        data TEXT -- JSON string
      )
    `);

    // Migration: Renaming celebration_board to fertilization_board
    // Check if old table exists BEFORE creating the new one
    const celebrationTableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='celebration_board'").get();
    if (celebrationTableExists) {
      console.log('SQLite: Renaming celebration_board table to fertilization_board');
      // Drop the new table if it was somehow created already (shouldn't happen in normal flow)
      this.db.exec("DROP TABLE IF EXISTS fertilization_board");
      this.db.exec("ALTER TABLE celebration_board RENAME TO fertilization_board");
    } else {
      // Create fertilization_board table only if it doesn't exist and old table wasn't renamed
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS fertilization_board(
          id INTEGER PRIMARY KEY,
          data JSON NOT NULL
        )
      `);
    }

    // Dream Board table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dream_board(
        id INTEGER PRIMARY KEY,
        data JSON NOT NULL
      )
    `);

    // Check if data column exists (for fertilization_board)
    try {
      const columns = this.db.prepare("PRAGMA table_info(fertilization_board)").all() as { name: string }[];
      const hasData = columns.some(c => c.name === 'data');

      if (columns.length > 0 && !hasData) {
        console.log('SQLite: Migrating fertilization_board, adding data column');
        this.db.exec("ALTER TABLE fertilization_board ADD COLUMN data TEXT");
      }
    } catch (error) {
      console.error('SQLite: Error checking/migrating fertilization_board schema:', error);
    }
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

    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as unknown as TaskRow | undefined;
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
      INSERT INTO tasks(id, parent_id, title, created_at, triage_status, urgent, impact, major_incident,
        difficulty, timer, category, termination_date, comment, duration_in_minutes, priority, user_id)
      VALUES(@id, @parent_id, @title, @created_at, @triage_status, @urgent, @impact, @major_incident,
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
        console.log(`SQLite: Deleting children of task ${taskId}: `, children.map(c => c.id));
        for (const child of children) {
          deleteRecursive(child.id);
        }
      }

      const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
      console.log(`SQLite: Deleted task ${taskId}, result: `, result);
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
    // 1. Get current FK state
    const fkState = this.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    const wasFkEnabled = fkState.foreign_keys === 1;

    // 2. Disable FKs (must be done outside transaction)
    if (wasFkEnabled) {
      this.db.exec('PRAGMA foreign_keys = OFF');
    }

    this.db.exec('BEGIN');
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO tasks(id, parent_id, title, created_at, triage_status, urgent, impact, major_incident,
          difficulty, timer, category, termination_date, comment, duration_in_minutes, priority, user_id)
        VALUES(@id, @parent_id, @title, @created_at, @triage_status, @urgent, @impact, @major_incident,
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

      // 3. Check for violations
      let violations = this.db.prepare('PRAGMA foreign_key_check').all() as { table: string, rowid: number, parent: string, fkid: number }[];

      if (violations.length > 0) {
        console.log(`SQLite: Found ${violations.length} foreign key violations. Attempting to auto-repair orphaned tasks...`);

        const repairStmt = this.db.prepare('UPDATE tasks SET parent_id = NULL WHERE rowid = ?');

        for (const violation of violations) {
          if (violation.table === 'tasks' && violation.parent === 'tasks') {
            repairStmt.run(violation.rowid);
          }
        }

        // Re-check violations
        violations = this.db.prepare('PRAGMA foreign_key_check').all() as { table: string, rowid: number, parent: string, fkid: number }[];

        if (violations.length > 0) {
          console.error('SQLite: Foreign key violations persisted after repair attempt:', violations);
          throw new Error(`Foreign key constraint failed: ${violations.length} violations found after repair attempt.`);
        } else {
          console.log('SQLite: All foreign key violations repaired successfully.');
        }
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      // 4. Restore FK state
      if (wasFkEnabled) {
        this.db.exec('PRAGMA foreign_keys = ON');
      }
    }
  }

  // User settings
  async getUserSettings(userId: string): Promise<UserSettingsEntity | null> {
    const row = this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as unknown as UserSettingsRow | undefined;
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      username: row.username,
      logo: row.logo,
      has_completed_onboarding: Boolean(row.has_completed_onboarding),
      workload: row.workload ?? row.workload_percentage ?? 60,
      split_time: row.split_time,
      monthly_balances: row.monthly_balances ? JSON.parse(row.monthly_balances) : {},
      card_compactness: row.card_compactness || 0,
    };
  }

  async updateUserSettings(userId: string, data: Partial<UserSettingsEntity>): Promise<UserSettingsEntity> {
    const current = await this.getUserSettings(userId) || { ...DEFAULT_USER_SETTINGS, userId };
    const updated = { ...current, ...data, userId };

    this.db.prepare(`
      INSERT INTO user_settings(user_id, username, logo, has_completed_onboarding, workload, split_time, monthly_balances, timezone, card_compactness)
      VALUES(@userId, @username, @logo, @has_completed_onboarding, @workload, @split_time, @monthly_balances, @timezone, @card_compactness)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        logo = excluded.logo,
        has_completed_onboarding = excluded.has_completed_onboarding,
        workload = excluded.workload,
        split_time = excluded.split_time,
        monthly_balances = excluded.monthly_balances,
        timezone = excluded.timezone,
        card_compactness = excluded.card_compactness
    `).run({
      userId: updated.userId,
      username: updated.username,
      logo: updated.logo,
      has_completed_onboarding: updated.has_completed_onboarding ? 1 : 0,
      workload: updated.workload ?? null,
      split_time: updated.split_time ?? null,
      monthly_balances: updated.monthly_balances ? JSON.stringify(updated.monthly_balances) : null,
      timezone: updated.timezone ?? null,
      card_compactness: updated.card_compactness ?? 0,
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
      workload: row.workload ?? row.workload_percentage ?? 60,
      split_time: row.split_time,
      monthly_balances: row.monthly_balances ? JSON.parse(row.monthly_balances) : {},
      card_compactness: row.card_compactness || 0,
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

  async deleteUser(userId: string): Promise<void> {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM qol_survey WHERE user_id = ?').run(userId);
      this.db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async clearAllUsers(): Promise<void> {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM qol_survey').run();
      this.db.prepare('DELETE FROM user_settings').run();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // App settings
  async getAppSettings(): Promise<AppSettingsEntity> {
    const row = this.db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as unknown as AppSettingsRow | undefined;
    return row ? {
      split_time: row.split_time,
      user_workload_percentage: row.user_workload_percentage,
      weeks_computation: row.weeks_computation,
      high_impact_task_goal: row.high_impact_task_goal,
      failure_rate_goal: row.failure_rate_goal,
      qli_goal: row.qli_goal,
      new_capabilities_goal: row.new_capabilities_goal,
      hours_to_be_done_by_day: row.hours_to_be_done_by_day ?? 8,
      vacation_limit_multiplier: row.vacation_limit_multiplier ?? 1.5,
      hourly_balance_limit_upper: row.hourly_balance_limit_upper ?? 0.5,
      hourly_balance_limit_lower: row.hourly_balance_limit_lower ?? -0.5,
      timezone: row.timezone ?? 'Europe/Zurich',
      country: row.country ?? 'CH',
      region: row.region ?? 'BE',
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
        new_capabilities_goal = @new_capabilities_goal,
        hours_to_be_done_by_day = @hours_to_be_done_by_day,
        vacation_limit_multiplier = @vacation_limit_multiplier,
        hourly_balance_limit_upper = @hourly_balance_limit_upper,
        hourly_balance_limit_lower = @hourly_balance_limit_lower,
        timezone = @timezone,
        country = @country,
        region = @region
      WHERE id = 1
    `).run({
      split_time: updated.split_time,
      user_workload_percentage: updated.user_workload_percentage,
      weeks_computation: updated.weeks_computation,
      high_impact_task_goal: updated.high_impact_task_goal,
      failure_rate_goal: updated.failure_rate_goal,
      qli_goal: updated.qli_goal,
      new_capabilities_goal: updated.new_capabilities_goal,
      hours_to_be_done_by_day: updated.hours_to_be_done_by_day,
      vacation_limit_multiplier: updated.vacation_limit_multiplier,
      hourly_balance_limit_upper: updated.hourly_balance_limit_upper,
      hourly_balance_limit_lower: updated.hourly_balance_limit_lower,
      timezone: updated.timezone,
      country: updated.country,
      region: updated.region,
    });

    return updated;
  }

  // QoL survey
  async getQolSurveyResponse(userId: string): Promise<QolSurveyResponseEntity | null> {
    const row = this.db.prepare('SELECT responses FROM qol_survey WHERE user_id = ?').get(userId) as JsonRow | undefined;
    return row?.responses ? JSON.parse(row.responses) : null;
  }

  async saveQolSurveyResponse(userId: string, data: QolSurveyResponseEntity): Promise<void> {
    this.db.prepare(`
      INSERT INTO qol_survey(user_id, responses)
      VALUES(@userId, @responses)
      ON CONFLICT(user_id) DO UPDATE SET responses = excluded.responses
    `).run({
      userId,
      responses: JSON.stringify(data),
    });
  }

  async getAllQolSurveyResponses(): Promise<Record<string, QolSurveyResponseEntity>> {
    const rows = this.db.prepare('SELECT user_id, responses FROM qol_survey').all() as { user_id: string; responses: string }[];
    const result: Record<string, QolSurveyResponseEntity> = {};
    for (const row of rows) {
      if (row.responses) {
        try {
          result[row.user_id] = JSON.parse(row.responses);
        } catch (e) {
          console.error(`Failed to parse QoL response for user ${row.user_id}`, e);
        }
      }
    }
    return result;
  }

  // Filters
  async getFilters(): Promise<FilterStateEntity | null> {
    const row = this.db.prepare('SELECT data FROM filters WHERE id = 1').get() as JsonRow | undefined;
    return row?.data ? JSON.parse(row.data) : null;
  }

  async saveFilters(data: FilterStateEntity): Promise<void> {
    this.db.prepare(`
      INSERT INTO filters (id, data)
      VALUES (1, @data)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run({ data: JSON.stringify(data) });
  }

  async clearFilters(): Promise<void> {
    this.db.prepare('DELETE FROM filters WHERE id = 1').run();
  }

  // Fertilization Board
  async getFertilizationBoardState(): Promise<FertilizationBoardEntity | null> {
    const row = this.db.prepare('SELECT data FROM fertilization_board WHERE id = 1').get() as JsonRow | undefined;
    return row?.data ? JSON.parse(row.data) : null;
  }

  async updateFertilizationBoardState(state: FertilizationBoardEntity): Promise<void> {
    this.db.prepare(`
      INSERT INTO fertilization_board (id, data)
      VALUES (1, @data)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run({ data: JSON.stringify(state) });
  }

  // Dream Board
  async getDreamBoardState(): Promise<DreamBoardEntity | null> {
    const row = this.db.prepare('SELECT data FROM dream_board WHERE id = 1').get() as JsonRow | undefined;
    return row?.data ? JSON.parse(row.data) : null;
  }

  async updateDreamBoardState(state: DreamBoardEntity): Promise<void> {
    this.db.prepare(`
      INSERT INTO dream_board (id, data)
      VALUES (1, @data)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run({ data: JSON.stringify(state) });
  }
}