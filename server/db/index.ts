// Database client interface and factory
import { TaskEntity, UserSettingsEntity, AppSettingsEntity, QolSurveyResponseEntity, FilterStateEntity, FertilizationBoardEntity, DreamBoardEntity, SalaryBoardEntity, CircleEntity, ReminderEntity, FrameworkEntity, FrameworkType, VoteEntity, VoteResponseEntity, VoteRankingSubmission, VoteLoop, VoteModerator, VoteKind, PomodoroSession } from '../../src/lib/persistence-types.js';
import type { VoteRankingBallot } from '../../src/lib/persistence-types.js';
import type { BallotParticipationStat } from '../../src/lib/vote-ranking.js';
import type { SprintStateEntity } from '../../src/lib/sprint-types.js';
import { applyTemporalMirror } from '../../mcp-server/src/task-temporal.js';

/**
 * How far back a restart warms the blind-poker scrub for votes that are no
 * longer open. Open rounds are always warmed because they can still receive
 * estimates; this window only bounds closed/finalized rounds whose historical
 * responses would otherwise be re-scanned and retained forever. Kept in one
 * place so SQLite and Postgres cannot drift.
 */
export const POKER_BLIND_WARMUP_DAYS = 180;

export interface SprintWellbeingRecord {
  userId: string;
  answers: number[];
  submittedAt: string;
}

/**
 * Snapshot a reset must still match inside its transaction. Poker round
 * rollover reads the vote, then deletes responses and replaces the config; a
 * concurrent duplicate rollover or a moderator close/finalize between those
 * steps must abort the write instead of destroying the new round or reopening
 * the vote.
 */
export interface VoteResetGuard {
  phase: VoteEntity['config']['phase'];
  pokerRound: number;
  pokerRevealedAt: string | null;
}

/**
 * Whether a persisted vote config still matches the reset snapshot. Shared by
 * both adapters: the comparison lives in one place so a SQLite and a Postgres
 * deployment cannot drift on which stale rollovers are rejected (which would
 * delete a new round's responses on the adapter that drifted).
 */
export function voteResetGuardMatches(
  config: VoteEntity['config'] | null | undefined,
  guard: VoteResetGuard,
): boolean {
  const poker = config?.poker;
  return (
    config?.phase === guard.phase &&
    (poker?.round ?? 0) === guard.pokerRound &&
    (poker?.revealedAt ?? null) === guard.pokerRevealedAt
  );
}

/**
 * Snapshot an arm/cancel/reveal write must still match inside its transaction.
 * The server-owned poker transitions each derive their next state from a vote
 * they read; a close/finalize, a competing reveal or a participant cancel that
 * lands between that read and the write must abort the write instead of
 * reopening the vote, un-revealing a round that just revealed, or revealing a
 * round the participant just cancelled.
 *
 * `pokerRevealAt` is part of the snapshot: a cancel clears the armed deadline
 * without changing `phase` or `revealedAt`, so without it an in-flight reveal
 * that re-read the vote before the cancel would still pass the guard and stamp
 * `revealedAt` on the cancelled round.
 */
export interface VotePokerWriteGuard {
  phase: VoteEntity['config']['phase'];
  pokerRevealedAt: string | null;
  pokerRevealAt: string | null;
  /**
   * Stable signature of the individually revealed proposal ids observed by the
   * caller. A force-reveal derives its next list from a read, so a competing
   * reveal (or a round reset) that changed the list between the read and the
   * write must abort the write instead of dropping the other proposal.
   */
  pokerRevealedProposalIds: string;
}

/**
 * Order-independent signature of a `revealedProposalIds` array, used by the
 * poker write guard. Deduplicates and sorts so two equivalent lists (or an
 * absent list and `[]`) always compare equal.
 */
export function pokerRevealedProposalIdsSignature(
  ids: readonly string[] | null | undefined,
): string {
  if (!Array.isArray(ids) || ids.length === 0) return '';
  return Array.from(
    new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  )
    .sort()
    .join(',');
}

