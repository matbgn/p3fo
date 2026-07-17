/**
 * P3FO MCP tool registry.
 *
 * Every tool mirrors a P3FO REST endpoint. Each handler receives a single
 * `params` object (matching the Zammad-MCP convention) and returns JSON.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { P3foClient, P3foApiError } from './client.js';

const stringOrUndefined = z.string().optional();
const recordSchema = z.record(z.string(), z.unknown()).optional();

function asText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorText(err: unknown) {
  if (err instanceof P3foApiError) {
    return { content: [{ type: 'text' as const, text: `P3FO API error ${err.status}: ${err.message}` }], isError: true };
  }
  return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message ?? String(err)}` }], isError: true };
}

// Reusable param schemas ------------------------------------------------------
const taskSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.string().optional(),
  triageStatus: z.string().optional(),
  urgent: z.boolean().optional(),
  impact: z.boolean().optional(),
  majorIncident: z.boolean().optional(),
  sprintTarget: z.boolean().optional(),
  difficulty: z.number().optional(),
  timer: z.array(z.unknown()).optional(),
  category: z.string().optional(),
  terminationDate: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  durationInMinutes: z.number().nullable().optional(),
  priority: z.number().nullable().optional(),
  userId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  children: z.array(z.string()).optional(),
  updatedAt: z.string().nullable().optional(),
  linkedVoteIds: z.array(z.string()).optional(),
  blockedSince: z.string().nullable().optional(),
}).passthrough();

const reminderSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  taskId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  read: z.boolean().optional(),
  persistent: z.boolean().optional(),
  triggerDate: z.string().optional(),
  offsetMinutes: z.number().optional(),
  snoozeDurationMinutes: z.number().optional(),
  originalTriggerDate: z.string().optional(),
  state: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

const circleSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.string().nullable().optional(),
  nodeType: z.string().optional(),
  modifier: z.string().optional(),
  color: z.string().optional(),
  size: z.number().optional(),
  purpose: z.string().optional(),
  missions: z.string().optional(),
  authorityScope: z.string().optional(),
  order: z.number().optional(),
  assignments: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

const frameworkSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  frameworkType: z.string().optional(),
  parentId: z.string().nullable().optional(),
  categories: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

const voteSchema = z.object({
  id: z.string().optional(),
  slug: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  ownerId: z.string().optional(),
  proposals: z.array(z.unknown()).optional(),
  config: z.unknown().optional(),
  outcome: z.unknown().optional(),
  moderationTokens: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  linkedTaskId: z.string().optional(),
}).passthrough();

const pomodoroSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().optional(),
  userId: z.string().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  phase: z.string().optional(),
  duration: z.number().optional(),
  completed: z.boolean().optional(),
  kind: z.string().optional(),
}).passthrough();

export function registerTools(server: McpServer, client: P3foClient) {
  // ---- System ----
  server.tool('p3fo_health', {}, async () => {
    try { return asText(await client.health()); } catch (e) { return errorText(e); }
  });

  server.tool('p3fo_clear_all_data', {}, async () => {
    try { return asText(await client.clearAllData()); } catch (e) { return errorText(e); }
  });

  // ---- Tasks ----
  server.tool(
    'p3fo_list_tasks',
    {
      params: z.object({
        userId: stringOrUndefined,
        limit: z.number().optional(),
        offset: z.number().optional(),
        excludeStatuses: z.array(z.string()).optional(),
        triageStatuses: z.array(z.string()).optional(),
        includeSubtasks: z.boolean().optional(),
      }).optional(),
    },
    async (args) => {
      // Default: exclude subtasks (parentId != null) to avoid overcharging context.
      const params = { includeSubtasks: false, ...(args.params ?? {}) };
      try { return asText(await client.getTasks(params)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_task',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.getTaskById(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_task',
    { params: z.object({ task: taskSchema }) },
    async (args) => {
      try { return asText(await client.createTask(args.params.task)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_task',
    { params: z.object({ id: z.string(), patch: taskSchema.partial() }) },
    async (args) => {
      try { return asText(await client.updateTask(args.params.id, args.params.patch)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_task',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteTask(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_bulk_update_priorities',
    { params: z.object({ items: z.array(z.object({ id: z.string(), priority: z.number().optional() })) }) },
    async (args) => {
      const items = args.params.items.map((i) => ({ id: i.id, priority: i.priority }));
      try { return asText(await client.bulkUpdateTaskPriorities(items)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_import_tasks',
    { params: z.object({ tasks: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importTasks(args.params.tasks)); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_tasks', {}, async () => {
    try { return asText(await client.clearAllTasks()); } catch (e) { return errorText(e); }
  });

  // ---- Users & user settings ----
  server.tool('p3fo_list_users', {}, async () => {
    try { return asText(await client.listUsers()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_get_user_settings',
    { params: z.object({ userId: z.string() }) },
    async (args) => {
      try { return asText(await client.getUserSettings(args.params.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_user_settings',
    { params: z.object({ userId: z.string(), patch: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateUserSettings(args.params.userId, args.params.patch ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_migrate_user',
    { params: z.object({ oldUserId: z.string(), newUserId: z.string() }) },
    async (args) => {
      try { return asText(await client.migrateUser(args.params.oldUserId, args.params.newUserId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_user',
    { params: z.object({ userId: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteUser(args.params.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_users', {}, async () => {
    try { return asText(await client.clearAllUsers()); } catch (e) { return errorText(e); }
  });

  // ---- App settings ----
  server.tool('p3fo_get_app_settings', {}, async () => {
    try { return asText(await client.getAppSettings()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_update_app_settings',
    { params: z.object({ patch: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateAppSettings(args.params.patch ?? {})); } catch (e) { return errorText(e); }
    },
  );

  // ---- QoL survey ----
  server.tool('p3fo_list_qol_responses', {}, async () => {
    try { return asText(await client.getAllQolSurveyResponses()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_get_qol_response',
    { params: z.object({ userId: z.string() }) },
    async (args) => {
      try { return asText(await client.getQolSurveyResponse(args.params.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_save_qol_response',
    { params: z.object({ userId: z.string(), data: recordSchema }) },
    async (args) => {
      try { return asText(await client.saveQolSurveyResponse(args.params.userId, args.params.data ?? {})); } catch (e) { return errorText(e); }
    },
  );

  // ---- Filters ----
  server.tool('p3fo_get_filters', {}, async () => {
    try { return asText(await client.getFilters()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_save_filters',
    { params: z.object({ data: recordSchema }) },
    async (args) => {
      try { return asText(await client.saveFilters(args.params.data ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_filters', {}, async () => {
    try { return asText(await client.clearFilters()); } catch (e) { return errorText(e); }
  });

  // ---- Fertilization Board ----
  server.tool('p3fo_get_fertilization_board', {}, async () => {
    try { return asText(await client.getFertilizationBoardState()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_update_fertilization_board',
    { params: z.object({ state: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateFertilizationBoardState(args.params.state ?? {})); } catch (e) { return errorText(e); }
    },
  );

  // ---- Dream Board ----
  server.tool('p3fo_get_dream_board', {}, async () => {
    try { return asText(await client.getDreamBoardState()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_update_dream_board',
    { params: z.object({ state: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateDreamBoardState(args.params.state ?? {})); } catch (e) { return errorText(e); }
    },
  );

  // ---- Circles ----
  server.tool('p3fo_list_circles', {}, async () => {
    try { return asText(await client.listCircles()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_get_circle',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.getCircleById(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_circle',
    { params: z.object({ circle: circleSchema }) },
    async (args) => {
      try { return asText(await client.createCircle(args.params.circle)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_circle',
    { params: z.object({ id: z.string(), patch: circleSchema.partial() }) },
    async (args) => {
      try { return asText(await client.updateCircle(args.params.id, args.params.patch)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_circle',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteCircle(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_circles', {}, async () => {
    try { return asText(await client.clearAllCircles()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_import_circles',
    { params: z.object({ circles: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importCircles(args.params.circles)); } catch (e) { return errorText(e); }
    },
  );

  // ---- Frameworks ----
  server.tool(
    'p3fo_list_frameworks',
    { params: z.object({ frameworkType: stringOrUndefined }).optional() },
    async (args) => {
      try { return asText(await client.listFrameworks(args?.params?.frameworkType)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_framework',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.getFrameworkById(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_framework',
    { params: z.object({ framework: frameworkSchema }) },
    async (args) => {
      try { return asText(await client.createFramework(args.params.framework)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_framework',
    { params: z.object({ id: z.string(), patch: frameworkSchema.partial() }) },
    async (args) => {
      try { return asText(await client.updateFramework(args.params.id, args.params.patch)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_framework',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteFramework(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_import_frameworks',
    { params: z.object({ frameworks: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importFrameworks(args.params.frameworks)); } catch (e) { return errorText(e); }
    },
  );

  // ---- Votes ----
  server.tool(
    'p3fo_list_votes',
    {
      params: z.object({
        linkedTaskId: stringOrUndefined,
        ownerId: stringOrUndefined,
        kind: stringOrUndefined,
      }).optional(),
    },
    async (args) => {
      try { return asText(await client.listVotes(args?.params ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_vote',
    { params: z.object({ idOrSlug: z.string() }) },
    async (args) => {
      try { return asText(await client.getVoteByIdOrSlug(args.params.idOrSlug)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_vote',
    { params: z.object({ vote: voteSchema }) },
    async (args) => {
      try { return asText(await client.createVote(args.params.vote)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_vote',
    { params: z.object({ id: z.string(), patch: voteSchema.partial() }) },
    async (args) => {
      try { return asText(await client.updateVote(args.params.id, args.params.patch)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_finalize_vote',
    { params: z.object({ id: z.string(), outcome: recordSchema }) },
    async (args) => {
      try { return asText(await client.finalizeVote(args.params.id, args.params.outcome ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_vote',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteVote(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_reset_vote',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.resetVote(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_vote_results',
    { params: z.object({ idOrSlug: z.string() }) },
    async (args) => {
      try { return asText(await client.getVoteResults(args.params.idOrSlug)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_submit_vote_response',
    { params: z.object({ idOrSlug: z.string(), response: recordSchema }) },
    async (args) => {
      try { return asText(await client.createVoteResponse(args.params.idOrSlug, args.params.response ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_withdraw_vote_response',
    { params: z.object({ idOrSlug: z.string(), voterToken: z.string(), proposalId: stringOrUndefined, loopId: stringOrUndefined }) },
    async (args) => {
      try { return asText(await client.deleteVoteResponse(args.params.idOrSlug, args.params.voterToken, args.params.proposalId, args.params.loopId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_list_vote_loops',
    { params: z.object({ voteId: z.string() }) },
    async (args) => {
      try { return asText(await client.listVoteLoops(args.params.voteId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_vote_loop',
    { params: z.object({ voteId: z.string(), loop: recordSchema }) },
    async (args) => {
      try { return asText(await client.createVoteLoop(args.params.voteId, args.params.loop ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_close_vote_loop',
    { params: z.object({ loopId: z.string() }) },
    async (args) => {
      try { return asText(await client.closeVoteLoop(args.params.loopId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_vote_loop',
    { params: z.object({ loopId: z.string(), patch: recordSchema }) },
    async (args) => {
      try { return asText(await client.updateVoteLoop(args.params.loopId, args.params.patch ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_list_vote_moderators',
    { params: z.object({ voteId: z.string() }) },
    async (args) => {
      try { return asText(await client.listVoteModerators(args.params.voteId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_add_vote_moderator',
    { params: z.object({ voteId: z.string(), input: recordSchema }) },
    async (args) => {
      try { return asText(await client.addVoteModerator(args.params.voteId, args.params.input ?? {})); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_revoke_vote_moderator',
    { params: z.object({ voteId: z.string(), moderatorId: z.string() }) },
    async (args) => {
      try { return asText(await client.revokeVoteModerator(args.params.voteId, args.params.moderatorId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_resolve_vote_moderator_token',
    { params: z.object({ token: z.string() }) },
    async (args) => {
      try { return asText(await client.resolveVoteModeratorToken(args.params.token)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_import_votes',
    { params: z.object({ items: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importVotes(args.params.items)); } catch (e) { return errorText(e); }
    },
  );

  // ---- Reminders ----
  server.tool(
    'p3fo_list_reminders',
    { params: z.object({ userId: stringOrUndefined }).optional() },
    async (args) => {
      try { return asText(await client.listReminders(args?.params?.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_get_reminder',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.getReminderById(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_reminder',
    { params: z.object({ reminder: reminderSchema }) },
    async (args) => {
      try { return asText(await client.createReminder(args.params.reminder)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_update_reminder',
    { params: z.object({ id: z.string(), patch: reminderSchema.partial() }) },
    async (args) => {
      try { return asText(await client.updateReminder(args.params.id, args.params.patch)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_reminder',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteReminder(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_reminders_by_task',
    { params: z.object({ taskId: z.string() }) },
    async (args) => {
      try { return asText(await client.deleteRemindersByTaskId(args.params.taskId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_reminders', {}, async () => {
    try { return asText(await client.clearAllReminders()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_import_reminders',
    { params: z.object({ reminders: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importReminders(args.params.reminders)); } catch (e) { return errorText(e); }
    },
  );

  // ---- Pomodoro sessions ----
  server.tool(
    'p3fo_list_pomodoro_sessions',
    {
      params: z.object({
        userId: stringOrUndefined,
        since: z.number().optional(),
      }).optional(),
    },
    async (args) => {
      try { return asText(await client.listPomodoroSessions(args?.params?.userId, args?.params?.since)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_create_pomodoro_session',
    { params: z.object({ session: pomodoroSchema }) },
    async (args) => {
      try { return asText(await client.createPomodoroSession(args.params.session)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_delete_pomodoro_session',
    { params: z.object({ id: z.string() }) },
    async (args) => {
      try { return asText(await client.deletePomodoroSession(args.params.id)); } catch (e) { return errorText(e); }
    },
  );

  server.tool('p3fo_clear_pomodoro_sessions', {}, async () => {
    try { return asText(await client.clearAllPomodoroSessions()); } catch (e) { return errorText(e); }
  });

  server.tool(
    'p3fo_delete_pomodoro_sessions_by_user',
    { params: z.object({ userId: z.string() }) },
    async (args) => {
      try { return asText(await client.deletePomodoroSessionsByUser(args.params.userId)); } catch (e) { return errorText(e); }
    },
  );

  server.tool(
    'p3fo_import_pomodoro_sessions',
    { params: z.object({ sessions: z.array(z.unknown()) }) },
    async (args) => {
      try { return asText(await client.importPomodoroSessions(args.params.sessions)); } catch (e) { return errorText(e); }
    },
  );
}