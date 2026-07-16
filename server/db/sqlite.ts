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
  CircleNodeModifier,
  ReminderEntity,
  FrameworkEntity,
  FrameworkType,
  VoteEntity,
  VoteResponseEntity,
  VoteLoop,
  VoteModerator,
  VoteKind,
  PomodoroSession
} from '../../src/lib/persistence-types.js';

// Raw database row types (SQLite stores booleans as 0/1 integers and JSON as strings)
interface TaskDbRow {
  id: string;
  parentId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string | null;
  triageStatus: string;
  urgent: number;
  impact: number;
  majorIncident: number;
  sprintTarget: number;
  difficulty: number;
  timer: string | null;
  category: string;
  terminationDate: string | null;
  comment: string | null;
  durationInMinutes: number | null;
  priority: number | null;
  userId: string | null;
  linkedVoteIds: string | null;
  blockedSince: string | null;
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
  trigram: string | null;
  pomodoroConfig: string | null;
  focusModeConfig: string | null;
  travelerConfig: string | null;
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
  cardAgingBaseDays: number | null;
  timezone: string | null;
  country: string | null;
  region: string | null;
  disabledModules: string | null;
  pomodoroConfig: string | null;
  focusModeConfig: string | null;
  travelerConfig: string | null;
  wipLimitPerUser: number | null;
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
  assignments: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReminderDbRow {
  id: string;
  userId: string;
  taskId: string | null;
  title: string;
  description: string | null;
  read: number;
  persistent: number;
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

interface VoteResponseDbRow {
  id: string;
  voteId: string;
  proposalId: string | null;
  loopId: string | null;
  userId: string | null;
  voterToken: string;
  value: number;
  comment: string | null;
  submittedAt: string;
}

interface VoteLoopDbRow {
  id: string;
  voteId: string;
  proposalId: string;
  roundNumber: number;
  proposalContent: string;
  openedAt: string;
  closedAt: string | null;
  openedByUserId: string;
}

interface VoteModeratorDbRow {
  id: string;
  voteId: string;
  userId: string | null;
  displayName: string;
  email: string | null;
  token: string;
  addedByUserId: string;
  addedAt: string;
  active: number;
  lastSeenAt: string | null;
}

interface PomodoroSessionDbRow {
  id: string;
  taskId: string | null;
  userId: string;
  startTime: number;
  endTime: number;
  phase: string;
  duration: number;
  completed: number;
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
    // Create tables FIRST before attempting migrations
    // This ensures tables exist when migrateSchema tries to add columns
    
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
        "sprintTarget" BOOLEAN DEFAULT 0,
        "difficulty" REAL DEFAULT 1,
        "timer" TEXT, -- JSON string
        "category" TEXT DEFAULT 'General',
        "terminationDate" TEXT,
        "comment" TEXT,
        "durationInMinutes" INTEGER,
        "priority" INTEGER,
        "updatedAt" TEXT,
        "userId" TEXT,
        "linkedVoteIds" TEXT,
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
        "preferredWorkingDays" TEXT, -- JSON string
        "trigram" TEXT
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
        "cardAgingBaseDays" REAL DEFAULT 30,
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
          "highImpactTaskGoal", "failureRateGoal", "qliGoal", "newCapabilitiesGoal", "hoursToBeDoneByDay",
          "vacationLimitMultiplier", "hourlyBalanceLimitUpper", "hourlyBalanceLimitLower", "cardAgingBaseDays", "timezone", "country", "region")
        VALUES(1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );
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
        "purpose" TEXT, -- What service or general functionality does the role-circle provide
        "missions" TEXT, -- What specific services or tasks does the role-circle provide
        "authorityScope" TEXT, -- What are the elements over which the role-circle has exclusive authority
        "order" INTEGER, -- Display order among siblings
        "assignments" TEXT, -- JSON string for role assignments
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY("parentId") REFERENCES "circles"("id")
      )
    `);

    // Reminders table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "reminders" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "taskId" TEXT,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "read" BOOLEAN DEFAULT 0,
        "persistent" BOOLEAN DEFAULT 0,
        "triggerDate" TEXT,
        "offsetMinutes" INTEGER,
        "snoozeDurationMinutes" INTEGER,
        "originalTriggerDate" TEXT,
        "state" TEXT DEFAULT 'scheduled' CHECK("state" IN ('scheduled', 'triggered', 'read', 'dismissed')),
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE
      )
    `);

    // Frameworks table (intentional & collaborative frameworks)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "frameworks" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "frameworkType" TEXT NOT NULL CHECK("frameworkType" IN ('intentional', 'collaborative')),
        "parentId" TEXT,
        "categories" TEXT NOT NULL DEFAULT '[]',
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY("parentId") REFERENCES "frameworks"("id")
      )
    `);

    // Votes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "votes" (
        "id" TEXT PRIMARY KEY,
        "slug" TEXT NOT NULL UNIQUE,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "ownerId" TEXT NOT NULL,
        "proposals" TEXT NOT NULL DEFAULT '[]',
        "config" TEXT NOT NULL DEFAULT '{}',
        "outcome" TEXT,
        "linkedTaskId" TEXT,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
      )
    `);

    // Vote responses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "voteResponses" (
        "id" TEXT PRIMARY KEY,
        "voteId" TEXT NOT NULL REFERENCES "votes"("id") ON DELETE CASCADE,
        "proposalId" TEXT,
        "loopId" TEXT,
        "userId" TEXT,
        "voterToken" TEXT NOT NULL,
        "value" REAL NOT NULL,
        "comment" TEXT,
        "submittedAt" TEXT NOT NULL
      )
    `);
    // Replace legacy single-response-per-voter constraint with one that allows
    // one response per (voter, proposal[, loop]) so multi-proposal votes work.
    this.tryDropLegacyVoteResponseConstraint();
    // Drop the non-COALESCE version of the new index if it was created in a
    // previous (buggy) migration, so we can recreate it with COALESCE below.
    this.db.exec(`DROP INDEX IF EXISTS "idx_voteResponses_voter_proposal_loop"`);
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_voteResponses_voter_proposal_loop"
        ON "voteResponses" ("voteId", "voterToken", COALESCE("proposalId", ''), COALESCE("loopId", ''))
    `);

    // Vote loops table (CONSENT_LOOP)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "voteLoops" (
        "id" TEXT PRIMARY KEY,
        "voteId" TEXT NOT NULL REFERENCES "votes"("id") ON DELETE CASCADE,
        "proposalId" TEXT NOT NULL,
        "roundNumber" INTEGER NOT NULL,
        "proposalContent" TEXT NOT NULL,
        "openedAt" TEXT NOT NULL,
        "closedAt" TEXT,
        "openedByUserId" TEXT NOT NULL,
        UNIQUE("voteId", "proposalId", "roundNumber")
      )
    `);

    // Vote moderators table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "voteModerators" (
        "id" TEXT PRIMARY KEY,
        "voteId" TEXT NOT NULL REFERENCES "votes"("id") ON DELETE CASCADE,
        "userId" TEXT,
        "displayName" TEXT NOT NULL,
        "email" TEXT,
        "token" TEXT NOT NULL UNIQUE,
        "addedByUserId" TEXT NOT NULL,
        "addedAt" TEXT NOT NULL,
        "active" INTEGER NOT NULL DEFAULT 1,
        "lastSeenAt" TEXT
      )
    `);

    // Create pomodoroSessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "pomodoroSessions" (
        "id" TEXT PRIMARY KEY,
        "taskId" TEXT REFERENCES "tasks"("id") ON DELETE SET NULL,
        "userId" TEXT NOT NULL,
        "startTime" INTEGER NOT NULL,
        "endTime" INTEGER NOT NULL,
        "phase" TEXT NOT NULL,
        "duration" INTEGER NOT NULL,
        "completed" INTEGER NOT NULL DEFAULT 0
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

    // Frameworks indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_frameworks_frameworkType" ON "frameworks"("frameworkType")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_frameworks_parentId" ON "frameworks"("parentId")`);

    // Votes indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_votes_slug" ON "votes"("slug")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_votes_ownerId" ON "votes"("ownerId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_votes_linkedTaskId" ON "votes"("linkedTaskId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_voteResponses_voteId" ON "voteResponses"("voteId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_voteResponses_loopId" ON "voteResponses"("loopId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_voteLoops_voteId" ON "voteLoops"("voteId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_voteModerators_voteId" ON "voteModerators"("voteId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_voteModerators_token" ON "voteModerators"("token")`);

    // Reminders indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_reminders_userId" ON "reminders"("userId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_reminders_taskId" ON "reminders"("taskId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_reminders_state" ON "reminders"("state")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_reminders_triggerDate" ON "reminders"("triggerDate")`);

    // Pomodoro sessions indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_pomodoro_userId" ON "pomodoroSessions"("userId")`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS "idx_pomodoro_startTime" ON "pomodoroSessions"("startTime")`);

    // Now run migrations AFTER tables exist
    try {
      this.migrateSchema();
    } catch (error) {
      console.error('Migration failed:', error);
      // Continue initialization, as migration might be partial or already done
    }
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

    // Add sprintTarget column to tasks
    addColumn('tasks', 'sprintTarget', 'BOOLEAN DEFAULT 0');

    // Add updatedAt column to tasks
    addColumn('tasks', 'updatedAt', 'TEXT');

    // Circle columns (fields added after initial table creation)
    addColumn('circles', 'purpose', 'TEXT');
    addColumn('circles', 'authorityScope', 'TEXT');
    addColumn('circles', 'missions', 'TEXT');
    addColumn('circles', 'assignments', 'TEXT');

    // Migrate legacy circle columns: rename description→purpose, domains→missions, accountabilities→authorityScope
    runMigration('circles', 'description', 'purpose');
    runMigration('circles', 'domains', 'missions');
    runMigration('circles', 'accountabilities', 'authorityScope');

    // Add new columns for UserSettings
    addColumn('userSettings', 'weekStartDay', 'INTEGER');
    addColumn('userSettings', 'defaultPlanView', 'TEXT');
    addColumn('userSettings', 'preferredWorkingDays', 'TEXT');
    addColumn('userSettings', 'trigram', 'TEXT');
    addColumn('userSettings', 'pomodoroConfig', 'TEXT');
    addColumn('userSettings', 'focusModeConfig', 'TEXT');
    addColumn('userSettings', 'travelerConfig', 'TEXT');
    addColumn('userSettings', 'nonActionPeriodHours', 'REAL DEFAULT 3');

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

    addColumn('appSettings', 'cardAgingBaseDays', 'REAL DEFAULT 30');
    addColumn('appSettings', 'disabledModules', 'TEXT');
    addColumn('appSettings', 'pomodoroConfig', 'TEXT');
    addColumn('appSettings', 'focusModeConfig', 'TEXT');
    addColumn('appSettings', 'travelerConfig', 'TEXT');
    addColumn('appSettings', 'wipLimitPerUser', 'INTEGER DEFAULT 5');

    // QolSurvey columns
    runMigration('qolSurvey', 'user_id', 'userId');

    // Tasks linkedVoteIds column
    addColumn('tasks', 'linkedVoteIds', 'TEXT');

    // Tasks blockedSince column (EF prosthetic: tracks when task entered Blocked status)
    addColumn('tasks', 'blockedSince', 'TEXT');

    // VoteLoops proposalId column (per-proposal loops)
    addColumn('voteLoops', 'proposalId', 'TEXT NOT NULL DEFAULT \'\'');

    this.tryFixVoteLoopsUniqueConstraint();
  }

  async testConnection(): Promise<void> {
    this.db.prepare('SELECT 1').run();
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // Tasks
  async getTasks(
    userId?: string,
    pagination?: { limit?: number; offset?: number },
    excludeStatuses?: string[],
    triageStatuses?: string[],
    includeSubtasks?: boolean,
  ): Promise<{ data: TaskEntity[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (userId) {
      conditions.push('"userId" = ?');
      params.push(userId);
    }

    if (excludeStatuses && excludeStatuses.length > 0) {
      const placeholders = excludeStatuses.map(() => '?').join(', ');
      conditions.push(`"triageStatus" NOT IN (${placeholders})`);
      params.push(...excludeStatuses);
    }

    if (triageStatuses && triageStatuses.length > 0) {
      const placeholders = triageStatuses.map(() => '?').join(', ');
      conditions.push(`"triageStatus" IN (${placeholders})`);
      params.push(...triageStatuses);
    }

    if (includeSubtasks === false) {
      conditions.push('"parentId" IS NULL');
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as count FROM "tasks"${whereClause}`;
    const countResult = this.db.prepare(countSql).get(...params) as { count: number };
    const total = countResult.count;

    let sql = `SELECT * FROM "tasks"${whereClause}`;
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
      sprintTarget: Boolean(row.sprintTarget),
      timer: row.timer ? JSON.parse(row.timer) : { startTime: null, elapsedTime: 0, isRunning: false },
      updatedAt: row.updatedAt ?? undefined,
      linkedVoteIds: row.linkedVoteIds ? JSON.parse(row.linkedVoteIds) : undefined,
      blockedSince: row.blockedSince ?? undefined,
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
      sprintTarget: Boolean(row.sprintTarget),
      timer: row.timer ? JSON.parse(row.timer) : { startTime: null, elapsedTime: 0, isRunning: false },
      updatedAt: row.updatedAt ?? undefined,
      linkedVoteIds: row.linkedVoteIds ? JSON.parse(row.linkedVoteIds) : undefined,
      blockedSince: row.blockedSince ?? undefined,
    };
  }

  async createTask(input: Partial<TaskEntity>): Promise<TaskEntity> {
    const newTask: TaskEntity = {
      id: input.id || crypto.randomUUID(),
      title: input.title || 'New Task',
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: input.updatedAt ?? null,
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
      linkedVoteIds: input.linkedVoteIds || undefined,
      blockedSince: input.blockedSince || null,
    };

    const params = {
      id: newTask.id,
      parentId: newTask.parentId,
      title: newTask.title,
      createdAt: newTask.createdAt,
      updatedAt: newTask.updatedAt,
      triageStatus: newTask.triageStatus,
      urgent: newTask.urgent ? 1 : 0,
      impact: newTask.impact ? 1 : 0,
      majorIncident: newTask.majorIncident ? 1 : 0,
      sprintTarget: newTask.sprintTarget ? 1 : 0,
      difficulty: newTask.difficulty,
      timer: JSON.stringify(newTask.timer),
      category: newTask.category,
      terminationDate: newTask.terminationDate,
      comment: newTask.comment,
      durationInMinutes: newTask.durationInMinutes,
      priority: newTask.priority,
      userId: newTask.userId,
      linkedVoteIds: newTask.linkedVoteIds ? JSON.stringify(newTask.linkedVoteIds) : null,
      blockedSince: newTask.blockedSince,
    };

    this.db.prepare(`
      INSERT INTO "tasks"("id", "parentId", "title", "createdAt", "updatedAt", "triageStatus", "urgent", "impact", "majorIncident", "sprintTarget", "difficulty", "timer", "category", "terminationDate", "comment", "durationInMinutes", "priority", "userId", "linkedVoteIds", "blockedSince")
      VALUES(@id, @parentId, @title, @createdAt, @updatedAt, @triageStatus, @urgent, @impact, @majorIncident, @sprintTarget, @difficulty, @timer, @category, @terminationDate, @comment, @durationInMinutes, @priority, @userId, @linkedVoteIds, @blockedSince)
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
      updatedAt: updated.updatedAt ?? null,
      triageStatus: updated.triageStatus,
      urgent: updated.urgent ? 1 : 0,
      impact: updated.impact ? 1 : 0,
      majorIncident: updated.majorIncident ? 1 : 0,
      sprintTarget: updated.sprintTarget ? 1 : 0,
      difficulty: updated.difficulty,
      timer: JSON.stringify(updated.timer),
      category: updated.category,
      terminationDate: updated.terminationDate,
      comment: updated.comment,
      durationInMinutes: updated.durationInMinutes,
      priority: updated.priority,
      userId: updated.userId,
      linkedVoteIds: updated.linkedVoteIds ? JSON.stringify(updated.linkedVoteIds) : null,
      blockedSince: updated.blockedSince,
    };

    this.db.prepare(`
      UPDATE "tasks" SET
      "parentId" = @parentId,
        "title" = @title,
        "updatedAt" = @updatedAt,
        "triageStatus" = @triageStatus,
        "urgent" = @urgent,
        "impact" = @impact,
        "majorIncident" = @majorIncident,
        "sprintTarget" = @sprintTarget,
        "difficulty" = @difficulty,
        "timer" = @timer,
        "category" = @category,
        "terminationDate" = @terminationDate,
        "comment" = @comment,
        "durationInMinutes" = @durationInMinutes,
        "priority" = @priority,
        "userId" = @userId,
        "linkedVoteIds" = @linkedVoteIds,
        "blockedSince" = @blockedSince
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
      INSERT INTO "tasks"("id", "parentId", "title", "createdAt", "updatedAt", "triageStatus", "urgent", "impact", "majorIncident", "sprintTarget", "difficulty", "timer", "category", "terminationDate", "comment", "durationInMinutes", "priority", "userId", "blockedSince")
      VALUES(@id, @parentId, @title, @createdAt, @updatedAt, @triageStatus, @urgent, @impact, @majorIncident, @sprintTarget, @difficulty, @timer, @category, @terminationDate, @comment, @durationInMinutes, @priority, @userId, @blockedSince)
      ON CONFLICT("id") DO UPDATE SET
      "parentId" = excluded."parentId",
        "title" = excluded."title",
        "updatedAt" = excluded."updatedAt",
        "triageStatus" = excluded."triageStatus",
        "urgent" = excluded."urgent",
        "impact" = excluded."impact",
        "majorIncident" = excluded."majorIncident",
        "sprintTarget" = excluded."sprintTarget",
        "difficulty" = excluded."difficulty",
        "timer" = excluded."timer",
        "category" = excluded."category",
        "terminationDate" = excluded."terminationDate",
        "comment" = excluded."comment",
        "durationInMinutes" = excluded."durationInMinutes",
        "priority" = excluded."priority",
        "userId" = excluded."userId",
        "blockedSince" = excluded."blockedSince"
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
          updatedAt: task.updatedAt ?? null,
          triageStatus: task.triageStatus,
          urgent: task.urgent ? 1 : 0,
          impact: task.impact ? 1 : 0,
          majorIncident: task.majorIncident ? 1 : 0,
          sprintTarget: task.sprintTarget ? 1 : 0,
          difficulty: task.difficulty,
          timer: JSON.stringify(task.timer),
          category: task.category,
          terminationDate: task.terminationDate,
          comment: task.comment,
          durationInMinutes: task.durationInMinutes,
          priority: task.priority,
          userId: task.userId,
          blockedSince: task.blockedSince ?? null,
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
      trigram: row.trigram || undefined,
      pomodoroConfig: row.pomodoroConfig ? JSON.parse(row.pomodoroConfig) : undefined,
      focusModeConfig: row.focusModeConfig ? JSON.parse(row.focusModeConfig) : undefined,
      travelerConfig: row.travelerConfig ? JSON.parse(row.travelerConfig) : undefined,
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
      preferredWorkingDays: updated.preferredWorkingDays ? JSON.stringify(updated.preferredWorkingDays) : null,
      trigram: updated.trigram ?? null,
      pomodoroConfig: updated.pomodoroConfig ? JSON.stringify(updated.pomodoroConfig) : null,
      focusModeConfig: updated.focusModeConfig ? JSON.stringify(updated.focusModeConfig) : null,
      travelerConfig: updated.travelerConfig ? JSON.stringify(updated.travelerConfig) : null,
    };

    this.db.prepare(`
      INSERT INTO "userSettings"("userId", "username", "logo", "hasCompletedOnboarding", "workload", "splitTime", "monthlyBalances", "timezone", "cardCompactness", "weekStartDay", "defaultPlanView", "preferredWorkingDays", "trigram", "pomodoroConfig", "focusModeConfig", "travelerConfig")
      VALUES(@userId, @username, @logo, @hasCompletedOnboarding, @workload, @splitTime, @monthlyBalances, @timezone, @cardCompactness, @weekStartDay, @defaultPlanView, @preferredWorkingDays, @trigram, @pomodoroConfig, @focusModeConfig, @travelerConfig)
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
        "preferredWorkingDays" = excluded."preferredWorkingDays",
        "trigram" = excluded."trigram",
        "pomodoroConfig" = excluded."pomodoroConfig",
        "focusModeConfig" = excluded."focusModeConfig",
        "travelerConfig" = excluded."travelerConfig"
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
      trigram: row.trigram || undefined,
      pomodoroConfig: row.pomodoroConfig ? JSON.parse(row.pomodoroConfig) : undefined,
      focusModeConfig: row.focusModeConfig ? JSON.parse(row.focusModeConfig) : undefined,
      travelerConfig: row.travelerConfig ? JSON.parse(row.travelerConfig) : undefined,
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
      cardAgingBaseDays: row.cardAgingBaseDays ?? 30,
      timezone: row.timezone ?? 'Europe/Zurich',
      country: row.country ?? 'CH',
      region: row.region ?? 'BE',
      disabledModules: row.disabledModules ? JSON.parse(row.disabledModules) : [],
      pomodoroConfig: row.pomodoroConfig ? JSON.parse(row.pomodoroConfig) : DEFAULT_APP_SETTINGS.pomodoroConfig,
      focusModeConfig: row.focusModeConfig ? JSON.parse(row.focusModeConfig) : DEFAULT_APP_SETTINGS.focusModeConfig,
      travelerConfig: row.travelerConfig ? JSON.parse(row.travelerConfig) : DEFAULT_APP_SETTINGS.travelerConfig,
      wipLimitPerUser: row.wipLimitPerUser ?? 5,
    };
  }

  async updateAppSettings(patch: Partial<AppSettingsEntity>): Promise<AppSettingsEntity> {
    const current = await this.getAppSettings();
    const updated = { ...current, ...patch };

    const params = {
      ...updated,
      id: 1,
      disabledModules: JSON.stringify(updated.disabledModules ?? []),
      pomodoroConfig: JSON.stringify(updated.pomodoroConfig ?? DEFAULT_APP_SETTINGS.pomodoroConfig),
      focusModeConfig: JSON.stringify(updated.focusModeConfig ?? DEFAULT_APP_SETTINGS.focusModeConfig),
      travelerConfig: JSON.stringify(updated.travelerConfig ?? DEFAULT_APP_SETTINGS.travelerConfig),
      wipLimitPerUser: updated.wipLimitPerUser ?? 5,
    };

    this.db.prepare(`
      INSERT INTO "appSettings"("id", "splitTime", "userWorkloadPercentage", "weeksComputation", "highImpactTaskGoal", "failureRateGoal", "qliGoal", "newCapabilitiesGoal", "hoursToBeDoneByDay", "vacationLimitMultiplier", "hourlyBalanceLimitUpper", "hourlyBalanceLimitLower", "cardAgingBaseDays", "timezone", "country", "region", "disabledModules", "pomodoroConfig", "focusModeConfig", "travelerConfig", "wipLimitPerUser")
      VALUES(@id, @splitTime, @userWorkloadPercentage, @weeksComputation, @highImpactTaskGoal, @failureRateGoal, @qliGoal, @newCapabilitiesGoal, @hoursToBeDoneByDay, @vacationLimitMultiplier, @hourlyBalanceLimitUpper, @hourlyBalanceLimitLower, @cardAgingBaseDays, @timezone, @country, @region, @disabledModules, @pomodoroConfig, @focusModeConfig, @travelerConfig, @wipLimitPerUser)
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
        "cardAgingBaseDays" = excluded."cardAgingBaseDays",
        "timezone" = excluded."timezone",
        "country" = excluded."country",
        "region" = excluded."region",
        "disabledModules" = excluded."disabledModules",
        "pomodoroConfig" = excluded."pomodoroConfig",
        "focusModeConfig" = excluded."focusModeConfig",
        "travelerConfig" = excluded."travelerConfig",
        "wipLimitPerUser" = excluded."wipLimitPerUser"
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
    return rows.map(row => this.mapCircleDbRowToEntity(row));
  }

  async getCircleById(id: string): Promise<CircleEntity | null> {
    const row = this.db.prepare('SELECT * FROM "circles" WHERE "id" = ?').get(id) as unknown as CircleDbRow | undefined;
    if (!row) {
      return null;
    }
    return this.mapCircleDbRowToEntity(row);
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

    const params = {
      id: newCircle.id,
      name: newCircle.name,
      parentId: newCircle.parentId,
      nodeType: newCircle.nodeType,
      modifier: newCircle.modifier ?? null,
      color: newCircle.color ?? null,
      size: newCircle.size ?? null,
      purpose: newCircle.purpose ?? null,
      missions: newCircle.missions ?? null,
      authorityScope: newCircle.authorityScope ?? null,
      order: newCircle.order ?? null,
      assignments: newCircle.assignments ? JSON.stringify(newCircle.assignments) : null,
      createdAt: newCircle.createdAt,
      updatedAt: newCircle.updatedAt,
    };

    this.db.prepare(`
      INSERT INTO "circles"("id", "name", "parentId", "nodeType", "modifier", "color", "size", "purpose", "missions", "authorityScope", "order", "assignments", "createdAt", "updatedAt")
      VALUES(@id, @name, @parentId, @nodeType, @modifier, @color, @size, @purpose, @missions, @authorityScope, @order, @assignments, @createdAt, @updatedAt)
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
      purpose: updated.purpose ?? null,
      missions: updated.missions ?? null,
      authorityScope: updated.authorityScope ?? null,
      order: updated.order ?? null,
      assignments: updated.assignments ? JSON.stringify(updated.assignments) : null,
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
        "purpose" = @purpose,
        "missions" = @missions,
        "authorityScope" = @authorityScope,
        "order" = @order,
        "assignments" = @assignments,
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

  async importCircles(circles: CircleEntity[]): Promise<void> {
    // 1. Get current FK state
    const fkState = this.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    const wasFkEnabled = fkState.foreign_keys === 1;

    // 2. Disable FKs (must be done outside transaction)
    if (wasFkEnabled) {
      this.db.exec('PRAGMA foreign_keys = OFF');
    }

    const insertStmt = this.db.prepare(`
      INSERT INTO "circles"("id", "name", "parentId", "nodeType", "modifier", "color", "size", "purpose", "missions", "authorityScope", "order", "assignments", "createdAt", "updatedAt")
      VALUES(@id, @name, @parentId, @nodeType, @modifier, @color, @size, @purpose, @missions, @authorityScope, @order, @assignments, @createdAt, @updatedAt)
      ON CONFLICT("id") DO UPDATE SET
        "name" = excluded."name",
        "parentId" = excluded."parentId",
        "nodeType" = excluded."nodeType",
        "modifier" = excluded."modifier",
        "color" = excluded."color",
        "size" = excluded."size",
        "purpose" = excluded."purpose",
        "missions" = excluded."missions",
        "authorityScope" = excluded."authorityScope",
        "order" = excluded."order",
        "assignments" = excluded."assignments",
        "createdAt" = excluded."createdAt",
        "updatedAt" = excluded."updatedAt"
    `);

    const checkFk = this.db.prepare('PRAGMA foreign_key_check');
    const repairStmt = this.db.prepare('UPDATE "circles" SET "parentId" = NULL WHERE rowid = ?');

    this.db.exec('BEGIN');
    try {
      for (const circle of circles) {
        insertStmt.run({
          id: circle.id,
          name: circle.name,
          parentId: circle.parentId,
          nodeType: circle.nodeType,
          modifier: circle.modifier ?? null,
          color: circle.color ?? null,
          size: circle.size ?? null,
          purpose: circle.purpose ?? null,
          missions: circle.missions ?? null,
          authorityScope: circle.authorityScope ?? null,
          order: circle.order ?? null,
          assignments: circle.assignments ? JSON.stringify(circle.assignments) : null,
          createdAt: circle.createdAt,
          updatedAt: circle.updatedAt,
        });
      }

      // 3. Check for violations
      let violations = checkFk.all() as { table: string, rowid: number, parent: string, fkid: number }[];

      if (violations.length > 0) {
        console.log(`SQLite: Found ${violations.length} foreign key violations in circles. Attempting to auto-repair...`);

        for (const violation of violations) {
          if (violation.table === 'circles' && violation.parent === 'circles') {
            repairStmt.run(violation.rowid);
          }
        }

        // Re-check violations
        violations = checkFk.all() as { table: string, rowid: number, parent: string, fkid: number }[];

        if (violations.length > 0) {
          console.error('SQLite: Foreign key violations in circles persisted after repair attempt:', violations);
          throw new Error(`Foreign key constraint failed in circles import: ${violations.length} violations found.`);
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

  // Reminders
  async listReminders(userId?: string): Promise<ReminderEntity[]> {
    let sql = 'SELECT * FROM "reminders"';
    const params: (string | number)[] = [];
    
    if (userId) {
      sql += ' WHERE "userId" = ?';
      params.push(userId);
    }
    
    sql += ' ORDER BY "createdAt" DESC';
    
    const rows = this.db.prepare(sql).all(...params) as unknown as ReminderDbRow[];
    return rows.map(row => this.mapReminderDbRowToEntity(row));
  }

  async getReminderById(id: string): Promise<ReminderEntity | null> {
    const row = this.db.prepare('SELECT * FROM "reminders" WHERE "id" = ?').get(id) as unknown as ReminderDbRow | undefined;
    if (!row) return null;
    return this.mapReminderDbRowToEntity(row);
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

    this.db.prepare(`
      INSERT INTO "reminders"("id", "userId", "taskId", "title", "description", "read", "persistent",
        "triggerDate", "offsetMinutes", "snoozeDurationMinutes", "originalTriggerDate", "state", "createdAt", "updatedAt")
      VALUES(@id, @userId, @taskId, @title, @description, @read, @persistent,
        @triggerDate, @offsetMinutes, @snoozeDurationMinutes, @originalTriggerDate, @state, @createdAt, @updatedAt)
    `).run({
      id: reminder.id,
      userId: reminder.userId,
      taskId: reminder.taskId ?? null,
      title: reminder.title,
      description: reminder.description ?? null,
      read: reminder.read ? 1 : 0,
      persistent: reminder.persistent ? 1 : 0,
      triggerDate: reminder.triggerDate ?? null,
      offsetMinutes: reminder.offsetMinutes ?? null,
      snoozeDurationMinutes: reminder.snoozeDurationMinutes ?? null,
      originalTriggerDate: reminder.originalTriggerDate ?? null,
      state: reminder.state,
      createdAt: reminder.createdAt,
      updatedAt: reminder.updatedAt,
    });

    return reminder;
  }

  async updateReminder(id: string, patch: Partial<ReminderEntity>): Promise<ReminderEntity> {
    const current = await this.getReminderById(id);
    if (!current) {
      throw new Error(`Reminder with id ${id} not found`);
    }

    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };

    this.db.prepare(`
      UPDATE "reminders" SET
        "title" = @title,
        "description" = @description,
        "read" = @read,
        "persistent" = @persistent,
        "triggerDate" = @triggerDate,
        "offsetMinutes" = @offsetMinutes,
        "snoozeDurationMinutes" = @snoozeDurationMinutes,
        "originalTriggerDate" = @originalTriggerDate,
        "state" = @state,
        "updatedAt" = @updatedAt
      WHERE "id" = @id
    `).run({
      id: updated.id,
      title: updated.title,
      description: updated.description ?? null,
      read: updated.read ? 1 : 0,
      persistent: updated.persistent ? 1 : 0,
      triggerDate: updated.triggerDate ?? null,
      offsetMinutes: updated.offsetMinutes ?? null,
      snoozeDurationMinutes: updated.snoozeDurationMinutes ?? null,
      originalTriggerDate: updated.originalTriggerDate ?? null,
      state: updated.state,
      updatedAt: updated.updatedAt,
    });

    return updated;
  }

  async deleteReminder(id: string): Promise<void> {
    this.db.prepare('DELETE FROM "reminders" WHERE "id" = ?').run(id);
  }

  async deleteRemindersByTaskId(taskId: string): Promise<void> {
    this.db.prepare('DELETE FROM "reminders" WHERE "taskId" = ?').run(taskId);
  }

  async clearAllReminders(): Promise<void> {
    this.db.prepare('DELETE FROM "reminders"').run();
  }

  async importReminders(reminders: ReminderEntity[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT INTO "reminders"("id", "userId", "taskId", "title", "description", "read", "persistent",
        "triggerDate", "offsetMinutes", "snoozeDurationMinutes", "originalTriggerDate", "state", "createdAt", "updatedAt")
      VALUES(@id, @userId, @taskId, @title, @description, @read, @persistent,
        @triggerDate, @offsetMinutes, @snoozeDurationMinutes, @originalTriggerDate, @state, @createdAt, @updatedAt)
      ON CONFLICT("id") DO UPDATE SET
        "userId" = excluded."userId",
        "taskId" = excluded."taskId",
        "title" = excluded."title",
        "description" = excluded."description",
        "read" = excluded."read",
        "persistent" = excluded."persistent",
        "triggerDate" = excluded."triggerDate",
        "offsetMinutes" = excluded."offsetMinutes",
        "snoozeDurationMinutes" = excluded."snoozeDurationMinutes",
        "originalTriggerDate" = excluded."originalTriggerDate",
        "state" = excluded."state",
        "updatedAt" = excluded."updatedAt"
    `);

    this.db.exec('BEGIN');
    try {
      for (const reminder of reminders) {
        insertStmt.run({
          id: reminder.id,
          userId: reminder.userId,
          taskId: reminder.taskId ?? null,
          title: reminder.title,
          description: reminder.description ?? null,
          read: reminder.read ? 1 : 0,
          persistent: reminder.persistent ? 1 : 0,
          triggerDate: reminder.triggerDate ?? null,
          offsetMinutes: reminder.offsetMinutes ?? null,
          snoozeDurationMinutes: reminder.snoozeDurationMinutes ?? null,
          originalTriggerDate: reminder.originalTriggerDate ?? null,
          state: reminder.state,
          createdAt: reminder.createdAt,
          updatedAt: reminder.updatedAt,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // Frameworks
  async getFrameworks(frameworkType?: string): Promise<FrameworkEntity[]> {
    let sql = 'SELECT * FROM "frameworks"';
    const params: string[] = [];
    if (frameworkType) {
      sql += ' WHERE "frameworkType" = ?';
      params.push(frameworkType);
    }
    sql += ' ORDER BY "createdAt" ASC';
    const rows = this.db.prepare(sql).all(...params) as unknown as FrameworkDbRow[];
    return rows.map(row => this.mapFrameworkDbRowToEntity(row));
  }

  async getFrameworkById(id: string): Promise<FrameworkEntity | null> {
    const row = this.db.prepare('SELECT * FROM "frameworks" WHERE "id" = ?').get(id) as unknown as FrameworkDbRow | undefined;
    if (!row) return null;
    return this.mapFrameworkDbRowToEntity(row);
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

    this.db.prepare(`
      INSERT INTO "frameworks"("id", "name", "frameworkType", "parentId", "categories", "createdAt", "updatedAt")
      VALUES(@id, @name, @frameworkType, @parentId, @categories, @createdAt, @updatedAt)
    `).run({
      id: newFramework.id,
      name: newFramework.name,
      frameworkType: newFramework.frameworkType,
      parentId: newFramework.parentId,
      categories: JSON.stringify(newFramework.categories),
      createdAt: newFramework.createdAt,
      updatedAt: newFramework.updatedAt,
    });

    return newFramework;
  }

  async updateFramework(id: string, patch: Partial<FrameworkEntity>): Promise<FrameworkEntity | null> {
    const current = await this.getFrameworkById(id);
    if (!current) return null;

    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };

    this.db.prepare(`
      UPDATE "frameworks" SET
        "name" = @name,
        "frameworkType" = @frameworkType,
        "parentId" = @parentId,
        "categories" = @categories,
        "updatedAt" = @updatedAt
      WHERE "id" = @id
    `).run({
      id: updated.id,
      name: updated.name,
      frameworkType: updated.frameworkType,
      parentId: updated.parentId,
      categories: JSON.stringify(updated.categories),
      updatedAt: updated.updatedAt,
    });

    return updated;
  }

  async deleteFramework(id: string): Promise<void> {
    this.db.prepare('DELETE FROM "frameworks" WHERE "id" = ?').run(id);
  }

  async importFrameworks(frameworks: FrameworkEntity[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT INTO "frameworks"("id", "name", "frameworkType", "parentId", "categories", "createdAt", "updatedAt")
      VALUES(@id, @name, @frameworkType, @parentId, @categories, @createdAt, @updatedAt)
      ON CONFLICT("id") DO UPDATE SET
        "name" = excluded."name",
        "frameworkType" = excluded."frameworkType",
        "parentId" = excluded."parentId",
        "categories" = excluded."categories",
        "updatedAt" = excluded."updatedAt"
    `);

    this.db.exec('BEGIN');
    try {
      for (const framework of frameworks) {
        insertStmt.run({
          id: framework.id,
          name: framework.name,
          frameworkType: framework.frameworkType,
          parentId: framework.parentId,
          categories: JSON.stringify(framework.categories),
          createdAt: framework.createdAt,
          updatedAt: framework.updatedAt,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private mapFrameworkDbRowToEntity(row: FrameworkDbRow): FrameworkEntity {
    return {
      id: row.id,
      name: row.name,
      frameworkType: row.frameworkType as FrameworkType,
      parentId: row.parentId,
      categories: JSON.parse(row.categories || '[]'),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Votes
  async getVotes(opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }): Promise<VoteEntity[]> {
    const conditions: string[] = [];
    const params: string[] = [];

    if (opts?.linkedTaskId) {
      conditions.push('"linkedTaskId" = ?');
      params.push(opts.linkedTaskId);
    }
    if (opts?.ownerId) {
      conditions.push('"ownerId" = ?');
      params.push(opts.ownerId);
    }
    if (opts?.kind) {
      conditions.push("json_extract(\"config\", '$.kind') = ?");
      params.push(opts.kind);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM "votes"${whereClause} ORDER BY "createdAt" DESC`).all(...params) as unknown as VoteDbRow[];
    return rows.map(row => this.mapVoteDbRowToEntity(row));
  }

  async getVoteById(id: string): Promise<VoteEntity | null> {
    const row = this.db.prepare('SELECT * FROM "votes" WHERE "id" = ?').get(id) as unknown as VoteDbRow | undefined;
    if (!row) return null;
    return this.mapVoteDbRowToEntity(row);
  }

  async getVoteBySlug(slug: string): Promise<VoteEntity | null> {
    const row = this.db.prepare('SELECT * FROM "votes" WHERE "slug" = ?').get(slug) as unknown as VoteDbRow | undefined;
    if (!row) return null;
    return this.mapVoteDbRowToEntity(row);
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

    this.db.prepare(`
      INSERT INTO "votes"("id", "slug", "title", "description", "ownerId", "proposals", "config", "outcome", "linkedTaskId", "createdAt", "updatedAt")
      VALUES(@id, @slug, @title, @description, @ownerId, @proposals, @config, @outcome, @linkedTaskId, @createdAt, @updatedAt)
    `).run({
      id: newVote.id,
      slug: newVote.slug,
      title: newVote.title,
      description: newVote.description ?? null,
      ownerId: newVote.ownerId,
      proposals: JSON.stringify(newVote.proposals),
      config: JSON.stringify(newVote.config),
      outcome: newVote.outcome ? JSON.stringify(newVote.outcome) : null,
      linkedTaskId: newVote.linkedTaskId ?? null,
      createdAt: newVote.createdAt,
      updatedAt: newVote.updatedAt,
    });

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

    this.db.prepare(`
      UPDATE "votes" SET
        "title" = @title,
        "description" = @description,
        "ownerId" = @ownerId,
        "proposals" = @proposals,
        "config" = @config,
        "outcome" = @outcome,
        "linkedTaskId" = @linkedTaskId,
        "updatedAt" = @updatedAt
      WHERE "id" = @id
    `).run({
      id: updated.id,
      title: updated.title,
      description: updated.description ?? null,
      ownerId: updated.ownerId,
      proposals: JSON.stringify(updated.proposals),
      config: JSON.stringify(updated.config),
      outcome: updated.outcome ? JSON.stringify(updated.outcome) : null,
      linkedTaskId: updated.linkedTaskId ?? null,
      updatedAt: updated.updatedAt,
    });

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

    this.db.prepare(`
      UPDATE "votes" SET
        "config" = @config,
        "outcome" = @outcome,
        "updatedAt" = @updatedAt
      WHERE "id" = @id
    `).run({
      id: updated.id,
      config: JSON.stringify(updated.config),
      outcome: JSON.stringify(updated.outcome),
      updatedAt: updated.updatedAt,
    });

    return updated;
  }

  async deleteVote(id: string): Promise<void> {
    this.db.prepare('DELETE FROM "votes" WHERE "id" = ?').run(id);
  }

  async resetVote(id: string): Promise<VoteEntity | null> {
    this.db.prepare('DELETE FROM "voteResponses" WHERE "voteId" = ?').run(id);
    this.db.prepare('DELETE FROM "voteLoops" WHERE "voteId" = ?').run(id);

    const row = this.db.prepare(`
      UPDATE "votes" SET "config" = json_set("config", '$.phase', 'IDLE'), "outcome" = NULL, "updatedAt" = ? WHERE "id" = ? RETURNING *
    `).get(new Date().toISOString(), id) as unknown as VoteDbRow | undefined;
    if (!row) return null;
    return this.mapVoteDbRowToEntity(row);
  }

  async importVotes(items: VoteEntity[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT INTO "votes"("id", "slug", "title", "description", "ownerId", "proposals", "config", "outcome", "linkedTaskId", "createdAt", "updatedAt")
      VALUES(@id, @slug, @title, @description, @ownerId, @proposals, @config, @outcome, @linkedTaskId, @createdAt, @updatedAt)
      ON CONFLICT("id") DO UPDATE SET
        "slug" = excluded."slug",
        "title" = excluded."title",
        "description" = excluded."description",
        "ownerId" = excluded."ownerId",
        "proposals" = excluded."proposals",
        "config" = excluded."config",
        "outcome" = excluded."outcome",
        "linkedTaskId" = excluded."linkedTaskId",
        "updatedAt" = excluded."updatedAt"
    `);

    this.db.exec('BEGIN');
    try {
      for (const vote of items) {
        insertStmt.run({
          id: vote.id,
          slug: vote.slug,
          title: vote.title,
          description: vote.description ?? null,
          ownerId: vote.ownerId,
          proposals: JSON.stringify(vote.proposals),
          config: JSON.stringify(vote.config),
          outcome: vote.outcome ? JSON.stringify(vote.outcome) : null,
          linkedTaskId: vote.linkedTaskId ?? null,
          createdAt: vote.createdAt,
          updatedAt: vote.updatedAt,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
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
      proposals: JSON.parse(row.proposals || '[]'),
      config: JSON.parse(row.config || '{}'),
      outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
      linkedTaskId: row.linkedTaskId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Vote responses
  async getVoteResponses(voteId: string): Promise<VoteResponseEntity[]> {
    const rows = this.db.prepare('SELECT * FROM "voteResponses" WHERE "voteId" = ? ORDER BY "submittedAt" ASC').all(voteId) as unknown as VoteResponseDbRow[];
    return rows.map(row => this.mapVoteResponseDbRowToEntity(row));
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

    this.db.prepare(`
      INSERT INTO "voteResponses"("id", "voteId", "proposalId", "loopId", "userId", "voterToken", "value", "comment", "submittedAt")
      VALUES(@id, @voteId, @proposalId, @loopId, @userId, @voterToken, @value, @comment, @submittedAt)
      ON CONFLICT("voteId", "voterToken", COALESCE("proposalId", ''), COALESCE("loopId", '')) DO UPDATE SET
        "proposalId" = excluded."proposalId",
        "loopId" = excluded."loopId",
        "userId" = excluded."userId",
        "value" = excluded."value",
        "comment" = excluded."comment",
        "submittedAt" = excluded."submittedAt"
    `).run({
      id: newResponse.id,
      voteId: newResponse.voteId,
      proposalId: newResponse.proposalId,
      loopId: newResponse.loopId ?? null,
      userId: newResponse.userId,
      voterToken: newResponse.voterToken,
      value: newResponse.value,
      comment: newResponse.comment ?? null,
      submittedAt: newResponse.submittedAt,
    });

    return newResponse;
  }

  async deleteVoteResponse(
    voteId: string,
    voterToken: string,
    proposalId: string | null,
    loopId: string | null = null,
  ): Promise<void> {
    this.db.prepare(`
      DELETE FROM "voteResponses"
      WHERE "voteId" = @voteId
        AND "voterToken" = @voterToken
        AND COALESCE("proposalId", '') = COALESCE(@proposalId, '')
        AND COALESCE("loopId", '') = COALESCE(@loopId, '')
    `).run({ voteId, voterToken, proposalId, loopId });
  }

  async importVoteResponses(items: VoteResponseEntity[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT INTO "voteResponses"("id", "voteId", "proposalId", "loopId", "userId", "voterToken", "value", "comment", "submittedAt")
      VALUES(@id, @voteId, @proposalId, @loopId, @userId, @voterToken, @value, @comment, @submittedAt)
      ON CONFLICT("voteId", "voterToken", COALESCE("proposalId", ''), COALESCE("loopId", '')) DO UPDATE SET
        "proposalId" = excluded."proposalId",
        "value" = excluded."value",
        "comment" = excluded."comment",
        "submittedAt" = excluded."submittedAt"
    `);

    this.db.exec('BEGIN');
    try {
      for (const item of items) {
        insertStmt.run({
          id: item.id,
          voteId: item.voteId,
          proposalId: item.proposalId,
          loopId: item.loopId ?? null,
          userId: item.userId,
          voterToken: item.voterToken,
          value: item.value,
          comment: item.comment ?? null,
          submittedAt: item.submittedAt,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private tryFixVoteLoopsUniqueConstraint(): void {
    const tableRow = this.db.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'voteLoops'`
    ).get() as { sql: string } | undefined;
    if (!tableRow) return;
    if (/UNIQUE\(\s*"voteId"\s*,\s*"proposalId"\s*,\s*"roundNumber"\s*\)/i.test(tableRow.sql)) return;

    this.db.exec('PRAGMA foreign_keys=OFF');
    this.db.exec('BEGIN');
    try {
      this.db.exec(`
        CREATE TABLE "voteLoops_new" (
          "id" TEXT PRIMARY KEY,
          "voteId" TEXT NOT NULL REFERENCES "votes"("id") ON DELETE CASCADE,
          "proposalId" TEXT NOT NULL DEFAULT '',
          "roundNumber" INTEGER NOT NULL,
          "proposalContent" TEXT NOT NULL,
          "openedAt" TEXT NOT NULL,
          "closedAt" TEXT,
          "openedByUserId" TEXT NOT NULL,
          "gatingValue" INTEGER,
          "gatingComment" TEXT,
          UNIQUE("voteId", "proposalId", "roundNumber")
        )
      `);
      this.db.exec(`
        INSERT INTO "voteLoops_new"
          ("id", "voteId", "proposalId", "roundNumber", "proposalContent", "openedAt", "closedAt", "openedByUserId", "gatingValue", "gatingComment")
        SELECT
          "id", "voteId", "proposalId", "roundNumber", "proposalContent", "openedAt", "closedAt", "openedByUserId", "gatingValue", "gatingComment"
        FROM "voteLoops"
      `);
      this.db.exec(`DROP TABLE "voteLoops"`);
      this.db.exec(`ALTER TABLE "voteLoops_new" RENAME TO "voteLoops"`);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.db.exec('PRAGMA foreign_keys=ON');
    }
  }

  private tryDropLegacyVoteResponseConstraint(): void {
    // SQLite doesn't support dropping a UNIQUE constraint from a table definition
    // without recreating the table. Detect the legacy schema and rebuild.
    const tableRow = this.db.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'voteResponses'`
    ).get() as { sql: string } | undefined;
    if (!tableRow) return;
    if (!/UNIQUE\(\s*"voteId"\s*,\s*"voterToken"\s*\)/i.test(tableRow.sql)) return;

    this.db.exec('PRAGMA foreign_keys=OFF');
    this.db.exec('BEGIN');
    try {
      this.db.exec(`
        CREATE TABLE "voteResponses_new" (
          "id" TEXT PRIMARY KEY,
          "voteId" TEXT NOT NULL REFERENCES "votes"("id") ON DELETE CASCADE,
          "proposalId" TEXT,
          "loopId" TEXT,
          "userId" TEXT,
          "voterToken" TEXT NOT NULL,
          "value" REAL NOT NULL,
          "comment" TEXT,
          "submittedAt" TEXT NOT NULL
        )
      `);
      this.db.exec(`
        INSERT INTO "voteResponses_new"
          ("id", "voteId", "proposalId", "loopId", "userId", "voterToken", "value", "comment", "submittedAt")
        SELECT
          "id", "voteId", "proposalId", "loopId", "userId", "voterToken", "value", "comment", "submittedAt"
        FROM "voteResponses"
      `);
      this.db.exec(`DROP TABLE "voteResponses"`);
      this.db.exec(`ALTER TABLE "voteResponses_new" RENAME TO "voteResponses"`);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.db.exec('PRAGMA foreign_keys=ON');
    }
  }

  private mapVoteResponseDbRowToEntity(row: VoteResponseDbRow): VoteResponseEntity {
    return {
      id: row.id,
      voteId: row.voteId,
      proposalId: row.proposalId,
      loopId: row.loopId ?? undefined,
      userId: row.userId,
      voterToken: row.voterToken,
      value: row.value,
      comment: row.comment ?? undefined,
      submittedAt: row.submittedAt,
    };
  }

  // Vote loops (CONSENT_LOOP)
  async getVoteLoops(voteId: string): Promise<VoteLoop[]> {
    const rows = this.db.prepare('SELECT * FROM "voteLoops" WHERE "voteId" = ? ORDER BY "proposalId" ASC, "roundNumber" ASC').all(voteId) as unknown as VoteLoopDbRow[];
    return rows.map(row => this.mapVoteLoopDbRowToEntity(row));
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

    this.db.prepare(`
      INSERT INTO "voteLoops"("id", "voteId", "proposalId", "roundNumber", "proposalContent", "openedAt", "closedAt", "openedByUserId")
      VALUES(@id, @voteId, @proposalId, @roundNumber, @proposalContent, @openedAt, @closedAt, @openedByUserId)
    `).run({
      id: newLoop.id,
      voteId: newLoop.voteId,
      proposalId: newLoop.proposalId,
      roundNumber: newLoop.roundNumber,
      proposalContent: newLoop.proposalContent,
      openedAt: newLoop.openedAt,
      closedAt: newLoop.closedAt ?? null,
      openedByUserId: newLoop.openedByUserId,
    });

    return newLoop;
  }

  async updateVoteLoop(loopId: string, patch: Partial<VoteLoop>): Promise<VoteLoop | null> {
    const rows = this.db.prepare('SELECT * FROM "voteLoops" WHERE "id" = ?').all(loopId) as unknown as VoteLoopDbRow[];
    if (rows.length === 0) return null;
    const current = this.mapVoteLoopDbRowToEntity(rows[0]);

    const updated: VoteLoop = { ...current, ...patch };

    this.db.prepare(`
      UPDATE "voteLoops" SET
        "proposalContent" = @proposalContent,
        "closedAt" = @closedAt
      WHERE "id" = @id
    `).run({
      id: updated.id,
      proposalContent: updated.proposalContent,
      closedAt: updated.closedAt ?? null,
    });

    return updated;
  }

  async closeVoteLoop(loopId: string): Promise<VoteLoop | null> {
    const rows = this.db.prepare('SELECT * FROM "voteLoops" WHERE "id" = ?').all(loopId) as unknown as VoteLoopDbRow[];
    if (rows.length === 0) return null;

    this.db.prepare(`
      UPDATE "voteLoops" SET
        "closedAt" = @closedAt
      WHERE "id" = @id
    `).run({
      id: loopId,
      closedAt: new Date().toISOString(),
    });

    const updatedRows = this.db.prepare('SELECT * FROM "voteLoops" WHERE "id" = ?').all(loopId) as unknown as VoteLoopDbRow[];
    return this.mapVoteLoopDbRowToEntity(updatedRows[0]);
  }

  async importVoteLoops(items: VoteLoop[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT INTO "voteLoops"("id", "voteId", "proposalId", "roundNumber", "proposalContent", "openedAt", "closedAt", "openedByUserId")
      VALUES(@id, @voteId, @proposalId, @roundNumber, @proposalContent, @openedAt, @closedAt, @openedByUserId)
      ON CONFLICT("voteId", "proposalId", "roundNumber") DO UPDATE SET
        "proposalContent" = excluded."proposalContent",
        "closedAt" = excluded."closedAt"
    `);

    this.db.exec('BEGIN');
    try {
      for (const item of items) {
        insertStmt.run({
          id: item.id,
          voteId: item.voteId,
          proposalId: item.proposalId,
          roundNumber: item.roundNumber,
          proposalContent: item.proposalContent,
          openedAt: item.openedAt,
          closedAt: item.closedAt ?? null,
          openedByUserId: item.openedByUserId,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private mapVoteLoopDbRowToEntity(row: VoteLoopDbRow): VoteLoop {
    return {
      id: row.id,
      voteId: row.voteId,
      proposalId: row.proposalId,
      roundNumber: row.roundNumber,
      proposalContent: row.proposalContent,
      openedAt: row.openedAt,
      closedAt: row.closedAt ?? undefined,
      openedByUserId: row.openedByUserId,
    };
  }

  // Vote moderators
  async getVoteModerators(voteId: string): Promise<VoteModerator[]> {
    const rows = this.db.prepare('SELECT * FROM "voteModerators" WHERE "voteId" = ? AND "active" = 1 ORDER BY "addedAt" ASC').all(voteId) as unknown as VoteModeratorDbRow[];
    return rows.map(row => this.mapVoteModeratorDbRowToEntity(row));
  }

  async addVoteModerator(voteId: string, input: { displayName: string; email?: string; addedByUserId: string }): Promise<VoteModerator> {
    const newModerator: VoteModerator = {
      id: crypto.randomUUID(),
      voteId,
      displayName: input.displayName,
      email: input.email,
      token: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
      addedByUserId: input.addedByUserId,
      addedAt: new Date().toISOString(),
      active: true,
    };

    this.db.prepare(`
      INSERT INTO "voteModerators"("id", "voteId", "userId", "displayName", "email", "token", "addedByUserId", "addedAt", "active", "lastSeenAt")
      VALUES(@id, @voteId, @userId, @displayName, @email, @token, @addedByUserId, @addedAt, @active, @lastSeenAt)
    `).run({
      id: newModerator.id,
      voteId: newModerator.voteId,
      userId: newModerator.userId ?? null,
      displayName: newModerator.displayName,
      email: newModerator.email ?? null,
      token: newModerator.token,
      addedByUserId: newModerator.addedByUserId,
      addedAt: newModerator.addedAt,
      active: 1,
      lastSeenAt: null,
    });

    return newModerator;
  }

  async revokeVoteModerator(moderatorId: string): Promise<void> {
    this.db.prepare('UPDATE "voteModerators" SET "active" = 0 WHERE "id" = ?').run(moderatorId);
  }

  async resolveVoteModeratorToken(token: string): Promise<{ vote: VoteEntity; moderator: VoteModerator } | null> {
    const rows = this.db.prepare('SELECT * FROM "voteModerators" WHERE "token" = ? AND "active" = 1').all(token) as unknown as VoteModeratorDbRow[];
    if (rows.length === 0) return null;
    const moderator = this.mapVoteModeratorDbRowToEntity(rows[0]);
    const vote = await this.getVoteById(moderator.voteId);
    if (!vote) return null;

    this.db.prepare('UPDATE "voteModerators" SET "lastSeenAt" = ? WHERE "id" = ?').run(new Date().toISOString(), moderator.id);

    return { vote, moderator };
  }

  async importVoteModerators(items: VoteModerator[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT INTO "voteModerators"("id", "voteId", "userId", "displayName", "email", "token", "addedByUserId", "addedAt", "active", "lastSeenAt")
      VALUES(@id, @voteId, @userId, @displayName, @email, @token, @addedByUserId, @addedAt, @active, @lastSeenAt)
      ON CONFLICT("token") DO UPDATE SET
        "displayName" = excluded."displayName",
        "active" = excluded."active"
    `);

    this.db.exec('BEGIN');
    try {
      for (const item of items) {
        insertStmt.run({
          id: item.id,
          voteId: item.voteId,
          userId: item.userId ?? null,
          displayName: item.displayName,
          email: item.email ?? null,
          token: item.token,
          addedByUserId: item.addedByUserId,
          addedAt: item.addedAt,
          active: item.active ? 1 : 0,
          lastSeenAt: item.lastSeenAt ?? null,
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private mapVoteModeratorDbRowToEntity(row: VoteModeratorDbRow): VoteModerator {
    return {
      id: row.id,
      voteId: row.voteId,
      userId: row.userId ?? undefined,
      displayName: row.displayName,
      email: row.email ?? undefined,
      token: row.token,
      addedByUserId: row.addedByUserId,
      addedAt: row.addedAt,
      active: row.active === 1,
      lastSeenAt: row.lastSeenAt ?? undefined,
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
      assignments: row.assignments ? JSON.parse(row.assignments) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapReminderDbRowToEntity(row: ReminderDbRow): ReminderEntity {
    return {
      id: row.id,
      userId: row.userId,
      taskId: row.taskId ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      read: row.read === 1,
      persistent: row.persistent === 1,
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

    if (userId) {
      conditions.push('"userId" = ?');
      params.push(userId);
    }
    if (since) {
      conditions.push('"startTime" >= ?');
      params.push(since);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM "pomodoroSessions"${whereClause} ORDER BY "startTime" DESC`).all(...params) as unknown as PomodoroSessionDbRow[];

    return rows.map(row => ({
      id: row.id,
      taskId: row.taskId ?? undefined,
      userId: row.userId,
      startTime: row.startTime,
      endTime: row.endTime,
      phase: row.phase as 'work' | 'short-break' | 'long-break',
      duration: row.duration,
      completed: row.completed === 1,
    }));
  }

  async createPomodoroSession(session: PomodoroSession): Promise<PomodoroSession & { warnings?: string[] }> {
    let taskId = session.taskId ?? null;
    const warnings: string[] = [];
    if (taskId !== null) {
      const task = this.db.prepare('SELECT "id" FROM "tasks" WHERE "id" = ?').get(taskId);
      if (!task) {
        taskId = null;
        warnings.push(`taskId "${session.taskId}" does not exist; session saved without task link`);
      }
    }
    this.db.prepare(`
      INSERT INTO "pomodoroSessions"("id", "taskId", "userId", "startTime", "endTime", "phase", "duration", "completed")
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      taskId,
      session.userId,
      session.startTime,
      session.endTime,
      session.phase,
      session.duration,
      session.completed ? 1 : 0,
    );
    const result: PomodoroSession & { warnings?: string[] } = { ...session, taskId: taskId ?? undefined };
    if (warnings.length > 0) result.warnings = warnings;
    return result;
  }

  async deletePomodoroSession(id: string): Promise<void> {
    this.db.prepare('DELETE FROM "pomodoroSessions" WHERE "id" = ?').run(id);
  }

  async importPomodoroSessions(sessions: PomodoroSession[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT INTO "pomodoroSessions"("id", "taskId", "userId", "startTime", "endTime", "phase", "duration", "completed")
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT("id") DO UPDATE SET
        "taskId" = excluded."taskId",
        "userId" = excluded."userId",
        "startTime" = excluded."startTime",
        "endTime" = excluded."endTime",
        "phase" = excluded."phase",
        "duration" = excluded."duration",
        "completed" = excluded."completed"
    `);

    this.db.exec('BEGIN');
    try {
      for (const session of sessions) {
        insertStmt.run(
          session.id,
          session.taskId ?? null,
          session.userId,
          session.startTime,
          session.endTime,
          session.phase,
          session.duration,
          session.completed ? 1 : 0,
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async clearAllPomodoroSessions(): Promise<void> {
    this.db.exec('DELETE FROM "pomodoroSessions"');
  }

  async deletePomodoroSessionsByUser(userId: string): Promise<void> {
    this.db.prepare('DELETE FROM "pomodoroSessions" WHERE "userId" = ?').run(userId);
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
      this.db.exec('DROP TABLE IF EXISTS "reminders"');
      this.db.exec('DROP TABLE IF EXISTS "frameworks"');
      this.db.exec('DROP TABLE IF EXISTS "votes"');
      this.db.exec('DROP TABLE IF EXISTS "voteResponses"');
      this.db.exec('DROP TABLE IF EXISTS "voteLoops"');
      this.db.exec('DROP TABLE IF EXISTS "voteModerators"');
      this.db.exec('DROP TABLE IF EXISTS "pomodoroSessions"');

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
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    // Re-initialize OUTSIDE the transaction to avoid auto-commit conflicts
    await this.initialize();
  }
}