import { DatabaseSync } from 'node:sqlite';
import { DbClient } from './index.js';
import type {
  TaskEntity,
  UserSettingsEntity,
  AppSettingsEntity,
  QolSurveyResponseEntity,
  FilterStateEntity,
  FertilizationBoardEntity,
  DreamBoardEntity,
  CircleEntity,
  CircleNodeType,
  CircleNodeModifier
} from '../../src/lib/persistence-types.js';

// Raw database row types (SQLite stores booleans as 0/1 integers and JSON as strings)
interface TaskDbRow {
  id: string;
  parentId: string | null;
  title: string;
  createdAt: string;
  triageStatus: string;
  urgent: number;
  impact: number;
  majorIncident: number;
  difficulty: number;
  timer: string | null;
  category: string;
  terminationDate: string | null;
  comment: string | null;
  durationInMinutes: number | null;
  priority: number | null;
  userId: string | null;
}

interface UserSettingsDbRow {
  userId: string;
  username: string;
  logo: string;
  hasCompletedOnboarding: number;
  workload: number | null;
  splitTime: string | null;
  monthlyBalances: string | null;
  cardCompactness: number | null;
  timezone: string | null;
  weekStartDay: number | null;
  defaultPlanView: string | null;
  preferredWorkingDays: string | null;
}

interface AppSettingsDbRow {
  id: number;
  splitTime: number;
  userWorkloadPercentage: number;
  weeksComputation: number;
  highImpactTaskGoal: number;
  failureRateGoal: number;
  qliGoal: number;
  newCapabilitiesGoal: number;
  hoursToBeDoneByDay: number | null;
  vacationLimitMultiplier: number | null;
  hourlyBalanceLimitUpper: number | null;
  hourlyBalanceLimitLower: number | null;
  timezone: string | null;
  country: string | null;
  region: string | null;
}

interface CircleDbRow {
  id: string;
  name: string;
  parentId: string | null;
  nodeType: string;
  modifier: string | null;
  color: string | null;
  size: number | null;
  description: string | null;
  order: number | null;
  createdAt: string;
  updatedAt: string;
}

// Default values
const DEFAULT_USER_SETTINGS: UserSettingsEntity = {
  userId: 'default-user',
  username: 'User',
  logo: '',
  hasCompletedOnboarding: false,
  workload: 60,
  splitTime: '13:00',
};

const DEFAULT_APP_SETTINGS: AppSettingsEntity = {
  splitTime: 40,
  userWorkloadPercentage: 80,
  weeksComputation: 4,
  highImpactTaskGoal: 5,
  failureRateGoal: 10,
  qliGoal: 7,
  newCapabilitiesGoal: 3,
  hoursToBeDoneByDay: 8,
};



export async function createSqliteClient(dbFile: string = './p3fo.db'): Promise<DbClient> {
  const db = new DatabaseSync(dbFile);

  // Enable WAL mode for better concurrency
  db.exec('PRAGMA journal_mode = WAL;');

  return new SqliteClient(db);
}

class SqliteClient implements DbClient {
  constructor(private db: DatabaseSync) { }

