/**
 * P3FO MCP Server — HTTP client wrapping the P3FO REST API.
 *
 * Reads the base URL from P3FO_API_URL (defaults to http://localhost:5172).
 * Optional P3FO_API_TOKEN is sent as Authorization: Bearer <token> if present.
 */

export class P3foApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'P3foApiError';
  }
}

function extractErrorMessage(parsed: unknown): string | undefined {
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const err = (parsed as Record<string, unknown>).error;
    if (typeof err === 'string') return err;
  }
  return undefined;
}

export class P3foClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(baseUrl?: string, token?: string) {
    const url = (baseUrl ?? process.env.P3FO_API_URL ?? 'http://localhost:5172').replace(/\/+$/, '');
    this.baseUrl = url;
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const tok = token ?? process.env.P3FO_API_TOKEN;
    if (tok) this.headers.Authorization = `Bearer ${tok}`;
  }

  async health(): Promise<{ ok: boolean; mode: string; timestamp: string }> {
    return this.get('/api/health');
  }

  // ---- Tasks ----
  getTasks(params?: {
    userId?: string;
    limit?: number;
    offset?: number;
    excludeStatuses?: string[];
    triageStatuses?: string[];
    includeSubtasks?: boolean;
  }) {
    const q = new URLSearchParams();
    if (params?.userId) q.set('user_id', params.userId);
    if (params?.limit !== undefined) q.set('limit', String(params.limit));
    if (params?.offset !== undefined) q.set('offset', String(params.offset));
    if (params?.excludeStatuses?.length) q.set('exclude_statuses', params.excludeStatuses.join(','));
    if (params?.triageStatuses?.length) q.set('triage_statuses', params.triageStatuses.join(','));
    if (params?.includeSubtasks !== undefined) q.set('include_subtasks', String(params.includeSubtasks));
    return this.get(`/api/tasks${q.toString() ? `?${q}` : ''}`);
  }

  getTaskById(id: string) {
    return this.get(`/api/tasks/${id}`);
  }

  createTask(task: Record<string, unknown>) {
    return this.post('/api/tasks', task);
  }

  updateTask(id: string, patch: Record<string, unknown>) {
    return this.patch(`/api/tasks/${id}`, patch);
  }

  deleteTask(id: string) {
    return this.del(`/api/tasks/${id}`);
  }

  bulkUpdateTaskPriorities(items: { id: string; priority: number | undefined }[]) {
    return this.post('/api/tasks/bulk-priorities', { items });
  }

  importTasks(tasks: unknown[]) {
    return this.post('/api/tasks/import', tasks);
  }

  clearAllTasks() {
    return this.post('/api/tasks/clear', {});
  }

  // ---- Users & user settings ----
  listUsers() {
    return this.get('/api/users');
  }

  getUserSettings(userId: string) {
    return this.get(`/api/user-settings/${userId}`);
  }

  updateUserSettings(userId: string, patch: Record<string, unknown>) {
    return this.post(`/api/user-settings/${userId}`, patch);
  }

  migrateUser(oldUserId: string, newUserId: string) {
    return this.post('/api/users/migrate', { oldUserId, newUserId });
  }

  deleteUser(userId: string) {
    return this.del(`/api/users/${userId}`);
  }

  clearAllUsers() {
    return this.post('/api/users/clear', {});
  }

  // ---- App settings ----
  getAppSettings() {
    return this.get('/api/settings');
  }

  updateAppSettings(patch: Record<string, unknown>) {
    return this.patch('/api/settings', patch);
  }

  // ---- QoL survey ----
  getAllQolSurveyResponses() {
    return this.get('/api/qol/all');
  }

  getQolSurveyResponse(userId: string) {
    return this.get(`/api/qol/${userId}`);
  }

  saveQolSurveyResponse(userId: string, data: Record<string, unknown>) {
    return this.put(`/api/qol/${userId}`, data);
  }

  // ---- Filters ----
  getFilters() {
    return this.get('/api/filters');
  }

  saveFilters(data: Record<string, unknown>) {
    return this.put('/api/filters', data);
  }

  clearFilters() {
    return this.del('/api/filters');
  }

  // ---- Fertilization Board ----
  getFertilizationBoardState() {
    return this.get('/api/fertilization-board');
  }

  updateFertilizationBoardState(state: Record<string, unknown>) {
    return this.put('/api/fertilization-board', state);
  }

  // ---- Dream Board ----
  getDreamBoardState() {
    return this.get('/api/dream-board');
  }

  updateDreamBoardState(state: Record<string, unknown>) {
    return this.put('/api/dream-board', state);
  }

  // ---- Circles ----
  listCircles() {
    return this.get('/api/circles');
  }

  getCircleById(id: string) {
    return this.get(`/api/circles/${id}`);
  }

  createCircle(circle: Record<string, unknown>) {
    return this.post('/api/circles', circle);
  }

  updateCircle(id: string, patch: Record<string, unknown>) {
    return this.patch(`/api/circles/${id}`, patch);
  }

  deleteCircle(id: string) {
    return this.del(`/api/circles/${id}`);
  }

  clearAllCircles() {
    return this.post('/api/circles/clear', {});
  }

  importCircles(circles: unknown[]) {
    return this.post('/api/circles/import', circles);
  }

  // ---- Frameworks ----
  listFrameworks(frameworkType?: string) {
    const q = frameworkType ? `?frameworkType=${frameworkType}` : '';
    return this.get(`/api/frameworks${q}`);
  }

  getFrameworkById(id: string) {
    return this.get(`/api/frameworks/${id}`);
  }

  createFramework(framework: Record<string, unknown>) {
    return this.post('/api/frameworks', framework);
  }

  updateFramework(id: string, patch: Record<string, unknown>) {
    return this.patch(`/api/frameworks/${id}`, patch);
  }

  deleteFramework(id: string) {
    return this.del(`/api/frameworks/${id}`);
  }

  importFrameworks(frameworks: unknown[]) {
    return this.post('/api/frameworks/import', frameworks);
  }

  // ---- Votes ----
  listVotes(opts?: { linkedTaskId?: string; ownerId?: string; kind?: string }) {
    const q = new URLSearchParams();
    if (opts?.linkedTaskId) q.set('linkedTaskId', opts.linkedTaskId);
    if (opts?.ownerId) q.set('ownerId', opts.ownerId);
    if (opts?.kind) q.set('kind', opts.kind);
    return this.get(`/api/votes${q.toString() ? `?${q}` : ''}`);
  }

  getVoteByIdOrSlug(idOrSlug: string) {
    return this.get(`/api/votes/${idOrSlug}`);
  }

  createVote(vote: Record<string, unknown>) {
    return this.post('/api/votes', vote);
  }

  updateVote(id: string, patch: Record<string, unknown>) {
    return this.put(`/api/votes/${id}`, patch);
  }

  finalizeVote(id: string, outcome: Record<string, unknown>) {
    return this.post(`/api/votes/${id}/finalize`, outcome);
  }

  deleteVote(id: string) {
    return this.del(`/api/votes/${id}`);
  }

  resetVote(id: string) {
    return this.post(`/api/votes/${id}/reset`, {});
  }

  getVoteResults(idOrSlug: string) {
    return this.get(`/api/votes/${idOrSlug}/results`);
  }

  createVoteResponse(idOrSlug: string, response: Record<string, unknown>) {
    return this.post(`/api/votes/${idOrSlug}/responses`, response);
  }

  deleteVoteResponse(idOrSlug: string, voterToken: string, proposalId?: string, loopId?: string) {
    const q = new URLSearchParams({ voterToken });
    if (proposalId) q.set('proposalId', proposalId);
    if (loopId) q.set('loopId', loopId);
    return this.del(`/api/votes/${idOrSlug}/responses?${q}`);
  }

  listVoteLoops(voteId: string) {
    return this.get(`/api/votes/${voteId}/loops`);
  }

  createVoteLoop(voteId: string, loop: Record<string, unknown>) {
    return this.post(`/api/votes/${voteId}/loops`, loop);
  }

  closeVoteLoop(loopId: string) {
    return this.post(`/api/votes/loops/${loopId}/close`, {});
  }

  updateVoteLoop(loopId: string, patch: Record<string, unknown>) {
    return this.put(`/api/votes/loops/${loopId}`, patch);
  }

  listVoteModerators(voteId: string) {
    return this.get(`/api/votes/${voteId}/moderators`);
  }

  addVoteModerator(voteId: string, input: Record<string, unknown>) {
    return this.post(`/api/votes/${voteId}/moderators`, input);
  }

  revokeVoteModerator(voteId: string, moderatorId: string) {
    return this.del(`/api/votes/${voteId}/moderators/${moderatorId}`);
  }

  resolveVoteModeratorToken(token: string) {
    return this.get(`/api/votes/moderate/${token}`);
  }

  importVotes(items: unknown[]) {
    return this.post('/api/votes/import', items);
  }

  // ---- Reminders ----
  listReminders(userId?: string) {
    const q = userId ? `?user_id=${userId}` : '';
    return this.get(`/api/reminders${q}`);
  }

  getReminderById(id: string) {
    return this.get(`/api/reminders/${id}`);
  }

  createReminder(input: Record<string, unknown>) {
    return this.post('/api/reminders', input);
  }

  updateReminder(id: string, patch: Record<string, unknown>) {
    return this.patch(`/api/reminders/${id}`, patch);
  }

  deleteReminder(id: string) {
    return this.del(`/api/reminders/${id}`);
  }

  deleteRemindersByTaskId(taskId: string) {
    return this.del(`/api/reminders/task/${taskId}`);
  }

  clearAllReminders() {
    return this.post('/api/reminders/clear', {});
  }

  importReminders(reminders: unknown[]) {
    return this.post('/api/reminders/import', reminders);
  }

  // ---- Pomodoro sessions ----
  listPomodoroSessions(userId?: string, since?: number) {
    const q = new URLSearchParams();
    if (userId) q.set('userId', userId);
    if (since !== undefined) q.set('since', String(since));
    return this.get(`/api/pomodoro-sessions${q.toString() ? `?${q}` : ''}`);
  }

  createPomodoroSession(session: Record<string, unknown>) {
    return this.post('/api/pomodoro-sessions', session);
  }

  deletePomodoroSession(id: string) {
    return this.del(`/api/pomodoro-sessions/${id}`);
  }

  clearAllPomodoroSessions() {
    return this.post('/api/pomodoro-sessions/clear', {});
  }

  deletePomodoroSessionsByUser(userId: string) {
    return this.del(`/api/pomodoro-sessions/user/${userId}`);
  }

  importPomodoroSessions(sessions: unknown[]) {
    return this.post('/api/pomodoro-sessions/import', sessions);
  }

  // ---- System ----
  clearAllData() {
    return this.post('/api/admin/clear-all-data', {});
  }

  // ---- Low-level helpers ----
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    let parsed: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const msg = extractErrorMessage(parsed) ?? `P3FO API ${res.status} ${res.statusText}`;
      throw new P3foApiError(res.status, msg, parsed);
    }

    return parsed as T;
  }

  private get<T>(path: string) {
    return this.request<T>('GET', path);
  }

  private post<T>(path: string, body: unknown) {
    return this.request<T>('POST', path, body);
  }

  private put<T>(path: string, body: unknown) {
    return this.request<T>('PUT', path, body);
  }

  private patch<T>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, body);
  }

  private del<T>(path: string) {
    return this.request<T>('DELETE', path);
  }
}