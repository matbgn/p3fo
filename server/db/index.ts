// Database client interface and factory
import { TaskEntity, UserSettingsEntity, AppSettingsEntity, QolSurveyResponseEntity, FilterStateEntity } from '../../src/lib/persistence-types';

// Define the database client interface
export interface DbClient {
  initialize(): Promise<void>;
  testConnection(): Promise<void>;
  close?(): Promise<void>;

  // Tasks
 getTasks(): Promise<TaskEntity[]>;
  getTaskById(id: string): Promise<TaskEntity | null>;
  createTask(task: Partial<TaskEntity>): Promise<TaskEntity>;
  updateTask(id: string, data: Partial<TaskEntity>): Promise<TaskEntity | null>;
  deleteTask(id: string): Promise<void>;
  bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void>;
  clearAllTasks(): Promise<void>;
  importTasks(tasks: TaskEntity[]): Promise<void>;

  // User settings
  getUserSettings(): Promise<UserSettingsEntity>;
  updateUserSettings(data: Partial<UserSettingsEntity>): Promise<UserSettingsEntity>;

  // App settings
 getAppSettings(): Promise<AppSettingsEntity>;
  updateAppSettings(data: Partial<AppSettingsEntity>): Promise<AppSettingsEntity>;

  // QoL survey
  getQolSurveyResponse(): Promise<QolSurveyResponseEntity | null>;
  saveQolSurveyResponse(data: QolSurveyResponseEntity): Promise<void>;

  // Filters
 getFilters(): Promise<FilterStateEntity | null>;
  saveFilters(data: FilterStateEntity): Promise<void>;
  clearFilters(): Promise<void>;
}

// Factory function to create database client
export async function createDbClient(
  clientType: string,
  dbUrl?: string,
  sqliteFile?: string
): Promise<DbClient> {
  switch (clientType.toLowerCase()) {
    case 'sqlite':
      const { createSqliteClient } = await import('./sqlite');
      return createSqliteClient(sqliteFile);
    case 'pg':
    case 'postgres':
      const { createPostgresClient } = await import('./postgres');
      return createPostgresClient(dbUrl);
    default:
      throw new Error(`Unsupported database client: ${clientType}`);
  }
}