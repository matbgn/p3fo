import { Pool, PoolClient } from 'pg';
import { DbClient, SprintWellbeingRecord, applyTaskTemporalMirror } from './index.js';
import type { SprintStateEntity } from '../../src/lib/sprint-types.js';
import type {
  TaskEntity,
  UserSettingsEntity,
  AppSettingsEntity,
  QolSurveyResponseEntity,
  FilterStateEntity,
  FertilizationBoardEntity,
  DreamBoardEntity,
  SalaryBoardEntity,
  CircleEntity,
  CircleNodeType,
  CircleNodeModifier,
  ReminderEntity,
  FrameworkEntity,
  FrameworkType,
  MonthlyBalanceData,
  VoteEntity,
  VoteResponseEntity,
  VoteRankingSubmission,
  VoteLoop,
  VoteModerator,
  VoteKind,
  PomodoroSession
} from '../../src/lib/persistence-types.js';

// Raw database row types for pg (JSONB is already parsed, booleans are booleans)
interface TaskDbRow {
  id: string;
  parentId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string | null;
  triageStatus: string;
  urgent: boolean;
  impact: boolean;
  majorIncident: boolean;
  sprintTarget: boolean;
  difficulty: number;
  timer: { startTime: number | null; elapsedTime: number; isRunning: boolean } | null;
  category: string;
  terminationDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  completedAt: string | null;
  comment: string | null;
  durationInMinutes: number | null;
  priority: number | null;
  userId: string | null;
  linkedVoteIds: string[] | null;
  blockedSince: string | null;
  plannedDate: string | null;
  plannedTime: string | null;
  plannedPosition: string | null;
  color: string | null;
  recurrence: string | null;
  seriesId: string | null;
  occurrenceDate: string | null;
  deletedAt: string | null;
}

interface UserSettingsDbRow {
  userId: string;
  username: string;
  logo: string;
  hasCompletedOnboarding: boolean;
  workload: number | null;
  splitTime: string | null;
  monthlyBalances: Record<string, unknown> | null;
  cardCompactness: number | null;
  timezone: string | null;
  weekStartDay: number | null;
  defaultPlanView: string | null;
  plannerDefault: boolean | null;
  preferredWorkingDays: number[] | Record<string, number> | null;
  trigram: string | null;
  pomodoroConfig: Record<string, unknown> | null;
  focusModeConfig: Record<string, unknown> | null;
  travelerConfig: Record<string, unknown> | null;
  nonActionPeriodHours: number | null;
}

interface CircleDbRow {
  id: string;
  name: string;
  parentId: string | null;
  nodeType: string;
  modifier: string | null;
  color: string | null;
  size: number | null;
  purpose: string | null;
  missions: string | null;
  authorityScope: string | null;
  order: number | null;
  assignments: unknown;
  createdAt: string;
  updatedAt: string;
}

 interface ReminderDbRow {
   id: string;
   userId: string;
   taskId: string | null;
   title: string;
   description: string | null;
   titleKey: string | null;
   titleParams: Record<string, unknown> | null;
   descriptionKey: string | null;
   descriptionParams: Record<string, unknown> | null;
   read: boolean;
   persistent: boolean;
   triggerDate: string | null;
   offsetMinutes: number | null;
   snoozeDurationMinutes: number | null;
   originalTriggerDate: string | null;
   state: string;
   createdAt: string;
   updatedAt: string;
 }

interface FrameworkDbRow {
  id: string;
  name: string;
  frameworkType: string;
  parentId: string | null;
  categories: string;
  createdAt: string;
  updatedAt: string;
}

