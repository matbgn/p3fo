import { PersistenceAdapter, TaskEntity, UserSettingsEntity, AppSettingsEntity, QolSurveyResponseEntity, FilterStateEntity, StorageMetadata, FertilizationBoardEntity, DreamBoardEntity, SalaryBoardEntity, ReminderEntity, CircleEntity, FrameworkEntity, FrameworkType, VoteEntity, VoteResponseEntity, VoteLoop, VoteModerator, VoteKind, PomodoroSession } from './persistence-types';
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
  async listTasks(userId?: string, excludeStatuses?: string[]): Promise<TaskEntity[]> {
    let endpoint = '/api/tasks';
    const params: string[] = [];
    if (userId) params.push(`user_id=${encodeURIComponent(userId)}`);
    if (excludeStatuses && excludeStatuses.length > 0) {
      params.push(`exclude_statuses=${encodeURIComponent(excludeStatuses.join(','))}`);
    }
    if (params.length > 0) endpoint += '?' + params.join('&');
    const result = await this.makeRequest(endpoint);
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

  // Salary Board
  async getSalaryBoardState(): Promise<SalaryBoardEntity | null> {
    return this.makeRequest('/api/salary-board');
  }

  async updateSalaryBoardState(state: SalaryBoardEntity): Promise<void> {
    await this.makeRequest('/api/salary-board', {
      method: 'PUT',
      body: JSON.stringify(state),
    });
  }

  // Reminders
  async listReminders(userId?: string): Promise<ReminderEntity[]> {
    const endpoint = userId ? `/api/reminders?user_id=${encodeURIComponent(userId)}` : '/api/reminders';
    return this.makeRequest(endpoint);
  }

  async getReminderById(id: string): Promise<ReminderEntity | null> {
    return this.makeRequest(`/api/reminders/${id}`);
  }

  async createReminder(input: Partial<ReminderEntity>): Promise<ReminderEntity> {
    return this.makeRequest('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateReminder(id: string, patch: Partial<ReminderEntity>): Promise<ReminderEntity> {
    return this.makeRequest(`/api/reminders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  async deleteReminder(id: string): Promise<void> {
    await this.makeRequest(`/api/reminders/${id}`, {
      method: 'DELETE',
    });
  }

  async deleteRemindersByTaskId(taskId: string): Promise<void> {
    await this.makeRequest(`/api/reminders/task/${taskId}`, {
      method: 'DELETE',
    });
  }

  async clearAllReminders(): Promise<void> {
    await this.makeRequest('/api/reminders/clear', {
      method: 'POST',
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

    // 4. Broadcast Clear Command to other Yjs clients' shared documents (boards and circles)
    // We import these dynamically to avoid circular dependencies if any, 
    // or just assume standard import at top if possible.
    // For now, let's assume we can import at module level.
    // But since this is a class method, let's use the valid imports.
    try {
      const { doc, yTasks, yUserSettings, yFertilizationState, yFertilizationCards, yFertilizationColumns, yDreamState, yDreamCards, yDreamColumns, yCircles, yFrameworks, ySystemState, yVoteProposals, yVoteLoops, yVoteResponses } = await import('./collaboration');
      doc.transact(() => {
        yTasks.clear();
        yUserSettings.clear();
        yFertilizationState.clear();
        yFertilizationCards.clear();
        yFertilizationColumns.clear();
        yDreamState.clear();
        yDreamCards.clear();
        yDreamColumns.clear();
        yCircles.clear();
        yFrameworks.clear();
        yVoteProposals.clear();
        yVoteLoops.clear();
        yVoteResponses.clear();
        ySystemState.set('command', { type: 'CLEAR_ALL', timestamp: Date.now() });
      });
      console.log('Cleared Yjs shared documents and broadcasted CLEAR_ALL command');
    } catch (e) {
      console.error('Error clearing Yjs documents:', e);
    }
  }

  // Circles
  async listCircles(): Promise<CircleEntity[]> {
    return this.makeRequest('/api/circles');
  }

  async importCircles(circles: CircleEntity[]): Promise<void> {
    await this.makeRequest('/api/circles/import', {
      method: 'POST',
      body: JSON.stringify(circles),
    });
  }

  // Frameworks
  async listFrameworks(frameworkType?: FrameworkType): Promise<FrameworkEntity[]> {
    const endpoint = frameworkType ? `/api/frameworks?frameworkType=${encodeURIComponent(frameworkType)}` : '/api/frameworks';
    return this.makeRequest(endpoint);
  }

  async getFrameworkById(id: string): Promise<FrameworkEntity | null> {
    return this.makeRequest(`/api/frameworks/${id}`);
  }

  async createFramework(input: Partial<FrameworkEntity>): Promise<FrameworkEntity> {
    return this.makeRequest('/api/frameworks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateFramework(id: string, patch: Partial<FrameworkEntity>): Promise<FrameworkEntity | null> {
    return this.makeRequest(`/api/frameworks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  async deleteFramework(id: string): Promise<void> {
    await this.makeRequest(`/api/frameworks/${id}`, {
      method: 'DELETE',
    });
  }

  async importFrameworks(frameworks: FrameworkEntity[]): Promise<void> {
    await this.makeRequest('/api/frameworks/import', {
      method: 'POST',
      body: JSON.stringify(frameworks),
    });
  }

  // Votes
  async listVotes(opts?: { linkedTaskId?: string; ownerId?: string; kind?: VoteKind }): Promise<VoteEntity[]> {
    const params = new URLSearchParams();
    if (opts?.linkedTaskId) params.set('linkedTaskId', opts.linkedTaskId);
    if (opts?.ownerId) params.set('ownerId', opts.ownerId);
    if (opts?.kind) params.set('kind', opts.kind);
    const qs = params.toString();
    return this.makeRequest(`/api/votes${qs ? `?${qs}` : ''}`);
  }

  async getVoteById(id: string): Promise<VoteEntity | null> {
    return this.makeRequest(`/api/votes/${id}`);
  }

  async getVoteBySlug(slug: string): Promise<VoteEntity | null> {
    return this.makeRequest(`/api/votes/${slug}`);
  }

  async createVote(input: Partial<VoteEntity>): Promise<VoteEntity> {
    return this.makeRequest('/api/votes', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateVote(id: string, patch: Partial<VoteEntity>): Promise<VoteEntity | null> {
    return this.makeRequest(`/api/votes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  async finalizeVote(id: string, outcome: VoteEntity['outcome']): Promise<VoteEntity | null> {
    return this.makeRequest(`/api/votes/${id}/finalize`, {
      method: 'POST',
      body: JSON.stringify(outcome),
    });
  }

  async deleteVote(id: string): Promise<void> {
    await this.makeRequest(`/api/votes/${id}`, { method: 'DELETE' });
  }

  async resetVote(id: string): Promise<VoteEntity | null> {
    return this.makeRequest(`/api/votes/${id}/reset`, {
      method: 'POST',
    });
  }

  async importVotes(items: VoteEntity[]): Promise<void> {
    await this.makeRequest('/api/votes/import', {
      method: 'POST',
      body: JSON.stringify(items),
    });
  }

  // Vote responses
  async listVoteResponses(voteId: string): Promise<VoteResponseEntity[]> {
    return this.makeRequest(`/api/votes/${voteId}/results`).then((r: { responses: VoteResponseEntity[] }) => r.responses || []);
  }

  async createVoteResponse(voteId: string, response: Partial<VoteResponseEntity>): Promise<VoteResponseEntity> {
    return this.makeRequest(`/api/votes/${voteId}/responses`, {
      method: 'POST',
      body: JSON.stringify(response),
    });
  }

  async deleteVoteResponse(
    voteId: string,
    voterToken: string,
    proposalId: string | null,
    loopId: string | null = null,
  ): Promise<void> {
    const params = new URLSearchParams({ voterToken });
    if (proposalId) params.set('proposalId', proposalId);
    if (loopId) params.set('loopId', loopId);
    await this.makeRequest(`/api/votes/${voteId}/responses?${params.toString()}`, {
      method: 'DELETE',
    });
  }

  async importVoteResponses(items: VoteResponseEntity[]): Promise<void> {
    await this.makeRequest('/api/vote-responses/import', {
      method: 'POST',
      body: JSON.stringify(items),
    });
  }

  // Vote loops
  async listVoteLoops(voteId: string): Promise<VoteLoop[]> {
    return this.makeRequest(`/api/votes/${voteId}/loops`);
  }

  async createVoteLoop(voteId: string, loop: Partial<VoteLoop>): Promise<VoteLoop> {
    return this.makeRequest(`/api/votes/${voteId}/loops`, {
      method: 'POST',
      body: JSON.stringify(loop),
    });
  }

  async updateVoteLoop(loopId: string, patch: Partial<VoteLoop>): Promise<VoteLoop | null> {
    return this.makeRequest(`/api/votes/loops/${loopId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  async closeVoteLoop(loopId: string): Promise<VoteLoop | null> {
    return this.makeRequest(`/api/votes/loops/${loopId}/close`, {
      method: 'POST',
    });
  }

  async importVoteLoops(items: VoteLoop[]): Promise<void> {
    await this.makeRequest('/api/vote-loops/import', {
      method: 'POST',
      body: JSON.stringify(items),
    });
  }

  // Vote moderators
  async listVoteModerators(voteId: string): Promise<VoteModerator[]> {
    return this.makeRequest(`/api/votes/${voteId}/moderators`);
  }

  async addVoteModerator(voteId: string, input: { displayName: string; email?: string }): Promise<VoteModerator> {
    return this.makeRequest(`/api/votes/${voteId}/moderators`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async revokeVoteModerator(moderatorId: string): Promise<void> {
    await this.makeRequest(`/api/vote-moderators/${moderatorId}`, { method: 'DELETE' });
  }

  async resolveVoteModerator(token: string): Promise<{ vote: VoteEntity; moderator: VoteModerator } | null> {
    return this.makeRequest(`/api/votes/moderate/${token}`);
  }

  async importVoteModerators(items: VoteModerator[]): Promise<void> {
    await this.makeRequest('/api/vote-moderators/import', {
      method: 'POST',
      body: JSON.stringify(items),
    });
  }

  async importReminders(reminders: ReminderEntity[]): Promise<void> {
    await this.makeRequest('/api/reminders/import', {
      method: 'POST',
      body: JSON.stringify(reminders),
    });
  }

  // Pomodoro sessions
  async listPomodoroSessions(userId?: string, since?: number): Promise<PomodoroSession[]> {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (since) params.set('since', since.toString());
    const qs = params.toString();
    const result = await this.makeRequest(`/api/pomodoro-sessions${qs ? `?${qs}` : ''}`);
    if (Array.isArray(result)) return result;
    const wrapped = result as { data: PomodoroSession[] };
    return wrapped.data ?? [];
  }

  async createPomodoroSession(session: PomodoroSession): Promise<PomodoroSession & { warnings?: string[] }> {
    return this.makeRequest('/api/pomodoro-sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    });
  }

  async importPomodoroSessions(sessions: PomodoroSession[]): Promise<void> {
    await this.makeRequest('/api/pomodoro-sessions/import', {
      method: 'POST',
      body: JSON.stringify(sessions),
    });
  }

  async deletePomodoroSession(id: string): Promise<void> {
    await this.makeRequest(`/api/pomodoro-sessions/${id}`, {
      method: 'DELETE',
    });
  }

  async clearAllPomodoroSessions(): Promise<void> {
    await this.makeRequest('/api/pomodoro-sessions/clear', {
      method: 'POST',
    });
  }

  async deletePomodoroSessionsByUser(userId: string): Promise<void> {
    await this.makeRequest(`/api/pomodoro-sessions/user/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }
}