// Types for the persistence layer
// Matches the existing structures in useTasks, useUserSettings, useSettings, filter-storage, QoLIndexSurveyPage

import { PomodoroConfig, FocusModeConfig, PomodoroSession } from './pomodoro-types';
export type { PomodoroConfig, FocusModeConfig, PomodoroSession } from './pomodoro-types';
export { DEFAULT_POMODORO_CONFIG, DEFAULT_FOCUS_MODE_CONFIG } from './pomodoro-types';

export type TriageStatus = "Backlog" | "Ready" | "WIP" | "Blocked" | "Done" | "Dropped";

export type Category =
  | "Marketing"
  | "Documentation"
  | "Consulting"
  | "Testing"
  | "Funerals"
  | "Negotiated overtime"
  | "Sickness"
  | "Finances"
  | "HR"
  | "Training"
  | "Support"
  | "UX/UI"
  | "Admin"
  | "Development"
  | "System Operations"
  | "Private";

export interface TaskTimer {
  startTime: number | null;
  elapsedTime: number;
  isRunning: boolean;
}

export interface TaskEntity {
  id: string;
  title: string;
  createdAt: string;
  triageStatus: TriageStatus | string;
  urgent: boolean;
  impact: boolean;
  majorIncident: boolean;
  sprintTarget: boolean;
  difficulty: number;
  timer: { startTime: number; endTime: number }[]; // Match existing app structure
  category: Category | string;
  terminationDate: string | null;
  comment: string | null;
  durationInMinutes: number | null;
  priority: number | null;
  userId: string | null;
  parentId: string | null; // For hierarchical tasks
  children?: string[]; // Add children array for hierarchical structure
  updatedAt?: string | null; // Last modification timestamp for card aging
  linkedVoteIds?: string[];
}

export interface MonthlyBalanceData {
  workload: number;
  hourlyBalance: number;
  hoursDone: number;
  vacationsHourlyBalance?: number;
  vacationsHourlyTaken?: number;
  isManual?: boolean;
  modifiedBy?: string;
}

export type ModuleId =
  | 'celebration'
  | 'dream'
  | 'plan'
  | 'program'
  | 'kanban'
  | 'focus'
  | 'timetable'
  | 'metrics'
  | 'settings'
  | 'voting'
  | 'dream.dream'
  | 'dream.storyboard'
  | 'dream.prioritization'
  | 'plan.circles'
  | 'plan.roles'
  | 'program.calendar'
  | 'program.resources'
  | 'dream.intentionalFramework'
  | 'dream.collaborativeFramework';

export interface AppSettingsEntity {
  splitTime: number;
  userWorkloadPercentage: number;
  weeksComputation: number;
  highImpactTaskGoal: number;
  failureRateGoal: number;
  qliGoal: number;
  newCapabilitiesGoal: number;
  vacationLimitMultiplier?: number;
  hourlyBalanceLimitUpper?: number;
  hourlyBalanceLimitLower?: number;
  hoursToBeDoneByDay?: number;
  timezone?: string;
  country?: string;
  region?: string;
  cardAgingBaseDays?: number;
  disabledModules?: ModuleId[];
  pomodoroConfig?: PomodoroConfig;
  focusModeConfig?: FocusModeConfig;
}

export interface UserSettingsEntity {
  userId: string;
  username: string;
  logo: string;
  hasCompletedOnboarding: boolean;
  workload?: number;
  splitTime?: string;
  monthlyBalances?: Record<string, MonthlyBalanceData>;
  cardCompactness?: number;
  timezone?: string;
  weekStartDay?: 0 | 1;
  defaultPlanView?: 'week' | 'month';
  preferredWorkingDays?: number[] | Record<string, number>;
  trigram?: string;
  pomodoroConfig?: PomodoroConfig;
  focusModeConfig?: FocusModeConfig;
}

export interface QolSurveyResponseEntity {
  // This will be the JSON object from the QoL survey
  [key: string]: unknown;
}

export interface FilterStateEntity {
  showUrgent: boolean;
  showImpact: boolean;
  showMajorIncident: boolean;
  showSprintTarget: boolean;
  status: TriageStatus[];
  showDone?: boolean;
  searchText?: string;
  difficulty: number[];
  category: Category[];
}

