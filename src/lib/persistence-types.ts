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
  created_at: string;
  triage_status: TriageStatus | string;
  urgent: boolean;
  impact: boolean;
  major_incident: boolean;
  difficulty: number;
  timer: { startTime: number; endTime: number }[]; // Match existing app structure
  category: Category | string;
  termination_date: string | null;
  comment: string | null;
  duration_in_minutes: number | null;
  priority: number | null;
  user_id: string | null;
  parent_id: string | null; // For hierarchical tasks
  children?: string[]; // Add children array for hierarchical structure
}

export interface MonthlyBalanceData {
  workload: number;
  hourly_balance: number;
  hours_done: number;
  vacations_hourly_balance?: number;
  vacations_hourly_taken?: number;
  is_manual?: boolean;
  modified_by?: string;
}

export interface AppSettingsEntity {
  split_time: number;
  user_workload_percentage: number;
  weeks_computation: number;
  high_impact_task_goal: number;
  failure_rate_goal: number;
  qli_goal: number;
  new_capabilities_goal: number;
  vacation_limit_multiplier?: number;
  hourly_balance_limit_upper?: number;
  hourly_balance_limit_lower?: number;
  hours_to_be_done_by_day?: number;
  timezone?: string;
  country?: string;
  region?: string;
}

export interface UserSettingsEntity {
  userId: string;
  username: string;
  logo: string;
  has_completed_onboarding: boolean;
  workload?: number;
  split_time?: string;
  monthly_balances?: Record<string, MonthlyBalanceData>;
  card_compactness?: number;
  timezone?: string;
}

export interface QolSurveyResponseEntity {
  // This will be the JSON object from the QoL survey
  [key: string]: unknown;
}

export interface FilterStateEntity {
  showUrgent: boolean;
  showImpact: boolean;
  showMajorIncident: boolean;
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
  getTask(id: string): Promise<TaskEntity | null>;
  createTask(input: Partial<TaskEntity>): Promise<TaskEntity>;
  updateTask(id: string, patch: Partial<TaskEntity>): Promise<TaskEntity>;
  deleteTask(id: string): Promise<void>;
  bulkUpdatePriorities(items: { id: string; priority: number | undefined }[]): Promise<void>;
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
  getSettings(): Promise<AppSettingsEntity>;
  updateSettings(patch: Partial<AppSettingsEntity>): Promise<AppSettingsEntity>;

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

  // Celebration Board
  getCelebrationBoardState(): Promise<CelebrationBoardEntity | null>;
  updateCelebrationBoardState(state: CelebrationBoardEntity): Promise<void>;
}

export interface CelebrationCard {
  id: string;
  columnId: string;
  content: string;
  authorId: string;
  likedBy: string[]; // Array of userIds who liked the card
  isRevealed: boolean; // For hidden edition
}

export interface CelebrationColumn {
  id: string;
  title: string;
  color: string; // For UI styling
  isLocked: boolean;
}

export interface CelebrationBoardEntity {
  moderatorId: string | null;
  isSessionActive: boolean;
  columns: CelebrationColumn[];
  cards: CelebrationCard[];
  timer: {
    isRunning: boolean;
    startTime: number | null;
    duration: number; // in seconds
  } | null;
  hiddenEdition: boolean; // Global flag for hidden edition mode
}