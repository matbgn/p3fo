import React, { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReminderStore } from '@/hooks/useReminders';
import { getPersistenceAdapter } from '@/lib/persistence-factory';

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
              importTasks(importedData);
            } else if (importedData.tasks) {
              // New format
              importTasks(importedData.tasks);

              if (importedData.scheduledReminders) {
                useReminderStore.getState().setScheduledReminders(importedData.scheduledReminders);
                useReminderStore.getState().checkAndTriggerReminders();
              }

              // Import User Settings
              if (importedData.userSettings && importedData.userSettings.userId) {
                await adapter.updateUserSettings(importedData.userSettings.userId, importedData.userSettings);
              }

              // Import QoL Survey Responses (new format: all users)
              if (importedData.qolSurveyResponses) {
                for (const [userId, response] of Object.entries(importedData.qolSurveyResponses)) {
                  await adapter.saveQolSurveyResponse(userId, response as any);
                }
              } else if (importedData.qolSurveyResponse) {
                // Fallback for old format (single user)
                const targetUserId = importedData.userSettings?.userId;
                if (targetUserId) {
                  await adapter.saveQolSurveyResponse(targetUserId, importedData.qolSurveyResponse);
                } else {
                  console.warn("No userId found in imported data for QoL survey response. Skipping.");
                }
              }

              // Import App Settings
              if (importedData.settings) {
                // Map export format back to entity format if needed, or assume compatible
                // The export format used camelCase keys (userWorkloadPercentage), but entity uses snake_case (user_workload_percentage)
                // We need to map them back.
                const appSettings = {
                  user_workload_percentage: importedData.settings.userWorkloadPercentage ? Number(importedData.settings.userWorkloadPercentage) : undefined,
                  weeks_computation: importedData.settings.weeksComputation ? Number(importedData.settings.weeksComputation) : undefined,
                  high_impact_task_goal: importedData.settings.highImpactTaskGoal ? Number(importedData.settings.highImpactTaskGoal) : undefined,
                  failure_rate_goal: importedData.settings.failureRateGoal ? Number(importedData.settings.failureRateGoal) : undefined,
                  qli_goal: importedData.settings.qliGoal ? Number(importedData.settings.qliGoal) : undefined,
                  new_capabilities_goal: importedData.settings.newCapabilitiesGoal ? Number(importedData.settings.newCapabilitiesGoal) : undefined,
                };
                await adapter.updateSettings(appSettings);
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