  async initialize(): Promise<void> {
    // Migration: Check for legacy schema and migrate if needed
    try {
      this.migrateSchema();
    } catch (error) {
      console.error('Migration failed:', error);
      // Continue initialization, as migration might be partial or already done
    }

    // Create tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" TEXT PRIMARY KEY,
        "parentId" TEXT,
        "title" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        "triageStatus" TEXT NOT NULL,
        "urgent" BOOLEAN DEFAULT 0,
        "impact" BOOLEAN DEFAULT 0,
        "majorIncident" BOOLEAN DEFAULT 0,
        "difficulty" REAL DEFAULT 1,
        "timer" TEXT, -- JSON string
        "category" TEXT DEFAULT 'General',
        "terminationDate" TEXT,
        "comment" TEXT,
        "durationInMinutes" INTEGER,
        "priority" INTEGER,
        "userId" TEXT,
        FOREIGN KEY("parentId") REFERENCES "tasks"("id")
      )
    `);

    // Create userSettings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "userSettings" (
        "userId" TEXT PRIMARY KEY,
        "username" TEXT NOT NULL,
        "logo" TEXT,
        "hasCompletedOnboarding" BOOLEAN DEFAULT 0,
        "workload" REAL DEFAULT 60,
        "splitTime" TEXT DEFAULT '13:00',
        "monthlyBalances" TEXT, -- JSON string
        "cardCompactness" INTEGER DEFAULT 0,
        "timezone" TEXT,
        "weekStartDay" INTEGER,
        "defaultPlanView" TEXT,
        "preferredWorkingDays" TEXT -- JSON string
      )
    `);

    // Create appSettings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "appSettings" (
        "id" INTEGER PRIMARY KEY DEFAULT 1,
        "splitTime" REAL DEFAULT 40,
        "userWorkloadPercentage" REAL DEFAULT 80,
        "weeksComputation" REAL DEFAULT 4,
        "highImpactTaskGoal" REAL DEFAULT 5,
        "failureRateGoal" REAL DEFAULT 10,
        "qliGoal" REAL DEFAULT 7,
        "newCapabilitiesGoal" REAL DEFAULT 3,
        "hoursToBeDoneByDay" REAL DEFAULT 8,
        "vacationLimitMultiplier" REAL DEFAULT 1.5,
        "hourlyBalanceLimitUpper" REAL DEFAULT 0.5,
        "hourlyBalanceLimitLower" REAL DEFAULT -0.5,
        "timezone" TEXT DEFAULT 'Europe/Zurich',
        "country" TEXT DEFAULT 'CH',
        "region" TEXT DEFAULT 'BE'
      )
    `);

    // Insert default app settings if not exists
    const appSettingsCount = this.db.prepare('SELECT COUNT(*) as count FROM "appSettings"').get() as { count: number };
    if (appSettingsCount.count === 0) {
      this.db.prepare(`
        INSERT INTO "appSettings"("id", "splitTime", "userWorkloadPercentage", "weeksComputation",
          "highImpactTaskGoal", "failureRateGoal", "qliGoal", "newCapabilitiesGoal", "hoursToBeDoneByDay")
        VALUES(1, @splitTime, @userWorkloadPercentage, @weeksComputation,
          @highImpactTaskGoal, @failureRateGoal, @qliGoal, @newCapabilitiesGoal, @hoursToBeDoneByDay)
      `).run(DEFAULT_APP_SETTINGS as unknown as Record<string, string | number | null>);
    }

    // Create qolSurvey table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "qolSurvey" (
          "userId" TEXT PRIMARY KEY,
          "responses" TEXT -- JSON string
        )
        `);

    // Create filters table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "filters" (
          "id" INTEGER PRIMARY KEY DEFAULT 1,
          "data" TEXT -- JSON string
        )
        `);

    // Create fertilizationBoard table
    this.db.exec(`
        CREATE TABLE IF NOT EXISTS "fertilizationBoard" (
          "id" INTEGER PRIMARY KEY,
          "data" TEXT NOT NULL -- JSON string
        )
        `);

    // Dream Board table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "dreamBoard" (
          "id" INTEGER PRIMARY KEY,
          "data" TEXT NOT NULL -- JSON string
        )
        `);

    // Circles table (EasyCIRCLE - organizational structure visualization)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "circles" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "parentId" TEXT,
        "nodeType" TEXT NOT NULL, -- 'organization', 'circle', 'group', 'role'
        "modifier" TEXT, -- 'template', 'hierarchy'
        "color" TEXT, -- Custom color for roles, e.g., "#FF6600"
        "size" REAL, -- Size weight for layout calculation
        "description" TEXT, -- Optional description/purpose
        "order" INTEGER, -- Display order among siblings
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY("parentId") REFERENCES "circles"("id")
      )
    `);

    // Create indexes for performance optimization
    // These indexes dramatically improve query performance when filtering by userId, parentId, or triageStatus
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_tasks_userId" ON "tasks"("userId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_tasks_parentId" ON "tasks"("parentId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_tasks_triageStatus" ON "tasks"("triageStatus")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_tasks_createdAt" ON "tasks"("createdAt")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_tasks_priority" ON "tasks"("priority")`);
    // Composite index for common filtering patterns (user + status)
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_tasks_userId_triageStatus" ON "tasks"("userId", "triageStatus")`);

    // Circles indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_circles_parentId" ON "circles"("parentId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_circles_nodeType" ON "circles"("nodeType")`);
  }

  private migrateSchema(): void {
    const runMigration = (table: string, oldCol: string, newCol: string) => {
      try {
        // Check if column exists
        const tableInfo = this.db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
        if (tableInfo.some(col => col.name === oldCol) && !tableInfo.some(col => col.name === newCol)) {
          console.log(`Migrating ${table}.${oldCol} to ${newCol}...`);
          this.db.exec(`ALTER TABLE "${table}" RENAME COLUMN "${oldCol}" TO "${newCol}"`);
        }
      } catch (e) {
        // ignore
      }
    };

    // Helper to add new columns if they don't exist
    const addColumn = (table: string, colName: string, colType: string) => {
      try {
        const tableInfo = this.db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
        if (!tableInfo.some(col => col.name === colName)) {
          console.log(`Adding column ${table}.${colName}...`);
          this.db.exec(`ALTER TABLE "${table}" ADD COLUMN "${colName}" ${colType}`);
        }
      } catch (e) {
        console.error(`Error adding column ${table}.${colName}:`, e);
      }
    }

    // Rename legacy tables to camelCase if needed
    const renameTable = (oldName: string, newName: string) => {
      try {
        const exists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(oldName);
        if (exists) {
          console.log(`Renaming table ${oldName} to ${newName}...`);
          this.db.exec(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
        }
      } catch (e) {
        console.error(`Error renaming table ${oldName}:`, e);
      }
    };

    renameTable('user_settings', 'userSettings');
    renameTable('app_settings', 'appSettings');
    renameTable('qol_survey', 'qolSurvey');
    renameTable('fertilization_board', 'fertilizationBoard');
    renameTable('dream_board', 'dreamBoard');
    renameTable('celebration_board', 'fertilizationBoard');

    // Tasks columns
    runMigration('tasks', 'parent_id', 'parentId');
    runMigration('tasks', 'created_at', 'createdAt');
    runMigration('tasks', 'triage_status', 'triageStatus');
    runMigration('tasks', 'major_incident', 'majorIncident');
    runMigration('tasks', 'termination_date', 'terminationDate');
    runMigration('tasks', 'duration_in_minutes', 'durationInMinutes');
    runMigration('tasks', 'user_id', 'userId');

    // UserSettings columns
    runMigration('userSettings', 'user_id', 'userId');
    runMigration('userSettings', 'has_completed_onboarding', 'hasCompletedOnboarding');
    runMigration('userSettings', 'workload_percentage', 'workload');
    runMigration('userSettings', 'split_time', 'splitTime');
    runMigration('userSettings', 'monthly_balances', 'monthlyBalances');
    runMigration('userSettings', 'card_compactness', 'cardCompactness');

    // Add new columns for UserSettings
    addColumn('userSettings', 'weekStartDay', 'INTEGER');
    addColumn('userSettings', 'defaultPlanView', 'TEXT');
    addColumn('userSettings', 'preferredWorkingDays', 'TEXT');

    // AppSettings columns
    runMigration('appSettings', 'split_time', 'splitTime');
    runMigration('appSettings', 'user_workload_percentage', 'userWorkloadPercentage');
    runMigration('appSettings', 'weeks_computation', 'weeksComputation');
    runMigration('appSettings', 'high_impact_task_goal', 'highImpactTaskGoal');
    runMigration('appSettings', 'failure_rate_goal', 'failureRateGoal');
    runMigration('appSettings', 'qli_goal', 'qliGoal');
    runMigration('appSettings', 'new_capabilities_goal', 'newCapabilitiesGoal');
    runMigration('appSettings', 'hours_to_be_done_by_day', 'hoursToBeDoneByDay');
    runMigration('appSettings', 'vacation_limit_multiplier', 'vacationLimitMultiplier');
    runMigration('appSettings', 'hourly_balance_limit_upper', 'hourlyBalanceLimitUpper');
    runMigration('appSettings', 'hourly_balance_limit_lower', 'hourlyBalanceLimitLower');

    // QolSurvey columns
    runMigration('qolSurvey', 'user_id', 'userId');
  }

  async testConnection(): Promise<void> {
    this.db.prepare('SELECT 1').run();
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // Tasks
  async getTasks(userId?: string, pagination?: { limit?: number; offset?: number }): Promise<{ data: TaskEntity[]; total: number }> {
    // Build count query
    let countSql = 'SELECT COUNT(*) as count FROM "tasks"';
    const countParams: (string | number | null)[] = [];
    if (userId) {
      countSql += ' WHERE "userId" = ?';
      countParams.push(userId);
    }
    const countResult = this.db.prepare(countSql).get(...countParams) as { count: number };
    const total = countResult.count;

    // Build data query
    let sql = 'SELECT * FROM "tasks"';
    const params: (string | number | null)[] = [];
    if (userId) {
      sql += ' WHERE "userId" = ?';
      params.push(userId);
    }
    sql += ' ORDER BY "priority" DESC NULLS LAST, "createdAt" ASC';

    if (pagination?.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(pagination.limit);
    }
    if (pagination?.offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(pagination.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as unknown as TaskDbRow[];

    const data = rows.map(row => ({
      ...row,
      urgent: Boolean(row.urgent),
      impact: Boolean(row.impact),
      majorIncident: Boolean(row.majorIncident),
      timer: row.timer ? JSON.parse(row.timer) : { startTime: null, elapsedTime: 0, isRunning: false },
    }));

    return { data, total };
  }

  async getTaskById(id: string): Promise<TaskEntity | null> {
    const row = this.db.prepare('SELECT * FROM "tasks" WHERE "id" = ?').get(id) as unknown as TaskDbRow | undefined;
    if (!row) {
      return null;
    }
    return {
      ...row,
      urgent: Boolean(row.urgent),
      impact: Boolean(row.impact),
      majorIncident: Boolean(row.majorIncident),
      timer: row.timer ? JSON.parse(row.timer) : { startTime: null, elapsedTime: 0, isRunning: false },
    };
  }

  async createTask(input: Partial<TaskEntity>): Promise<TaskEntity> {
    const newTask: TaskEntity = {
      id: input.id || crypto.randomUUID(),
      title: input.title || 'New Task',
      createdAt: input.createdAt || new Date().toISOString(),
      triageStatus: input.triageStatus || 'Backlog',
      urgent: input.urgent || false,
      impact: input.impact || false,
      majorIncident: input.majorIncident || false,
      difficulty: input.difficulty || 1,
      timer: input.timer || [],
      category: input.category || 'General',
      terminationDate: input.terminationDate || null,
      comment: input.comment || null,
      durationInMinutes: input.durationInMinutes || null,
      priority: input.priority || null,
      userId: input.userId || null,
      parentId: input.parentId || null,
      children: input.children || [],
    };

    const params = {
      id: newTask.id,
      parentId: newTask.parentId,
      title: newTask.title,
      createdAt: newTask.createdAt,
      triageStatus: newTask.triageStatus,
      urgent: newTask.urgent ? 1 : 0,
      impact: newTask.impact ? 1 : 0,
      majorIncident: newTask.majorIncident ? 1 : 0,
      difficulty: newTask.difficulty,
      timer: JSON.stringify(newTask.timer),
      category: newTask.category,
      terminationDate: newTask.terminationDate,
      comment: newTask.comment,
      durationInMinutes: newTask.durationInMinutes,
      priority: newTask.priority,
      userId: newTask.userId,
    };

    this.db.prepare(`
      INSERT INTO "tasks"("id", "parentId", "title", "createdAt", "triageStatus", "urgent", "impact", "majorIncident", "difficulty", "timer", "category", "terminationDate", "comment", "durationInMinutes", "priority", "userId")
      VALUES(@id, @parentId, @title, @createdAt, @triageStatus, @urgent, @impact, @majorIncident, @difficulty, @timer, @category, @terminationDate, @comment, @durationInMinutes, @priority, @userId)
    `).run(params);

    return newTask;
  }

  async updateTask(id: string, patch: Partial<TaskEntity>): Promise<TaskEntity | null> {
    const current = await this.getTaskById(id);
    if (!current) {
      return null;
    }

    const updated = { ...current, ...patch };

    const params = {
      id: updated.id,
      parentId: updated.parentId,
      title: updated.title,
      triageStatus: updated.triageStatus,
      urgent: updated.urgent ? 1 : 0,
      impact: updated.impact ? 1 : 0,
      majorIncident: updated.majorIncident ? 1 : 0,
      difficulty: updated.difficulty,
      timer: JSON.stringify(updated.timer),
      category: updated.category,
      terminationDate: updated.terminationDate,
      comment: updated.comment,
      durationInMinutes: updated.durationInMinutes,
      priority: updated.priority,
      userId: updated.userId,
    };

    this.db.prepare(`
      UPDATE "tasks" SET
      "parentId" = @parentId,
        "title" = @title,
        "triageStatus" = @triageStatus,
        "urgent" = @urgent,
        "impact" = @impact,
        "majorIncident" = @majorIncident,
        "difficulty" = @difficulty,
        "timer" = @timer,
        "category" = @category,
        "terminationDate" = @terminationDate,
        "comment" = @comment,
        "durationInMinutes" = @durationInMinutes,
        "priority" = @priority,
        "userId" = @userId
      WHERE "id" = @id
        `).run(params);

    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    this.db.exec('BEGIN');
    try {
      // Find all descendants recursively using a CTE with depth to ensure bottom-up deletion
      const descendants = this.db.prepare(`
        WITH RECURSIVE descendants(id, depth) AS (
          SELECT id, 1 FROM "tasks" WHERE "parentId" = ?
          UNION ALL
          SELECT t.id, d.depth + 1 FROM "tasks" t
          INNER JOIN descendants d ON t."parentId" = d.id
        )
        SELECT id FROM descendants ORDER BY depth DESC
      `).all(id) as { id: string }[];

      const deleteStmt = this.db.prepare('DELETE FROM "tasks" WHERE "id" = ?');

      // Delete descendants first (deepest first) to avoid FK violations
      for (const row of descendants) {
        deleteStmt.run(row.id);
      }

      // Finally delete the parent
      deleteStmt.run(id);

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void> {
    this.db.exec('BEGIN');
    try {
      const updateStmt = this.db.prepare('UPDATE "tasks" SET "priority" = @priority WHERE "id" = @id');
      for (const item of items) {
        updateStmt.run({ priority: item.priority, id: item.id });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async clearAllTasks(): Promise<void> {
    this.db.prepare('DELETE FROM "tasks"').run();
  }

  async importTasks(tasks: TaskEntity[]): Promise<void> {
    // 1. Get current FK state
    const fkState = this.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    const wasFkEnabled = fkState.foreign_keys === 1;

    // 2. Disable FKs (must be done outside transaction)
    if (wasFkEnabled) {
      this.db.exec('PRAGMA foreign_keys = OFF');
    }

    const insertStmt = this.db.prepare(`
      INSERT INTO "tasks"("id", "parentId", "title", "createdAt", "triageStatus", "urgent", "impact", "majorIncident", "difficulty", "timer", "category", "terminationDate", "comment", "durationInMinutes", "priority", "userId")
      VALUES(@id, @parentId, @title, @createdAt, @triageStatus, @urgent, @impact, @majorIncident, @difficulty, @timer, @category, @terminationDate, @comment, @durationInMinutes, @priority, @userId)
      ON CONFLICT("id") DO UPDATE SET
      "parentId" = excluded."parentId",
        "title" = excluded."title",
        "triageStatus" = excluded."triageStatus",
        "urgent" = excluded."urgent",
        "impact" = excluded."impact",
        "majorIncident" = excluded."majorIncident",
        "difficulty" = excluded."difficulty",
        "timer" = excluded."timer",
        "category" = excluded."category",
        "terminationDate" = excluded."terminationDate",
        "comment" = excluded."comment",
        "durationInMinutes" = excluded."durationInMinutes",
        "priority" = excluded."priority",
        "userId" = excluded."userId"
          `);

    const checkFk = this.db.prepare('PRAGMA foreign_key_check');
    const repairStmt = this.db.prepare('UPDATE "tasks" SET "parentId" = NULL WHERE rowid = ?');

    this.db.exec('BEGIN');
    try {
      for (const task of tasks) {
        insertStmt.run({
          id: task.id,
          parentId: task.parentId,
          title: task.title,
          createdAt: task.createdAt,
          triageStatus: task.triageStatus,
          urgent: task.urgent ? 1 : 0,
          impact: task.impact ? 1 : 0,
          majorIncident: task.majorIncident ? 1 : 0,
          difficulty: task.difficulty,
          timer: JSON.stringify(task.timer),
          category: task.category,
          terminationDate: task.terminationDate,
          comment: task.comment,
          durationInMinutes: task.durationInMinutes,
          priority: task.priority,
          userId: task.userId,
        });
      }

      // 3. Check for violations
      let violations = checkFk.all() as { table: string, rowid: number, parent: string, fkid: number }[];

      if (violations.length > 0) {
        console.log(`SQLite: Found ${violations.length} foreign key violations. Attempting to auto-repair orphaned tasks...`);

        for (const violation of violations) {
          if (violation.table === 'tasks' && violation.parent === 'tasks') {
            repairStmt.run(violation.rowid);
          }
        }

        // Re-check violations
        violations = checkFk.all() as { table: string, rowid: number, parent: string, fkid: number }[];

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
    const row = this.db.prepare('SELECT * FROM "userSettings" WHERE "userId" = ?').get(userId) as unknown as UserSettingsDbRow | undefined;
    if (!row) {
      return null;
    }
    return {
      ...row,
      hasCompletedOnboarding: Boolean(row.hasCompletedOnboarding),
      monthlyBalances: row.monthlyBalances ? JSON.parse(row.monthlyBalances) : {},
      weekStartDay: row.weekStartDay as 0 | 1 | undefined,
      defaultPlanView: row.defaultPlanView as 'week' | 'month' | undefined,
      preferredWorkingDays: row.preferredWorkingDays ? JSON.parse(row.preferredWorkingDays) : undefined,
    };
  }

  async updateUserSettings(userId: string, data: Partial<UserSettingsEntity>): Promise<UserSettingsEntity> {
    const current = await this.getUserSettings(userId) || { ...DEFAULT_USER_SETTINGS, userId };
    const updated = { ...current, ...data, userId };

    const params = {
      userId: updated.userId,
      username: updated.username,
      logo: updated.logo,
      hasCompletedOnboarding: updated.hasCompletedOnboarding ? 1 : 0,
      workload: updated.workload ?? null,
      splitTime: updated.splitTime ?? null,
      monthlyBalances: updated.monthlyBalances ? JSON.stringify(updated.monthlyBalances) : null,
      timezone: updated.timezone ?? null,
      cardCompactness: updated.cardCompactness ?? 0,
      weekStartDay: updated.weekStartDay ?? null,
      defaultPlanView: updated.defaultPlanView ?? null,
      preferredWorkingDays: updated.preferredWorkingDays ? JSON.stringify(updated.preferredWorkingDays) : null
    };

    this.db.prepare(`
      INSERT INTO "userSettings"("userId", "username", "logo", "hasCompletedOnboarding", "workload", "splitTime", "monthlyBalances", "timezone", "cardCompactness", "weekStartDay", "defaultPlanView", "preferredWorkingDays")
      VALUES(@userId, @username, @logo, @hasCompletedOnboarding, @workload, @splitTime, @monthlyBalances, @timezone, @cardCompactness, @weekStartDay, @defaultPlanView, @preferredWorkingDays)
      ON CONFLICT("userId") DO UPDATE SET
      "username" = excluded."username",
        "logo" = excluded."logo",
        "hasCompletedOnboarding" = excluded."hasCompletedOnboarding",
        "workload" = excluded."workload",
        "splitTime" = excluded."splitTime",
        "monthlyBalances" = excluded."monthlyBalances",
        "timezone" = excluded."timezone",
        "cardCompactness" = excluded."cardCompactness",
        "weekStartDay" = excluded."weekStartDay",
        "defaultPlanView" = excluded."defaultPlanView",
        "preferredWorkingDays" = excluded."preferredWorkingDays"
          `).run(params);

    return updated;
  }

  async listUsers(): Promise<UserSettingsEntity[]> {
    const rows = this.db.prepare('SELECT * FROM "userSettings"').all() as unknown as UserSettingsDbRow[];
    return rows.map(row => ({
      ...row,
      hasCompletedOnboarding: Boolean(row.hasCompletedOnboarding),
      monthlyBalances: row.monthlyBalances ? JSON.parse(row.monthlyBalances) : {},
      weekStartDay: row.weekStartDay as 0 | 1 | undefined,
      defaultPlanView: row.defaultPlanView as 'week' | 'month' | undefined,
      preferredWorkingDays: row.preferredWorkingDays ? JSON.parse(row.preferredWorkingDays) : undefined,
    }));
  }

  async migrateUser(oldUserId: string, newUserId: string): Promise<void> {
    this.db.exec('BEGIN');
    try {
      // 1. Delete old user's tasks (target UUID's tasks are the source of truth)
      this.db.prepare('DELETE FROM "tasks" WHERE "userId" = ?').run(oldUserId);

      // 2. Delete old user settings (target UUID's settings prevail)
      this.db.prepare('DELETE FROM "userSettings" WHERE "userId" = ?').run(oldUserId);

      this.db.exec('COMMIT');
      console.log(`SQLite: Switched from ${oldUserId} to ${newUserId} (old user data discarded)`);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM "qolSurvey" WHERE "userId" = ?').run(userId);
      this.db.prepare('DELETE FROM "userSettings" WHERE "userId" = ?').run(userId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async clearAllUsers(): Promise<void> {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM "qolSurvey"').run();
      this.db.prepare('DELETE FROM "userSettings"').run();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // App settings
  async getAppSettings(): Promise<AppSettingsEntity> {
    const row = this.db.prepare('SELECT * FROM "appSettings" WHERE "id" = 1').get() as unknown as AppSettingsDbRow | undefined;
    if (!row) {
      return DEFAULT_APP_SETTINGS;
    }

    return {
      ...row,
      hoursToBeDoneByDay: row.hoursToBeDoneByDay ?? 8,
      vacationLimitMultiplier: row.vacationLimitMultiplier ?? 1.5,
      hourlyBalanceLimitUpper: row.hourlyBalanceLimitUpper ?? 0.5,
      hourlyBalanceLimitLower: row.hourlyBalanceLimitLower ?? -0.5,
      timezone: row.timezone ?? 'Europe/Zurich',
      country: row.country ?? 'CH',
      region: row.region ?? 'BE',
    };
  }

  async updateAppSettings(patch: Partial<AppSettingsEntity>): Promise<AppSettingsEntity> {
    const current = await this.getAppSettings();
    const updated = { ...current, ...patch };

    // Ensure id is not in the object passed to run() if strict or to avoid confusion, 
    // OR ensure query uses @id if we pass it. 
    // But since id is always 1 for app settings, we can just hardcode 1 in SQL (as done) 
    // and remove id from params if needed.
    // However, better-sqlite3 usually ignores unused params.
    // Let's debug by ensuring we only pass exact params.

    // Actually, looking at the error "Unknown named parameter 'id'", it strongly suggests
    // that the query EXPECTS @id but it was NOT provided? 
    // OR provided but not used?

    // Ah, I see "id" in "INSERT INTO appSettings(id, ...)".
    // Maybe I should explicitly pass id=1 in params and use @id in SQL?
    // Let's modify query to use @id and ensure params has id: 1.

    const params = { ...updated, id: 1 };

    this.db.prepare(`
      INSERT INTO "appSettings"("id", "splitTime", "userWorkloadPercentage", "weeksComputation", "highImpactTaskGoal", "failureRateGoal", "qliGoal", "newCapabilitiesGoal", "hoursToBeDoneByDay", "vacationLimitMultiplier", "hourlyBalanceLimitUpper", "hourlyBalanceLimitLower", "timezone", "country", "region")
      VALUES(@id, @splitTime, @userWorkloadPercentage, @weeksComputation, @highImpactTaskGoal, @failureRateGoal, @qliGoal, @newCapabilitiesGoal, @hoursToBeDoneByDay, @vacationLimitMultiplier, @hourlyBalanceLimitUpper, @hourlyBalanceLimitLower, @timezone, @country, @region)
      ON CONFLICT("id") DO UPDATE SET
        "splitTime" = excluded."splitTime",
        "userWorkloadPercentage" = excluded."userWorkloadPercentage",
        "weeksComputation" = excluded."weeksComputation",
        "highImpactTaskGoal" = excluded."highImpactTaskGoal",
        "failureRateGoal" = excluded."failureRateGoal",
        "qliGoal" = excluded."qliGoal",
        "newCapabilitiesGoal" = excluded."newCapabilitiesGoal",
        "hoursToBeDoneByDay" = excluded."hoursToBeDoneByDay",
        "vacationLimitMultiplier" = excluded."vacationLimitMultiplier",
        "hourlyBalanceLimitUpper" = excluded."hourlyBalanceLimitUpper",
        "hourlyBalanceLimitLower" = excluded."hourlyBalanceLimitLower",
        "timezone" = excluded."timezone",
        "country" = excluded."country",
        "region" = excluded."region"
    `).run(params);

    return updated;
  }

  // QoL survey
  async getQolSurveyResponse(userId: string): Promise<QolSurveyResponseEntity | null> {
    const row = this.db.prepare('SELECT responses FROM "qolSurvey" WHERE "userId" = ?').get(userId) as { responses?: string } | undefined;
    return row?.responses ? JSON.parse(row.responses) : null;
  }

  async saveQolSurveyResponse(userId: string, data: QolSurveyResponseEntity): Promise<void> {
    this.db.prepare(`
      INSERT INTO "qolSurvey"("userId", "responses")
      VALUES(@userId, @responses)
      ON CONFLICT("userId") DO UPDATE SET "responses" = excluded."responses"
        `).run({
      userId,
      responses: JSON.stringify(data),
    });
  }

  async getAllQolSurveyResponses(): Promise<Record<string, QolSurveyResponseEntity>> {
    const rows = this.db.prepare('SELECT "userId", "responses" FROM "qolSurvey"').all() as { userId: string; responses: string }[];
    const result: Record<string, QolSurveyResponseEntity> = {};
    for (const row of rows) {
      if (row.responses) {
        try {
          result[row.userId] = JSON.parse(row.responses);
        } catch (e) {
          console.error(`Failed to parse QoL response for user ${row.userId}`, e);
        }
      }
    }
    return result;
  }

  // Filters
  async getFilters(): Promise<FilterStateEntity | null> {
    const row = this.db.prepare('SELECT data FROM "filters" WHERE "id" = 1').get() as { data?: string } | undefined;
    return row?.data ? JSON.parse(row.data) : null;
  }

  async saveFilters(data: FilterStateEntity): Promise<void> {
    this.db.prepare(`
      INSERT INTO "filters"("id", "data")
      VALUES(1, @data)
      ON CONFLICT("id") DO UPDATE SET "data" = excluded."data"
        `).run({ data: JSON.stringify(data) });
  }

  async clearFilters(): Promise<void> {
    this.db.prepare('DELETE FROM "filters" WHERE "id" = 1').run();
  }

  // Fertilization Board
  async getFertilizationBoardState(): Promise<FertilizationBoardEntity | null> {
    const row = this.db.prepare('SELECT data FROM "fertilizationBoard" WHERE "id" = 1').get() as { data?: string } | undefined;
    return row?.data ? JSON.parse(row.data) : null;
  }

  async updateFertilizationBoardState(state: FertilizationBoardEntity): Promise<void> {
    this.db.prepare(`
      INSERT INTO "fertilizationBoard"("id", "data")
      VALUES(1, @data)
      ON CONFLICT("id") DO UPDATE SET "data" = excluded."data"
        `).run({ data: JSON.stringify(state) });
  }

  // Dream Board
  async getDreamBoardState(): Promise<DreamBoardEntity | null> {
    const row = this.db.prepare('SELECT data FROM "dreamBoard" WHERE "id" = 1').get() as { data?: string } | undefined;
    return row?.data ? JSON.parse(row.data) : null;
  }

  async updateDreamBoardState(state: DreamBoardEntity): Promise<void> {
    this.db.prepare(`
      INSERT INTO "dreamBoard"("id", "data")
      VALUES(1, @data)
      ON CONFLICT("id") DO UPDATE SET "data" = excluded."data"
        `).run({ data: JSON.stringify(state) });
  }

  // Circles (EasyCIRCLE)
  async getCircles(): Promise<CircleEntity[]> {
    const rows = this.db.prepare('SELECT * FROM "circles" ORDER BY "order" ASC NULLS LAST, "createdAt" ASC').all() as unknown as CircleDbRow[];
    return rows.map(row => ({
      ...row,
      nodeType: row.nodeType as CircleNodeType,
      modifier: row.modifier as CircleNodeModifier | undefined,
    }));
  }

  async getCircleById(id: string): Promise<CircleEntity | null> {
    const row = this.db.prepare('SELECT * FROM "circles" WHERE "id" = ?').get(id) as unknown as CircleDbRow | undefined;
    if (!row) {
      return null;
    }
    return {
      ...row,
      nodeType: row.nodeType as CircleNodeType,
      modifier: row.modifier as CircleNodeModifier | undefined,
    };
  }

  async createCircle(input: Partial<CircleEntity>): Promise<CircleEntity> {
    const now = new Date().toISOString();
    const newCircle: CircleEntity = {
      id: input.id || crypto.randomUUID(),
      name: input.name || 'New Circle',
      parentId: input.parentId || null,
      nodeType: input.nodeType || 'circle',
      modifier: input.modifier,
      color: input.color,
      size: input.size,
      description: input.description,
      order: input.order,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    };

    const params = {
      id: newCircle.id,
      name: newCircle.name,
      parentId: newCircle.parentId,
      nodeType: newCircle.nodeType,
      modifier: newCircle.modifier ?? null,
      color: newCircle.color ?? null,
      size: newCircle.size ?? null,
      description: newCircle.description ?? null,
      order: newCircle.order ?? null,
      createdAt: newCircle.createdAt,
      updatedAt: newCircle.updatedAt,
    };

    this.db.prepare(`
      INSERT INTO "circles"("id", "name", "parentId", "nodeType", "modifier", "color", "size", "description", "order", "createdAt", "updatedAt")
      VALUES(@id, @name, @parentId, @nodeType, @modifier, @color, @size, @description, @order, @createdAt, @updatedAt)
    `).run(params);

    return newCircle;
  }

  async updateCircle(id: string, patch: Partial<CircleEntity>): Promise<CircleEntity | null> {
    const current = await this.getCircleById(id);
    if (!current) {
      return null;
    }

    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };

    const params = {
      id: updated.id,
      name: updated.name,
      parentId: updated.parentId,
      nodeType: updated.nodeType,
      modifier: updated.modifier ?? null,
      color: updated.color ?? null,
      size: updated.size ?? null,
      description: updated.description ?? null,
      order: updated.order ?? null,
      updatedAt: updated.updatedAt,
    };

    this.db.prepare(`
      UPDATE "circles" SET
        "name" = @name,
        "parentId" = @parentId,
        "nodeType" = @nodeType,
        "modifier" = @modifier,
        "color" = @color,
        "size" = @size,
        "description" = @description,
        "order" = @order,
        "updatedAt" = @updatedAt
      WHERE "id" = @id
    `).run(params);

    return updated;
  }

  async deleteCircle(id: string): Promise<void> {
    this.db.exec('BEGIN');
    try {
      // Find all descendants recursively using a CTE with depth to ensure bottom-up deletion
      const descendants = this.db.prepare(`
        WITH RECURSIVE descendants(id, depth) AS (
          SELECT id, 1 FROM "circles" WHERE "parentId" = ?
          UNION ALL
          SELECT c.id, d.depth + 1 FROM "circles" c
          INNER JOIN descendants d ON c."parentId" = d.id
        )
        SELECT id FROM descendants ORDER BY depth DESC
      `).all(id) as { id: string }[];

      const deleteStmt = this.db.prepare('DELETE FROM "circles" WHERE "id" = ?');

      // Delete descendants first (deepest first) to avoid FK violations
      for (const row of descendants) {
        deleteStmt.run(row.id);
      }

      // Finally delete the parent
      deleteStmt.run(id);

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async clearAllCircles(): Promise<void> {
    this.db.prepare('DELETE FROM "circles"').run();
  }

  async clearAllData(): Promise<void> {
    // Drop all tables to prompt a full schema reset on next initialize or strictly here
    this.db.exec('BEGIN');
    try {
      this.db.exec('DROP TABLE IF EXISTS "tasks"');
      this.db.exec('DROP TABLE IF EXISTS "userSettings"');
      this.db.exec('DROP TABLE IF EXISTS "appSettings"');
      this.db.exec('DROP TABLE IF EXISTS "qolSurvey"');
      this.db.exec('DROP TABLE IF EXISTS "filters"');
      this.db.exec('DROP TABLE IF EXISTS "fertilizationBoard"');
      this.db.exec('DROP TABLE IF EXISTS "dreamBoard"');
      this.db.exec('DROP TABLE IF EXISTS "circles"');

      // Also drop legacy tables if they exist
      this.db.exec('DROP TABLE IF EXISTS tasks');
      this.db.exec('DROP TABLE IF EXISTS user_settings');
      this.db.exec('DROP TABLE IF EXISTS app_settings');
      this.db.exec('DROP TABLE IF EXISTS qol_survey');
      this.db.exec('DROP TABLE IF EXISTS filters');
      this.db.exec('DROP TABLE IF EXISTS fertilization_board');
      this.db.exec('DROP TABLE IF EXISTS dream_board');
      this.db.exec('DROP TABLE IF EXISTS celebration_board');

      this.db.exec('COMMIT');

      // Re-initialize to create empty tables with new schema
      await this.initialize();

    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}