export interface StorageMetadata {
  mode: 'browser-json' | 'server-sql';
  backend: 'local' | 'sqlite' | 'postgres';
  version: string;
}

export interface PersistenceAdapter {
  // Tasks
  listTasks(userId?: string, excludeStatuses?: string[]): Promise<TaskEntity[]>;
  getTaskById(id: string): Promise<TaskEntity | null>;
  createTask(input: Partial<TaskEntity>): Promise<TaskEntity>;
  updateTask(id: string, patch: Partial<TaskEntity>): Promise<TaskEntity>;
  deleteTask(id: string): Promise<void>;
  bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void>;
  clearAllTasks(): Promise<void>;
  importTasks(tasks: TaskEntity[]): Promise<void>;

  // User settings
  getUserSettings(userId: string): Promise<UserSettingsEntity | null>;
  updateUserSettings(userId: string, patch: Partial<UserSettingsEntity>): Promise<UserSettingsEntity>;
  listUsers(): Promise<UserSettingsEntity[]>;
  migrateUser(oldUserId: string, newUserId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  clearAllUsers(): Promise<void>;

  // App settings
  getAppSettings(): Promise<AppSettingsEntity>;
  updateAppSettings(patch: Partial<AppSettingsEntity>): Promise<AppSettingsEntity>;

  // QoL survey
  getQolSurveyResponse(userId: string): Promise<QolSurveyResponseEntity | null>;
  saveQolSurveyResponse(userId: string, data: QolSurveyResponseEntity): Promise<void>;
  getAllQolSurveyResponses(): Promise<Record<string, QolSurveyResponseEntity>>;

  // Filters
  getFilters(): Promise<FilterStateEntity | null>;
  saveFilters(data: FilterStateEntity): Promise<void>;
  clearFilters(): Promise<void>;

  // Metadata
  getMetadata(): Promise<StorageMetadata>;

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

  // System
  clearAllData(): Promise<void>;

  // Circles
  listCircles(): Promise<CircleEntity[]>;
  importCircles(circles: CircleEntity[]): Promise<void>;

  // Frameworks
  listFrameworks(frameworkType?: FrameworkType): Promise<FrameworkEntity[]>;
  getFrameworkById(id: string): Promise<FrameworkEntity | null>;
  createFramework(input: Partial<FrameworkEntity>): Promise<FrameworkEntity>;
  updateFramework(id: string, patch: Partial<FrameworkEntity>): Promise<FrameworkEntity | null>;
  deleteFramework(id: string): Promise<void>;
  importFrameworks(frameworks: FrameworkEntity[]): Promise<void>;

  // Votes
  listVotes(opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }): Promise<VoteEntity[]>;
  getVoteById(id: string): Promise<VoteEntity | null>;
  getVoteBySlug(slug: string): Promise<VoteEntity | null>;
  createVote(input: Partial<VoteEntity>): Promise<VoteEntity>;
  updateVote(id: string, patch: Partial<VoteEntity>): Promise<VoteEntity | null>;
  finalizeVote(id: string, outcome: VoteEntity['outcome']): Promise<VoteEntity | null>;
  deleteVote(id: string): Promise<void>;
  resetVote(id: string): Promise<VoteEntity | null>;
  importVotes(items: VoteEntity[]): Promise<void>;

  // Vote responses
  listVoteResponses(voteId: string): Promise<VoteResponseEntity[]>;
  createVoteResponse?(voteId: string, response: Partial<VoteResponseEntity>): Promise<VoteResponseEntity>;
  deleteVoteResponse?(voteId: string, voterToken: string, proposalId: string | null, loopId?: string | null): Promise<void>;
  importVoteResponses(items: VoteResponseEntity[]): Promise<void>;

  // Vote loops (CONSENT_LOOP)
  listVoteLoops(voteId: string): Promise<VoteLoop[]>;
  createVoteLoop(voteId: string, loop: Partial<VoteLoop>): Promise<VoteLoop>;
  updateVoteLoop(loopId: string, patch: Partial<VoteLoop>): Promise<VoteLoop | null>;
  closeVoteLoop(loopId: string): Promise<VoteLoop | null>;
  importVoteLoops(items: VoteLoop[]): Promise<void>;

