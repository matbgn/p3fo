import { PersistenceAdapter, TaskEntity, UserSettingsEntity, AppSettingsEntity, QolSurveyResponseEntity, FilterStateEntity, StorageMetadata, FertilizationBoardEntity, DreamBoardEntity, ReminderEntity, CircleEntity, FrameworkEntity, FrameworkType, VoteEntity, VoteResponseEntity, VoteLoop, VoteModerator, VoteKind } from './persistence-types';

// Storage keys
const TASKS_STORAGE_KEY = 'dyad_task_board_v1';
const USER_SETTINGS_STORAGE_KEY = 'p3fo_user_settings_v1';
const APP_SETTINGS_STORAGE_KEY = 'dyad_settings_v1';
const QOL_SURVEY_STORAGE_KEY = 'qolSurveyResponse';
const FILTERS_STORAGE_KEY = 'taskFilters';
const FERTILIZATION_BOARD_STORAGE_KEY = 'fertilizationBoard';
const DREAM_BOARD_STORAGE_KEY = 'dreamBoard';
const CIRCLES_STORAGE_KEY = 'p3fo_circles_v1';
const REMINDERS_STORAGE_KEY = 'p3fo_reminders_v1';
const FRAMEWORKS_STORAGE_KEY = 'p3fo_frameworks_v1';
const VOTES_STORAGE_KEY = 'p3fo_votes_v1';
const VOTE_RESPONSES_STORAGE_KEY = 'p3fo_vote_responses_v1';
const VOTE_LOOPS_STORAGE_KEY = 'p3fo_vote_loops_v1';
const VOTE_MODERATORS_STORAGE_KEY = 'p3fo_vote_moderators_v1';

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
  cardAgingBaseDays: 30,
  disabledModules: [],
};

export class BrowserJsonPersistence implements PersistenceAdapter {
  async listTasks(userId?: string, excludeStatuses?: string[]): Promise<TaskEntity[]> {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(TASKS_STORAGE_KEY);
      let allTasks = stored ? JSON.parse(stored) : [];

      if (userId) {
        allTasks = allTasks.filter((task: TaskEntity) => task.userId === userId);
      }

      if (excludeStatuses && excludeStatuses.length > 0) {
        allTasks = allTasks.filter((task: TaskEntity) => !excludeStatuses.includes(task.triageStatus || ''));
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
      // 1. Delete old user's tasks (target UUID's tasks are the source of truth)
      const tasks = await this.listTasks();
      const filteredTasks = tasks.filter(task => task.userId !== oldUserId);
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(filteredTasks));

      // 2. Delete old user settings (target UUID's settings prevail)
      localStorage.removeItem(`${USER_SETTINGS_STORAGE_KEY}_${oldUserId}`);

      console.log(`Switched from ${oldUserId} to ${newUserId} (old user data discarded)`);
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

  // Reminders
  async listReminders(userId?: string): Promise<ReminderEntity[]> {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(REMINDERS_STORAGE_KEY);
      const allReminders = stored ? JSON.parse(stored) : [];

      // Filter by userId if provided
      if (userId) {
        return allReminders.filter((reminder: ReminderEntity) => reminder.userId === userId);
      }

      return allReminders;
    } catch (error) {
      console.error('Error reading reminders from localStorage:', error);
      return [];
    }
  }

