import { PersistenceAdapter, TaskEntity, UserSettingsEntity, AppSettingsEntity, QolSurveyResponseEntity, FilterStateEntity, StorageMetadata, FertilizationBoardEntity, DreamBoardEntity } from './persistence-types';
import { DEFAULT_TASKS_INITIALIZED_KEY } from '@/hooks/useTasks';

export class HttpApiPersistence implements PersistenceAdapter {
  private baseUrl: string;

  constructor(apiUrl: string) {
    this.baseUrl = apiUrl;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // For DELETE requests or other requests that don't return content
    if (response.status === 204 || endpoint.includes('/clear') || endpoint.includes('/delete')) {
      return null;
    }

    return response.json();
  }

  // Tasks
  async listTasks(userId?: string): Promise<TaskEntity[]> {
    const endpoint = userId ? `/api/tasks?user_id=${encodeURIComponent(userId)}` : '/api/tasks';
    const result = await this.makeRequest(endpoint);
    // Backend returns { data: TaskEntity[], total: number }
    return result.data;
  }

  async getTaskById(id: string): Promise<TaskEntity | null> {
    return this.makeRequest(`/api/tasks/${id}`);
  }

  async createTask(input: Partial<TaskEntity>): Promise<TaskEntity> {
    return this.makeRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateTask(id: string, patch: Partial<TaskEntity>): Promise<TaskEntity> {
    return this.makeRequest(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  async deleteTask(id: string): Promise<void> {
    await this.makeRequest(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
  }

  async bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]): Promise<void> {
    await this.makeRequest('/api/tasks/bulk-priorities', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  async clearAllTasks(): Promise<void> {
    await this.makeRequest('/api/tasks/clear', {
      method: 'POST',
    });
  }

  async importTasks(tasks: TaskEntity[]): Promise<void> {
    await this.makeRequest('/api/tasks/import', {
      method: 'POST',
      body: JSON.stringify(tasks),
    });
  }

  // User settings
  async getUserSettings(userId: string): Promise<UserSettingsEntity | null> {
    try {
      return await this.makeRequest(`/api/user-settings/${userId}`);
    } catch (error) {
      // If user settings don't exist (404), return null so they can be created
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async updateUserSettings(userId: string, patch: Partial<UserSettingsEntity>): Promise<UserSettingsEntity> {
    return this.makeRequest(`/api/user-settings/${userId}`, {
      method: 'POST', // Using POST to create or update
      body: JSON.stringify(patch),
    });
  }

  async listUsers(): Promise<UserSettingsEntity[]> {
    return this.makeRequest('/api/users');
  }

  async migrateUser(oldUserId: string, newUserId: string): Promise<void> {
    await this.makeRequest('/api/users/migrate', {
      method: 'POST',
      body: JSON.stringify({ oldUserId, newUserId }),
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.makeRequest(`/api/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async clearAllUsers(): Promise<void> {
    await this.makeRequest('/api/users/clear', {
      method: 'POST',
    });
  }

  // App settings
  async getAppSettings(): Promise<AppSettingsEntity> {
    return this.makeRequest('/api/settings');
  }

  async updateAppSettings(patch: Partial<AppSettingsEntity>): Promise<AppSettingsEntity> {
    return this.makeRequest('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  // QoL survey
  // QoL survey
  async getQolSurveyResponse(userId: string): Promise<QolSurveyResponseEntity | null> {
    return this.makeRequest(`/api/qol/${userId}`);
  }

  async saveQolSurveyResponse(userId: string, data: QolSurveyResponseEntity): Promise<void> {
    await this.makeRequest(`/api/qol/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getAllQolSurveyResponses(): Promise<Record<string, QolSurveyResponseEntity>> {
    return this.makeRequest('/api/qol/all');
  }

  // Filters
  async getFilters(): Promise<FilterStateEntity | null> {
    return this.makeRequest('/api/filters');
  }

  async saveFilters(data: FilterStateEntity): Promise<void> {
    await this.makeRequest('/api/filters', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async clearFilters(): Promise<void> {
    await this.makeRequest('/api/filters', {
      method: 'DELETE',
    });
  }

  // Metadata
  async getMetadata(): Promise<StorageMetadata> {
    // We'll need to enhance the backend to provide this info
    // For now, we'll default to sqlite as specified in the proposal
    return {
      mode: 'server-sql',
      backend: 'sqlite', // Default assumption until backend provides this info
      version: '1.0.0',
    };
  }

  // Fertilization Board
  async getFertilizationBoardState(): Promise<FertilizationBoardEntity | null> {
    return this.makeRequest('/api/fertilization-board');
  }

  async updateFertilizationBoardState(state: FertilizationBoardEntity): Promise<void> {
    await this.makeRequest('/api/fertilization-board', {
      method: 'PUT',
      body: JSON.stringify(state),
    });
  }

  // Dream Board
  async getDreamBoardState(): Promise<DreamBoardEntity | null> {
    return this.makeRequest('/api/dream-board');
  }

  async updateDreamBoardState(state: DreamBoardEntity): Promise<void> {
    await this.makeRequest('/api/dream-board', {
      method: 'PUT',
      body: JSON.stringify(state),
    });
  }

  async clearAllData(): Promise<void> {
    // 1. Clear Server Data
    await this.makeRequest('/api/admin/clear-all-data', {
      method: 'POST',
    });

    // 2. Clear Browser LocalStorage/SessionStorage
    if (typeof window !== 'undefined') {
      localStorage.clear();
      // Preserve the initialized flag to prevent default tasks from being recreated
      localStorage.setItem(DEFAULT_TASKS_INITIALIZED_KEY, 'true');
      sessionStorage.clear();

      // 3. Clear IndexedDB (Yjs persistence)
      try {
        const dbs = await window.indexedDB.databases();
        dbs.forEach(db => {
          if (db.name && db.name.includes('p3fo') || db.name === 'item') { // 'item' is default for localforage sometimes, but p3fo-yjs-tasks is key
            window.indexedDB.deleteDatabase(db.name);
          }
        });
        // Specifically delete the known one
        window.indexedDB.deleteDatabase('p3fo-yjs-tasks');
        console.log('Cleared browser storage and IndexedDB');
      } catch (e) {
        console.error('Error clearing IndexedDB:', e);
      }
    }

    // 4. Broadcast Clear Command to other clients
    // We import these dynamically to avoid circular dependencies if any, 
    // or just assume standard import at top if possible.
    // For now, let's assume we can import at module level.
    // But since this is a class method, let's use the valid imports.
    try {
      const { doc, ySystemState } = await import('./collaboration');
      doc.transact(() => {
        ySystemState.set('command', { type: 'CLEAR_ALL', timestamp: Date.now() });
      });
      console.log('Broadcasted CLEAR_ALL command');
    } catch (e) {
      console.error('Error broadcasting clear command:', e);
    }
  }
}