  // Vote moderators
  listVoteModerators(voteId: string): Promise<VoteModerator[]>;
  addVoteModerator(voteId: string, input: { displayName: string; email?: string }): Promise<VoteModerator>;
  revokeVoteModerator(moderatorId: string): Promise<void>;
  resolveVoteModerator(token: string): Promise<{ vote: VoteEntity; moderator: VoteModerator } | null>;
  importVoteModerators(items: VoteModerator[]): Promise<void>;

  // Pomodoro sessions
  listPomodoroSessions(userId?: string, since?: number): Promise<PomodoroSession[]>;
  createPomodoroSession(session: PomodoroSession): Promise<PomodoroSession>;
  deletePomodoroSession(id: string): Promise<void>;
  clearAllPomodoroSessions(): Promise<void>;
  deletePomodoroSessionsByUser(userId: string): Promise<void>;
}

export type FactTag = 'A' | 'N' | 'K' | 'P';

export interface FertilizationCard {
  id: string;
  columnId: string;
  content: string;
  authorId: string | null; // null for anonymous cards
  votes: Record<string, number>; // UserId -> VoteValue
  isRevealed: boolean; // For hidden edition
  linkedCardIds?: string[]; // IDs of linked cards
  promotedTaskId?: string | null; // ID of task created from this card (for legacy display)
  factTag?: FactTag; // Achieved / Non-Achieved / Key numbers / Planned (facts column only)
}

export interface DreamCard extends FertilizationCard {
  timeFrame: TimeFrame; // Required for Dreams column cards
}

export interface FertilizationColumn {
  id: string;
  title: string;
  color: string; // For UI styling
  isLocked: boolean;
  votingMode?: VotingMode; // Per-column override; falls back to board-level
  votingPhase?: VotingPhase; // Per-column override; falls back to board-level
  maxPointsPerUser?: number; // Per-column budget for POINTS mode
  mjLabels?: Record<number, string>; // Per-column override for Majority Judgment grade labels
}

export type DreamColumn = FertilizationColumn;

export type TimeFrame = '3mo' | '6mo' | '1y' | '2y' | '4y';
export type VotingMode = 'THUMBS_UP' | 'THUMBS_UD_NEUTRAL' | 'POINTS' | 'MAJORITY_JUDGMENT';
export type VotingPhase = 'IDLE' | 'VOTING' | 'REVEALED';

export type VoteMode = VotingMode | 'CONSENT_LOOP';
export type VoteKind = 'consultation' | 'decision';
export type VotePhase = 'IDLE' | 'OPEN' | 'CLOSED' | 'FINALIZED';

export interface VoteProposal {
  id: string;
  content: string;
  description?: string;
  infoUrl?: string;
  position: number;
  active: boolean;
}

export interface VoteConfig {
  mode: VoteMode;
  kind: VoteKind;
  phase: VotePhase;
  allowMultiple?: boolean;
  maxPointsPerUser?: number;
  mjLabels?: Record<number, string>;
  isAnonymous?: boolean;
  allowFreeText?: boolean;
  requireObjectionComment?: boolean;
  allowAudienceProposals?: boolean;
  showResultsBeforeClose?: boolean;
  allowVoteChangeUntilClose?: boolean;
  multipleChoiceVote?: boolean;
  isHiddenFromHome?: boolean;
  openAt?: string;
  closeAt?: string;
}

export interface VoteEntity {
  id: string;
  slug: string;
  title: string;
  description?: string;
  ownerId: string;
  proposals: VoteProposal[];
  config: VoteConfig;
  outcome?: {
    winningProposalId: string | null;
    summary: string;
    finalizedAt: string;
    finalizedByUserId: string;
    signature?: string;
  };
  moderationTokens?: VoteModerator[];
  createdAt: string;
  updatedAt: string;
  linkedTaskId?: string;
}

export interface VoteResponseEntity {
  id: string;
  voteId: string;
  proposalId: string | null;
  loopId?: string;
  userId: string | null;
  voterToken: string;
  value: number;
  comment?: string;
  submittedAt: string;
}

