import { PersistenceAdapter, TaskEntity, UserSettingsEntity, AppSettingsEntity, QolSurveyResponseEntity, FilterStateEntity, StorageMetadata, FertilizationBoardEntity, DreamBoardEntity } from './persistence-types';

// Storage keys
const TASKS_STORAGE_KEY = 'dyad_task_board_v1';
const USER_SETTINGS_STORAGE_KEY = 'p3fo_user_settings_v1';
const APP_SETTINGS_STORAGE_KEY = 'dyad_settings_v1';
const QOL_SURVEY_STORAGE_KEY = 'qolSurveyResponse';
const FILTERS_STORAGE_KEY = 'taskFilters';
const FERTILIZATION_BOARD_STORAGE_KEY = 'fertilizationBoard';
const DREAM_BOARD_STORAGE_KEY = 'dreamBoard';

// Default values
const DEFAULT_USER_SETTINGS: UserSettingsEntity = {
  userId: 'default-user',
  username: 'User',
  logo: '',
  hasCompletedOnboarding: false,
  workload: 60,
  splitTime: '13:00',
  cardCompactness: 0,
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
};

export class BrowserJsonPersistence implements PersistenceAdapter {
  async listTasks(userId?: string): Promise<TaskEntity[]> {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(TASKS_STORAGE_KEY);
      const allTasks = stored ? JSON.parse(stored) : [];

      // Filter by userId if provided
      if (userId) {
        return allTasks.filter((task: TaskEntity) => task.userId === userId);
      }

      return allTasks;
    } catch (error) {
      console.error('Error reading tasks from localStorage:', error);
      return [];
    }
  }

  async getTaskById(id: string): Promise<TaskEntity | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const tasks = await this.listTasks();
      return tasks.find(task => task.id === id) || null;
    } catch (error) {
      console.error('Error getting task from localStorage:', error);
      return null;
    }
  }

  async createTask(input: Partial<TaskEntity>): Promise<TaskEntity> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot create task in non-browser environment');
    }

    try {
      const tasks = await this.listTasks();
      const newTask: TaskEntity = {
        id: input.id || crypto.randomUUID(),
        title: input.title || 'New Task',
        createdAt: input.createdAt || new Date().toISOString(),
        triageStatus: input.triageStatus || 'Backlog',
        urgent: input.urgent || false,
        impact: input.impact || false,
        majorIncident: input.majorIncident || false,
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
      };

      tasks.push(newTask);
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
      return newTask;
    } catch (error) {
      console.error('Error creating task in localStorage:', error);
      throw error;
    }
  }

  async updateTask(id: string, patch: Partial<TaskEntity>): Promise<TaskEntity> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot update task in non-browser environment');
    }

    try {
      const tasks = await this.listTasks();
      const index = tasks.findIndex(task => task.id === id);

      if (index === -1) {
        throw new Error(`Task with id ${id} not found`);
      }

      tasks[index] = { ...tasks[index], ...patch };
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
      return tasks[index];
    } catch (error) {
      console.error('Error updating task in localStorage:', error);
      throw error;
    }
  }

  async deleteTask(id: string): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const tasks = await this.listTasks();
      const filteredTasks = tasks.filter(task => task.id !== id);
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(filteredTasks));
    } catch (error) {
      console.error('Error deleting task from localStorage:', error);
      throw error;
    }
  }

  async bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const tasks = await this.listTasks();

      for (const { id, priority } of items) {
        const index = tasks.findIndex(task => task.id === id);
        if (index !== -1) {
          tasks[index].priority = priority;
        }
      }

      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error('Error bulk updating priorities in localStorage:', error);
      throw error;
    }
  }

  async clearAllTasks(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(TASKS_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing tasks from localStorage:', error);
      throw error;
    }
  }

  async importTasks(tasks: TaskEntity[]): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error('Error importing tasks to localStorage:', error);
      throw error;
    }
  }

  async getUserSettings(userId: string): Promise<UserSettingsEntity | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = localStorage.getItem(`${USER_SETTINGS_STORAGE_KEY}_${userId}`);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      // Migration for legacy data
      if (parsed.workload === undefined && parsed.workload_percentage !== undefined) {
        parsed.workload = parsed.workload_percentage;
        delete parsed.workload_percentage;
      }
      return parsed;
    } catch (error) {
      console.error('Error reading user settings from localStorage:', error);
      return null;
    }
  }

  async updateUserSettings(userId: string, patch: Partial<UserSettingsEntity>): Promise<UserSettingsEntity> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot update user settings in a non-browser environment.');
    }

    try {
      const current = await this.getUserSettings(userId) || { ...DEFAULT_USER_SETTINGS, userId };
      const updated = { ...current, ...patch };
      localStorage.setItem(`${USER_SETTINGS_STORAGE_KEY}_${userId}`, JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error updating user settings in localStorage:', error);
      throw error;
    }
  }

  async listUsers(): Promise<UserSettingsEntity[]> {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const users: UserSettingsEntity[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${USER_SETTINGS_STORAGE_KEY}_`)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);
            // Migration for legacy data
            if (parsed.workload === undefined && parsed.workload_percentage !== undefined) {
              parsed.workload = parsed.workload_percentage;
              delete parsed.workload_percentage;
            }
            users.push(parsed);
          }
        }
      }
      return users;
    } catch (error) {
      console.error('Error listing users from localStorage:', error);
      return [];
    }
  }

  async migrateUser(oldUserId: string, newUserId: string): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      // 1. Migrate tasks
      const tasks = await this.listTasks();
      let tasksChanged = false;

      tasks.forEach(task => {
        if (task.userId === oldUserId) {
          task.userId = newUserId;
          tasksChanged = true;
        }
      });

      if (tasksChanged) {
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
      }

      // 2. Migrate settings
      const oldSettings = await this.getUserSettings(oldUserId);
      if (oldSettings) {
        // Save as new user settings, updating the ID
        await this.updateUserSettings(newUserId, {
          ...oldSettings,
          userId: newUserId
        });

        // Remove old settings
        localStorage.removeItem(`${USER_SETTINGS_STORAGE_KEY}_${oldUserId}`);
      }

      console.log(`Migrated data from ${oldUserId} to ${newUserId}`);
    } catch (error) {
      console.error('Error migrating user data:', error);
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(`${USER_SETTINGS_STORAGE_KEY}_${userId}`);
      localStorage.removeItem(`${QOL_SURVEY_STORAGE_KEY}_${userId}`);
      console.log(`Deleted user ${userId}`);
    } catch (error) {
      console.error('Error deleting user from localStorage:', error);
      throw error;
    }
  }

  async clearAllUsers(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(`${USER_SETTINGS_STORAGE_KEY}_`) || key.startsWith(`${QOL_SURVEY_STORAGE_KEY}_`))) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error('Error clearing users from localStorage:', error);
      throw error;
    }
  }

  async getAppSettings(): Promise<AppSettingsEntity> {
    if (typeof window === 'undefined') {
      return DEFAULT_APP_SETTINGS;
    }

    try {
      const stored = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_APP_SETTINGS;
    } catch (error) {
      console.error('Error reading app settings from localStorage:', error);
      return DEFAULT_APP_SETTINGS;
    }
  }

  async updateAppSettings(patch: Partial<AppSettingsEntity>): Promise<AppSettingsEntity> {
    if (typeof window === 'undefined') {
      return DEFAULT_APP_SETTINGS;
    }

    try {
      const current = await this.getAppSettings();
      const updated = { ...current, ...patch };
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error updating app settings in localStorage:', error);
      throw error;
    }
  }

  async getQolSurveyResponse(userId: string): Promise<QolSurveyResponseEntity | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = localStorage.getItem(`${QOL_SURVEY_STORAGE_KEY}_${userId}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error reading QoL survey response from localStorage:', error);
      return null;
    }
  }

  async saveQolSurveyResponse(userId: string, data: QolSurveyResponseEntity): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(`${QOL_SURVEY_STORAGE_KEY}_${userId}`, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving QoL survey response to localStorage:', error);
      throw error;
    }
  }

  async getAllQolSurveyResponses(): Promise<Record<string, QolSurveyResponseEntity>> {
    if (typeof window === 'undefined') {
      return {};
    }

    try {
      const responses: Record<string, QolSurveyResponseEntity> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${QOL_SURVEY_STORAGE_KEY}_`)) {
          const userId = key.replace(`${QOL_SURVEY_STORAGE_KEY}_`, '');
          const stored = localStorage.getItem(key);
          if (stored) {
            responses[userId] = JSON.parse(stored);
          }
        }
      }
      return responses;
    } catch (error) {
      console.error('Error getting all QoL survey responses from localStorage:', error);
      return {};
    }
  }

  async getFilters(): Promise<FilterStateEntity | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = sessionStorage.getItem(FILTERS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error reading filters from sessionStorage:', error);
      return null;
    }
  }

  async saveFilters(data: FilterStateEntity): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving filters to sessionStorage:', error);
      throw error;
    }
  }

  async clearFilters(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      sessionStorage.removeItem(FILTERS_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing filters from sessionStorage:', error);
      throw error;
    }
  }

  async getMetadata(): Promise<StorageMetadata> {
    return {
      mode: 'browser-json',
      backend: 'local',
      version: '1.0.0',
    };
  }

  async getFertilizationBoardState(): Promise<FertilizationBoardEntity | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = localStorage.getItem(FERTILIZATION_BOARD_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error reading fertilization board state from localStorage:', error);
      return null;
    }
  }

  async updateFertilizationBoardState(state: FertilizationBoardEntity): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(FERTILIZATION_BOARD_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error updating fertilization board state in localStorage:', error);
      throw error;
    }
  }

  async getDreamBoardState(): Promise<DreamBoardEntity | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = localStorage.getItem(DREAM_BOARD_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error reading dream board state from localStorage:', error);
      return null;
    }
  }

  async updateDreamBoardState(state: DreamBoardEntity): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(DREAM_BOARD_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error updating dream board state in localStorage:', error);
      throw error;
    }
  }

  async clearAllData(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      // Clear all known keys
      localStorage.removeItem(TASKS_STORAGE_KEY);
      localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
      localStorage.removeItem(FERTILIZATION_BOARD_STORAGE_KEY);
      localStorage.removeItem(DREAM_BOARD_STORAGE_KEY);
      sessionStorage.removeItem(FILTERS_STORAGE_KEY);

      // Clear dynamic keys (users and QoL surveys)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(`${USER_SETTINGS_STORAGE_KEY}_`) || key.startsWith(`${QOL_SURVEY_STORAGE_KEY}_`))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      console.log('All application data cleared from localStorage');
    } catch (error) {
      console.error('Error clearing all data from localStorage:', error);
      throw error;
    }
  }
}