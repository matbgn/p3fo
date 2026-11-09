// Database client interface and factory
import { TaskEntity, UserSettingsEntity, AppSettingsEntity, QolSurveyResponseEntity, FilterStateEntity, FertilizationBoardEntity, DreamBoardEntity, SalaryBoardEntity, CircleEntity, ReminderEntity, FrameworkEntity, FrameworkType, VoteEntity, VoteResponseEntity, VoteRankingSubmission, VoteLoop, VoteModerator, VoteKind, PomodoroSession } from '../../src/lib/persistence-types.js';
import type { SprintStateEntity } from '../../src/lib/sprint-types.js';
import { applyTemporalMirror } from '../../mcp-server/src/task-temporal.js';

export interface SprintWellbeingRecord {
  userId: string;
  answers: number[];
  submittedAt: string;
}

// Pagination options for queries
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

// Paginated response wrapper
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

/**
 * Keep the legacy `terminationDate` mirror in sync with the split temporal
 * fields on server-side writes (API, MCP, import). The rule itself lives in
 * `mcp-server/src/task-temporal.ts` so the MCP importer uses the exact same
 * semantics without a second copy.
 *
 * `previousStatus` lets the helper detect a real status transition: a partial
 * patch that only changes `triageStatus` still has to stamp or clear the
 * completion fields, while an unrelated patch must not touch them.
 */
export function applyTaskTemporalMirror(
  target: Partial<TaskEntity>,
  provided: Partial<TaskEntity>,
  previousStatus?: string | null,
): Partial<TaskEntity> {
  applyTemporalMirror(target, provided, previousStatus);
  return target;
}

// Define the database client interface
export interface DbClient {
  initialize(): Promise<void>;
  testConnection(): Promise<void>;
  close?(): Promise<void>;

  // Tasks
  getTasks(
    userId?: string,
    pagination?: PaginationOptions,
    excludeStatuses?: string[],
    triageStatuses?: string[],
    includeSubtasks?: boolean,
    options?: { search?: string; active?: boolean; includeDeleted?: boolean },
  ): Promise<PaginatedResponse<TaskEntity>>;
  getTaskById(id: string): Promise<TaskEntity | null>;
  createTask(task: Partial<TaskEntity>): Promise<TaskEntity>;
  updateTask(id: string, data: Partial<TaskEntity>): Promise<TaskEntity | null>;
  deleteTask(id: string): Promise<void>;
  bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void>;
  bulkUpdateSprintTargets(items: { id: string; sprintTarget: boolean }[]): Promise<void>;
  clearAllTasks(): Promise<void>;
  importTasks(tasks: TaskEntity[]): Promise<void>;

  // User settings
  getUserSettings(userId: string): Promise<UserSettingsEntity | null>;
  updateUserSettings(userId: string, data: Partial<UserSettingsEntity>): Promise<UserSettingsEntity>;
  listUsers(): Promise<UserSettingsEntity[]>;
  migrateUser(oldUserId: string, newUserId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  clearAllUsers?(): Promise<void>; // Optional for now to avoid breaking changes immediately, but we will implement it

  // App settings
  getAppSettings(): Promise<AppSettingsEntity>;
  updateAppSettings(data: Partial<AppSettingsEntity>): Promise<AppSettingsEntity>;

  // QoL survey
  getQolSurveyResponse(userId: string): Promise<QolSurveyResponseEntity | null>;
  saveQolSurveyResponse(userId: string, data: QolSurveyResponseEntity): Promise<void>;
  getAllQolSurveyResponses?(): Promise<Record<string, QolSurveyResponseEntity>>;

  // Filters
  getFilters(): Promise<FilterStateEntity | null>;
  saveFilters(data: FilterStateEntity): Promise<void>;
  clearFilters(): Promise<void>;

  // Fertilization Board
  getFertilizationBoardState(): Promise<FertilizationBoardEntity | null>;
  updateFertilizationBoardState(state: FertilizationBoardEntity): Promise<void>;

  // Dream Board
  getDreamBoardState(): Promise<DreamBoardEntity | null>;
  updateDreamBoardState(state: DreamBoardEntity): Promise<void>;

  // Salary Board
  getSalaryBoardState(): Promise<SalaryBoardEntity | null>;
  updateSalaryBoardState(state: SalaryBoardEntity): Promise<void>;

  // Sprint ceremony
  getSprintState(): Promise<SprintStateEntity | null>;
  updateSprintState(state: SprintStateEntity): Promise<void>;
  /**
   * Write only when the persisted `updatedAt` still matches the expected value
   * (`null` means "no stored updatedAt yet"). Returns false when another writer
   * won the race; callers must not touch derived task flags in that case.
   */
  compareAndUpdateSprintState(
    state: SprintStateEntity,
    expectedUpdatedAt: string | null,
  ): Promise<boolean>;

  // Sprint well-being (raw answers stay on the server; only aggregates leave)
  getSprintWellbeing(sprintId: string): Promise<SprintWellbeingRecord[]>;
  submitSprintWellbeing(sprintId: string, userId: string, answers: number[]): Promise<void>;

  // Reminders
  listReminders(userId?: string): Promise<ReminderEntity[]>;
  getReminderById(id: string): Promise<ReminderEntity | null>;
  createReminder(input: Partial<ReminderEntity>): Promise<ReminderEntity>;
  updateReminder(id: string, patch: Partial<ReminderEntity>): Promise<ReminderEntity>;
  deleteReminder(id: string): Promise<void>;
  deleteRemindersByTaskId(taskId: string): Promise<void>;
  clearAllReminders(): Promise<void>;
  importReminders(reminders: ReminderEntity[]): Promise<void>;

  // Circles (EasyCIRCLE)
  getCircles(): Promise<CircleEntity[]>;
  getCircleById(id: string): Promise<CircleEntity | null>;
  createCircle(circle: Partial<CircleEntity>): Promise<CircleEntity>;
  updateCircle(id: string, data: Partial<CircleEntity>): Promise<CircleEntity | null>;
  deleteCircle(id: string): Promise<void>;
  clearAllCircles(): Promise<void>;
  importCircles(circles: CircleEntity[]): Promise<void>;

  // Frameworks
  getFrameworks(frameworkType?: string): Promise<FrameworkEntity[]>;
  getFrameworkById(id: string): Promise<FrameworkEntity | null>;
  createFramework(framework: Partial<FrameworkEntity>): Promise<FrameworkEntity>;
  updateFramework(id: string, data: Partial<FrameworkEntity>): Promise<FrameworkEntity | null>;
  deleteFramework(id: string): Promise<void>;
  importFrameworks(frameworks: FrameworkEntity[]): Promise<void>;

  // Votes
  getVotes(opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }): Promise<VoteEntity[]>;
  getVoteById(id: string): Promise<VoteEntity | null>;
  getVoteBySlug(slug: string): Promise<VoteEntity | null>;
  createVote(vote: Partial<VoteEntity>): Promise<VoteEntity>;
  updateVote(id: string, data: Partial<VoteEntity>): Promise<VoteEntity | null>;
  finalizeVote(id: string, outcome: VoteEntity['outcome']): Promise<VoteEntity | null>;
  deleteVote(id: string): Promise<void>;
  resetVote(id: string): Promise<VoteEntity | null>;
  importVotes(items: VoteEntity[]): Promise<void>;

