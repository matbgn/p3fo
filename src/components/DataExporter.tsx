import React, { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { useReminderStore } from '@/hooks/useReminders';
import { useUserSettings } from '@/hooks/useUserSettings';
import { getPersistenceAdapter } from '@/lib/persistence-factory';

const DataExporter: React.FC = () => {
  const { tasks } = useTasks();
  const { userId, userSettings } = useUserSettings();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Get persistence adapter to fetch current data
      const adapter = await getPersistenceAdapter();

      // Fetch app settings from persistence
      const appSettings = await adapter.getSettings();

      // Fetch QoL survey response from persistence
      const qolSurveyResponse = await adapter.getQolSurveyResponse() || {};

      // Map app settings to export format
      const settingsToExport = {
        userWorkloadPercentage: appSettings.user_workload_percentage?.toString(),
        weeksComputation: appSettings.weeks_computation?.toString(),
        highImpactTaskGoal: appSettings.high_impact_task_goal?.toString(),
        failureRateGoal: appSettings.failure_rate_goal?.toString(),
        qliGoal: appSettings.qli_goal?.toString(),
        newCapabilitiesGoal: appSettings.new_capabilities_goal?.toString(),
      };

      const exportData = {
        tasks,
        scheduledReminders: useReminderStore.getState().scheduledReminders,
        qolSurveyResponse,
        settings: settingsToExport,
        userSettings: {
          userId,
          ...userSettings,
        },
      };

      const data = JSON.stringify(exportData, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'p3fo-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button onClick={handleExport} disabled={isExporting}>
      {isExporting ? 'Exporting...' : 'Export Data'}
    </Button>
  );
};

export default DataExporter;
