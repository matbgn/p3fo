import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { QolSurveyResponseEntity, MonthlyBalanceData } from '@/lib/persistence-types';
import { saveTemplates, type TaskTemplate } from '@/lib/task-templates';
import {
  yTasks,
  yUserSettings,
  yFertilizationState,
  yFertilizationCards,
  yFertilizationColumns,
  yDreamState,
  yDreamCards,
  yDreamColumns,
  yCircles,
  yFrameworks,
  yAppSettings,
  isCollaborationEnabled,
  doc,
} from '@/lib/collaboration';
import { useReminderStore } from '@/hooks/useReminders';
import { tasksToEntities, convertEntitiesToTasks } from '@/lib/task-conversions';
import type { Task } from '@/hooks/useTasks';

export const CURRENT_SCHEMA_VERSION = 4;

export function extractImportErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (error instanceof SyntaxError) {
    return `Invalid JSON file: ${error.message}`;
  }
  if (error instanceof Error) {
    const httpMatch = error.message.match(/status: (\d+)/);
    if (httpMatch) {
      const status = httpMatch[1];
      const hintKey = `dataImport.error.${status}` as const;
      const hint = t(hintKey);
      return hint !== hintKey ? `HTTP ${status}: ${hint}` : `HTTP ${status}`;
    }
    if (error.message === 'Failed to fetch' || /NetworkError|fetch/i.test(error.message)) {
      return t('dataImport.networkError');
    }
    return error.message;
  }
  return typeof error === 'string' ? error : t('dataImport.unknownError');
}

