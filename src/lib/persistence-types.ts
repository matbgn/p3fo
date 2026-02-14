// Types for the persistence layer
// Matches the existing structures in useTasks, useUserSettings, useSettings, filter-storage, QoLIndexSurveyPage

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
  preferredWorkingDays?: number[] | Record<string, number>; // Legacy array or new map (day -> percentage)
  trigram?: string;
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
  listTasks(userId?: string): Promise<TaskEntity[]>;
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

  // System
  clearAllData(): Promise<void>;
}

export interface FertilizationCard {
  id: string;
  columnId: string;
  content: string;
  authorId: string | null; // null for anonymous cards
  votes: Record<string, number>; // UserId -> VoteValue
  isRevealed: boolean; // For hidden edition
  linkedCardIds?: string[]; // IDs of linked cards
  promotedTaskId?: string | null; // ID of task created from this card (for legacy display)
}

export interface DreamCard extends FertilizationCard {
  timeFrame: TimeFrame; // Required for Dreams column cards
}

export interface FertilizationColumn {
  id: string;
  title: string;
  color: string; // For UI styling
  isLocked: boolean;
}

export type DreamColumn = FertilizationColumn;

export type TimeFrame = '3mo' | '6mo' | '1y' | '2y' | '4y';
export type VotingMode = 'THUMBS_UP' | 'THUMBS_UD_NEUTRAL' | 'POINTS' | 'MAJORITY_JUDGMENT';
export type VotingPhase = 'IDLE' | 'VOTING' | 'REVEALED';

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
}

// Circles (EasyCIRCLE) - Organizational structure visualization
// Based on OMO2 holon types: 1=Role, 2=Circle, 3=Group, 4=Organization
export type CircleNodeType = 'organization' | 'circle' | 'group' | 'role';
export type CircleNodeModifier = 'template' | 'hierarchy';

export interface CircleEntity {
  id: string;
  name: string;
  parentId: string | null;
  nodeType: CircleNodeType;
  modifier?: CircleNodeModifier; // 'template' for predefined roles, 'hierarchy' for octagon display
  color?: string; // Custom color (mainly for roles), e.g., "#FF6600"
  size?: number; // Size weight for layout calculation
  description?: string; // Optional description/purpose
  purpose?: string; // Raison d'être - the purpose/reason for being of this role
  domains?: string; // Domains of authority - what this role has control over
  accountabilities?: string; // Attendus - expectations and accountabilities
  order?: number; // Display order among siblings
  createdAt: string;
  updatedAt: string;
}