/** Shared guard comparison for the arm/cancel/reveal poker writes. */
export function votePokerWriteGuardMatches(
  config: VoteEntity['config'] | null | undefined,
  guard: VotePokerWriteGuard,
): boolean {
  const poker = config?.poker;
  return (
    config?.phase === guard.phase &&
    (poker?.revealedAt ?? null) === guard.pokerRevealedAt &&
    (poker?.revealAt ?? null) === guard.pokerRevealAt &&
    pokerRevealedProposalIdsSignature(poker?.revealedProposalIds) ===
      guard.pokerRevealedProposalIds
  );
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

/** One row of a voter's atomic response replacement. */
export interface VoteResponseUpsert {
  proposalId: string;
  value: number;
  attendeeData?: VoteResponseEntity['attendeeData'];
  /** One free-text comment, repeated on each row of a scheduling batch. */
  comment?: string | null;
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
  /**
   * Existing votes for the given ids, in one round-trip. A restore payload
   * lists its own ids, so callers use this instead of `getVotes()` to keep the
   * read bounded by the request rather than by the whole vote history.
   */
  getVotesByIds(ids: string[]): Promise<VoteEntity[]>;
  getVoteById(id: string): Promise<VoteEntity | null>;
  getVoteBySlug(slug: string): Promise<VoteEntity | null>;
  createVote(vote: Partial<VoteEntity>): Promise<VoteEntity>;
  updateVote(id: string, data: Partial<VoteEntity>): Promise<VoteEntity | null>;
  /**
   * Merge a patch into a vote's `poker` config under a guard, atomically.
   * Re-reads (and locks on Postgres) the row inside the transaction, aborts with
   * `null` when the phase or reveal state no longer matches `guard`, and
   * otherwise applies only the supplied poker fields so a concurrent edit to
   * `phase` or any other config key survives. The arm/cancel/reveal transitions
   * must not use the generic `updateVote`, whose patch merges a caller-read
   * config snapshot and can overwrite a close or a competing reveal that landed
   * after that read.
   */
  updateVotePokerConfig(
    id: string,
    patch: Partial<NonNullable<VoteEntity['config']['poker']>>,
    guard: VotePokerWriteGuard,
  ): Promise<VoteEntity | null>;
  finalizeVote(id: string, outcome: VoteEntity['outcome']): Promise<VoteEntity | null>;
  deleteVote(id: string): Promise<void>;
  resetVote(id: string): Promise<VoteEntity | null>;
  /**
   * Reset a vote and merge a config patch in one transaction. A poker round
   * rollover deletes the responses and advances the round at the same time; if
   * those writes can be observed apart, an interrupted process leaves the
   * responses gone and the vote stranded in IDLE with no way to retry. Either
   * both apply or neither does.
   *
   * The patch is merged onto the config re-read (and locked on Postgres) inside
   * the transaction, so a concurrent update to an unrelated key is preserved.
   * When `guard` is provided the reset is abandoned with a `null` result if the
   * phase, poker round or reveal deadline changed since the caller read it.
   */
  resetVoteWithConfig(
    id: string,
    configPatch: Partial<VoteEntity['config']>,
    guard?: VoteResetGuard,
  ): Promise<VoteEntity | null>;
  /**
   * Only the poker votes that still owe a reveal: mode POKER_PLANNING, phase
   * OPEN, an armed `revealAt` and no `revealedAt`. Used by the startup
   * recovery instead of loading the entire vote history.
   */
  getPokerVotesAwaitingReveal(): Promise<VoteEntity[]>;
  /**
   * Blind poker votes whose persisted deck is still unrevealed AND that still
   * carry at least one response. The shared Yjs document is unauthenticated, so
   * the blind-reveal scrub must decide from persisted state instead of the
   * client-visible vote projection. The config is included so startup can also
   * warm the per-proposal `revealedProposalIds` allow-list; restricting to votes
   * that have a response keeps the warm set bounded to the rounds that can
   * actually leak a value, rather than every hidden poker vote ever created.
   */
  getUnrevealedPokerVoteStates(): Promise<Array<Pick<VoteEntity, 'id' | 'config'>>>;
  importVotes(items: VoteEntity[]): Promise<void>;

  // Vote responses
  getVoteResponses(voteId: string): Promise<VoteResponseEntity[]>;
  /**
   * Just the `(voterToken, proposalId)` coverage of a vote's responses, without
   * loading row ids, values or the parsed `attendeeData` JSON. The poker
   * readiness poll runs every 2 seconds for every viewer and only needs to know
   * which proposals each voter covered, so it must not pay for a full row scan.
   */
  getVoteParticipantCoverage(
    voteId: string,
  ): Promise<Array<{ voterToken: string; proposalId: string | null }>>;
  /** One voter's own responses, used to read back their comment. */
  getVoteResponsesForVoter(voteId: string, voterToken: string): Promise<VoteResponseEntity[]>;
  createVoteResponse(voteId: string, response: Partial<VoteResponseEntity>): Promise<VoteResponseEntity>;
  /**
   * Delete the matching response rows and return their ids, so the live Yjs
   * channel can evict exactly those keys instead of re-broadcasting the whole
   * vote.
   */
  deleteVoteResponse(voteId: string, voterToken: string, proposalId: string | null, loopId?: string | null): Promise<string[]>;
  /** Delete every response row a voter owns (a whole scheduling row). */
  deleteVoteResponsesForVoter(voteId: string, voterToken: string): Promise<string[]>;
  /**
   * Atomically replace one voter's rows for `scopeProposalIds`: upsert every
   * supplied row and delete every in-scope row that is not one of those
   * upserts, in one serialized transaction. The delete set is derived inside
   * the transaction (not from a snapshot read before it) and the voter's
   * replacement is serialized across app instances, so concurrent submissions
   * cannot merge two intents into a hybrid matrix. A deploy restart or a
   * failure mid-way must not leave a half-replaced availability matrix
   * (withdrawn slots still counted). `scopeProposalIds` bounds the delete to
   * the vote's active slots so rows for removed candidates are left untouched.
   */
  replaceVoteResponsesForVoter(
    voteId: string,
    voterToken: string,
    upserts: VoteResponseUpsert[],
    scopeProposalIds: string[],
  ): Promise<{ responses: VoteResponseEntity[]; removedIds: string[] }>;
  /**
   * Set (or clear) the free-text comment on every response row this voter
   * owns, without touching their votes. Returns the updated rows so the live
   * Yjs channel can publish them.
   */
  updateVoteResponsesComment(
    voteId: string,
    voterToken: string,
    comment: string | null,
  ): Promise<VoteResponseEntity[]>;
  /**
   * Rename the voter's existing canonical rows without touching availability.
   * The target rows are selected inside the same transaction and per-voter lock
   * as `replaceVoteResponsesForVoter`, so a concurrently submitted availability
   * matrix cannot be resurrected from a stale pre-read snapshot, and everything
   * other than `attendeeData` (value, `submittedAt`, `userId`, comment) is
   * preserved as stored.
   */
  renameVoteResponsesForVoter(
    voteId: string,
    voterToken: string,
    displayName: string,
    options: {
      /** Only rows for this proposal; `null` targets every non-null proposal. */
      proposalId: string | null;
      /** `hidden` forces hidden visibility; `auto` keeps the row's visibility. */
      visibility: 'hidden' | 'auto';
    },
  ): Promise<VoteResponseEntity[]>;
  importVoteResponses(items: VoteResponseEntity[]): Promise<void>;

  // Comparative prioritization ballots
  getVoteRankingSubmissions(voteId: string): Promise<VoteRankingSubmission[]>;
  getVoteRankingSubmission(voteId: string, voterToken: string): Promise<VoteRankingSubmission | null>;
  /**
   * Create or update the ballot row for `(voteId, voterToken)`. Fields left
   * `undefined` keep their stored value, so an autosave that omits `submitted`
   * can never erase a previously submitted ballot.
   */
  upsertVoteRankingSubmission(
    voteId: string,
    patch: {
      voterToken: string;
      userId?: string | null;
      displayName?: string | null;
      draft?: VoteRankingBallot | null;
      draftUpdatedAt?: string | null;
      submitted?: VoteRankingBallot | null;
      submittedAt?: string | null;
      lastSeenAt?: string;
    },
  ): Promise<VoteRankingSubmission>;
  deleteVoteRankingSubmission(voteId: string, voterToken: string): Promise<void>;
  /**
   * Update only the stored display name on a voter's existing comparative
   * submission, preserving the ballot, coverage and timestamps. A rename after
   * Submit must reach the submission the facilitator's participation view
   * reads (`displayName`), which no longer flows through a ballot save once the
   * vote locks changes. Returns false when the voter has no submission.
   */
  renameVoteRankingSubmissionForVoter(
    voteId: string,
    voterToken: string,
    displayName: string,
  ): Promise<boolean>;
  /** Only rows carrying a submitted ballot; draft payloads are not loaded. */
  getVoteRankingSubmittedBallots(voteId: string): Promise<VoteRankingSubmission[]>;
  /** Count submitted ballots without loading any ballot payload. */
  countVoteRankingSubmittedBallots(voteId: string): Promise<number>;
  /**
   * Count everyone who opened/participated in a comparative vote without
   * parsing ballot payloads. Used by the live broadcast, which only needs the
   * aggregate counts, not per-participant coverage/confidence.
   */
  countVoteRankingParticipants(voteId: string): Promise<number>;
  /** Lean participation projection that avoids loading full ballot payloads. */
  getVoteRankingParticipationStats(voteId: string): Promise<BallotParticipationStat[]>;
  /**
   * Cheap existence check for stored participant identities. Callers use it to
   * decide whether an identity scrub is needed without a state transition, so a
   * failed scrub is repaired by the next save instead of never running again.
   */
  hasVoteRankingSubmissionIdentities(voteId: string): Promise<boolean>;
  /** Null out stored participant identities after anonymity is switched on. */
  scrubVoteRankingSubmissionIdentities(voteId: string): Promise<void>;
  /**
   * Import ballots. When `replaceVoteIds` is provided, ballots for those votes
   * are deleted before inserting so a restore replaces rather than merges; the
   * list is expected to cover every vote the backup represents. In-progress
   * drafts are preserved, because a redacted backup cannot contain them and
   * deleting them would lose data the restore cannot put back. An empty array
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
  /** Resolve a moderator token without recording a "last seen" stamp. Used for
   * read-only capability checks so that merely viewing results (or the in-app
   * owner view reusing the token) does not mark the link as used. */
  verifyVoteModeratorToken(token: string): Promise<{ vote: VoteEntity; moderator: VoteModerator } | null>;
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