export interface ImportedUserSettings {
  userId?: string;
  username?: string;
  logo?: string;
  hasCompletedOnboarding?: boolean;
  workload?: number;
  splitTime?: string;
  monthlyBalances?: Record<string, MonthlyBalanceData>;
  cardCompactness?: number;
  timezone?: string;
  weekStartDay?: 0 | 1;
  defaultPlanView?: 'week' | 'month';
  preferredWorkingDays?: number[];
  trigram?: string;
  nonActionPeriodHours?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBoard = Record<string, any>;

function migrateOfflineVotes(cards: AnyBoard['cards']): AnyBoard['cards'] {
  return (cards || []).map((c: { offlineVotes?: number | Record<string, number>; [key: string]: unknown }) => ({
    ...c,
    offlineVotes:
      typeof c.offlineVotes === 'number'
        ? c.offlineVotes > 0
          ? { offline_1: c.offlineVotes }
          : {}
        : c.offlineVotes || {},
  }));
}

interface SyncFertilizationArgs {
  board: AnyBoard;
}

async function syncFertilizationToYjs({ board }: SyncFertilizationArgs) {
  if (!isCollaborationEnabled()) return;
  const migratedCards = migrateOfflineVotes(board.cards);
  doc.transact(() => {
    yFertilizationState.set('moderatorId', board.moderatorId ?? null);
    yFertilizationState.set('isSessionActive', board.isSessionActive ?? false);
    yFertilizationState.set('timer', board.timer ?? null);
    yFertilizationState.set('hiddenEdition', board.hiddenEdition ?? true);
    yFertilizationState.set('votingMode', board.votingMode ?? 'THUMBS_UP');
    yFertilizationState.set('votingPhase', board.votingPhase ?? 'IDLE');
    yFertilizationState.set('areCursorsVisible', board.areCursorsVisible ?? true);
    yFertilizationState.set('showAllLinks', board.showAllLinks ?? false);
    if (board.maxPointsPerUser !== undefined) yFertilizationState.set('maxPointsPerUser', board.maxPointsPerUser);
    if (board.showOfflineVotesPanel !== undefined) yFertilizationState.set('showOfflineVotesPanel', board.showOfflineVotesPanel);
    yFertilizationColumns.clear();
    board.columns?.forEach((col: AnyBoard) => yFertilizationColumns.set(col.id, col));
    yFertilizationCards.clear();
    migratedCards.forEach((card: AnyBoard) => yFertilizationCards.set(card.id, card));
  });
}

interface SyncDreamArgs {
  board: AnyBoard;
}

async function syncDreamToYjs({ board }: SyncDreamArgs) {
  if (!isCollaborationEnabled()) return;
  const migratedCards = migrateOfflineVotes(board.cards);
  doc.transact(() => {
    yDreamState.set('moderatorId', board.moderatorId ?? null);
    yDreamState.set('isSessionActive', board.isSessionActive ?? false);
    yDreamState.set('timer', board.timer ?? null);
    yDreamState.set('hiddenEdition', board.hiddenEdition ?? true);
    yDreamState.set('votingMode', board.votingMode ?? 'THUMBS_UP');
    yDreamState.set('votingPhase', board.votingPhase ?? 'IDLE');
    yDreamState.set('areCursorsVisible', board.areCursorsVisible ?? true);
    yDreamState.set('showAllLinks', board.showAllLinks ?? false);
    if (board.maxPointsPerUser !== undefined) yDreamState.set('maxPointsPerUser', board.maxPointsPerUser);
    if (board.mjLabels !== undefined) yDreamState.set('mjLabels', board.mjLabels);
    if (board.showOfflineVotesPanel !== undefined) yDreamState.set('showOfflineVotesPanel', board.showOfflineVotesPanel);
    yDreamState.set('isTimelineExpanded', board.isTimelineExpanded ?? false);
    yDreamState.set('timeSortDirection', board.timeSortDirection ?? 'nearest');
    yDreamColumns.clear();
    board.columns?.forEach((col: AnyBoard) => yDreamColumns.set(col.id, col));
    yDreamCards.clear();
    migratedCards.forEach((card: AnyBoard) => yDreamCards.set(card.id, card));
  });
}

/**
 * Apply a parsed p3fo export object to the persistence layer and Yjs.
 *
 * This is the shared engine behind both the file-based DataImporter and the
 * ACME example-data modal. It accepts the same shape as the export JSON
 * (schemaVersion 4) and writes every present section.
 *
 * @param importedData The parsed export object (mutated in place is fine).
 * @param opts.tasksAsEntities When true, `importedData.tasks` is treated as
 *   `TaskEntity[]` (already in DB shape) and imported directly. When false
 *   (default, matches the file importer), tasks are treated as frontend `Task[]`
 *   and converted via `tasksToEntities`. The ACME builder emits TaskEntity[]
 *   so it passes `true`.
 */
export async function applyImportedData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  importedData: any,
  opts: { tasksAsEntities?: boolean } = {},
): Promise<void> {
  const adapter = await getPersistenceAdapter();

  // ---- Tasks ----
  if (Array.isArray(importedData.tasks)) {
    const entities = opts.tasksAsEntities
      ? (importedData.tasks as Parameters<typeof adapter.importTasks>[0])
      : tasksToEntities(importedData.tasks as Task[]);
    await adapter.importTasks(entities);
    if (isCollaborationEnabled()) {
      // For entity-shaped imports we must convert back to the frontend Task
      // shape Yjs expects; for task-shaped imports we can use them as-is.
      const tasksForYjs = opts.tasksAsEntities
        ? convertEntitiesToTasks(entities)
        : (importedData.tasks as Task[]);
      doc.transact(() => {
        yTasks.clear();
        tasksForYjs.forEach((task: Task) => yTasks.set(task.id, task));
      });
    }
  }

  // ---- Reminders (in-memory store + bulk import) ----
  const remindersData = importedData.scheduledReminders || importedData.reminders;
  if (remindersData && Array.isArray(remindersData)) {
    useReminderStore.getState().setScheduledReminders(remindersData);
    useReminderStore.getState().checkAndTriggerReminders();
    await adapter.importReminders(remindersData);
  }

  // ---- User settings ----
  const userSettingsData = importedData.allUserSettings || importedData.userSettings;
  if (userSettingsData) {
    const processUserSetting = async (settings: ImportedUserSettings) => {
      if (!settings.userId) return;
      const userId = settings.userId;
      const normalizedSettings = {
        userId,
        username: settings.username,
        logo: settings.logo,
        hasCompletedOnboarding: settings.hasCompletedOnboarding,
        workload: settings.workload,
        splitTime: settings.splitTime,
        monthlyBalances: settings.monthlyBalances,
        cardCompactness: settings.cardCompactness,
        timezone: settings.timezone,
        weekStartDay: settings.weekStartDay,
        defaultPlanView: settings.defaultPlanView,
        preferredWorkingDays: settings.preferredWorkingDays,
        trigram: settings.trigram,
        nonActionPeriodHours: settings.nonActionPeriodHours,
      };
      await adapter.updateUserSettings(userId, normalizedSettings);
      if (isCollaborationEnabled()) {
        yUserSettings.set(userId, {
          userId,
          username: normalizedSettings.username,
          logo: normalizedSettings.logo,
          hasCompletedOnboarding: normalizedSettings.hasCompletedOnboarding,
          workload: normalizedSettings.workload,
          monthlyBalances: normalizedSettings.monthlyBalances || {},
          cardCompactness: normalizedSettings.cardCompactness ?? 0,
          splitTime: normalizedSettings.splitTime,
          timezone: normalizedSettings.timezone,
          weekStartDay: normalizedSettings.weekStartDay,
          defaultPlanView: normalizedSettings.defaultPlanView,
          preferredWorkingDays: normalizedSettings.preferredWorkingDays,
          trigram: normalizedSettings.trigram,
          nonActionPeriodHours: normalizedSettings.nonActionPeriodHours,
        });
      }
    };

    if (Array.isArray(userSettingsData)) {
      for (const settings of userSettingsData) {
        await processUserSetting(settings);
      }
    } else {
      for (const [key, settings] of Object.entries(userSettingsData)) {
        const s = settings as ImportedUserSettings;
        const settingsWithUserId: ImportedUserSettings = { ...s, userId: s.userId || key };
        await processUserSetting(settingsWithUserId);
      }
    }
  }

  // ---- App settings ----
  if (importedData.settings) {
    const appSettings = {
      userWorkloadPercentage: importedData.settings.userWorkloadPercentage ? Number(importedData.settings.userWorkloadPercentage) : undefined,
      weeksComputation: importedData.settings.weeksComputation ? Number(importedData.settings.weeksComputation) : undefined,
      highImpactTaskGoal: importedData.settings.highImpactTaskGoal ? Number(importedData.settings.highImpactTaskGoal) : undefined,
      failureRateGoal: importedData.settings.failureRateGoal ? Number(importedData.settings.failureRateGoal) : undefined,
      qliGoal: importedData.settings.qliGoal ? Number(importedData.settings.qliGoal) : undefined,
      newCapabilitiesGoal: importedData.settings.newCapabilitiesGoal ? Number(importedData.settings.newCapabilitiesGoal) : undefined,
      vacationLimitMultiplier: importedData.settings.vacationLimitMultiplier ? Number(importedData.settings.vacationLimitMultiplier) : undefined,
      hourlyBalanceLimitUpper: importedData.settings.hourlyBalanceLimitUpper ? Number(importedData.settings.hourlyBalanceLimitUpper) : undefined,
      hourlyBalanceLimitLower: importedData.settings.hourlyBalanceLimitLower ? Number(importedData.settings.hourlyBalanceLimitLower) : undefined,
      hoursToBeDoneByDay: importedData.settings.hoursToBeDoneByDay ? Number(importedData.settings.hoursToBeDoneByDay) : undefined,
      timezone: importedData.settings.timezone,
      country: importedData.settings.country,
      region: importedData.settings.region,
      splitTime: importedData.settings.splitTime ? Number(importedData.settings.splitTime) : undefined,
      cardAgingBaseDays: importedData.settings.cardAgingBaseDays ? Number(importedData.settings.cardAgingBaseDays) : undefined,
      disabledModules: importedData.settings.disabledModules || undefined,
      wipLimitPerUser: importedData.settings.wipLimitPerUser !== undefined ? Number(importedData.settings.wipLimitPerUser) : undefined,
    };
    await adapter.updateAppSettings(appSettings);
    if (isCollaborationEnabled()) {
      doc.transact(() => {
        for (const [key, value] of Object.entries(appSettings)) {
          if (value !== undefined) {
            yAppSettings.set(key, JSON.stringify(value));
          }
        }
      });
    }
  }

  // ---- Fertilization / Celebration board ----
  const fertilizationBoard = importedData.fertilizationBoard || importedData.celebrationBoard;
  if (fertilizationBoard) {
    const migratedCards = migrateOfflineVotes(fertilizationBoard.cards);
    const migratedBoard = { ...fertilizationBoard, cards: migratedCards };
    await adapter.updateFertilizationBoardState(migratedBoard);
    await syncFertilizationToYjs({ board: fertilizationBoard });
  }

  // ---- Dream board ----
  if (importedData.dreamBoard) {
    const board = importedData.dreamBoard;
    const migratedCards = migrateOfflineVotes(board.cards);
    const migratedBoard = { ...board, cards: migratedCards };
    await adapter.updateDreamBoardState(migratedBoard);
    await syncDreamToYjs({ board });
  }

  // ---- Salary board ----
  if (importedData.salaryBoard) {
    await adapter.updateSalaryBoardState(importedData.salaryBoard);
  }

  // ---- QoL survey responses ----
  const qolData = importedData.qolSurveyResponses || importedData.qolSurvey || importedData.qol_survey;
  if (qolData) {
    for (const [userId, responses] of Object.entries(qolData)) {
      await adapter.saveQolSurveyResponse(userId, responses as QolSurveyResponseEntity);
    }
  }

  // ---- Circles ----
  if (importedData.circles && Array.isArray(importedData.circles)) {
    await adapter.importCircles(importedData.circles);
    if (isCollaborationEnabled()) {
      doc.transact(() => {
        yCircles.clear();
        importedData.circles.forEach((circle: { id: string; [key: string]: unknown }) => {
          yCircles.set(circle.id, circle);
        });
      });
    }
  }

  // ---- Frameworks ----
  if (importedData.frameworks && Array.isArray(importedData.frameworks)) {
    await adapter.importFrameworks(importedData.frameworks);
    if (isCollaborationEnabled()) {
      doc.transact(() => {
        yFrameworks.clear();
        importedData.frameworks.forEach((framework: { id: string; [key: string]: unknown }) => {
          yFrameworks.set(framework.id, framework);
        });
      });
    }
  }

  // ---- Votes + vote artifacts ----
  if (importedData.votes && Array.isArray(importedData.votes)) {
    await adapter.importVotes(importedData.votes);
  }
  if (importedData.voteResponses && Array.isArray(importedData.voteResponses)) {
    await adapter.importVoteResponses(importedData.voteResponses);
  }
  if (importedData.voteLoops && Array.isArray(importedData.voteLoops)) {
    await adapter.importVoteLoops(importedData.voteLoops);
  }
  if (importedData.voteModerators && Array.isArray(importedData.voteModerators)) {
    await adapter.importVoteModerators(importedData.voteModerators);
  }

  // ---- Pomodoro sessions ----
  if (importedData.pomodoroSessions && Array.isArray(importedData.pomodoroSessions)) {
    await adapter.importPomodoroSessions(importedData.pomodoroSessions);
  }

  // ---- Task templates (localStorage-backed, scope-aware) ----
  if (Array.isArray(importedData.taskTemplates)) {
    const workspaceTemplates = (importedData.taskTemplates as TaskTemplate[])
      .filter(t => t && t.id && (!t.scope || t.scope === 'workspace'));
    const userTemplates = (importedData.taskTemplates as TaskTemplate[])
      .filter(t => t && t.id && t.scope === 'user');
    if (workspaceTemplates.length > 0) saveTemplates('workspace', workspaceTemplates);
    if (userTemplates.length > 0) saveTemplates('user', userTemplates);
  }

  // ---- Restore active user identity ----
  if (importedData.activeUserId) {
    const Cookies = (await import('js-cookie')).default;
    Cookies.set('p3fo_user_id', importedData.activeUserId, { expires: 365 * 10 });
    localStorage.setItem('p3fo_user_id', importedData.activeUserId);
  }
}