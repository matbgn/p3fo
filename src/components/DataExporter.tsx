import React, { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { useReminderStore } from '@/hooks/useReminders';
import { useUserSettings } from '@/hooks/useUserSettings';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { convertEntitiesToTasks } from '@/lib/task-conversions';
import { VoteResponseEntity, VoteLoop, VoteModerator } from '@/lib/persistence-types';

const DataExporter: React.FC = () => {
  const { allTasks: tasks } = useTasks();
  const { userId } = useUserSettings();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Get persistence adapter to fetch current data
      const adapter = await getPersistenceAdapter();

      // Fetch ALL tasks from persistence (ignoring current user filter)
      const allTaskEntities = await adapter.listTasks();
      const allTasks = convertEntitiesToTasks(allTaskEntities);

      // Fetch app settings from persistence
      const appSettings = await adapter.getAppSettings();

      // Fetch ALL QoL survey responses from persistence (for all users)
      const allQolSurveyResponses = await adapter.getAllQolSurveyResponses() || {};

      // Fetch ALL user settings
      const allUserSettings = await adapter.listUsers();

      // Map app settings to export format
      const settingsToExport = {
        userWorkloadPercentage: appSettings.userWorkloadPercentage?.toString(),
        weeksComputation: appSettings.weeksComputation?.toString(),
        highImpactTaskGoal: appSettings.highImpactTaskGoal?.toString(),
        failureRateGoal: appSettings.failureRateGoal?.toString(),
        qliGoal: appSettings.qliGoal?.toString(),
        newCapabilitiesGoal: appSettings.newCapabilitiesGoal?.toString(),
        vacationLimitMultiplier: appSettings.vacationLimitMultiplier?.toString(),
        hourlyBalanceLimitUpper: appSettings.hourlyBalanceLimitUpper?.toString(),
        hourlyBalanceLimitLower: appSettings.hourlyBalanceLimitLower?.toString(),
        hoursToBeDoneByDay: appSettings.hoursToBeDoneByDay?.toString(),
        timezone: appSettings.timezone,
        country: appSettings.country,
        region: appSettings.region,
        splitTime: appSettings.splitTime?.toString(),
        cardAgingBaseDays: appSettings.cardAgingBaseDays?.toString(),
        disabledModules: appSettings.disabledModules,
      };

      // Fetch Fertilization Board state
      const fertilizationBoardState = await adapter.getFertilizationBoardState();

      // Fetch Dream Board state
      const dreamBoardState = await adapter.getDreamBoardState();

      // Fetch ALL reminders
      const allReminders = await adapter.listReminders();

      // Fetch ALL circles
      const allCircles = await adapter.listCircles();

      // Fetch ALL frameworks
      const allFrameworks = await adapter.listFrameworks();

      // Fetch ALL votes from persistence
      const allVotes = await adapter.listVotes();

      // Fetch vote responses, loops, and moderators for each vote
      const allVoteResponses: VoteResponseEntity[] = [];
      const allVoteLoops: VoteLoop[] = [];
      const allVoteModerators: VoteModerator[] = [];
      for (const vote of allVotes) {
        const responses = await adapter.listVoteResponses(vote.id);
        allVoteResponses.push(...responses);
        const loops = await adapter.listVoteLoops(vote.id);
        allVoteLoops.push(...loops);
        const moderators = await adapter.listVoteModerators(vote.id);
        allVoteModerators.push(...moderators);
      }

      const exportData = {
        schemaVersion: 2,
        tasks: allTasks,
        scheduledReminders: allReminders,
        qolSurveyResponses: allQolSurveyResponses,
        fertilizationBoard: fertilizationBoardState,
        dreamBoard: dreamBoardState,
        circles: allCircles,
        frameworks: allFrameworks,
        settings: settingsToExport,
        activeUserId: userId,
        allUserSettings,
        votes: allVotes,
        voteResponses: allVoteResponses,
        voteLoops: allVoteLoops,
        voteModerators: allVoteModerators,
      };

      const data = JSON.stringify(exportData, null, 2);

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'p3fo-export.json';
      document.body.appendChild(a); // Append to body to ensure click works
      a.click();
      document.body.removeChild(a); // Remove after click

      // Delay revocation to ensure download starts
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);


    } catch (error) {
      console.error('Error exporting data:', error);
      alert(`Failed to export data: ${error instanceof Error ? error.message : String(error)}`);
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
