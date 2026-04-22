import { Pool, PoolClient } from 'pg';
import { DbClient } from './index.js';
import {
  TaskEntity,
  UserSettingsEntity,
  AppSettingsEntity,
  QolSurveyResponseEntity,
  FilterStateEntity,
  FertilizationBoardEntity,
  DreamBoardEntity,
  CircleEntity,
  CircleNodeType,
  CircleNodeModifier,
  ReminderEntity
} from '../../src/lib/persistence-types.js';

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
  vacationLimitMultiplier: 1.5,
  hourlyBalanceLimitUpper: 0.5,
  hourlyBalanceLimitLower: -0.5,
  cardAgingBaseDays: 30,
  timezone: 'Europe/Zurich',
  country: 'CH',
  region: 'BE',
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
    // 1. Create tables FIRST before migration
    // This ensures tables exist when migrateSchema tries to add columns
    
    // Create tasks table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" TEXT PRIMARY KEY,
        "parentId" TEXT,
        "title" TEXT NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "triageStatus" TEXT NOT NULL,
        "urgent" BOOLEAN DEFAULT false,
        "impact" BOOLEAN DEFAULT false,
        "majorIncident" BOOLEAN DEFAULT false,
        "sprintTarget" BOOLEAN DEFAULT false,
        "difficulty" REAL DEFAULT 1,
        "timer" JSONB, -- JSONB for efficient JSON operations
        "category" TEXT DEFAULT 'General',
        "terminationDate" TIMESTAMP WITH TIME ZONE,
        "comment" TEXT,
        "durationInMinutes" INTEGER,
        "priority" INTEGER,
        "userId" TEXT,
        CONSTRAINT "fk_tasks_parent" FOREIGN KEY ("parentId") REFERENCES "tasks" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE
      )
    `);

    // Create userSettings table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "userSettings" (
        "userId" TEXT PRIMARY KEY,
        "username" TEXT NOT NULL,
        "logo" TEXT,
        "hasCompletedOnboarding" BOOLEAN DEFAULT false,
        "workload" REAL DEFAULT 60,
        "splitTime" TEXT DEFAULT '13:00',
        "monthlyBalances" JSONB,
        "cardCompactness" INTEGER DEFAULT 0,
        "timezone" TEXT,
        "weekStartDay" INTEGER,
        "defaultPlanView" TEXT,
        "preferredWorkingDays" JSONB,
        "trigram" TEXT
      )
    `);

    // Create appSettings table
    await this.pool.query(`
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
        "cardAgingBaseDays" REAL DEFAULT 30,
        "timezone" TEXT DEFAULT 'Europe/Zurich',
        "country" TEXT DEFAULT 'CH',
        "region" TEXT DEFAULT 'BE'
      )
    `);

    // Insert default app settings if not exists
    const appSettingsResult = await this.pool.query('SELECT COUNT(*) as count FROM "appSettings"');
    if (parseInt(appSettingsResult.rows[0].count) === 0) {
      await this.pool.query(`
        INSERT INTO "appSettings" ("id", "splitTime", "userWorkloadPercentage", "weeksComputation", 
                                  "highImpactTaskGoal", "failureRateGoal", "qliGoal", "newCapabilitiesGoal", "hoursToBeDoneByDay",
                                  "vacationLimitMultiplier", "hourlyBalanceLimitUpper", "hourlyBalanceLimitLower", "cardAgingBaseDays", "timezone", "country", "region") 
        VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        DEFAULT_APP_SETTINGS.splitTime,
        DEFAULT_APP_SETTINGS.userWorkloadPercentage,
        DEFAULT_APP_SETTINGS.weeksComputation,
        DEFAULT_APP_SETTINGS.highImpactTaskGoal,
        DEFAULT_APP_SETTINGS.failureRateGoal,
        DEFAULT_APP_SETTINGS.qliGoal,
        DEFAULT_APP_SETTINGS.newCapabilitiesGoal,
        DEFAULT_APP_SETTINGS.hoursToBeDoneByDay,
        DEFAULT_APP_SETTINGS.vacationLimitMultiplier ?? 1.5,
        DEFAULT_APP_SETTINGS.hourlyBalanceLimitUpper ?? 0.5,
        DEFAULT_APP_SETTINGS.hourlyBalanceLimitLower ?? -0.5,
        DEFAULT_APP_SETTINGS.cardAgingBaseDays ?? 30,
        DEFAULT_APP_SETTINGS.timezone ?? 'Europe/Zurich',
        DEFAULT_APP_SETTINGS.country ?? 'CH',
        DEFAULT_APP_SETTINGS.region ?? 'BE'
      ]);
    }

    // Create qolSurvey table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "qolSurvey" (
        "userId" TEXT PRIMARY KEY,
        "responses" JSONB
      )
    `);

    // Create filters table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "filters" (
        "id" INTEGER PRIMARY KEY DEFAULT 1,
        "data" JSONB
      )
    `);

    // Create fertilizationBoard table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "fertilizationBoard" (
        "id" INTEGER PRIMARY KEY DEFAULT 1,
        "data" JSONB
      )
    `);

    // Create dreamBoard table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "dreamBoard" (
        "id" INTEGER PRIMARY KEY DEFAULT 1,
        "data" JSONB
      )
    `);

    // Circles table (EasyCIRCLE - organizational structure visualization)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "circles" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "parentId" TEXT,
        "nodeType" TEXT NOT NULL, -- 'organization', 'circle', 'group', 'role'
        "modifier" TEXT, -- 'template', 'hierarchy'
        "color" TEXT, -- Custom color for roles, e.g., "#FF6600"
        "size" REAL, -- Size weight for layout calculation
        "description" TEXT, -- Optional description/purpose
        "purpose" TEXT, -- Raison d'être
        "domains" TEXT, -- Domains of authority
        "accountabilities" TEXT, -- Attendus and expectations
        "order" INTEGER, -- Display order among siblings
        "assignments" JSONB, -- Users assigned to this role with involvement types
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "fk_circles_parent" FOREIGN KEY ("parentId") REFERENCES "circles" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE
      )
    `);

    // Reminders table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "reminders" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "taskId" TEXT,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "read" BOOLEAN DEFAULT false,
        "persistent" BOOLEAN DEFAULT false,
        "triggerDate" TIMESTAMP WITH TIME ZONE,
        "offsetMinutes" INTEGER,
        "snoozeDurationMinutes" INTEGER,
        "originalTriggerDate" TIMESTAMP WITH TIME ZONE,
        "state" TEXT DEFAULT 'scheduled' CHECK ("state" IN ('scheduled', 'triggered', 'read', 'dismissed')),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "fk_reminders_task" FOREIGN KEY ("taskId") REFERENCES "tasks" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE
      )
    `);

    // Create indexes for performance optimization
    // These indexes dramatically improve query performance when filtering by userId, parentId, or triageStatus
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_userId" ON "tasks"("userId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_parentId" ON "tasks"("parentId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_triageStatus" ON "tasks"("triageStatus")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_createdAt" ON "tasks"("createdAt")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_priority" ON "tasks"("priority")`);
    // Composite index for common filtering patterns (user + status)
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_tasks_userId_triageStatus" ON "tasks"("userId", "triageStatus")`);

    // Circles indexes
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_circles_parentId" ON "circles"("parentId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_circles_nodeType" ON "circles"("nodeType")`);

    // Reminders indexes
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_reminders_userId" ON "reminders"("userId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_reminders_taskId" ON "reminders"("taskId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_reminders_state" ON "reminders"("state")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_reminders_triggerDate" ON "reminders"("triggerDate")`);

    // 2. Run migrations AFTER tables exist
    try {
      await this.migrateSchema();
    } catch (error) {
      console.error('PostgreSQL migration failed:', error);
    }
  }

  private async migrateSchema(): Promise<void> {
    const runMigration = async (table: string, oldCol: string, newCol: string) => {
      try {
        // Check if column exists. Note: table names and column names in information_schema are usually lowercase for unquoted identifiers.
        // But here we are dealing with renaming from snake_case (likely unquoted creation) to camelCase (quoted).
        // If table was created as `CREATE TABLE tasks`, it is 'tasks'.
        // If created as `CREATE TABLE "tasks"`, it is 'tasks' (case sensitive if it had mixed case, but it was just lowercase tasks).
        // So 'tasks' is safe for table name pattern matching if we assume standard postgres usage.

        // However, correct params for information_schema should be exact string match.
        // In my previous `postgres.ts`, tables were created as `CREATE TABLE IF NOT EXISTS tasks` (unquoted).
        // So they are 'tasks' in DB.
        // NEW tables are `CREATE TABLE IF NOT EXISTS "tasks"` (quoted). This is also 'tasks' effectively.
        // So checking for 'tasks' is fine.

        const colCheck = await this.pool.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
          [table.replace(/"/g, ''), oldCol]
        );

        const newColCheck = await this.pool.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
          [table.replace(/"/g, ''), newCol.replace(/"/g, '')] // Remove quotes for check
        );

        if (colCheck.rows.length > 0 && newColCheck.rows.length === 0) {
          console.log(`Migrating ${table}.${oldCol} to ${newCol}...`);
          await this.pool.query(`ALTER TABLE "${table.replace(/"/g, '')}" RENAME COLUMN "${oldCol}" TO "${newCol}"`);
        }
      } catch (e) {
        console.error(`Error migrating ${table}.${oldCol}:`, e);
      }
    };

    const addColumn = async (table: string, colName: string, colType: string) => {
      try {
        const colCheck = await this.pool.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
          [table.replace(/"/g, ''), colName.replace(/"/g, '')]
        );

        if (colCheck.rows.length === 0) {
          console.log(`Adding column ${table}.${colName}...`);
          await this.pool.query(`ALTER TABLE "${table.replace(/"/g, '')}" ADD COLUMN "${colName}" ${colType}`);
        }
      } catch (e) {
        console.error(`Error adding column ${table}.${colName}:`, e);
      }
    };

    // Rename legacy tables to camelCase if needed
    const renameTable = async (oldName: string, newName: string) => {
      try {
        const exists = await this.pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name=$1`, [oldName]);
        if (exists.rows.length > 0) {
          // Check if new table already exists (if so, we might have a conflict or need to merge? For now assume rename is what we want if new doesn't exist)
          const newExists = await this.pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name=$1`, [newName]);
          if (newExists.rows.length === 0) {
            console.log(`Renaming table ${oldName} to ${newName}...`);
            await this.pool.query(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
          }
        }
      } catch (e) {
        console.error(`Error renaming table ${oldName}:`, e);
      }
    };

    // Note: old tables were snake_case e.g. user_settings. New are userSettings.
    // However, if I used quotes for new tables, they are case sensitive "userSettings". 
    // "user_settings" vs "userSettings".

    await renameTable('user_settings', 'userSettings');
    await renameTable('app_settings', 'appSettings');
    await renameTable('qol_survey', 'qolSurvey');
    await renameTable('fertilization_board', 'fertilizationBoard');
    await renameTable('dream_board', 'dreamBoard');
    await renameTable('celebration_board', 'fertilizationBoard');

    // Tasks columns
    await runMigration('tasks', 'parent_id', 'parentId');
    await runMigration('tasks', 'created_at', 'createdAt');
    await runMigration('tasks', 'triage_status', 'triageStatus');
    await runMigration('tasks', 'major_incident', 'majorIncident');
    await runMigration('tasks', 'termination_date', 'terminationDate');
    await runMigration('tasks', 'duration_in_minutes', 'durationInMinutes');
    await runMigration('tasks', 'user_id', 'userId');

    // UserSettings columns
    await runMigration('userSettings', 'user_id', 'userId');
    await runMigration('userSettings', 'has_completed_onboarding', 'hasCompletedOnboarding');
    await runMigration('userSettings', 'workload_percentage', 'workload');
    await runMigration('userSettings', 'split_time', 'splitTime');
    await runMigration('userSettings', 'monthly_balances', 'monthlyBalances');
    await runMigration('userSettings', 'card_compactness', 'cardCompactness');

    // Add sprintTarget column to tasks
    await addColumn('tasks', 'sprintTarget', 'BOOLEAN DEFAULT false');

    // Add updatedAt column to tasks
    await addColumn('tasks', 'updatedAt', 'TIMESTAMP WITH TIME ZONE');

    // Circle columns (fields added after initial table creation)
    await addColumn('circles', 'purpose', 'TEXT');
    await addColumn('circles', 'domains', 'TEXT');
    await addColumn('circles', 'accountabilities', 'TEXT');
    await addColumn('circles', 'assignments', 'JSONB');

    // Add new columns for UserSettings
    await addColumn('userSettings', 'weekStartDay', 'INTEGER');
    await addColumn('userSettings', 'defaultPlanView', 'TEXT');
    await addColumn('userSettings', 'preferredWorkingDays', 'JSONB');
    await addColumn('userSettings', 'trigram', 'TEXT');

    // AppSettings columns
    await runMigration('appSettings', 'split_time', 'splitTime');
    await runMigration('appSettings', 'user_workload_percentage', 'userWorkloadPercentage');
    await runMigration('appSettings', 'weeks_computation', 'weeksComputation');
    await runMigration('appSettings', 'high_impact_task_goal', 'highImpactTaskGoal');
    await runMigration('appSettings', 'failure_rate_goal', 'failureRateGoal');
    await runMigration('appSettings', 'qli_goal', 'qliGoal');
    await runMigration('appSettings', 'new_capabilities_goal', 'newCapabilitiesGoal');
    await runMigration('appSettings', 'hours_to_be_done_by_day', 'hoursToBeDoneByDay');
    await runMigration('appSettings', 'vacation_limit_multiplier', 'vacationLimitMultiplier');
    await runMigration('appSettings', 'hourly_balance_limit_upper', 'hourlyBalanceLimitUpper');
    await runMigration('appSettings', 'hourly_balance_limit_lower', 'hourlyBalanceLimitLower');

    await addColumn('appSettings', 'cardAgingBaseDays', 'REAL DEFAULT 30');

    // QolSurvey columns
    await runMigration('qolSurvey', 'user_id', 'userId');
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
  async getTasks(userId?: string, pagination?: { limit?: number; offset?: number }): Promise<{ data: TaskEntity[]; total: number }> {
    // Build count query
    let countSql = 'SELECT COUNT(*) as count FROM "tasks"';
    const countParams: (string | number | boolean | null)[] = [];
    if (userId) {
      countSql += ' WHERE "userId" = $1';
      countParams.push(userId);
    }
    const countResult = await this.pool.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count);

    // Build data query
    let sql = 'SELECT * FROM "tasks"';
    const params: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    if (userId) {
      sql += ` WHERE "userId" = $${paramIndex++}`;
      params.push(userId);
    }
    sql += ' ORDER BY "priority" DESC NULLS LAST, "createdAt" ASC';

    if (pagination?.limit !== undefined) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(pagination.limit);
    }
    if (pagination?.offset !== undefined) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(pagination.offset);
    }

    const result = await this.pool.query(sql, params);
    const data = result.rows.map(row => this.mapTaskDbRowToEntity(row));

    return { data, total };
  }

  async getTaskById(id: string): Promise<TaskEntity | null> {
    const result = await this.pool.query('SELECT * FROM "tasks" WHERE "id" = $1', [id]);
    if (result.rows.length === 0) return null;

    return this.mapTaskDbRowToEntity(result.rows[0]);
  }

  async createTask(input: Partial<TaskEntity>): Promise<TaskEntity> {
    const newTask: TaskEntity = {
      id: input.id || crypto.randomUUID(),
      title: input.title || 'New Task',
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: input.updatedAt ?? undefined,
      triageStatus: input.triageStatus || 'Backlog',
      urgent: input.urgent || false,
      impact: input.impact || false,
      majorIncident: input.majorIncident || false,
      sprintTarget: input.sprintTarget || false,
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

    await this.pool.query(`
      INSERT INTO "tasks" ("id", "parentId", "title", "createdAt", "updatedAt", "triageStatus", "urgent", "impact", "majorIncident", "sprintTarget",
                         "difficulty", "timer", "category", "terminationDate", "comment", "durationInMinutes", "priority", "userId")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `, [
      newTask.id,
      newTask.parentId,
      newTask.title,
      newTask.createdAt,
      newTask.updatedAt ?? null,
      newTask.triageStatus,
      newTask.urgent,
      newTask.impact,
      newTask.majorIncident,
      newTask.sprintTarget,
      newTask.difficulty,
      JSON.stringify(newTask.timer),
      newTask.category,
      newTask.terminationDate,
      newTask.comment,
      newTask.durationInMinutes,
      newTask.priority,
      newTask.userId,
    ]);

    return newTask;
  }

  async updateTask(id: string, patch: Partial<TaskEntity>): Promise<TaskEntity | null> {
    const currentTask = await this.getTaskById(id);
    if (!currentTask) {
      return null;
    }

    const updatedTask = { ...currentTask, ...patch };

    const params = [
      updatedTask.parentId,
      updatedTask.title,
      updatedTask.updatedAt ?? null,
      updatedTask.triageStatus,
      updatedTask.urgent,
      updatedTask.impact,
      updatedTask.majorIncident,
      updatedTask.sprintTarget,
      updatedTask.difficulty,
      JSON.stringify(updatedTask.timer),
      updatedTask.category,
      updatedTask.terminationDate,
      updatedTask.comment,
      updatedTask.durationInMinutes,
      updatedTask.priority,
      updatedTask.userId,
      id
    ];

    await this.pool.query(`
      UPDATE "tasks"
      SET "parentId" = $1, "title" = $2, "updatedAt" = $3, "triageStatus" = $4, "urgent" = $5,
          "impact" = $6, "majorIncident" = $7, "sprintTarget" = $8, "difficulty" = $9, "timer" = $10,
          "category" = $11, "terminationDate" = $12, "comment" = $13,
          "durationInMinutes" = $14, "priority" = $15, "userId" = $16
      WHERE "id" = $17
    `, params);

    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Delete recursive tasks (Cascade)
      await client.query(`
        WITH RECURSIVE descendants AS (
            SELECT id FROM "tasks" WHERE "id" = $1
            UNION
            SELECT t.id FROM "tasks" t
            INNER JOIN descendants d ON t."parentId" = d.id
        )
        DELETE FROM "tasks"
        WHERE "id" IN (SELECT id FROM descendants)
      `, [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void> {
    // Use a transaction to update all priorities at once
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const { id, priority } of items) {
        await client.query(
          'UPDATE "tasks" SET "priority" = $1 WHERE "id" = $2',
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
    await this.pool.query('DELETE FROM "tasks"');
  }

  async importTasks(tasks: TaskEntity[]): Promise<void> {
    // Use a transaction to import all tasks at once
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET CONSTRAINTS ALL DEFERRED');

      for (const task of tasks) {
        await client.query(`
          INSERT INTO "tasks" ("id", "parentId", "title", "createdAt", "updatedAt", "triageStatus", "urgent", "impact", "majorIncident", "sprintTarget",
                             "difficulty", "timer", "category", "terminationDate", "comment", "durationInMinutes", "priority", "userId")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT ("id") DO UPDATE SET
            "parentId" = EXCLUDED."parentId",
            "title" = EXCLUDED."title",
            "updatedAt" = EXCLUDED."updatedAt",
            "triageStatus" = EXCLUDED."triageStatus",
            "urgent" = EXCLUDED."urgent",
            "impact" = EXCLUDED."impact",
            "majorIncident" = EXCLUDED."majorIncident",
            "sprintTarget" = EXCLUDED."sprintTarget",
            "difficulty" = EXCLUDED."difficulty",
            "timer" = EXCLUDED."timer",
            "category" = EXCLUDED."category",
            "terminationDate" = EXCLUDED."terminationDate",
            "comment" = EXCLUDED."comment",
            "durationInMinutes" = EXCLUDED."durationInMinutes",
            "priority" = EXCLUDED."priority",
            "userId" = EXCLUDED."userId"
        `, [
          task.id,
          task.parentId,
          task.title,
          task.createdAt,
          task.updatedAt ?? null,
          task.triageStatus,
          task.urgent,
          task.impact,
          task.majorIncident,
          task.sprintTarget,
          task.difficulty,
          JSON.stringify(task.timer),
          task.category,
          task.terminationDate,
          task.comment,
          task.durationInMinutes,
          task.priority,
          task.userId,
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
    const result = await this.pool.query('SELECT * FROM "userSettings" WHERE "userId" = $1', [userId]);
    if (result.rows.length > 0) {
      return this.mapUserSettingsDbRowToEntity(result.rows[0]);
    }
    return null;
  }

  async updateUserSettings(userId: string, data: Partial<UserSettingsEntity>): Promise<UserSettingsEntity> {
    const current = await this.getUserSettings(userId) || { ...DEFAULT_USER_SETTINGS, userId };
    const updated = { ...current, ...data, userId };

    await this.pool.query(`
      INSERT INTO "userSettings" ("userId", "username", "logo", "hasCompletedOnboarding", "workload", "splitTime", "monthlyBalances", "timezone", "cardCompactness", "weekStartDay", "defaultPlanView", "preferredWorkingDays", "trigram")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT ("userId") DO UPDATE SET
        "username" = EXCLUDED."username",
        "logo" = EXCLUDED."logo",
        "hasCompletedOnboarding" = EXCLUDED."hasCompletedOnboarding",
        "workload" = EXCLUDED."workload",
        "splitTime" = EXCLUDED."splitTime",
        "monthlyBalances" = EXCLUDED."monthlyBalances",
        "timezone" = EXCLUDED."timezone",
        "cardCompactness" = EXCLUDED."cardCompactness",
        "weekStartDay" = EXCLUDED."weekStartDay",
        "defaultPlanView" = EXCLUDED."defaultPlanView",
        "preferredWorkingDays" = EXCLUDED."preferredWorkingDays",
        "trigram" = EXCLUDED."trigram"
    `, [
      updated.userId,
      updated.username,
      updated.logo,
      updated.hasCompletedOnboarding,
      updated.workload,
      updated.splitTime,
      JSON.stringify(updated.monthlyBalances),
      updated.timezone,
      updated.cardCompactness,
      updated.weekStartDay ?? null,
      updated.defaultPlanView ?? null,
      updated.preferredWorkingDays ? JSON.stringify(updated.preferredWorkingDays) : null,
      updated.trigram ?? null
    ]);

    return updated;
  }

  async listUsers(): Promise<UserSettingsEntity[]> {
    const result = await this.pool.query('SELECT * FROM "userSettings"');
    return result.rows.map(row => this.mapUserSettingsDbRowToEntity(row));
  }

  async migrateUser(oldUserId: string, newUserId: string): Promise<void> {
    // 1. Delete old user's tasks (target UUID's tasks are the source of truth)
    await this.pool.query('DELETE FROM "tasks" WHERE "userId" = $1', [oldUserId]);

    // 2. Delete old user settings (target UUID's settings prevail)
    await this.pool.query('DELETE FROM "userSettings" WHERE "userId" = $1', [oldUserId]);

    console.log(`PostgreSQL: Switched from ${oldUserId} to ${newUserId} (old user data discarded)`);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM "qolSurvey" WHERE "userId" = $1', [userId]);
    await this.pool.query('DELETE FROM "userSettings" WHERE "userId" = $1', [userId]);
  }

  async clearAllUsers(): Promise<void> {
    await this.pool.query('DELETE FROM "qolSurvey"');
    await this.pool.query('DELETE FROM "userSettings"');
  }

  // App settings
  async getAppSettings(): Promise<AppSettingsEntity> {
    const result = await this.pool.query('SELECT * FROM "appSettings" WHERE "id" = 1');
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        ...row,
        hoursToBeDoneByDay: row.hoursToBeDoneByDay ?? 8,
        vacationLimitMultiplier: row.vacationLimitMultiplier ?? 1.5,
        hourlyBalanceLimitUpper: row.hourlyBalanceLimitUpper ?? 0.5,
        hourlyBalanceLimitLower: row.hourlyBalanceLimitLower ?? -0.5,
        cardAgingBaseDays: row.cardAgingBaseDays ?? 30,
        timezone: row.timezone ?? 'Europe/Zurich',
        country: row.country ?? 'CH',
        region: row.region ?? 'BE',
      };
    }
    return DEFAULT_APP_SETTINGS;
  }

  async updateAppSettings(data: Partial<AppSettingsEntity>): Promise<AppSettingsEntity> {
    const current = await this.getAppSettings();
    const updated = { ...current, ...data };

    await this.pool.query(`
      INSERT INTO "appSettings" ("id", "splitTime", "userWorkloadPercentage", "weeksComputation", 
                                "highImpactTaskGoal", "failureRateGoal", "qliGoal", "newCapabilitiesGoal",
                                "hoursToBeDoneByDay", "vacationLimitMultiplier", "hourlyBalanceLimitUpper",
                                "hourlyBalanceLimitLower", "cardAgingBaseDays", "timezone", "country", "region")
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT ("id") DO UPDATE SET
        "splitTime" = EXCLUDED."splitTime",
        "userWorkloadPercentage" = EXCLUDED."userWorkloadPercentage",
        "weeksComputation" = EXCLUDED."weeksComputation",
        "highImpactTaskGoal" = EXCLUDED."highImpactTaskGoal",
        "failureRateGoal" = EXCLUDED."failureRateGoal",
        "qliGoal" = EXCLUDED."qliGoal",
        "newCapabilitiesGoal" = EXCLUDED."newCapabilitiesGoal",
        "hoursToBeDoneByDay" = EXCLUDED."hoursToBeDoneByDay",
        "vacationLimitMultiplier" = EXCLUDED."vacationLimitMultiplier",
        "hourlyBalanceLimitUpper" = EXCLUDED."hourlyBalanceLimitUpper",
        "hourlyBalanceLimitLower" = EXCLUDED."hourlyBalanceLimitLower",
        "cardAgingBaseDays" = EXCLUDED."cardAgingBaseDays",
        "timezone" = EXCLUDED."timezone",
        "country" = EXCLUDED."country",
        "region" = EXCLUDED."region"
    `, [
      updated.splitTime,
      updated.userWorkloadPercentage,
      updated.weeksComputation,
      updated.highImpactTaskGoal,
      updated.failureRateGoal,
      updated.qliGoal,
      updated.newCapabilitiesGoal,
      updated.hoursToBeDoneByDay,
      updated.vacationLimitMultiplier,
      updated.hourlyBalanceLimitUpper,
      updated.hourlyBalanceLimitLower,
      updated.cardAgingBaseDays,
      updated.timezone,
      updated.country,
      updated.region
    ]);

    return updated;
  }

  // QoL survey
  async getQolSurveyResponse(userId: string): Promise<QolSurveyResponseEntity | null> {
    const result = await this.pool.query('SELECT "responses" FROM "qolSurvey" WHERE "userId" = $1', [userId]);
    if (result.rows.length > 0 && result.rows[0].responses) {
      return result.rows[0].responses;
    }
    return null;
  }

  async saveQolSurveyResponse(userId: string, data: QolSurveyResponseEntity): Promise<void> {
    await this.pool.query(`
      INSERT INTO "qolSurvey" ("userId", "responses")
      VALUES ($1, $2)
      ON CONFLICT ("userId") DO UPDATE SET "responses" = EXCLUDED."responses"
    `, [userId, JSON.stringify(data)]);
  }

  async getAllQolSurveyResponses(): Promise<Record<string, QolSurveyResponseEntity>> {
    const result = await this.pool.query('SELECT "userId", "responses" FROM "qolSurvey"');
    const responses: Record<string, QolSurveyResponseEntity> = {};
    for (const row of result.rows) {
      if (row.responses) {
        responses[row.userId] = row.responses;
      }
    }
    return responses;
  }

  // Filters
  async getFilters(): Promise<FilterStateEntity | null> {
    const result = await this.pool.query('SELECT "data" FROM "filters" WHERE "id" = 1');
    if (result.rows.length > 0 && result.rows[0].data) {
      return result.rows[0].data;
    }
    return null;
  }

  async saveFilters(data: FilterStateEntity): Promise<void> {
    await this.pool.query(`
      INSERT INTO "filters" ("id", "data")
      VALUES (1, $1)
      ON CONFLICT ("id") DO UPDATE SET "data" = EXCLUDED."data"
    `, [JSON.stringify(data)]);
  }

  async clearFilters(): Promise<void> {
    await this.pool.query('DELETE FROM "filters" WHERE "id" = 1');
  }

  // Fertilization Board
  async getFertilizationBoardState(): Promise<FertilizationBoardEntity | null> {
    const result = await this.pool.query('SELECT "data" FROM "fertilizationBoard" WHERE "id" = 1');
    if (result.rows.length > 0 && result.rows[0].data) {
      return result.rows[0].data;
    }
    return null;
  }

  async updateFertilizationBoardState(state: FertilizationBoardEntity): Promise<void> {
    await this.pool.query(`
      INSERT INTO "fertilizationBoard" ("id", "data")
      VALUES (1, $1)
      ON CONFLICT ("id") DO UPDATE SET "data" = EXCLUDED."data"
    `, [JSON.stringify(state)]);
  }

  // Dream Board (Now implemented for Postgres consistent with SQLite)
  async getDreamBoardState(): Promise<DreamBoardEntity | null> {
    const result = await this.pool.query('SELECT "data" FROM "dreamBoard" WHERE "id" = 1');
    if (result.rows.length > 0 && result.rows[0].data) {
      return result.rows[0].data;
    }
    return null;
  }

  async updateDreamBoardState(state: DreamBoardEntity): Promise<void> {
    await this.pool.query(`
        INSERT INTO "dreamBoard" ("id", "data")
        VALUES (1, $1)
        ON CONFLICT ("id") DO UPDATE SET "data" = EXCLUDED."data"
      `, [JSON.stringify(state)]);
  }

  // Circles (EasyCIRCLE)
  async getCircles(): Promise<CircleEntity[]> {
    const result = await this.pool.query('SELECT * FROM "circles" ORDER BY "order" ASC NULLS LAST, "createdAt" ASC');
    return result.rows.map(row => this.mapCircleDbRowToEntity(row));
  }

  async getCircleById(id: string): Promise<CircleEntity | null> {
    const result = await this.pool.query('SELECT * FROM "circles" WHERE "id" = $1', [id]);
    if (result.rows.length === 0) return null;

    return this.mapCircleDbRowToEntity(result.rows[0]);
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
      purpose: input.purpose,
      domains: input.domains,
      accountabilities: input.accountabilities,
      order: input.order,
      assignments: input.assignments,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    };

    await this.pool.query(`
      INSERT INTO "circles" ("id", "name", "parentId", "nodeType", "modifier", "color", "size", "description", "purpose", "domains", "accountabilities", "order", "assignments", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      newCircle.id,
      newCircle.name,
      newCircle.parentId,
      newCircle.nodeType,
      newCircle.modifier ?? null,
      newCircle.color ?? null,
      newCircle.size ?? null,
      newCircle.description ?? null,
      newCircle.purpose ?? null,
      newCircle.domains ?? null,
      newCircle.accountabilities ?? null,
      newCircle.order ?? null,
      newCircle.assignments ? JSON.stringify(newCircle.assignments) : null,
      newCircle.createdAt,
      newCircle.updatedAt,
    ]);

    return newCircle;
  }

  async updateCircle(id: string, patch: Partial<CircleEntity>): Promise<CircleEntity | null> {
    const current = await this.getCircleById(id);
    if (!current) {
      return null;
    }

    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };

    await this.pool.query(`
      UPDATE "circles"
      SET "name" = $1, "parentId" = $2, "nodeType" = $3, "modifier" = $4,
          "color" = $5, "size" = $6, "description" = $7, "purpose" = $8,
          "domains" = $9, "accountabilities" = $10, "order" = $11,
          "assignments" = $12, "updatedAt" = $13
      WHERE "id" = $14
    `, [
      updated.name,
      updated.parentId,
      updated.nodeType,
      updated.modifier ?? null,
      updated.color ?? null,
      updated.size ?? null,
      updated.description ?? null,
      updated.purpose ?? null,
      updated.domains ?? null,
      updated.accountabilities ?? null,
      updated.order ?? null,
      updated.assignments ? JSON.stringify(updated.assignments) : null,
      updated.updatedAt,
      id
    ]);

    return updated;
  }

  async deleteCircle(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Delete recursive circles (Cascade)
      await client.query(`
        WITH RECURSIVE descendants AS (
            SELECT id FROM "circles" WHERE "id" = $1
            UNION
            SELECT c.id FROM "circles" c
            INNER JOIN descendants d ON c."parentId" = d.id
        )
        DELETE FROM "circles"
        WHERE "id" IN (SELECT id FROM descendants)
      `, [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async clearAllCircles(): Promise<void> {
    await this.pool.query('DELETE FROM "circles"');
  }

  async importCircles(circles: CircleEntity[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET CONSTRAINTS ALL DEFERRED');

      for (const circle of circles) {
        await client.query(`
          INSERT INTO "circles"("id", "name", "parentId", "nodeType", "modifier", "color", "size", "description", "purpose", "domains", "accountabilities", "order", "assignments", "createdAt", "updatedAt")
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT ("id") DO UPDATE SET
            "name" = EXCLUDED."name",
            "parentId" = EXCLUDED."parentId",
            "nodeType" = EXCLUDED."nodeType",
            "modifier" = EXCLUDED."modifier",
            "color" = EXCLUDED."color",
            "size" = EXCLUDED."size",
            "description" = EXCLUDED."description",
            "purpose" = EXCLUDED."purpose",
            "domains" = EXCLUDED."domains",
            "accountabilities" = EXCLUDED."accountabilities",
            "order" = EXCLUDED."order",
            "assignments" = EXCLUDED."assignments",
            "createdAt" = EXCLUDED."createdAt",
            "updatedAt" = EXCLUDED."updatedAt"
        `, [
          circle.id,
          circle.name,
          circle.parentId,
          circle.nodeType,
          circle.modifier ?? null,
          circle.color ?? null,
          circle.size ?? null,
          circle.description ?? null,
          circle.purpose ?? null,
          circle.domains ?? null,
          circle.accountabilities ?? null,
          circle.order ?? null,
          circle.assignments ? JSON.stringify(circle.assignments) : null,
          circle.createdAt,
          circle.updatedAt,
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Reminders
  async listReminders(userId?: string): Promise<ReminderEntity[]> {
    let sql = 'SELECT * FROM "reminders"';
    const params: (string | number)[] = [];
    
    if (userId) {
      sql += ' WHERE "userId" = $1';
      params.push(userId);
    }
    
    sql += ' ORDER BY "createdAt" DESC';
    
    const result = await this.pool.query(sql, params);
    return result.rows.map(row => this.mapReminderRowToEntity(row));
  }

  async getReminderById(id: string): Promise<ReminderEntity | null> {
    const result = await this.pool.query('SELECT * FROM "reminders" WHERE "id" = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.mapReminderRowToEntity(result.rows[0]);
  }

  async createReminder(input: Partial<ReminderEntity>): Promise<ReminderEntity> {
    const now = new Date().toISOString();
    const reminder: ReminderEntity = {
      id: input.id || crypto.randomUUID(),
      userId: input.userId!,
      taskId: input.taskId,
      title: input.title!,
      description: input.description,
      read: input.read ?? false,
      persistent: input.persistent ?? false,
      triggerDate: input.triggerDate,
      offsetMinutes: input.offsetMinutes,
      snoozeDurationMinutes: input.snoozeDurationMinutes,
      originalTriggerDate: input.originalTriggerDate,
      state: input.state || 'scheduled',
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    };

    await this.pool.query(`
      INSERT INTO "reminders"("id", "userId", "taskId", "title", "description", "read", "persistent",
        "triggerDate", "offsetMinutes", "snoozeDurationMinutes", "originalTriggerDate", "state", "createdAt", "updatedAt")
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      reminder.id,
      reminder.userId,
      reminder.taskId ?? null,
      reminder.title,
      reminder.description ?? null,
      reminder.read,
      reminder.persistent,
      reminder.triggerDate ?? null,
      reminder.offsetMinutes ?? null,
      reminder.snoozeDurationMinutes ?? null,
      reminder.originalTriggerDate ?? null,
      reminder.state,
      reminder.createdAt,
      reminder.updatedAt,
    ]);

    return reminder;
  }

  async updateReminder(id: string, patch: Partial<ReminderEntity>): Promise<ReminderEntity> {
    const current = await this.getReminderById(id);
    if (!current) {
      throw new Error(`Reminder with id ${id} not found`);
    }

    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };

    await this.pool.query(`
      UPDATE "reminders" SET
        "title" = $1,
        "description" = $2,
        "read" = $3,
        "persistent" = $4,
        "triggerDate" = $5,
        "offsetMinutes" = $6,
        "snoozeDurationMinutes" = $7,
        "originalTriggerDate" = $8,
        "state" = $9,
        "updatedAt" = $10
      WHERE "id" = $11
    `, [
      updated.title,
      updated.description ?? null,
      updated.read,
      updated.persistent,
      updated.triggerDate ?? null,
      updated.offsetMinutes ?? null,
      updated.snoozeDurationMinutes ?? null,
      updated.originalTriggerDate ?? null,
      updated.state,
      updated.updatedAt,
      updated.id,
    ]);

    return updated;
  }

  async deleteReminder(id: string): Promise<void> {
    await this.pool.query('DELETE FROM "reminders" WHERE "id" = $1', [id]);
  }

  async deleteRemindersByTaskId(taskId: string): Promise<void> {
    await this.pool.query('DELETE FROM "reminders" WHERE "taskId" = $1', [taskId]);
  }

  async clearAllReminders(): Promise<void> {
    await this.pool.query('DELETE FROM "reminders"');
  }

  async importReminders(reminders: ReminderEntity[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const reminder of reminders) {
        await client.query(`
          INSERT INTO "reminders"("id", "userId", "taskId", "title", "description", "read", "persistent",
            "triggerDate", "offsetMinutes", "snoozeDurationMinutes", "originalTriggerDate", "state", "createdAt", "updatedAt")
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT ("id") DO UPDATE SET
            "userId" = EXCLUDED."userId",
            "taskId" = EXCLUDED."taskId",
            "title" = EXCLUDED."title",
            "description" = EXCLUDED."description",
            "read" = EXCLUDED."read",
            "persistent" = EXCLUDED."persistent",
            "triggerDate" = EXCLUDED."triggerDate",
            "offsetMinutes" = EXCLUDED."offsetMinutes",
            "snoozeDurationMinutes" = EXCLUDED."snoozeDurationMinutes",
            "originalTriggerDate" = EXCLUDED."originalTriggerDate",
            "state" = EXCLUDED."state",
            "updatedAt" = EXCLUDED."updatedAt"
        `, [
          reminder.id,
          reminder.userId,
          reminder.taskId ?? null,
          reminder.title,
          reminder.description ?? null,
          reminder.read,
          reminder.persistent,
          reminder.triggerDate ?? null,
          reminder.offsetMinutes ?? null,
          reminder.snoozeDurationMinutes ?? null,
          reminder.originalTriggerDate ?? null,
          reminder.state,
          reminder.createdAt,
          reminder.updatedAt,
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mapTaskDbRowToEntity(row: any): TaskEntity {
    return {
      ...row,
      timer: row.timer || { startTime: null, elapsedTime: 0, isRunning: false },
      children: [],
      updatedAt: row.updatedAt ?? undefined,
    };
  }

  private mapUserSettingsDbRowToEntity(row: any): UserSettingsEntity {
    return {
      ...row,
      monthlyBalances: row.monthlyBalances || {},
      weekStartDay: row.weekStartDay,
      defaultPlanView: row.defaultPlanView,
      preferredWorkingDays: row.preferredWorkingDays || undefined,
      trigram: row.trigram || undefined,
    };
  }

  private mapCircleDbRowToEntity(row: any): CircleEntity {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      nodeType: row.nodeType as CircleNodeType,
      modifier: row.modifier as CircleNodeModifier | undefined,
      color: row.color ?? undefined,
      size: row.size ?? undefined,
      description: row.description ?? undefined,
      purpose: row.purpose ?? undefined,
      domains: row.domains ?? undefined,
      accountabilities: row.accountabilities ?? undefined,
      order: row.order ?? undefined,
      assignments: row.assignments ? (typeof row.assignments === 'string' ? JSON.parse(row.assignments) : row.assignments) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapReminderRowToEntity(row: any): ReminderEntity {
    return {
      id: row.id,
      userId: row.userId,
      taskId: row.taskId ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      read: row.read,
      persistent: row.persistent,
      triggerDate: row.triggerDate ?? undefined,
      offsetMinutes: row.offsetMinutes ?? undefined,
      snoozeDurationMinutes: row.snoozeDurationMinutes ?? undefined,
      originalTriggerDate: row.originalTriggerDate ?? undefined,
      state: row.state,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async clearAllData(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Drop all tables for full schema reset
      await client.query('DROP TABLE IF EXISTS "tasks" CASCADE');
      await client.query('DROP TABLE IF EXISTS "userSettings" CASCADE');
      await client.query('DROP TABLE IF EXISTS "appSettings" CASCADE');
      await client.query('DROP TABLE IF EXISTS "qolSurvey" CASCADE');
      await client.query('DROP TABLE IF EXISTS "filters" CASCADE');
      await client.query('DROP TABLE IF EXISTS "fertilizationBoard" CASCADE');
      await client.query('DROP TABLE IF EXISTS "dreamBoard" CASCADE');
      await client.query('DROP TABLE IF EXISTS "circles" CASCADE');
      await client.query('DROP TABLE IF EXISTS "reminders" CASCADE');

      // Drop legacy tables if they exist
      await client.query('DROP TABLE IF EXISTS tasks CASCADE');
      await client.query('DROP TABLE IF EXISTS user_settings CASCADE');
      await client.query('DROP TABLE IF EXISTS app_settings CASCADE');
      await client.query('DROP TABLE IF EXISTS qol_survey CASCADE');
      await client.query('DROP TABLE IF EXISTS filters CASCADE');
      await client.query('DROP TABLE IF EXISTS fertilization_board CASCADE');
      await client.query('DROP TABLE IF EXISTS dream_board CASCADE');
      await client.query('DROP TABLE IF EXISTS celebration_board CASCADE');

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Re-initialize OUTSIDE the transaction to avoid auto-commit conflicts
    // (this will recreate tables with the new schema and run migrations)
    await this.initialize();
  }
}