  // Vote responses
  getVoteResponses(voteId: string): Promise<VoteResponseEntity[]>;
  createVoteResponse(voteId: string, response: Partial<VoteResponseEntity>): Promise<VoteResponseEntity>;
  deleteVoteResponse(voteId: string, voterToken: string, proposalId: string | null, loopId?: string | null): Promise<void>;
  importVoteResponses(items: VoteResponseEntity[]): Promise<void>;

  // Comparative prioritization ballots
  getVoteRankingSubmissions(voteId: string): Promise<VoteRankingSubmission[]>;
  /**
   * Import ballots. When `replaceVoteIds` is provided, ballots for those votes
   * are deleted before inserting so a restore replaces rather than merges; the
   * list is expected to cover every vote the backup represents. An empty array
   * is a no-op, never an unscoped wipe.
   */
  importVoteRankingSubmissions(items: VoteRankingSubmission[], replaceVoteIds?: string[]): Promise<void>;

  // Vote loops (CONSENT_LOOP)
  getVoteLoops(voteId: string): Promise<VoteLoop[]>;
  createVoteLoop(voteId: string, loop: Partial<VoteLoop>): Promise<VoteLoop>;
  closeVoteLoop(loopId: string): Promise<VoteLoop | null>;
  updateVoteLoop(loopId: string, patch: Partial<VoteLoop>): Promise<VoteLoop | null>;
  importVoteLoops(items: VoteLoop[]): Promise<void>;

  // Vote moderators
  getVoteModerators(voteId: string): Promise<VoteModerator[]>;
  addVoteModerator(voteId: string, input: { displayName: string; email?: string; addedByUserId: string }): Promise<VoteModerator>;
  revokeVoteModerator(moderatorId: string): Promise<void>;
  resolveVoteModeratorToken(token: string): Promise<{ vote: VoteEntity; moderator: VoteModerator } | null>;
  importVoteModerators(items: VoteModerator[]): Promise<void>;

  // Pomodoro sessions
  listPomodoroSessions(userId?: string, since?: number): Promise<PomodoroSession[]>;
  createPomodoroSession(session: PomodoroSession): Promise<PomodoroSession & { warnings?: string[] }>;
  importPomodoroSessions(sessions: PomodoroSession[]): Promise<void>;
  deletePomodoroSession(id: string): Promise<void>;
  clearAllPomodoroSessions(): Promise<void>;
  deletePomodoroSessionsByUser(userId: string): Promise<void>;

  // System
  clearAllData(): Promise<void>;
}

// Factory function to create database client
export async function createDbClient(
  clientType: string,
  dbUrl?: string,
  sqliteFile?: string
): Promise<DbClient> {
  switch (clientType.toLowerCase()) {
    case 'sqlite': {
      const { createSqliteClient } = await import('./sqlite.js');
      return createSqliteClient(sqliteFile);
    }
    case 'pg':
    case 'postgres': {
      const { createPostgresClient } = await import('./postgres.js');
      return createPostgresClient(dbUrl);
    }
    default:
      throw new Error(`Unsupported database client: ${clientType}`);
  }
}