export interface VoteLoop {
  id: string;
  voteId: string;
  proposalId: string;
  roundNumber: number;
  proposalContent: string;
  openedAt: string;
  closedAt?: string;
  openedByUserId: string;
}

export interface VoteModerator {
  id: string;
  voteId: string;
  userId?: string;
  displayName: string;
  email?: string;
  token: string;
  addedByUserId: string;
  addedAt: string;
  active: boolean;
  lastSeenAt?: string;
}

export interface FertilizationBoardEntity {
  moderatorId: string | null;
  isSessionActive: boolean;
  columns: FertilizationColumn[];
  cards: FertilizationCard[];
  timer: {
    isRunning: boolean;
    startTime: number | null;
    duration: number; // in seconds
  } | null;
  hiddenEdition: boolean; // Global flag for hidden edition mode
  votingMode: VotingMode;
  votingPhase: VotingPhase;
  maxPointsPerUser?: number; // Configurable max points for POINTS voting mode
  mjLabels?: Record<number, string>; // Global override for Majority Judgment grade labels
  areCursorsVisible?: boolean; // Control cursor visibility for all users
  showAllLinks?: boolean; // Control global link visibility
}

export interface DreamBoardEntity {
  moderatorId: string | null;
  isSessionActive: boolean;
  columns: DreamColumn[];
  cards: DreamCard[];
  timer: {
    isRunning: boolean;
    startTime: number | null;
    duration: number; // in seconds
  } | null;
  hiddenEdition: boolean; // Global flag for hidden edition mode
  votingMode: VotingMode;
  votingPhase: VotingPhase;
  maxPointsPerUser?: number; // Configurable max points for POINTS voting mode
  isTimelineExpanded: boolean; // Dream-specific timeline expansion state
  timeSortDirection: 'nearest' | 'farthest'; // Dream-specific sorting direction
  areCursorsVisible?: boolean; // Control cursor visibility for all users
  showAllLinks?: boolean; // Control global link visibility
  mjLabels?: Record<number, string>; // Global override for Majority Judgment grade labels
}

// Circles (EasyCIRCLE) - Organizational structure visualization
// Based on OMO2 holon types: 1=Role, 2=Circle, 3=Group, 4=Organization
export type CircleNodeType = 'organization' | 'circle' | 'group' | 'role';
export type CircleNodeModifier = 'template' | 'hierarchy';

export type RoleInvolvementType = 'P' | 'CP' | 'PA' | 'F' | 'A' | 'R';

export interface RoleAssignment {
  userId: string;
  involvementType: RoleInvolvementType;
}

export interface CircleEntity {
  id: string;
  name: string;
  parentId: string | null;
  nodeType: CircleNodeType;
  modifier?: CircleNodeModifier; // 'template' for predefined roles, 'hierarchy' for octagon display
  color?: string; // Custom color (mainly for roles), e.g., "#FF6600"
  size?: number; // Size weight for layout calculation
  purpose?: string; // What service or general functionality does the role-circle provide
  missions?: string; // What specific services or tasks does the role-circle provide
  authorityScope?: string; // What are the elements over which the role-circle has exclusive authority
  order?: number; // Display order among siblings
  assignments?: RoleAssignment[]; // Users assigned to this role with involvement types
  createdAt: string;
  updatedAt: string;
}

export interface ReminderEntity {
  id: string;
  userId: string;
  taskId?: string;
  title: string;
  description?: string;
  read: boolean;
  persistent: boolean;
  triggerDate?: string; // ISO date string for scheduling
  offsetMinutes?: number;
  snoozeDurationMinutes?: number;
  originalTriggerDate?: string;
  state: 'scheduled' | 'triggered' | 'read' | 'dismissed';
  createdAt: string;
  updatedAt: string;
}

export type FrameworkType = 'intentional' | 'collaborative';

export interface FrameworkCategory {
  id: string;
  label: string;
  description: string;
  optional?: boolean;
  content: string;
  order: number;
}

export interface FrameworkEntity {
  id: string;
  name: string;
  frameworkType: FrameworkType;
  parentId: string | null;
  categories: FrameworkCategory[];
  createdAt: string;
  updatedAt: string;
}