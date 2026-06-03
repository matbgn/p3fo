// Database client interface and factory
import { TaskEntity, UserSettingsEntity, AppSettingsEntity, QolSurveyResponseEntity, FilterStateEntity, FertilizationBoardEntity, DreamBoardEntity, CircleEntity, ReminderEntity, FrameworkEntity, FrameworkType, VoteEntity, VoteResponseEntity, VoteLoop, VoteModerator, VoteKind } from '../../src/lib/persistence-types.js';

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

// Define the database client interface
export interface DbClient {
  initialize(): Promise<void>;
  testConnection(): Promise<void>;
  close?(): Promise<void>;

  // Tasks
  getTasks(userId?: string, pagination?: PaginationOptions, excludeStatuses?: string[]): Promise<PaginatedResponse<TaskEntity>>;
  getTaskById(id: string): Promise<TaskEntity | null>;
  createTask(task: Partial<TaskEntity>): Promise<TaskEntity>;
  updateTask(id: string, data: Partial<TaskEntity>): Promise<TaskEntity | null>;
  deleteTask(id: string): Promise<void>;
  bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void>;
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
  importVoteResponses(items: VoteResponseEntity[]): Promise<void>;

  // Vote loops (CONSENT_LOOP)
  getVoteLoops(voteId: string): Promise<VoteLoop[]>;
  createVoteLoop(voteId: string, loop: Partial<VoteLoop>): Promise<VoteLoop>;
  closeVoteLoop(loopId: string, gating: { value: -1 | 0 | 1; comment?: string }): Promise<VoteLoop | null>;
  updateVoteLoop(loopId: string, patch: Partial<VoteLoop>): Promise<VoteLoop | null>;
  importVoteLoops(items: VoteLoop[]): Promise<void>;

  // Vote moderators
  getVoteModerators(voteId: string): Promise<VoteModerator[]>;
  addVoteModerator(voteId: string, input: { displayName: string; email?: string; addedByUserId: string }): Promise<VoteModerator>;
  revokeVoteModerator(moderatorId: string): Promise<void>;
  resolveVoteModeratorToken(token: string): Promise<{ vote: VoteEntity; moderator: VoteModerator } | null>;
  importVoteModerators(items: VoteModerator[]): Promise<void>;

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