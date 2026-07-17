import React, { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReminderStore } from '@/hooks/useReminders';
import { useToast } from '@/hooks/use-toast';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { QolSurveyResponseEntity, MonthlyBalanceData } from '@/lib/persistence-types';
import { saveTemplates, type TaskTemplate } from '@/lib/task-templates';
import { yUserSettings, yFertilizationState, yFertilizationCards, yFertilizationColumns, yDreamState, yDreamCards, yDreamColumns, yCircles, yFrameworks, yAppSettings, isCollaborationEnabled, doc } from '@/lib/collaboration';

const CURRENT_SCHEMA_VERSION = 4;

function extractImportErrorMessage(error: unknown): string {
  if (error instanceof SyntaxError) {
    return `Invalid JSON file: ${error.message}`;
  }
  if (error instanceof Error) {
    const httpMatch = error.message.match(/status: (\d+)/);
    if (httpMatch) {
      const status = httpMatch[1];
      const hintMap: Record<string, string> = {
        '400': 'Bad request — the server rejected the data shape.',
        '401': 'Unauthorized — please re-authenticate.',
        '403': 'Forbidden — your account cannot perform this import.',
        '404': 'Not found — an API endpoint is missing.',
        '500': 'Server error while saving — check the server logs.',
      };
      return hintMap[status] ? `HTTP ${status}: ${hintMap[status]}` : `HTTP ${status}`;
    }
    if (error.message === 'Failed to fetch' || /NetworkError|fetch/i.test(error.message)) {
      return 'Network error — could not reach the backend server.';
    }
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error. See the browser console for details.';
}

interface ImportedUserSettings {
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

const DataImporter: React.FC = () => {
  const { importTasks } = useTasks();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = () => {
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result) {
          try {
            const importedData = JSON.parse(e.target.result as string);

            // Schema version check
            if (importedData.schemaVersion !== undefined && importedData.schemaVersion > CURRENT_SCHEMA_VERSION) {
              toast({
                variant: 'destructive',
                title: 'Unsupported schema version',
                description: `Schema version ${importedData.schemaVersion} is newer than the supported version ${CURRENT_SCHEMA_VERSION}. Please update the application.`,
              });
              return;
            }

            const adapter = await getPersistenceAdapter();

            if (Array.isArray(importedData)) {
              // Old format: just an array of tasks
              await importTasks(importedData);
            } else if (importedData.tasks) {
              // New format
              await importTasks(importedData.tasks);

              if (importedData.scheduledReminders) {
                useReminderStore.getState().setScheduledReminders(importedData.scheduledReminders);
                useReminderStore.getState().checkAndTriggerReminders();
              }

              // Import User Settings (allUserSettings is the new key, userSettings is legacy)
              const userSettingsData = importedData.allUserSettings || importedData.userSettings;

              if (userSettingsData) {
                const processUserSetting = async (settings: ImportedUserSettings) => {
                  if (!settings.userId) return;

                  const userId = settings.userId;

                  // Import ALL fields from exported data - imported data takes precedence
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

                  console.log('Importing user settings for:', userId, normalizedSettings);

                  await adapter.updateUserSettings(userId, normalizedSettings);

                  // Sync to Yjs for cross-client synchronization
                  // This ensures other clients receive the imported data and don't
                  // overwrite it with their stale cached settings
                  if (isCollaborationEnabled()) {
                    console.log('Syncing imported user settings to Yjs:', { userId, username: normalizedSettings.username });
                    // Set all fields explicitly - imported data takes precedence
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
                  // Map format: userId -> settings
                  for (const [key, settings] of Object.entries(userSettingsData)) {
                    // Ensure settings has userId, if not use key
                    const s = settings as ImportedUserSettings;
                    const settingsWithUserId: ImportedUserSettings = { ...s, userId: s.userId || key };
                    await processUserSetting(settingsWithUserId);
                  }
                }
              }

              // ...

              // Import App Settings
              if (importedData.settings) {
                // Map export format back to entity format if needed, or assume compatible
                // Both export and entity now use camelCase
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
                // Sync to Yjs for cross-client synchronization
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

              // Import Fertilization Board (or legacy Celebration Board)
              if (importedData.fertilizationBoard) {
                const board = importedData.fertilizationBoard;
                const migratedCards = (board.cards || []).map((c: { offlineVotes?: number | Record<string, number>; [key: string]: unknown }) => ({
                  ...c,
                  offlineVotes: typeof c.offlineVotes === 'number'
                    ? c.offlineVotes > 0 ? { offline_1: c.offlineVotes } : {}
                    : (c.offlineVotes || {}),
                }));
                const migratedBoard = { ...board, cards: migratedCards };
                await adapter.updateFertilizationBoardState(migratedBoard);
                // Sync to Yjs for cross-client synchronization
                if (isCollaborationEnabled()) {
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
                    // Clear and repopulate columns
                    yFertilizationColumns.clear();
                    board.columns?.forEach(col => yFertilizationColumns.set(col.id, col));
                    // Clear and repopulate cards
                    yFertilizationCards.clear();
                    migratedCards.forEach(card => yFertilizationCards.set(card.id, card));
                  });
                }
              } else if (importedData.celebrationBoard) {
                // Backward compatibility for legacy export
                const board = importedData.celebrationBoard;
                const migratedCards = (board.cards || []).map((c: { offlineVotes?: number | Record<string, number>; [key: string]: unknown }) => ({
                  ...c,
                  offlineVotes: typeof c.offlineVotes === 'number'
                    ? c.offlineVotes > 0 ? { offline_1: c.offlineVotes } : {}
                    : (c.offlineVotes || {}),
                }));
                const migratedBoard = { ...board, cards: migratedCards };
                await adapter.updateFertilizationBoardState(migratedBoard);
                // Sync to Yjs for cross-client synchronization
                if (isCollaborationEnabled()) {
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
                    // Clear and repopulate columns
                    yFertilizationColumns.clear();
                    board.columns?.forEach(col => yFertilizationColumns.set(col.id, col));
                    // Clear and repopulate cards
                    yFertilizationCards.clear();
                    migratedCards.forEach(card => yFertilizationCards.set(card.id, card));
                  });
                }
              }

              // Import Dream Board
              if (importedData.dreamBoard) {
                const board = importedData.dreamBoard;
                const migratedCards = (board.cards || []).map((c: { offlineVotes?: number | Record<string, number>; [key: string]: unknown }) => ({
                  ...c,
                  offlineVotes: typeof c.offlineVotes === 'number'
                    ? c.offlineVotes > 0 ? { offline_1: c.offlineVotes } : {}
                    : (c.offlineVotes || {}),
                }));
                const migratedBoard = { ...board, cards: migratedCards };
                await adapter.updateDreamBoardState(migratedBoard);
                // Sync to Yjs for cross-client synchronization
                if (isCollaborationEnabled()) {
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
                    // Clear and repopulate columns
                    yDreamColumns.clear();
                    board.columns?.forEach(col => yDreamColumns.set(col.id, col));
                    // Clear and repopulate cards
                    yDreamCards.clear();
                    migratedCards.forEach(card => yDreamCards.set(card.id, card));
                  });
                }
              }

              // Import QoL Survey Responses
              const qolData = importedData.qolSurveyResponses || importedData.qolSurvey || importedData.qol_survey;
              if (qolData) {
                for (const [userId, responses] of Object.entries(qolData)) {
                  await adapter.saveQolSurveyResponse(userId, responses as QolSurveyResponseEntity);
                }
              }

              // Import Reminders (bulk)
              const remindersData = importedData.scheduledReminders || importedData.reminders;
              if (remindersData && Array.isArray(remindersData)) {
                await adapter.importReminders(remindersData);
              }

              // Import Circles (bulk)
              if (importedData.circles && Array.isArray(importedData.circles)) {
                await adapter.importCircles(importedData.circles);
                // Sync to Yjs for cross-client synchronization
                if (isCollaborationEnabled()) {
                  doc.transact(() => {
                    yCircles.clear();
                    importedData.circles.forEach((circle: { id: string; [key: string]: unknown }) => {
                      yCircles.set(circle.id, circle);
                    });
                  });
                }
              }

              // Import Frameworks (bulk)
              if (importedData.frameworks && Array.isArray(importedData.frameworks)) {
                await adapter.importFrameworks(importedData.frameworks);
                // Sync to Yjs for cross-client synchronization
                if (isCollaborationEnabled()) {
                  doc.transact(() => {
                    yFrameworks.clear();
                    importedData.frameworks.forEach((framework: { id: string; [key: string]: unknown }) => {
                      yFrameworks.set(framework.id, framework);
                    });
                  });
                }
              }

              // Import Votes (bulk)
              if (importedData.votes && Array.isArray(importedData.votes)) {
                await adapter.importVotes(importedData.votes);
              }

              // Import Vote Responses (bulk)
              if (importedData.voteResponses && Array.isArray(importedData.voteResponses)) {
                await adapter.importVoteResponses(importedData.voteResponses);
              }

              // Import Vote Loops (bulk)
              if (importedData.voteLoops && Array.isArray(importedData.voteLoops)) {
                await adapter.importVoteLoops(importedData.voteLoops);
              }

              // Import Vote Moderators (bulk)
              if (importedData.voteModerators && Array.isArray(importedData.voteModerators)) {
                await adapter.importVoteModerators(importedData.voteModerators);
              }

              // Import Pomodoro/Focus Sessions (bulk)
              if (importedData.pomodoroSessions && Array.isArray(importedData.pomodoroSessions)) {
                await adapter.importPomodoroSessions(importedData.pomodoroSessions);
              }

              // Import Task Templates (localStorage-backed, scope-aware)
              if (Array.isArray(importedData.taskTemplates)) {
                const workspaceTemplates = (importedData.taskTemplates as TaskTemplate[])
                  .filter(t => t && t.id && (!t.scope || t.scope === 'workspace'));
                const userTemplates = (importedData.taskTemplates as TaskTemplate[])
                  .filter(t => t && t.id && t.scope === 'user');
                if (workspaceTemplates.length > 0) saveTemplates('workspace', workspaceTemplates);
                if (userTemplates.length > 0) saveTemplates('user', userTemplates);
              }

              // RESTORE ACTIVE USER IDENTITY
              if (importedData.activeUserId) {
                console.log('Restoring active user ID from import:', importedData.activeUserId);
                // Set cookie and localStorage to the active user ID from the backup
                // This ensures that after reload, the app initializes with this user

                // We need to dynamically import js-cookie since it is not imported at the top
                const Cookies = (await import('js-cookie')).default;
                Cookies.set('p3fo_user_id', importedData.activeUserId, { expires: 365 * 10 });
                localStorage.setItem('p3fo_user_id', importedData.activeUserId);
              }
            }

            toast({
              title: 'Data imported successfully!',
              description: 'The page will reload to apply the imported data.',
            });
            // Trigger a reload or state update if necessary
            window.location.reload();
          } catch (error) {
            console.error("Import error:", error);
            const message = extractImportErrorMessage(error);
            toast({
              variant: 'destructive',
              title: 'Error importing data',
              description: message,
            });
          }
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Input type="file" onChange={handleFileChange} />
      <Button onClick={handleImport} disabled={!file}>
        Import Data
      </Button>
    </div>
  );
};

export default DataImporter;
