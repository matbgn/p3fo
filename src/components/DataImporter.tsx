import React, { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReminderStore } from '@/hooks/useReminders';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { QolSurveyResponseEntity, MonthlyBalanceData } from '@/lib/persistence-types';
import { yUserSettings, isCollaborationEnabled } from '@/lib/collaboration';

interface ImportedUserSettings {
  userId?: string;
  user_id?: string;
  username?: string;
  logo?: string;
  hasCompletedOnboarding?: boolean;
  has_completed_onboarding?: boolean;
  workload?: number;
  splitTime?: string;
  split_time?: string;
  monthlyBalances?: Record<string, MonthlyBalanceData>;
  monthly_balances?: Record<string, MonthlyBalanceData>;
  cardCompactness?: number;
  card_compactness?: number;
  timezone?: string;
}

const DataImporter: React.FC = () => {
  const { importTasks } = useTasks();
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
                  if (!settings.userId && !settings.user_id) return;

                  const userId = settings.userId || settings.user_id;

                  // Normalize legacy snake_case to camelCase
                  const normalizedSettings = {
                    userId,
                    username: settings.username,
                    logo: settings.logo,
                    hasCompletedOnboarding: settings.hasCompletedOnboarding ?? settings.has_completed_onboarding,
                    workload: settings.workload,
                    splitTime: settings.splitTime ?? settings.split_time,
                    monthlyBalances: settings.monthlyBalances ?? settings.monthly_balances,
                    cardCompactness: settings.cardCompactness ?? settings.card_compactness,
                    timezone: settings.timezone,
                  };

                  await adapter.updateUserSettings(userId, normalizedSettings);

                  // Sync to Yjs for cross-client synchronization
                  // This ensures other clients receive the imported data and don't
                  // overwrite it with their stale cached settings
                  if (isCollaborationEnabled()) {
                    console.log('Syncing imported user settings to Yjs:', { userId, username: normalizedSettings.username });
                    yUserSettings.set(userId, {
                      userId,
                      username: normalizedSettings.username,
                      logo: normalizedSettings.logo,
                      hasCompletedOnboarding: normalizedSettings.hasCompletedOnboarding,
                      monthlyBalances: normalizedSettings.monthlyBalances || {},
                      cardCompactness: normalizedSettings.cardCompactness ?? 0
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
                };
                await adapter.updateAppSettings(appSettings);
              }

              // Import Fertilization Board (or legacy Celebration Board)
              if (importedData.fertilizationBoard) {
                await adapter.updateFertilizationBoardState(importedData.fertilizationBoard);
              } else if (importedData.celebrationBoard) {
                // Backward compatibility for legacy export
                await adapter.updateFertilizationBoardState(importedData.celebrationBoard);
              }

              // Import QoL Survey Responses
              // Check for the correct key from DataExporter (qolSurveyResponses)
              // Also support legacy/alternative keys (qolSurvey, qol_survey)
              const qolData = importedData.qolSurveyResponses || importedData.qolSurvey || importedData.qol_survey;

              if (qolData) {
                for (const [userId, responses] of Object.entries(qolData)) {
                  await adapter.saveQolSurveyResponse(userId, responses as QolSurveyResponseEntity);
                }
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

            alert('Data imported successfully!');
            // Trigger a reload or state update if necessary
            window.location.reload();
          } catch (error) {
            console.error("Import error:", error);
            alert('Error importing data. Please check the file format.');
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
