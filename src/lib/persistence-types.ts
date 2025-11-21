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

export interface UserSettingsEntity {
  userId: string;
  username: string;
  logo: string;
  has_completed_onboarding: boolean;
  workload_percentage?: number;
  split_time?: string;
}

export interface AppSettingsEntity {
  split_time: number;
  user_workload_percentage: number;
  weeks_computation: number;
  high_impact_task_goal: number;
  failure_rate_goal: number;
  qli_goal: number;
  new_capabilities_goal: number;
}

export interface QolSurveyResponseEntity {
  // This will be the JSON object from the QoL survey
  [key: string]: any;
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

  // App settings
  getSettings(): Promise<AppSettingsEntity>;
  updateSettings(patch: Partial<AppSettingsEntity>): Promise<AppSettingsEntity>;

  // QoL survey
  getQolSurveyResponse(): Promise<QolSurveyResponseEntity | null>;
  saveQolSurveyResponse(data: QolSurveyResponseEntity): Promise<void>;

  // Filters
  getFilters(): Promise<FilterStateEntity | null>;
  saveFilters(data: FilterStateEntity): Promise<void>;
  clearFilters(): Promise<void>;

  // Metadata
  getMetadata(): Promise<StorageMetadata>;
}