  async getReminderById(id: string): Promise<ReminderEntity | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const reminders = await this.listReminders();
      return reminders.find(reminder => reminder.id === id) || null;
    } catch (error) {
      console.error('Error getting reminder from localStorage:', error);
      return null;
    }
  }

  async createReminder(input: Partial<ReminderEntity>): Promise<ReminderEntity> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot create reminder in non-browser environment');
    }

    try {
      const reminders = await this.listReminders();
      const now = new Date().toISOString();
      const newReminder: ReminderEntity = {
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

      reminders.push(newReminder);
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders));
      return newReminder;
    } catch (error) {
      console.error('Error creating reminder in localStorage:', error);
      throw error;
    }
  }

  async updateReminder(id: string, patch: Partial<ReminderEntity>): Promise<ReminderEntity> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot update reminder in non-browser environment');
    }

    try {
      const reminders = await this.listReminders();
      const index = reminders.findIndex(reminder => reminder.id === id);

      if (index === -1) {
        throw new Error(`Reminder with id ${id} not found`);
      }

      reminders[index] = { ...reminders[index], ...patch, updatedAt: new Date().toISOString() };
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders));
      return reminders[index];
    } catch (error) {
      console.error('Error updating reminder in localStorage:', error);
      throw error;
    }
  }

  async deleteReminder(id: string): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const reminders = await this.listReminders();
      const filteredReminders = reminders.filter(reminder => reminder.id !== id);
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(filteredReminders));
    } catch (error) {
      console.error('Error deleting reminder from localStorage:', error);
      throw error;
    }
  }

  async deleteRemindersByTaskId(taskId: string): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const reminders = await this.listReminders();
      const filteredReminders = reminders.filter(reminder => reminder.taskId !== taskId);
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(filteredReminders));
    } catch (error) {
      console.error('Error deleting reminders by taskId from localStorage:', error);
      throw error;
    }
  }

  async clearAllReminders(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(REMINDERS_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing reminders from localStorage:', error);
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
      localStorage.removeItem(REMINDERS_STORAGE_KEY);
      localStorage.removeItem(CIRCLES_STORAGE_KEY);
      localStorage.removeItem(FRAMEWORKS_STORAGE_KEY);
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

  // Circles
  async listCircles(): Promise<CircleEntity[]> {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(CIRCLES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading circles from localStorage:', error);
      return [];
    }
  }

  async importCircles(circles: CircleEntity[]): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(CIRCLES_STORAGE_KEY, JSON.stringify(circles));
    } catch (error) {
      console.error('Error importing circles to localStorage:', error);
      throw error;
    }
  }

  async importReminders(reminders: ReminderEntity[]): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders));
    } catch (error) {
      console.error('Error importing reminders to localStorage:', error);
      throw error;
    }
  }

  // Frameworks
  async listFrameworks(frameworkType?: FrameworkType): Promise<FrameworkEntity[]> {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(FRAMEWORKS_STORAGE_KEY);
      const all: FrameworkEntity[] = stored ? JSON.parse(stored) : [];
      if (frameworkType) {
        return all.filter(f => f.frameworkType === frameworkType);
      }
      return all;
    } catch (error) {
      console.error('Error reading frameworks from localStorage:', error);
      return [];
    }
  }

  async getFrameworkById(id: string): Promise<FrameworkEntity | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const frameworks = await this.listFrameworks();
      return frameworks.find(f => f.id === id) || null;
    } catch (error) {
      console.error('Error getting framework from localStorage:', error);
      return null;
    }
  }

  async createFramework(input: Partial<FrameworkEntity>): Promise<FrameworkEntity> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot create framework in non-browser environment');
    }

    try {
      const frameworks = await this.listFrameworks();
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
      frameworks.push(newFramework);
      localStorage.setItem(FRAMEWORKS_STORAGE_KEY, JSON.stringify(frameworks));
      return newFramework;
    } catch (error) {
      console.error('Error creating framework in localStorage:', error);
      throw error;
    }
  }

  async updateFramework(id: string, patch: Partial<FrameworkEntity>): Promise<FrameworkEntity | null> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot update framework in non-browser environment');
    }

    try {
      const frameworks = await this.listFrameworks();
      const index = frameworks.findIndex(f => f.id === id);
      if (index === -1) {
        console.warn('Update framework: not found', id);
        return null;
      }
      frameworks[index] = { ...frameworks[index], ...patch, updatedAt: new Date().toISOString() };
      localStorage.setItem(FRAMEWORKS_STORAGE_KEY, JSON.stringify(frameworks));
      return frameworks[index];
    } catch (error) {
      console.error('Error updating framework in localStorage:', error);
      throw error;
    }
  }

  async deleteFramework(id: string): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const frameworks = await this.listFrameworks();
      const filtered = frameworks.filter(f => f.id !== id);
      localStorage.setItem(FRAMEWORKS_STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting framework from localStorage:', error);
      throw error;
    }
  }

  async importFrameworks(frameworks: FrameworkEntity[]): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(FRAMEWORKS_STORAGE_KEY, JSON.stringify(frameworks));
    } catch (error) {
      console.error('Error importing frameworks to localStorage:', error);
      throw error;
    }
  }

  // Votes
  async listVotes(opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }): Promise<VoteEntity[]> {
    try {
      const stored = localStorage.getItem(VOTES_STORAGE_KEY);
      const all: VoteEntity[] = stored ? JSON.parse(stored) : [];
      if (opts?.linkedTaskId) return all.filter(v => v.linkedTaskId === opts.linkedTaskId);
      if (opts?.ownerId) return all.filter(v => v.ownerId === opts.ownerId);
      if (opts?.kind) return all.filter(v => v.config.kind === opts.kind);
      return all;
    } catch (error) {
      console.error('Error reading votes from localStorage:', error);
      return [];
    }
  }

  async getVoteById(id: string): Promise<VoteEntity | null> {
    try {
      const votes = await this.listVotes();
      return votes.find(v => v.id === id) || null;
    } catch (error) {
      console.error('Error getting vote from localStorage:', error);
      return null;
    }
  }

  async getVoteBySlug(slug: string): Promise<VoteEntity | null> {
    try {
      const votes = await this.listVotes();
      return votes.find(v => v.slug === slug) || null;
    } catch (error) {
      console.error('Error getting vote by slug from localStorage:', error);
      return null;
    }
  }

  async createVote(input: Partial<VoteEntity>): Promise<VoteEntity> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot create vote in non-browser environment');
    }

    try {
      const votes = await this.listVotes();
      const slug = input.slug || Math.random().toString(36).substring(2, 9);
      const newVote: VoteEntity = {
        id: input.id || crypto.randomUUID(),
        slug,
        title: input.title || 'New Vote',
        description: input.description,
        ownerId: input.ownerId || 'unknown',
        proposals: input.proposals || [],
        config: input.config || { mode: 'THUMBS_UP', kind: 'consultation', phase: 'IDLE' },
        outcome: input.outcome,
        createdAt: input.createdAt || new Date().toISOString(),
        updatedAt: input.updatedAt || new Date().toISOString(),
        linkedTaskId: input.linkedTaskId,
      };
      votes.push(newVote);
      localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(votes));
      return newVote;
    } catch (error) {
      console.error('Error creating vote in localStorage:', error);
      throw error;
    }
  }

  async updateVote(id: string, patch: Partial<VoteEntity>): Promise<VoteEntity | null> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot update vote in non-browser environment');
    }

    try {
      const votes = await this.listVotes();
      const index = votes.findIndex(v => v.id === id);
      if (index === -1) return null;
      votes[index] = { ...votes[index], ...patch, config: { ...votes[index].config, ...patch.config }, updatedAt: new Date().toISOString() };
      localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(votes));
      return votes[index];
    } catch (error) {
      console.error('Error updating vote in localStorage:', error);
      throw error;
    }
  }

  async finalizeVote(id: string, outcome: VoteEntity['outcome']): Promise<VoteEntity | null> {
    if (typeof window === 'undefined') {
      throw new Error('Cannot finalize vote in non-browser environment');
    }

    try {
      const votes = await this.listVotes();
      const index = votes.findIndex(v => v.id === id);
      if (index === -1) return null;
      votes[index] = { ...votes[index], config: { ...votes[index].config, phase: 'FINALIZED' }, outcome, updatedAt: new Date().toISOString() };
      localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(votes));
      return votes[index];
    } catch (error) {
      console.error('Error finalizing vote in localStorage:', error);
      throw error;
    }
  }

  async deleteVote(id: string): Promise<void> {
    try {
      const votes = await this.listVotes();
      const filtered = votes.filter(v => v.id !== id);
      localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting vote from localStorage:', error);
      throw error;
    }
  }

  async importVotes(items: VoteEntity[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Error importing votes to localStorage:', error);
      throw error;
    }
  }

  // Vote responses
  async listVoteResponses(voteId: string): Promise<VoteResponseEntity[]> {
    try {
      const stored = localStorage.getItem(VOTE_RESPONSES_STORAGE_KEY);
      const all: VoteResponseEntity[] = stored ? JSON.parse(stored) : [];
      return all.filter(r => r.voteId === voteId);
    } catch (error) {
      console.error('Error reading vote responses from localStorage:', error);
      return [];
    }
  }

  async importVoteResponses(items: VoteResponseEntity[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(VOTE_RESPONSES_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Error importing vote responses to localStorage:', error);
      throw error;
    }
  }

  // Vote loops
  async listVoteLoops(voteId: string): Promise<VoteLoop[]> {
    try {
      const stored = localStorage.getItem(VOTE_LOOPS_STORAGE_KEY);
      const all: VoteLoop[] = stored ? JSON.parse(stored) : [];
      return all.filter(l => l.voteId === voteId);
    } catch (error) {
      console.error('Error reading vote loops from localStorage:', error);
      return [];
    }
  }

  async createVoteLoop(voteId: string, loop: Partial<VoteLoop>): Promise<VoteLoop> {
    if (typeof window === 'undefined') throw new Error('Cannot create vote loop in non-browser environment');
    try {
      const stored = localStorage.getItem(VOTE_LOOPS_STORAGE_KEY);
      const all: VoteLoop[] = stored ? JSON.parse(stored) : [];
      const newLoop: VoteLoop = {
        id: loop.id || crypto.randomUUID(),
        voteId,
        roundNumber: loop.roundNumber ?? 1,
        proposalContent: loop.proposalContent || '',
        openedAt: loop.openedAt || new Date().toISOString(),
        closedAt: loop.closedAt,
        openedByUserId: loop.openedByUserId || 'unknown',
        gatingValue: loop.gatingValue,
        gatingComment: loop.gatingComment,
      };
      all.push(newLoop);
      localStorage.setItem(VOTE_LOOPS_STORAGE_KEY, JSON.stringify(all));
      return newLoop;
    } catch (error) {
      console.error('Error creating vote loop in localStorage:', error);
      throw error;
    }
  }

  async updateVoteLoop(loopId: string, patch: Partial<VoteLoop>): Promise<VoteLoop | null> {
    if (typeof window === 'undefined') throw new Error('Cannot update vote loop in non-browser environment');
    try {
      const stored = localStorage.getItem(VOTE_LOOPS_STORAGE_KEY);
      const all: VoteLoop[] = stored ? JSON.parse(stored) : [];
      const index = all.findIndex(l => l.id === loopId);
      if (index === -1) return null;
      all[index] = { ...all[index], ...patch };
      localStorage.setItem(VOTE_LOOPS_STORAGE_KEY, JSON.stringify(all));
      return all[index];
    } catch (error) {
      console.error('Error updating vote loop in localStorage:', error);
      throw error;
    }
  }

  async closeVoteLoop(loopId: string, gating: { value: -1 | 0 | 1; comment?: string }): Promise<VoteLoop | null> {
    if (typeof window === 'undefined') throw new Error('Cannot close vote loop in non-browser environment');
    try {
      const stored = localStorage.getItem(VOTE_LOOPS_STORAGE_KEY);
      const all: VoteLoop[] = stored ? JSON.parse(stored) : [];
      const index = all.findIndex(l => l.id === loopId);
      if (index === -1) return null;
      all[index] = { ...all[index], closedAt: new Date().toISOString(), gatingValue: gating.value, gatingComment: gating.comment };
      localStorage.setItem(VOTE_LOOPS_STORAGE_KEY, JSON.stringify(all));
      return all[index];
    } catch (error) {
      console.error('Error closing vote loop in localStorage:', error);
      throw error;
    }
  }

  async importVoteLoops(items: VoteLoop[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(VOTE_LOOPS_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Error importing vote loops to localStorage:', error);
      throw error;
    }
  }

  // Vote moderators
  async listVoteModerators(voteId: string): Promise<VoteModerator[]> {
    try {
      const stored = localStorage.getItem(VOTE_MODERATORS_STORAGE_KEY);
      const all: VoteModerator[] = stored ? JSON.parse(stored) : [];
      return all.filter(m => m.voteId === voteId && m.active);
    } catch (error) {
      console.error('Error reading vote moderators from localStorage:', error);
      return [];
    }
  }

  async addVoteModerator(voteId: string, input: { displayName: string; email?: string }): Promise<VoteModerator> {
    if (typeof window === 'undefined') throw new Error('Cannot add moderator in non-browser environment');
    try {
      const stored = localStorage.getItem(VOTE_MODERATORS_STORAGE_KEY);
      const all: VoteModerator[] = stored ? JSON.parse(stored) : [];
      const newModerator: VoteModerator = {
        id: crypto.randomUUID(),
        voteId,
        displayName: input.displayName,
        email: input.email,
        token: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
        addedByUserId: 'unknown',
        addedAt: new Date().toISOString(),
        active: true,
      };
      all.push(newModerator);
      localStorage.setItem(VOTE_MODERATORS_STORAGE_KEY, JSON.stringify(all));
      return newModerator;
    } catch (error) {
      console.error('Error adding vote moderator in localStorage:', error);
      throw error;
    }
  }

  async revokeVoteModerator(moderatorId: string): Promise<void> {
    if (typeof window === 'undefined') throw new Error('Cannot revoke moderator in non-browser environment');
    try {
      const stored = localStorage.getItem(VOTE_MODERATORS_STORAGE_KEY);
      const all: VoteModerator[] = stored ? JSON.parse(stored) : [];
      const index = all.findIndex(m => m.id === moderatorId);
      if (index !== -1) {
        all[index].active = false;
        localStorage.setItem(VOTE_MODERATORS_STORAGE_KEY, JSON.stringify(all));
      }
    } catch (error) {
      console.error('Error revoking vote moderator in localStorage:', error);
      throw error;
    }
  }

  async resolveVoteModerator(token: string): Promise<{ vote: VoteEntity; moderator: VoteModerator } | null> {
    try {
      const stored = localStorage.getItem(VOTE_MODERATORS_STORAGE_KEY);
      const all: VoteModerator[] = stored ? JSON.parse(stored) : [];
      const moderator = all.find(m => m.token === token && m.active);
      if (!moderator) return null;
      const vote = await this.getVoteById(moderator.voteId);
      if (!vote) return null;
      return { vote, moderator };
    } catch (error) {
      console.error('Error resolving moderator token in localStorage:', error);
      return null;
    }
  }

  async importVoteModerators(items: VoteModerator[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(VOTE_MODERATORS_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Error importing vote moderators to localStorage:', error);
      throw error;
    }
  }
}