interface VoteDbRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  ownerId: string;
  proposals: string;
  config: string;
  outcome: string | null;
  linkedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}
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
  disabledModules: [],
  pomodoroConfig: {
    workDuration: 25 * 60 * 1000,
    breakDuration: 5 * 60 * 1000,
    longBreakDuration: 15 * 60 * 1000,
    cyclesBeforeLongBreak: 4,
    pomodoroEnabled: true,
  },
  focusModeConfig: {
    enablePiP: true,
    autoOpenPiPOnStart: true,
    pipWidth: 320,
    pipHeight: 400,
    wakeLock: true,
    soundNotifications: true,
    showFocusOverlay: false,
    autoStartBreak: false,
    autoStartWork: false,
  },
  travelerConfig: {
    travelMode: 'flight',
    departure: '',
    destination: '',
    enabled: true,
  },
  wipLimitPerUser: 5,
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
        "dueDate" TIMESTAMP WITH TIME ZONE,
        "dueTime" TEXT,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "comment" TEXT,
        "durationInMinutes" INTEGER,
        "priority" REAL,
        "userId" TEXT,
        "linkedVoteIds" JSONB,
        "blockedSince" TIMESTAMP WITH TIME ZONE,
        "plannedDate" TEXT,
        "plannedTime" TEXT,
        "plannedPosition" TEXT,
        "color" TEXT DEFAULT 'none',
        "recurrence" TEXT,
        "seriesId" TEXT,
        "occurrenceDate" TEXT,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
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
        "plannerDefault" BOOLEAN,
        "preferredWorkingDays" JSONB,
        "trigram" TEXT,
         "pomodoroConfig" JSONB,
         "focusModeConfig" JSONB,
         "travelerConfig" JSONB
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

    // Create salaryBoard table (transparent salary system)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "salaryBoard" (
        "id" INTEGER PRIMARY KEY DEFAULT 1,
        "data" JSONB
      )
    `);

    // Sprint ceremony state
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "sprintState" (
        "id" INTEGER PRIMARY KEY DEFAULT 1,
        "data" JSONB
      )
    `);

    // Anonymous WHO-5 responses: one row per user per sprint, never exposed raw.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "sprintWellbeing" (
        "sprintId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "answers" JSONB NOT NULL,
        "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("sprintId", "userId")
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
        "purpose" TEXT, -- What service or general functionality does the role-circle provide
        "missions" TEXT, -- What specific services or tasks does the role-circle provide
        "authorityScope" TEXT, -- What are the elements over which the role-circle has exclusive authority
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
        "titleKey" TEXT,
        "titleParams" JSONB,
        "descriptionKey" TEXT,
        "descriptionParams" JSONB,
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

    // Frameworks table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "frameworks" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "frameworkType" TEXT NOT NULL CHECK ("frameworkType" IN ('intentional', 'collaborative')),
        "parentId" TEXT,
        "categories" JSONB NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "fk_frameworks_parent" FOREIGN KEY ("parentId") REFERENCES "frameworks" ("id") DEFERRABLE INITIALLY DEFERRED
      )
    `);

    // Votes table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "votes" (
        "id" TEXT PRIMARY KEY,
        "slug" TEXT NOT NULL UNIQUE,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "ownerId" TEXT NOT NULL,
        "proposals" JSONB NOT NULL DEFAULT '[]',
        "config" JSONB NOT NULL DEFAULT '{}',
        "outcome" JSONB,
        "linkedTaskId" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);

    // Vote responses table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "voteResponses" (
        "id" TEXT PRIMARY KEY,
        "voteId" TEXT NOT NULL REFERENCES "votes"("id") ON DELETE CASCADE,
        "proposalId" TEXT,
        "loopId" TEXT,
        "userId" TEXT,
        "voterToken" TEXT NOT NULL,
        "value" DOUBLE PRECISION NOT NULL,
        "comment" TEXT,
        "submittedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);
    // Replace legacy single-response-per-voter constraint with one that allows
    // one response per (voter, proposal[, loop]) so multi-proposal votes work.
    await this.pool.query(`
      DO $$
      DECLARE
        constraint_record RECORD;
      BEGIN
        FOR constraint_record IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = '"voteResponses"'::regclass
            AND contype = 'u'
            AND ARRAY(
              SELECT attname FROM pg_attribute
              WHERE attrelid = conrelid AND attnum = ANY(conkey)
              ORDER BY array_position(conkey, attnum)
            ) = ARRAY["voteId", "voterToken"]
        LOOP
          EXECUTE format('ALTER TABLE "voteResponses" DROP CONSTRAINT %I', constraint_record.conname);
        END LOOP;
      END $$;
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_voteResponses_voter_proposal_loop"
        ON "voteResponses" ("voteId", "voterToken", COALESCE("proposalId", ''), COALESCE("loopId", ''))
    `);

    // Comparative prioritization ballots
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "voteRankingSubmissions" (
        "id" TEXT PRIMARY KEY,
        "voteId" TEXT NOT NULL REFERENCES "votes"("id") ON DELETE CASCADE,
        "voterToken" TEXT NOT NULL,
        "userId" TEXT,
        "displayName" TEXT,
        "draftPayload" JSONB,
        "submittedPayload" JSONB,
        "draftUpdatedAt" TIMESTAMP WITH TIME ZONE,
        "submittedAt" TIMESTAMP WITH TIME ZONE,
        "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        UNIQUE("voteId", "voterToken")
      )
    `);
    // The UNIQUE("voteId", "voterToken") constraint already provides a btree
    // index whose leading column is voteId, so no separate voteId index is needed.

    // Vote loops table (CONSENT_LOOP)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "voteLoops" (
        "id" TEXT PRIMARY KEY,
        "voteId" TEXT NOT NULL REFERENCES "votes"("id") ON DELETE CASCADE,
        "proposalId" TEXT NOT NULL DEFAULT '',
        "roundNumber" INTEGER NOT NULL,
        "proposalContent" TEXT NOT NULL,
        "openedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "closedAt" TIMESTAMP WITH TIME ZONE,
        "openedByUserId" TEXT NOT NULL,
        "gatingValue" INTEGER,
        "gatingComment" TEXT,
        UNIQUE("voteId", "proposalId", "roundNumber")
      )
    `);

    // Vote moderators table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "voteModerators" (
        "id" TEXT PRIMARY KEY,
        "voteId" TEXT NOT NULL REFERENCES "votes"("id") ON DELETE CASCADE,
        "userId" TEXT,
        "displayName" TEXT NOT NULL,
        "email" TEXT,
        "token" TEXT NOT NULL UNIQUE,
        "addedByUserId" TEXT NOT NULL,
        "addedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT TRUE,
        "lastSeenAt" TIMESTAMP WITH TIME ZONE
      )
    `);

    // Create pomodoroSessions table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "pomodoroSessions" (
        "id" TEXT PRIMARY KEY,
        "taskId" TEXT REFERENCES "tasks"("id") ON DELETE SET NULL,
        "userId" TEXT NOT NULL,
        "startTime" BIGINT NOT NULL,
        "endTime" BIGINT NOT NULL,
        "phase" TEXT NOT NULL,
        "duration" BIGINT NOT NULL,
        "completed" BOOLEAN NOT NULL DEFAULT FALSE,
        "multiplier" INTEGER NOT NULL DEFAULT 1
      )
    `);
    // Add multiplier column for existing deployments (pomodoro boost feature)
    await this.pool.query(`ALTER TABLE "pomodoroSessions" ADD COLUMN IF NOT EXISTS "multiplier" INTEGER NOT NULL DEFAULT 1`);
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

    // Frameworks indexes
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_frameworks_frameworkType" ON "frameworks"("frameworkType")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_frameworks_parentId" ON "frameworks"("parentId")`);

    // Votes indexes
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_votes_slug" ON "votes"("slug")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_votes_ownerId" ON "votes"("ownerId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_votes_linkedTaskId" ON "votes"("linkedTaskId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_voteResponses_voteId" ON "voteResponses"("voteId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_voteResponses_loopId" ON "voteResponses"("loopId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_voteLoops_voteId" ON "voteLoops"("voteId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_voteModerators_voteId" ON "voteModerators"("voteId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_voteModerators_token" ON "voteModerators"("token")`);

    // Pomodoro sessions indexes
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_pomodoro_userId" ON "pomodoroSessions"("userId")`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS "idx_pomodoro_startTime" ON "pomodoroSessions"("startTime")`);

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
    await addColumn('circles', 'authorityScope', 'TEXT');
    await addColumn('circles', 'missions', 'TEXT');
    await addColumn('circles', 'assignments', 'JSONB');

    // Migrate legacy circle columns: rename description→purpose, domains→missions, accountabilities→authorityScope
    await runMigration('circles', 'description', 'purpose');
    await runMigration('circles', 'domains', 'missions');
    await runMigration('circles', 'accountabilities', 'authorityScope');

    // Add new columns for UserSettings
    await addColumn('userSettings', 'weekStartDay', 'INTEGER');
    await addColumn('userSettings', 'defaultPlanView', 'TEXT');
    await addColumn('userSettings', 'plannerDefault', 'BOOLEAN');
    await addColumn('userSettings', 'preferredWorkingDays', 'JSONB');
    await addColumn('userSettings', 'trigram', 'TEXT');
    await addColumn('userSettings', 'pomodoroConfig', 'JSONB');
    await addColumn('userSettings', 'focusModeConfig', 'JSONB');
    await addColumn('userSettings', 'travelerConfig', 'JSONB');
    await addColumn('userSettings', 'nonActionPeriodHours', 'REAL DEFAULT 3');

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
    await addColumn('appSettings', 'disabledModules', 'JSONB');
await addColumn('appSettings', 'pomodoroConfig', 'JSONB');
await addColumn('appSettings', 'focusModeConfig', 'JSONB');
await addColumn('appSettings', 'travelerConfig', 'JSONB');
    await addColumn('appSettings', 'wipLimitPerUser', 'INTEGER DEFAULT 5');

    // QolSurvey columns
    await runMigration('qolSurvey', 'user_id', 'userId');

    // Tasks linkedVoteIds column
    await addColumn('tasks', 'linkedVoteIds', 'JSONB');

    // Tasks blockedSince column (EF prosthetic: tracks when task entered Blocked status)
    await addColumn('tasks', 'blockedSince', 'TIMESTAMP WITH TIME ZONE');

    // Temporal split columns + one-time backfill. A migration marker (rather
    // than a pre-DDL column probe) keeps the backfill retryable: if the process
    // dies after the columns are added but before the backfill commits, the
    // next boot runs it again instead of skipping it forever.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "_migrations" (
        "id" TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await addColumn('tasks', 'dueDate', 'TIMESTAMP WITH TIME ZONE');
    await addColumn('tasks', 'dueTime', 'TEXT');
    await addColumn('tasks', 'completedAt', 'TIMESTAMP WITH TIME ZONE');

    // Planner columns
    await addColumn('tasks', 'plannedDate', 'TEXT');
    await addColumn('tasks', 'plannedTime', 'TEXT');
    await addColumn('tasks', 'plannedPosition', 'TEXT');
    await addColumn('tasks', 'color', "TEXT DEFAULT 'none'");
    await addColumn('tasks', 'recurrence', 'TEXT');
    await addColumn('tasks', 'seriesId', 'TEXT');
    await addColumn('tasks', 'occurrenceDate', 'TEXT');
    await addColumn('tasks', 'deletedAt', 'TIMESTAMP WITH TIME ZONE');

    // Lazy backfill: before the temporal split, terminationDate was both the
    // deadline and the completion timestamp. Preserve both meanings for rows
    // touched since the deploy window. The marker is written in the same
    // transaction as the updates, so a crash or failed migration retries on
    // the next start. Older rows are not rewritten: readers fall back to
    // terminationDate for historical data, and touching the full history at
    // boot would lock a large part of the table.
    const TEMPORAL_BACKFILL_WINDOW_DAYS = 2;
    const temporalBackfillCutoff = new Date(
      Date.now() - TEMPORAL_BACKFILL_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    const temporalSplitMigrationId = 'tasks.temporal-split-backfill';
    const migrationClient = await this.pool.connect();
    try {
      await migrationClient.query('BEGIN');
      const marker = await migrationClient.query(
        `SELECT 1 FROM "_migrations" WHERE "id" = $1`,
        [temporalSplitMigrationId],
      );
      if (marker.rows.length === 0) {
        await migrationClient.query(`
          UPDATE "tasks"
          SET "dueDate" = "terminationDate"
          WHERE "dueDate" IS NULL
            AND "completedAt" IS NULL
            AND "terminationDate" IS NOT NULL
            AND "triageStatus" <> 'Done'
            AND "updatedAt" >= $1::timestamptz
        `, [temporalBackfillCutoff]);
        await migrationClient.query(`
          UPDATE "tasks"
          SET "completedAt" = "terminationDate"
          WHERE "completedAt" IS NULL
            AND "terminationDate" IS NOT NULL
            AND "triageStatus" = 'Done'
            AND "updatedAt" >= $1::timestamptz
        `, [temporalBackfillCutoff]);
        await migrationClient.query(
          `INSERT INTO "_migrations" ("id") VALUES ($1) ON CONFLICT ("id") DO NOTHING`,
          [temporalSplitMigrationId],
        );
      }
      await migrationClient.query('COMMIT');
    } catch (error) {
      await migrationClient.query('ROLLBACK').catch(() => undefined);
      console.error('Task temporal split backfill failed; it will retry on next start:', error);
    } finally {
      migrationClient.release();
    }

    // Historical timed deadlines are derived on read (see normalizeDueTime).
    // Do not backfill the new dueTime column here: dueDate stores an instant in
    // the device-local date domain, so any single app/session timezone (e.g.
    // appSettings.timezone, usually UTC on the server) would bake a shifted
    // wall clock into every historical row, and an explicit dueTime wins on
    // read, making that shift permanent. A full-history rewrite at boot would
    // also contradict the bounded temporal-split backfill above.

    // VoteLoops proposalId column (per-proposal loops)
    await addColumn('voteLoops', 'proposalId', 'TEXT NOT NULL DEFAULT \'\'');
    await addColumn('voteLoops', 'gatingValue', 'INTEGER');
    await addColumn('voteLoops', 'gatingComment', 'TEXT');

    // Reminders i18n columns (system-generated reminders store a translation
    // key + params instead of baked-in text, so they re-localize on language
    // change). Params stored as JSONB for native parsing.
    await addColumn('reminders', 'titleKey', 'TEXT');
    await addColumn('reminders', 'titleParams', 'JSONB');
    await addColumn('reminders', 'descriptionKey', 'TEXT');
    await addColumn('reminders', 'descriptionParams', 'JSONB');

     await this.tryAddVoteLoopsUniqueConstraint();

    // Migrate tasks.priority from INTEGER to REAL so dot-notation float
    // priorities (e.g. 1.01, 1.0102) can be stored and ordered correctly.
    await this.tryMigrateTasksPriorityToReal();
  }

  /**
   * Alter tasks.priority column type from INTEGER to REAL if needed.
   * Postgres supports ALTER COLUMN TYPE in place — no table rebuild required.
   */
  private async tryMigrateTasksPriorityToReal(): Promise<void> {
    try {
      const res = await this.pool.query(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = 'tasks' AND column_name = 'priority'`,
      );
      if (res.rows.length === 0) return;
      const dataType = (res.rows[0] as { data_type: string }).data_type;
      // integer → needs migration. real/double precision/numeric are already float-compatible.
      if (dataType === 'integer') {
        console.log('Migrating tasks.priority INTEGER -> REAL...');
        await this.pool.query(`ALTER TABLE "tasks" ALTER COLUMN "priority" TYPE REAL`);
        console.log('tasks.priority migrated to REAL.');
      }
    } catch (e) {
      console.error('Error migrating tasks.priority to REAL:', e);
    }
  }

  private async tryAddVoteLoopsUniqueConstraint(): Promise<void> {
    try {
      const constraintCheck = await this.pool.query(
        `SELECT 1 FROM information_schema.table_constraints
         WHERE table_name = 'voteLoops' AND constraint_type = 'UNIQUE'`
      );
      if (constraintCheck.rows.length > 0) return;

      await this.pool.query(
        `ALTER TABLE "voteLoops" ADD CONSTRAINT "voteLoops_voteId_proposalId_roundNumber_key" UNIQUE ("voteId", "proposalId", "roundNumber")`
      );
    } catch (e) {
      console.error('Error adding voteLoops unique constraint:', e);
    }
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
  async getTasks(
    userId?: string,
    pagination?: { limit?: number; offset?: number },
    excludeStatuses?: string[],
    triageStatuses?: string[],
    includeSubtasks?: boolean,
    options?: { search?: string; active?: boolean; includeDeleted?: boolean },
  ): Promise<{ data: TaskEntity[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`"userId" = $${paramIndex++}`);
      params.push(userId);
    }

    if (excludeStatuses && excludeStatuses.length > 0) {
      const placeholders = excludeStatuses.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`"triageStatus" NOT IN (${placeholders})`);
      params.push(...excludeStatuses);
    }

    if (triageStatuses && triageStatuses.length > 0) {
      const placeholders = triageStatuses.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`"triageStatus" IN (${placeholders})`);
      params.push(...triageStatuses);
    }

    if (options?.active) {
      conditions.push(`"triageStatus" IN ('WIP', 'Ready', 'Blocked')`);
    }

    if (options?.search) {
      conditions.push(`"title" ILIKE $${paramIndex++}`);
      params.push(`%${options.search}%`);
    }

    if (includeSubtasks === false) {
      conditions.push(`"parentId" IS NULL`);
    }

    // Soft-deleted tombstone rows stay in the table so recurrence expansion can
    // suppress deleted occurrences. Callers that render tasks must opt in to
    // receive them; MCP listings and audits use the default and exclude them.
    if (!options?.includeDeleted) {
      conditions.push(`"deletedAt" IS NULL`);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as count FROM "tasks"${whereClause}`;
    const countResult = await this.pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count);

    let sql = `SELECT * FROM "tasks"${whereClause}`;
    // Priority is ascending (1 = highest). Unprioritized tasks sort last so a
    // default listing starts with actionable work instead of archived/legacy
    // low-value rows.
    sql += ' ORDER BY "priority" ASC NULLS LAST, "createdAt" ASC';

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
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      triageStatus: input.triageStatus || 'Backlog',
      urgent: input.urgent || false,
      impact: input.impact || false,
      majorIncident: input.majorIncident || false,
      sprintTarget: input.sprintTarget || false,
      difficulty: input.difficulty || 1,
      timer: input.timer || [],
      category: input.category || 'General',
      terminationDate: input.terminationDate || null,
      dueDate: input.dueDate || null,
      dueTime: input.dueTime ?? null,
      completedAt: input.completedAt || null,
      comment: input.comment || null,
      durationInMinutes: input.durationInMinutes || null,
      priority: input.priority ?? null,
      userId: input.userId || null,
      parentId: input.parentId || null,
      children: input.children || [],
      linkedVoteIds: input.linkedVoteIds || undefined,
      blockedSince: input.blockedSince || null,
      plannedDate: input.plannedDate ?? null,
      plannedTime: input.plannedTime ?? null,
      plannedPosition: input.plannedPosition ?? null,
      color: input.color ?? 'none',
      recurrence: input.recurrence ?? null,
      seriesId: input.seriesId ?? null,
      occurrenceDate: input.occurrenceDate ?? null,
      deletedAt: input.deletedAt ?? null,
    };

    applyTaskTemporalMirror(newTask, input);

    await this.pool.query(`
      INSERT INTO "tasks" ("id", "parentId", "title", "createdAt", "updatedAt", "triageStatus", "urgent", "impact", "majorIncident", "sprintTarget",
                         "difficulty", "timer", "category", "terminationDate", "dueDate", "dueTime", "completedAt", "comment", "durationInMinutes", "priority", "userId", "linkedVoteIds", "blockedSince",
                         "plannedDate", "plannedTime", "plannedPosition", "color", "recurrence", "seriesId", "occurrenceDate", "deletedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
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
      newTask.dueDate ?? null,
      newTask.dueTime ?? null,
      newTask.completedAt ?? null,
      newTask.comment,
      newTask.durationInMinutes,
      newTask.priority,
      newTask.userId,
      newTask.linkedVoteIds || null,
      newTask.blockedSince,
      newTask.plannedDate ?? null,
      newTask.plannedTime ?? null,
      newTask.plannedPosition ?? null,
      newTask.color ?? 'none',
      newTask.recurrence ?? null,
      newTask.seriesId ?? null,
      newTask.occurrenceDate ?? null,
      newTask.deletedAt ?? null,
    ]);

    return newTask;
  }

  async updateTask(id: string, patch: Partial<TaskEntity>): Promise<TaskEntity | null> {
    const currentTask = await this.getTaskById(id);
    if (!currentTask) {
      return null;
    }

    const updatedTask = applyTaskTemporalMirror({ ...currentTask, ...patch }, patch, currentTask.triageStatus) as TaskEntity;

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
      updatedTask.dueDate ?? null,
      updatedTask.dueTime ?? null,
      updatedTask.completedAt ?? null,
      updatedTask.comment,
      updatedTask.durationInMinutes,
      updatedTask.priority,
      updatedTask.userId,
      updatedTask.linkedVoteIds ? JSON.stringify(updatedTask.linkedVoteIds) : null,
      updatedTask.blockedSince ?? null,
      updatedTask.plannedDate ?? null,
      updatedTask.plannedTime ?? null,
      updatedTask.plannedPosition ?? null,
      updatedTask.color ?? 'none',
      updatedTask.recurrence ?? null,
      updatedTask.seriesId ?? null,
      updatedTask.occurrenceDate ?? null,
      updatedTask.deletedAt ?? null,
      id
    ];

    await this.pool.query(`
      UPDATE "tasks"
      SET "parentId" = $1, "title" = $2, "updatedAt" = $3, "triageStatus" = $4, "urgent" = $5,
          "impact" = $6, "majorIncident" = $7, "sprintTarget" = $8, "difficulty" = $9, "timer" = $10,
          "category" = $11, "terminationDate" = $12, "dueDate" = $13, "dueTime" = $14, "completedAt" = $15, "comment" = $16,
          "durationInMinutes" = $17, "priority" = $18, "userId" = $19, "linkedVoteIds" = $20, "blockedSince" = $21,
          "plannedDate" = $22, "plannedTime" = $23, "plannedPosition" = $24, "color" = $25,
          "recurrence" = $26, "seriesId" = $27, "occurrenceDate" = $28, "deletedAt" = $29
      WHERE "id" = $30
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

  async bulkUpdateSprintTargets(items: { id: string; sprintTarget: boolean }[]): Promise<void> {
    if (items.length === 0) return;
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE "tasks" AS t
         SET "sprintTarget" = v."sprintTarget"
         FROM unnest($1::text[], $2::boolean[]) AS v("id", "sprintTarget")
         WHERE t."id" = v."id"`,
        [items.map((item) => item.id), items.map((item) => item.sprintTarget)],
      );

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
        applyTaskTemporalMirror(task, task, task.triageStatus);
        await client.query(`
          INSERT INTO "tasks" ("id", "parentId", "title", "createdAt", "updatedAt", "triageStatus", "urgent", "impact", "majorIncident", "sprintTarget",
                             "difficulty", "timer", "category", "terminationDate", "dueDate", "dueTime", "completedAt", "comment", "durationInMinutes", "priority", "userId", "linkedVoteIds", "blockedSince",
                             "plannedDate", "plannedTime", "plannedPosition", "color", "recurrence", "seriesId", "occurrenceDate", "deletedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
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
            "dueDate" = EXCLUDED."dueDate",
            "dueTime" = EXCLUDED."dueTime",
            "completedAt" = EXCLUDED."completedAt",
            "comment" = EXCLUDED."comment",
            "durationInMinutes" = EXCLUDED."durationInMinutes",
            "priority" = EXCLUDED."priority",
            "userId" = EXCLUDED."userId",
            "linkedVoteIds" = EXCLUDED."linkedVoteIds",
            "blockedSince" = EXCLUDED."blockedSince",
            "plannedDate" = EXCLUDED."plannedDate",
            "plannedTime" = EXCLUDED."plannedTime",
            "plannedPosition" = EXCLUDED."plannedPosition",
            "color" = EXCLUDED."color",
            "recurrence" = EXCLUDED."recurrence",
            "seriesId" = EXCLUDED."seriesId",
            "occurrenceDate" = EXCLUDED."occurrenceDate",
            "deletedAt" = EXCLUDED."deletedAt"
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
          task.dueDate ?? null,
          task.dueTime ?? null,
          task.completedAt ?? null,
          task.comment,
          task.durationInMinutes,
          task.priority,
          task.userId,
          task.linkedVoteIds ? JSON.stringify(task.linkedVoteIds) : null,
          task.blockedSince ?? null,
          task.plannedDate ?? null,
          task.plannedTime ?? null,
          task.plannedPosition ?? null,
          task.color ?? 'none',
          task.recurrence ?? null,
          task.seriesId ?? null,
          task.occurrenceDate ?? null,
          task.deletedAt ?? null,
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
      INSERT INTO "userSettings" ("userId", "username", "logo", "hasCompletedOnboarding", "workload", "splitTime", "monthlyBalances", "timezone", "cardCompactness", "weekStartDay", "defaultPlanView", "plannerDefault", "preferredWorkingDays", "trigram", "pomodoroConfig", "focusModeConfig", "travelerConfig", "nonActionPeriodHours")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
        "plannerDefault" = EXCLUDED."plannerDefault",
        "preferredWorkingDays" = EXCLUDED."preferredWorkingDays",
        "trigram" = EXCLUDED."trigram",
        "pomodoroConfig" = EXCLUDED."pomodoroConfig",
        "focusModeConfig" = EXCLUDED."focusModeConfig",
        "travelerConfig" = EXCLUDED."travelerConfig",
        "nonActionPeriodHours" = EXCLUDED."nonActionPeriodHours"
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
      updated.plannerDefault ?? false,
      updated.preferredWorkingDays ? JSON.stringify(updated.preferredWorkingDays) : null,
      updated.trigram ?? null,
      updated.pomodoroConfig ? JSON.stringify(updated.pomodoroConfig) : null,
      updated.focusModeConfig ? JSON.stringify(updated.focusModeConfig) : null,
      updated.travelerConfig ? JSON.stringify(updated.travelerConfig) : null,
      updated.nonActionPeriodHours ?? null,
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
        disabledModules: typeof row.disabledModules === 'string' ? JSON.parse(row.disabledModules) : (row.disabledModules ?? []),
        pomodoroConfig: typeof row.pomodoroConfig === 'string' ? JSON.parse(row.pomodoroConfig) : (row.pomodoroConfig ?? DEFAULT_APP_SETTINGS.pomodoroConfig),
        focusModeConfig: typeof row.focusModeConfig === 'string' ? JSON.parse(row.focusModeConfig) : (row.focusModeConfig ?? DEFAULT_APP_SETTINGS.focusModeConfig),
        travelerConfig: typeof row.travelerConfig === 'string' ? JSON.parse(row.travelerConfig) : (row.travelerConfig ?? DEFAULT_APP_SETTINGS.travelerConfig),
        wipLimitPerUser: row.wipLimitPerUser ?? DEFAULT_APP_SETTINGS.wipLimitPerUser,
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
                                "hourlyBalanceLimitLower", "cardAgingBaseDays", "timezone", "country", "region", "disabledModules", "pomodoroConfig", "focusModeConfig", "travelerConfig", "wipLimitPerUser")
      VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
        "region" = EXCLUDED."region",
        "disabledModules" = EXCLUDED."disabledModules",
        "pomodoroConfig" = EXCLUDED."pomodoroConfig",
        "focusModeConfig" = EXCLUDED."focusModeConfig",
        "travelerConfig" = EXCLUDED."travelerConfig",
        "wipLimitPerUser" = EXCLUDED."wipLimitPerUser"
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
      updated.region,
      JSON.stringify(updated.disabledModules ?? []),
      JSON.stringify(updated.pomodoroConfig ?? DEFAULT_APP_SETTINGS.pomodoroConfig),
      JSON.stringify(updated.focusModeConfig ?? DEFAULT_APP_SETTINGS.focusModeConfig),
      JSON.stringify(updated.travelerConfig ?? DEFAULT_APP_SETTINGS.travelerConfig),
      updated.wipLimitPerUser ?? DEFAULT_APP_SETTINGS.wipLimitPerUser,
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

  // Salary Board
  async getSalaryBoardState(): Promise<SalaryBoardEntity | null> {
    const result = await this.pool.query('SELECT "data" FROM "salaryBoard" WHERE "id" = 1');
    if (result.rows.length > 0 && result.rows[0].data) {
      return result.rows[0].data;
    }
    return null;
  }

  async updateSalaryBoardState(state: SalaryBoardEntity): Promise<void> {
    await this.pool.query(`
        INSERT INTO "salaryBoard" ("id", "data")
        VALUES (1, $1)
        ON CONFLICT ("id") DO UPDATE SET "data" = EXCLUDED."data"
      `, [JSON.stringify(state)]);
  }

  // Sprint ceremony
  async getSprintState(): Promise<SprintStateEntity | null> {
    const result = await this.pool.query('SELECT "data" FROM "sprintState" WHERE "id" = 1');
    if (result.rows.length > 0 && result.rows[0].data) {
      return result.rows[0].data;
    }
    return null;
  }

  async updateSprintState(state: SprintStateEntity): Promise<void> {
    await this.pool.query(`
        INSERT INTO "sprintState" ("id", "data")
        VALUES (1, $1)
        ON CONFLICT ("id") DO UPDATE SET "data" = EXCLUDED."data"
      `, [JSON.stringify(state)]);
  }

  async compareAndUpdateSprintState(
    state: SprintStateEntity,
    expectedUpdatedAt: string | null,
  ): Promise<boolean> {
    if (expectedUpdatedAt === null) {
      const result = await this.pool.query(
        `INSERT INTO "sprintState" ("id", "data")
         VALUES (1, $1)
         ON CONFLICT ("id") DO UPDATE SET "data" = EXCLUDED."data"
         WHERE ("sprintState"."data"->>'updatedAt') IS NULL`,
        [JSON.stringify(state)],
      );
      return (result.rowCount ?? 0) > 0;
    }

    const result = await this.pool.query(
      `UPDATE "sprintState"
       SET "data" = $1
       WHERE "id" = 1 AND ("data"->>'updatedAt') = $2`,
      [JSON.stringify(state), expectedUpdatedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getSprintWellbeing(sprintId: string): Promise<SprintWellbeingRecord[]> {
    const result = await this.pool.query(
      'SELECT "userId", "answers", "submittedAt" FROM "sprintWellbeing" WHERE "sprintId" = $1',
      [sprintId],
    );
    return result.rows.map((row) => ({
      userId: row.userId,
      answers: row.answers as number[],
      submittedAt: row.submittedAt?.toISOString?.() ?? String(row.submittedAt),
    }));
  }

  async submitSprintWellbeing(sprintId: string, userId: string, answers: number[]): Promise<void> {
    await this.pool.query(`
        INSERT INTO "sprintWellbeing" ("sprintId", "userId", "answers")
        VALUES ($1, $2, $3)
        ON CONFLICT ("sprintId", "userId") DO NOTHING
      `, [sprintId, userId, JSON.stringify(answers)]);
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
      purpose: input.purpose,
      missions: input.missions,
      authorityScope: input.authorityScope,
      order: input.order,
      assignments: input.assignments,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    };

    await this.pool.query(`
      INSERT INTO "circles" ("id", "name", "parentId", "nodeType", "modifier", "color", "size", "purpose", "missions", "authorityScope", "order", "assignments", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      newCircle.id,
      newCircle.name,
      newCircle.parentId,
      newCircle.nodeType,
      newCircle.modifier ?? null,
      newCircle.color ?? null,
      newCircle.size ?? null,
      newCircle.purpose ?? null,
      newCircle.missions ?? null,
      newCircle.authorityScope ?? null,
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
          "color" = $5, "size" = $6, "purpose" = $7, "missions" = $8,
          "authorityScope" = $9, "order" = $10, "assignments" = $11, "updatedAt" = $12
      WHERE "id" = $13
    `, [
      updated.name,
      updated.parentId,
      updated.nodeType,
      updated.modifier ?? null,
      updated.color ?? null,
      updated.size ?? null,
      updated.purpose ?? null,
      updated.missions ?? null,
      updated.authorityScope ?? null,
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
          INSERT INTO "circles"("id", "name", "parentId", "nodeType", "modifier", "color", "size", "purpose", "missions", "authorityScope", "order", "assignments", "createdAt", "updatedAt")
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT ("id") DO UPDATE SET
            "name" = EXCLUDED."name",
            "parentId" = EXCLUDED."parentId",
            "nodeType" = EXCLUDED."nodeType",
            "modifier" = EXCLUDED."modifier",
            "color" = EXCLUDED."color",
            "size" = EXCLUDED."size",
            "purpose" = EXCLUDED."purpose",
            "missions" = EXCLUDED."missions",
            "authorityScope" = EXCLUDED."authorityScope",
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
          circle.purpose ?? null,
          circle.missions ?? null,
          circle.authorityScope ?? null,
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
      titleKey: input.titleKey,
      titleParams: input.titleParams,
      descriptionKey: input.descriptionKey,
      descriptionParams: input.descriptionParams,
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
      INSERT INTO "reminders"("id", "userId", "taskId", "title", "description", "titleKey", "titleParams",
        "descriptionKey", "descriptionParams", "read", "persistent",
        "triggerDate", "offsetMinutes", "snoozeDurationMinutes", "originalTriggerDate", "state", "createdAt", "updatedAt")
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `, [
      reminder.id,
      reminder.userId,
      reminder.taskId ?? null,
      reminder.title,
      reminder.description ?? null,
      reminder.titleKey ?? null,
      reminder.titleParams ?? null,
      reminder.descriptionKey ?? null,
      reminder.descriptionParams ?? null,
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
        "titleKey" = $3,
        "titleParams" = $4,
        "descriptionKey" = $5,
        "descriptionParams" = $6,
        "read" = $7,
        "persistent" = $8,
        "triggerDate" = $9,
        "offsetMinutes" = $10,
        "snoozeDurationMinutes" = $11,
        "originalTriggerDate" = $12,
        "state" = $13,
        "updatedAt" = $14
      WHERE "id" = $15
    `, [
      updated.title,
      updated.description ?? null,
      updated.titleKey ?? null,
      updated.titleParams ?? null,
      updated.descriptionKey ?? null,
      updated.descriptionParams ?? null,
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
          INSERT INTO "reminders"("id", "userId", "taskId", "title", "description", "titleKey", "titleParams",
            "descriptionKey", "descriptionParams", "read", "persistent",
            "triggerDate", "offsetMinutes", "snoozeDurationMinutes", "originalTriggerDate", "state", "createdAt", "updatedAt")
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT ("id") DO UPDATE SET
            "userId" = EXCLUDED."userId",
            "taskId" = EXCLUDED."taskId",
            "title" = EXCLUDED."title",
            "description" = EXCLUDED."description",
            "titleKey" = EXCLUDED."titleKey",
            "titleParams" = EXCLUDED."titleParams",
            "descriptionKey" = EXCLUDED."descriptionKey",
            "descriptionParams" = EXCLUDED."descriptionParams",
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
          reminder.titleKey ?? null,
          reminder.titleParams ?? null,
          reminder.descriptionKey ?? null,
          reminder.descriptionParams ?? null,
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

  // Frameworks
  async getFrameworks(frameworkType?: string): Promise<FrameworkEntity[]> {
    let sql = 'SELECT * FROM "frameworks"';
    const params: string[] = [];
    if (frameworkType) {
      sql += ' WHERE "frameworkType" = $1';
      params.push(frameworkType);
    }
    sql += ' ORDER BY "createdAt" ASC';
    const result = await this.pool.query(sql, params);
    return result.rows.map((row: FrameworkDbRow) => this.mapFrameworkDbRowToEntity(row));
  }

  async getFrameworkById(id: string): Promise<FrameworkEntity | null> {
    const result = await this.pool.query('SELECT * FROM "frameworks" WHERE "id" = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.mapFrameworkDbRowToEntity(result.rows[0]);
  }

  async createFramework(input: Partial<FrameworkEntity>): Promise<FrameworkEntity> {
    const now = new Date().toISOString();
    const newFramework: FrameworkEntity = {
      id: input.id || crypto.randomUUID(),
      name: input.name || 'New Framework',
      frameworkType: input.frameworkType || 'intentional',
      parentId: input.parentId ?? null,
      categories: input.categories || [],
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    };

    await this.pool.query(`
      INSERT INTO "frameworks"("id", "name", "frameworkType", "parentId", "categories", "createdAt", "updatedAt")
      VALUES($1, $2, $3, $4, $5, $6, $7)
    `, [
      newFramework.id,
      newFramework.name,
      newFramework.frameworkType,
      newFramework.parentId,
      JSON.stringify(newFramework.categories),
      newFramework.createdAt,
      newFramework.updatedAt,
    ]);

    return newFramework;
  }

  async updateFramework(id: string, patch: Partial<FrameworkEntity>): Promise<FrameworkEntity | null> {
    const current = await this.getFrameworkById(id);
    if (!current) return null;

    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };

    await this.pool.query(`
      UPDATE "frameworks" SET
        "name" = $1, "frameworkType" = $2, "parentId" = $3, "categories" = $4, "updatedAt" = $5
      WHERE "id" = $6
    `, [
      updated.name,
      updated.frameworkType,
      updated.parentId,
      JSON.stringify(updated.categories),
      updated.updatedAt,
      updated.id,
    ]);

    return updated;
  }

  async deleteFramework(id: string): Promise<void> {
    await this.pool.query('DELETE FROM "frameworks" WHERE "id" = $1', [id]);
  }

  async importFrameworks(frameworks: FrameworkEntity[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const framework of frameworks) {
        await client.query(`
          INSERT INTO "frameworks"("id", "name", "frameworkType", "parentId", "categories", "createdAt", "updatedAt")
          VALUES($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT ("id") DO UPDATE SET
            "name" = EXCLUDED."name",
            "frameworkType" = EXCLUDED."frameworkType",
            "parentId" = EXCLUDED."parentId",
            "categories" = EXCLUDED."categories",
            "updatedAt" = EXCLUDED."updatedAt"
        `, [
          framework.id,
          framework.name,
          framework.frameworkType,
          framework.parentId,
          JSON.stringify(framework.categories),
          framework.createdAt,
          framework.updatedAt,
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

  private mapFrameworkDbRowToEntity(row: FrameworkDbRow): FrameworkEntity {
    return {
      id: row.id,
      name: row.name,
      frameworkType: row.frameworkType as FrameworkType,
      parentId: row.parentId,
      categories: typeof row.categories === 'string' ? JSON.parse(row.categories) : (row.categories || []),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Votes
  async getVotes(opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }): Promise<VoteEntity[]> {
    const conditions: string[] = [];
    const params: (string | null)[] = [];
    let paramIdx = 1;

    if (opts?.linkedTaskId) {
      conditions.push(`"linkedTaskId" = $${paramIdx++}`);
      params.push(opts.linkedTaskId);
    }
    if (opts?.ownerId) {
      conditions.push(`"ownerId" = $${paramIdx++}`);
      params.push(opts.ownerId);
    }
    if (opts?.kind) {
      conditions.push(`"config"->>'kind' = $${paramIdx++}`);
      params.push(opts.kind);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query(`SELECT * FROM "votes"${whereClause} ORDER BY "createdAt" DESC`, params);
    return result.rows.map((row: VoteDbRow) => this.mapVoteDbRowToEntity(row));
  }

  async getVoteById(id: string): Promise<VoteEntity | null> {
    const result = await this.pool.query('SELECT * FROM "votes" WHERE "id" = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.mapVoteDbRowToEntity(result.rows[0]);
  }

  async getVoteBySlug(slug: string): Promise<VoteEntity | null> {
    const result = await this.pool.query('SELECT * FROM "votes" WHERE "slug" = $1', [slug]);
    if (result.rows.length === 0) return null;
    return this.mapVoteDbRowToEntity(result.rows[0]);
  }

  async createVote(input: Partial<VoteEntity>): Promise<VoteEntity> {
    const now = new Date().toISOString();
    const slug = input.slug || this.generateSlug();
    const newVote: VoteEntity = {
      id: input.id || crypto.randomUUID(),
      slug,
      title: input.title || 'New Vote',
      description: input.description,
      ownerId: input.ownerId || 'unknown',
      proposals: input.proposals || [],
      config: input.config || { mode: 'THUMBS_UP', kind: 'consultation', phase: 'IDLE' },
      outcome: input.outcome,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
      linkedTaskId: input.linkedTaskId,
    };

    await this.pool.query(`
      INSERT INTO "votes"("id", "slug", "title", "description", "ownerId", "proposals", "config", "outcome", "linkedTaskId", "createdAt", "updatedAt")
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      newVote.id,
      newVote.slug,
      newVote.title,
      newVote.description ?? null,
      newVote.ownerId,
      JSON.stringify(newVote.proposals),
      JSON.stringify(newVote.config),
      newVote.outcome ? JSON.stringify(newVote.outcome) : null,
      newVote.linkedTaskId ?? null,
      newVote.createdAt,
      newVote.updatedAt,
    ]);

    return newVote;
  }

  async updateVote(id: string, patch: Partial<VoteEntity>): Promise<VoteEntity | null> {
    const current = await this.getVoteById(id);
    if (!current) return null;

    if (current.config.phase === 'FINALIZED' && patch.config?.phase === 'FINALIZED') {
      return current;
    }

    const updated: VoteEntity = {
      ...current,
      ...patch,
      config: patch.config ? { ...current.config, ...patch.config } : current.config,
      proposals: patch.proposals ?? current.proposals,
      outcome: patch.outcome ?? current.outcome,
      updatedAt: new Date().toISOString(),
    };

    await this.pool.query(`
      UPDATE "votes" SET
        "title" = $1, "description" = $2, "ownerId" = $3, "proposals" = $4,
        "config" = $5, "outcome" = $6, "linkedTaskId" = $7, "updatedAt" = $8
      WHERE "id" = $9
    `, [
      updated.title,
      updated.description ?? null,
      updated.ownerId,
      JSON.stringify(updated.proposals),
      JSON.stringify(updated.config),
      updated.outcome ? JSON.stringify(updated.outcome) : null,
      updated.linkedTaskId ?? null,
      updated.updatedAt,
      updated.id,
    ]);

    return updated;
  }

  async finalizeVote(id: string, outcome: VoteEntity['outcome']): Promise<VoteEntity | null> {
    const current = await this.getVoteById(id);
    if (!current) return null;

    const updated: VoteEntity = {
      ...current,
      config: { ...current.config, phase: 'FINALIZED' },
      outcome,
      updatedAt: new Date().toISOString(),
    };

    await this.pool.query(`
      UPDATE "votes" SET "config" = $1, "outcome" = $2, "updatedAt" = $3 WHERE "id" = $4
    `, [
      JSON.stringify(updated.config),
      JSON.stringify(updated.outcome),
      updated.updatedAt,
      updated.id,
    ]);

    return updated;
  }

  async deleteVote(id: string): Promise<void> {
    await this.pool.query('DELETE FROM "votes" WHERE "id" = $1', [id]);
  }

  async resetVote(id: string): Promise<VoteEntity | null> {
    await this.pool.query('DELETE FROM "voteResponses" WHERE "voteId" = $1', [id]);
    await this.pool.query('DELETE FROM "voteRankingSubmissions" WHERE "voteId" = $1', [id]);
    await this.pool.query('DELETE FROM "voteLoops" WHERE "voteId" = $1', [id]);

    const result = await this.pool.query(
      `UPDATE "votes" SET "config" = jsonb_set("config", '{phase}', '"IDLE"'), "outcome" = NULL, "updatedAt" = $1 WHERE "id" = $2 RETURNING *`,
      [new Date().toISOString(), id],
    );
    if (result.rows.length === 0) return null;
    return this.mapVoteDbRowToEntity(result.rows[0]);
  }

  async importVotes(items: VoteEntity[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const vote of items) {
        await client.query(`
          INSERT INTO "votes"("id", "slug", "title", "description", "ownerId", "proposals", "config", "outcome", "linkedTaskId", "createdAt", "updatedAt")
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT ("id") DO UPDATE SET
            "slug" = EXCLUDED."slug",
            "title" = EXCLUDED."title",
            "description" = EXCLUDED."description",
            "ownerId" = EXCLUDED."ownerId",
            "proposals" = EXCLUDED."proposals",
            "config" = EXCLUDED."config",
            "outcome" = EXCLUDED."outcome",
            "linkedTaskId" = EXCLUDED."linkedTaskId",
            "updatedAt" = EXCLUDED."updatedAt"
        `, [
          vote.id,
          vote.slug,
          vote.title,
          vote.description ?? null,
          vote.ownerId,
          JSON.stringify(vote.proposals),
          JSON.stringify(vote.config),
          vote.outcome ? JSON.stringify(vote.outcome) : null,
          vote.linkedTaskId ?? null,
          vote.createdAt,
          vote.updatedAt,
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

  private generateSlug(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let slug = '';
    for (let i = 0; i < 7; i++) {
      slug += chars[Math.floor(Math.random() * chars.length)];
    }
    return slug;
  }

  private mapVoteDbRowToEntity(row: VoteDbRow): VoteEntity {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description ?? undefined,
      ownerId: row.ownerId,
      proposals: typeof row.proposals === 'string' ? JSON.parse(row.proposals) : (row.proposals || []),
      config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}),
      outcome: row.outcome ? (typeof row.outcome === 'string' ? JSON.parse(row.outcome) : row.outcome) : undefined,
      linkedTaskId: row.linkedTaskId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Vote responses
  async getVoteResponses(voteId: string): Promise<VoteResponseEntity[]> {
    const result = await this.pool.query('SELECT * FROM "voteResponses" WHERE "voteId" = $1 ORDER BY "submittedAt" ASC', [voteId]);
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      voteId: row.voteId as string,
      proposalId: row.proposalId as string | null,
      loopId: (row.loopId as string | null) ?? undefined,
      userId: row.userId as string | null,
      voterToken: row.voterToken as string,
      value: row.value as number,
      comment: (row.comment as string | null) ?? undefined,
      submittedAt: row.submittedAt as string,
    }));
  }

  async createVoteResponse(voteId: string, response: Partial<VoteResponseEntity>): Promise<VoteResponseEntity> {
    const newResponse: VoteResponseEntity = {
      id: response.id || crypto.randomUUID(),
      voteId,
      proposalId: response.proposalId ?? null,
      loopId: response.loopId,
      userId: response.userId ?? null,
      voterToken: response.voterToken || crypto.randomUUID(),
      value: response.value ?? 0,
      comment: response.comment,
      submittedAt: response.submittedAt || new Date().toISOString(),
    };

    await this.pool.query(`
      INSERT INTO "voteResponses"("id", "voteId", "proposalId", "loopId", "userId", "voterToken", "value", "comment", "submittedAt")
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT ("voteId", "voterToken", (COALESCE("proposalId", '')), (COALESCE("loopId", '')))
        DO UPDATE SET
          "proposalId" = EXCLUDED."proposalId",
          "loopId" = EXCLUDED."loopId",
          "userId" = EXCLUDED."userId",
          "value" = EXCLUDED."value",
          "comment" = EXCLUDED."comment",
          "submittedAt" = EXCLUDED."submittedAt"
    `, [
      newResponse.id,
      newResponse.voteId,
      newResponse.proposalId,
      newResponse.loopId ?? null,
      newResponse.userId,
      newResponse.voterToken,
      newResponse.value,
      newResponse.comment ?? null,
      newResponse.submittedAt,
    ]);

    return newResponse;
  }

  async deleteVoteResponse(
    voteId: string,
    voterToken: string,
    proposalId: string | null,
    loopId: string | null = null,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM "voteResponses"
       WHERE "voteId" = $1
         AND "voterToken" = $2
         AND COALESCE("proposalId", '') = COALESCE($3, '')
         AND COALESCE("loopId", '') = COALESCE($4, '')`,
      [voteId, voterToken, proposalId, loopId],
    );
  }

  async importVoteResponses(items: VoteResponseEntity[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(`
          INSERT INTO "voteResponses"("id", "voteId", "proposalId", "loopId", "userId", "voterToken", "value", "comment", "submittedAt")
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT ("voteId", "voterToken", (COALESCE("proposalId", '')), (COALESCE("loopId", '')))
            DO UPDATE SET
              "proposalId" = EXCLUDED."proposalId",
              "value" = EXCLUDED."value",
              "comment" = EXCLUDED."comment",
              "submittedAt" = EXCLUDED."submittedAt"
        `, [item.id, item.voteId, item.proposalId, item.loopId ?? null, item.userId, item.voterToken, item.value, item.comment ?? null, item.submittedAt]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private toIsoString(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  // Comparative prioritization ballots
  private mapVoteRankingSubmissionRow(
    row: Record<string, unknown>,
  ): VoteRankingSubmission {
    return {
      id: row.id as string,
      voteId: row.voteId as string,
      voterToken: row.voterToken as string,
      userId: (row.userId as string | null) ?? null,
      displayName: (row.displayName as string | null) ?? null,
      draft: (row.draftPayload as VoteRankingSubmission['draft']) ?? null,
      submitted: (row.submittedPayload as VoteRankingSubmission['submitted']) ?? null,
      draftUpdatedAt: this.toIsoString(row.draftUpdatedAt),
      submittedAt: this.toIsoString(row.submittedAt),
      lastSeenAt: this.toIsoString(row.lastSeenAt) ?? new Date().toISOString(),
    };
  }

  async getVoteRankingSubmissions(voteId: string): Promise<VoteRankingSubmission[]> {
    const result = await this.pool.query(
      'SELECT * FROM "voteRankingSubmissions" WHERE "voteId" = $1 ORDER BY "lastSeenAt" DESC',
      [voteId],
    );
    return result.rows.map((row: Record<string, unknown>) =>
      this.mapVoteRankingSubmissionRow(row),
    );
  }

  async importVoteRankingSubmissions(
    items: VoteRankingSubmission[],
    replaceVoteIds?: string[],
  ): Promise<void> {
    // Column list and conflict handling are shared by the sequential and batched
    // branches below so the two cannot drift apart.
    const columns = `"id", "voteId", "voterToken", "userId", "displayName",
              "draftPayload", "submittedPayload", "draftUpdatedAt", "submittedAt", "lastSeenAt"`;
    const conflictClause = `ON CONFLICT ("id") DO UPDATE SET
              "userId" = EXCLUDED."userId",
              "displayName" = EXCLUDED."displayName",
              "draftPayload" = EXCLUDED."draftPayload",
              "submittedPayload" = EXCLUDED."submittedPayload",
              "draftUpdatedAt" = EXCLUDED."draftUpdatedAt",
              "submittedAt" = EXCLUDED."submittedAt",
              "lastSeenAt" = EXCLUDED."lastSeenAt"
            -- A preserved id must never overwrite a row that belongs to another vote.
            WHERE "voteRankingSubmissions"."voteId" = EXCLUDED."voteId"`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Restores must replace, not merge: delete the affected votes' ballots
      // first so rows absent from the backup cannot keep feeding aggregation.
      // A non-empty id list scopes the delete; an empty list is a no-op so a
      // stray empty payload can never wipe ballots for unrelated votes.
      if (replaceVoteIds && replaceVoteIds.length > 0) {
        await client.query(
          'DELETE FROM "voteRankingSubmissions" WHERE "voteId" = ANY($1::text[])',
          [replaceVoteIds],
        );
      }
      const hasParticipantTokens = items.some((item) => Boolean(item.voterToken));
      if (hasParticipantTokens) {
        // Rows that carry a participant credential need the existing
        // delete-then-insert last-wins semantics, so keep them sequential.
        for (const item of items) {
          const voterToken = item.voterToken || crypto.randomUUID();
          // A preserved `id` can collide with the primary key on re-import
          // (exports redact voterToken, so the composite conflict target no
          // longer matches). Drop a row that already holds the same participant
          // token under another id so the insert cannot violate the unique key.
          if (item.voterToken) {
            await client.query(
              'DELETE FROM "voteRankingSubmissions" WHERE "voteId" = $1 AND "voterToken" = $2 AND "id" <> $3',
              [item.voteId, item.voterToken, item.id],
            );
          }
          await client.query(`
            INSERT INTO "voteRankingSubmissions"(${columns})
            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ${conflictClause}
          `, [
            item.id,
            item.voteId,
            voterToken,
            item.userId,
            item.displayName,
            item.draft ? JSON.stringify(item.draft) : null,
            item.submitted ? JSON.stringify(item.submitted) : null,
            item.draftUpdatedAt,
            item.submittedAt,
            item.lastSeenAt,
          ]);
        }
      } else {
        // Export/restore path: the participant credential is redacted, so every
        // row gets a fresh random token and no unique-key conflicts are
        // possible. Batch the inserts instead of one round trip per ballot.
        const chunkSize = 500;
        for (let start = 0; start < items.length; start += chunkSize) {
          const chunk = items.slice(start, start + chunkSize);
          const params: unknown[] = [];
          const tuples: string[] = [];
          for (const item of chunk) {
            const offset = params.length;
            tuples.push(
              `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, ` +
              `$${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`,
            );
            params.push(
              item.id,
              item.voteId,
              // Exports redact the participant credential; reissue one on restore.
              crypto.randomUUID(),
              item.userId,
              item.displayName,
              item.draft ? JSON.stringify(item.draft) : null,
              item.submitted ? JSON.stringify(item.submitted) : null,
              item.draftUpdatedAt,
              item.submittedAt,
              item.lastSeenAt,
            );
          }
          await client.query(`
            INSERT INTO "voteRankingSubmissions"(${columns})
            VALUES ${tuples.join(', ')}
            ${conflictClause}
          `, params);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Vote loops (CONSENT_LOOP)
  async getVoteLoops(voteId: string): Promise<VoteLoop[]> {
    const result = await this.pool.query('SELECT * FROM "voteLoops" WHERE "voteId" = $1 ORDER BY "proposalId" ASC, "roundNumber" ASC', [voteId]);
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      voteId: row.voteId as string,
      proposalId: row.proposalId as string,
      roundNumber: row.roundNumber as number,
      proposalContent: row.proposalContent as string,
      openedAt: row.openedAt as string,
      closedAt: (row.closedAt as string | null) ?? undefined,
      openedByUserId: row.openedByUserId as string,
    }));
  }

  async createVoteLoop(voteId: string, loop: Partial<VoteLoop>): Promise<VoteLoop> {
    const newLoop: VoteLoop = {
      id: loop.id || crypto.randomUUID(),
      voteId,
      proposalId: loop.proposalId || '',
      roundNumber: loop.roundNumber ?? 1,
      proposalContent: loop.proposalContent || '',
      openedAt: loop.openedAt || new Date().toISOString(),
      closedAt: loop.closedAt,
      openedByUserId: loop.openedByUserId || 'unknown',
    };

    await this.pool.query(`
      INSERT INTO "voteLoops"("id", "voteId", "proposalId", "roundNumber", "proposalContent", "openedAt", "closedAt", "openedByUserId")
      VALUES($1, $2, $3, $4, $5, $6, $7, $8)
    `, [newLoop.id, newLoop.voteId, newLoop.proposalId, newLoop.roundNumber, newLoop.proposalContent, newLoop.openedAt, newLoop.closedAt ?? null, newLoop.openedByUserId]);

    return newLoop;
  }

  async updateVoteLoop(loopId: string, patch: Partial<VoteLoop>): Promise<VoteLoop | null> {
    const result = await this.pool.query('SELECT * FROM "voteLoops" WHERE "id" = $1', [loopId]);
    if (result.rows.length === 0) return null;
    const current = result.rows[0];

    const updated = { ...current, ...patch };
    await this.pool.query(`
      UPDATE "voteLoops" SET "proposalContent" = $1, "closedAt" = $2 WHERE "id" = $3
    `, [updated.proposalContent, updated.closedAt ?? null, loopId]);

    return updated;
  }

  async closeVoteLoop(loopId: string): Promise<VoteLoop | null> {
    const result = await this.pool.query('SELECT * FROM "voteLoops" WHERE "id" = $1', [loopId]);
    if (result.rows.length === 0) return null;

    const closedAt = new Date().toISOString();
    await this.pool.query(`
      UPDATE "voteLoops" SET "closedAt" = $1 WHERE "id" = $2
    `, [closedAt, loopId]);

    const updatedResult = await this.pool.query('SELECT * FROM "voteLoops" WHERE "id" = $1', [loopId]);
    return updatedResult.rows[0];
  }

  async importVoteLoops(items: VoteLoop[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(`
          INSERT INTO "voteLoops"("id", "voteId", "proposalId", "roundNumber", "proposalContent", "openedAt", "closedAt", "openedByUserId")
          VALUES($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT ("voteId", "proposalId", "roundNumber") DO UPDATE SET
            "proposalContent" = EXCLUDED."proposalContent",
            "closedAt" = EXCLUDED."closedAt"
        `, [item.id, item.voteId, item.proposalId, item.roundNumber, item.proposalContent, item.openedAt, item.closedAt ?? null, item.openedByUserId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Vote moderators
  async getVoteModerators(voteId: string): Promise<VoteModerator[]> {
    const result = await this.pool.query('SELECT * FROM "voteModerators" WHERE "voteId" = $1 AND "active" = TRUE ORDER BY "addedAt" ASC', [voteId]);
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      voteId: row.voteId as string,
      userId: (row.userId as string | null) ?? undefined,
      displayName: row.displayName as string,
      email: (row.email as string | null) ?? undefined,
      token: row.token as string,
      addedByUserId: row.addedByUserId as string,
      addedAt: row.addedAt as string,
      active: row.active as boolean,
      lastSeenAt: (row.lastSeenAt as string | null) ?? undefined,
    }));
  }

  async addVoteModerator(voteId: string, input: { displayName: string; email?: string; addedByUserId: string }): Promise<VoteModerator> {
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.pool.query(`
      INSERT INTO "voteModerators"("id", "voteId", "userId", "displayName", "email", "token", "addedByUserId", "addedAt", "active")
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
    `, [id, voteId, null, input.displayName, input.email ?? null, token, input.addedByUserId, now]);

    return {
      id,
      voteId,
      displayName: input.displayName,
      email: input.email,
      token,
      addedByUserId: input.addedByUserId,
      addedAt: now,
      active: true,
    };
  }

  async revokeVoteModerator(moderatorId: string): Promise<void> {
    await this.pool.query('UPDATE "voteModerators" SET "active" = FALSE WHERE "id" = $1', [moderatorId]);
  }

  async resolveVoteModeratorToken(token: string): Promise<{ vote: VoteEntity; moderator: VoteModerator } | null> {
    const result = await this.pool.query('SELECT * FROM "voteModerators" WHERE "token" = $1 AND "active" = TRUE', [token]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const moderator: VoteModerator = {
      id: row.id,
      voteId: row.voteId,
      userId: row.userId ?? undefined,
      displayName: row.displayName,
      email: row.email ?? undefined,
      token: row.token,
      addedByUserId: row.addedByUserId,
      addedAt: row.addedAt,
      active: row.active,
      lastSeenAt: row.lastSeenAt ?? undefined,
    };

    const vote = await this.getVoteById(moderator.voteId);
    if (!vote) return null;

    await this.pool.query('UPDATE "voteModerators" SET "lastSeenAt" = $1 WHERE "id" = $2', [new Date().toISOString(), moderator.id]);
    return { vote, moderator };
  }

  async importVoteModerators(items: VoteModerator[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(`
          INSERT INTO "voteModerators"("id", "voteId", "userId", "displayName", "email", "token", "addedByUserId", "addedAt", "active", "lastSeenAt")
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT ("token") DO UPDATE SET
            "displayName" = EXCLUDED."displayName",
            "active" = EXCLUDED."active"
        `, [item.id, item.voteId, item.userId ?? null, item.displayName, item.email ?? null, item.token, item.addedByUserId, item.addedAt, item.active, item.lastSeenAt ?? null]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mapTaskDbRowToEntity(row: TaskDbRow): TaskEntity {
    return {
      ...row,
      timer: row.timer ? [row.timer as unknown as { startTime: number; endTime: number }] : [],
      children: [],
      updatedAt: row.updatedAt ?? undefined,
    };
  }

  private mapUserSettingsDbRowToEntity(row: UserSettingsDbRow): UserSettingsEntity {
    return {
      ...row,
      monthlyBalances: row.monthlyBalances as unknown as Record<string, MonthlyBalanceData> | undefined,
      weekStartDay: row.weekStartDay as 0 | 1 | undefined,
      defaultPlanView: row.defaultPlanView as 'week' | 'month' | undefined,
      plannerDefault: Boolean(row.plannerDefault),
      preferredWorkingDays: row.preferredWorkingDays || undefined,
      trigram: row.trigram || undefined,
      pomodoroConfig: row.pomodoroConfig ? (typeof row.pomodoroConfig === 'string' ? JSON.parse(row.pomodoroConfig) : row.pomodoroConfig) : undefined,
      focusModeConfig: row.focusModeConfig ? (typeof row.focusModeConfig === 'string' ? JSON.parse(row.focusModeConfig) : row.focusModeConfig) : undefined,
      travelerConfig: row.travelerConfig ? (typeof row.travelerConfig === 'string' ? JSON.parse(row.travelerConfig) : row.travelerConfig) : undefined,
      nonActionPeriodHours: row.nonActionPeriodHours ?? undefined,
    };
  }

  private mapCircleDbRowToEntity(row: CircleDbRow): CircleEntity {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      nodeType: row.nodeType as CircleNodeType,
      modifier: row.modifier as CircleNodeModifier | undefined,
      color: row.color ?? undefined,
      size: row.size ?? undefined,
      purpose: row.purpose ?? undefined,
      missions: row.missions ?? undefined,
      authorityScope: row.authorityScope ?? undefined,
      order: row.order ?? undefined,
      assignments: row.assignments ? (typeof row.assignments === 'string' ? JSON.parse(row.assignments) : row.assignments) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapReminderRowToEntity(row: ReminderDbRow): ReminderEntity {
    return {
      id: row.id,
      userId: row.userId,
      taskId: row.taskId ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      titleKey: row.titleKey ?? undefined,
      titleParams: row.titleParams ?? undefined,
      descriptionKey: row.descriptionKey ?? undefined,
      descriptionParams: row.descriptionParams ?? undefined,
      read: row.read,
      persistent: row.persistent,
      triggerDate: row.triggerDate ?? undefined,
      offsetMinutes: row.offsetMinutes ?? undefined,
      snoozeDurationMinutes: row.snoozeDurationMinutes ?? undefined,
      originalTriggerDate: row.originalTriggerDate ?? undefined,
      state: row.state as 'scheduled' | 'triggered' | 'read' | 'dismissed',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Pomodoro sessions
  async listPomodoroSessions(userId?: string, since?: number): Promise<PomodoroSession[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`"userId" = $${paramIndex++}`);
      params.push(userId);
    }
    if (since) {
      conditions.push(`"startTime" >= $${paramIndex++}`);
      params.push(since);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query(`SELECT * FROM "pomodoroSessions"${whereClause} ORDER BY "startTime" DESC`, params);

    return result.rows.map(row => ({
      id: row.id,
      taskId: row.taskId ?? undefined,
      userId: row.userId,
      startTime: Number(row.startTime),
      endTime: Number(row.endTime),
      phase: row.phase,
      duration: Number(row.duration),
      completed: row.completed === true || row.completed === 1,
      ...(row.multiplier != null && Number(row.multiplier) > 1 ? { multiplier: Number(row.multiplier) as 2 | 3 } : {}),
    }));
  }

  async createPomodoroSession(session: PomodoroSession): Promise<PomodoroSession & { warnings?: string[] }> {
    let taskId = session.taskId ?? null;
    const warnings: string[] = [];
    if (taskId !== null) {
      const res = await this.pool.query('SELECT "id" FROM "tasks" WHERE "id" = $1', [taskId]);
      if (res.rowCount === 0) {
        taskId = null;
        warnings.push(`taskId "${session.taskId}" does not exist; session saved without task link`);
      }
    }
    await this.pool.query(`
      INSERT INTO "pomodoroSessions" ("id", "taskId", "userId", "startTime", "endTime", "phase", "duration", "completed", "multiplier")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      session.id,
      taskId,
      session.userId,
      session.startTime,
      session.endTime,
      session.phase,
      session.duration,
      session.completed,
      session.multiplier ?? 1,
    ]);
    const result: PomodoroSession & { warnings?: string[] } = { ...session, taskId: taskId ?? undefined };
    if (warnings.length > 0) result.warnings = warnings;
    return result;
  }

  async deletePomodoroSession(id: string): Promise<void> {
    await this.pool.query('DELETE FROM "pomodoroSessions" WHERE "id" = $1', [id]);
  }

  async importPomodoroSessions(sessions: PomodoroSession[]): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const session of sessions) {
        await client.query(`
          INSERT INTO "pomodoroSessions" ("id", "taskId", "userId", "startTime", "endTime", "phase", "duration", "completed", "multiplier")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT ("id") DO UPDATE SET
            "taskId" = EXCLUDED."taskId",
            "userId" = EXCLUDED."userId",
            "startTime" = EXCLUDED."startTime",
            "endTime" = EXCLUDED."endTime",
            "phase" = EXCLUDED."phase",
            "duration" = EXCLUDED."duration",
            "completed" = EXCLUDED."completed",
            "multiplier" = EXCLUDED."multiplier"
        `, [
          session.id,
          session.taskId ?? null,
          session.userId,
          session.startTime,
          session.endTime,
          session.phase,
          session.duration,
          session.completed,
          session.multiplier ?? 1,
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

  async clearAllPomodoroSessions(): Promise<void> {
    await this.pool.query('DELETE FROM "pomodoroSessions"');
  }

  async deletePomodoroSessionsByUser(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM "pomodoroSessions" WHERE "userId" = $1', [userId]);
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
      await client.query('DROP TABLE IF EXISTS "salaryBoard" CASCADE');
      await client.query('DROP TABLE IF EXISTS "sprintState" CASCADE');
      await client.query('DROP TABLE IF EXISTS "sprintWellbeing" CASCADE');
      await client.query('DROP TABLE IF EXISTS "circles" CASCADE');
      await client.query('DROP TABLE IF EXISTS "reminders" CASCADE');
      await client.query('DROP TABLE IF EXISTS "frameworks" CASCADE');
      await client.query('DROP TABLE IF EXISTS "votes" CASCADE');
      await client.query('DROP TABLE IF EXISTS "voteResponses" CASCADE');
      await client.query('DROP TABLE IF EXISTS "voteRankingSubmissions" CASCADE');
      await client.query('DROP TABLE IF EXISTS "voteLoops" CASCADE');
      await client.query('DROP TABLE IF EXISTS "voteModerators" CASCADE');
await client.query('DROP TABLE IF EXISTS "pomodoroSessions" CASCADE');

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