import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { useReminderStore } from '@/hooks/useReminders';
import { useUserSettings } from '@/hooks/useUserSettings';
import { getPersistenceAdapter, getSelectedMode } from '@/lib/persistence-factory';
import { convertEntitiesToTasks } from '@/lib/task-conversions';
import { getAllTemplates } from '@/lib/task-templates';
import { CURRENT_SCHEMA_VERSION } from '@/lib/apply-imported-data';
import { areRankingResultsVisible, isVoteAnonymous, redactRankingSubmissionForBackup } from '@/lib/vote-ranking';
import { VoteResponseEntity, VoteLoop, VoteModerator, VoteRankingSubmission } from '@/lib/persistence-types';

const DataExporter: React.FC = () => {
  const { t } = useTranslation();
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
        wipLimitPerUser: appSettings.wipLimitPerUser,
      };

      // Fetch Fertilization Board state
      const fertilizationBoardState = await adapter.getFertilizationBoardState();

      // Fetch Dream Board state
      const dreamBoardState = await adapter.getDreamBoardState();

      // Fetch Salary Board state
      const salaryBoardState = await adapter.getSalaryBoardState();

      // Fetch sprint ceremony state
      const sprintState = await adapter.getSprintState();

      // Fetch ALL reminders
      const allReminders = await adapter.listReminders();

      // Fetch ALL circles
      const allCircles = await adapter.listCircles();

      // Fetch ALL frameworks
      const allFrameworks = await adapter.listFrameworks();

      // Fetch ALL votes from persistence
      const allVotes = await adapter.listVotes();

      // Fetch ALL pomodoro/focus sessions
      const allPomodoroSessions = await adapter.listPomodoroSessions();

      // Fetch vote responses, loops, moderators, and ranking ballots for each vote
      const allVoteResponses: VoteResponseEntity[] = [];
      const allVoteLoops: VoteLoop[] = [];
      const allVoteModerators: VoteModerator[] = [];
      const allVoteRankingSubmissions: VoteRankingSubmission[] = [];
      // The bulk ballot read withholds a hidden (OPEN) vote's ballots from
      // non-moderators, so a backup must present a moderator token or it would
      // silently omit those ballots. Reuse the active moderator tokens that are
      // already part of the export to keep the backup complete.
      const moderatorTokenByVote = new Map<string, string>();
      for (const vote of allVotes) {
        const responses = await adapter.listVoteResponses(vote.id);
        allVoteResponses.push(...responses);
        const loops = await adapter.listVoteLoops(vote.id);
        allVoteLoops.push(...loops);
        const moderators = await adapter.listVoteModerators(vote.id);
        allVoteModerators.push(...moderators);
        const activeModerator = moderators.find(moderator => moderator.active && moderator.token);
        if (activeModerator) moderatorTokenByVote.set(vote.id, activeModerator.token);
      }

      // Fetch ballots for every vote, not only those currently in
      // COMPARATIVE_PRIORITIZATION mode: restore replaces ballots for every
      // vote id in the backup, so omitting a vote here would permanently
      // delete its stored ballots on restore. Votes with no ballots return
      // an empty list. Ballots are the app's largest dataset, so fetch them
      // concurrently instead of one serial request per vote.
      const rankingsByVote = await Promise.all(
        allVotes.map(async vote => {
          const rankings = await adapter.listVoteRankingSubmissions(
            vote.id,
            userId,
            moderatorTokenByVote.get(vote.id),
          );
          // Never export the participant credential; restore reissues a fresh token.
          // Anonymous votes (including an absent flag) must also drop identities.
          const anonymous = isVoteAnonymous(vote.config);
          return rankings.map(item => redactRankingSubmissionForBackup(item, anonymous));
        }),
      );
      allVoteRankingSubmissions.push(...rankingsByVote.flat());

      // A hidden vote without any moderator token cannot be read by the backup
      // path, so its ballots are absent from the file. Surface that instead of
      // producing a silently incomplete backup that would lose data on restore.
      const unreadableRankingVotes = getSelectedMode() === 'server-sql'
        ? allVotes.filter(
            vote => !areRankingResultsVisible(vote) && !moderatorTokenByVote.has(vote.id),
          )
        : [];
      if (unreadableRankingVotes.length > 0) {
        alert(
          `Warning: ${unreadableRankingVotes.length} open vote(s) with hidden results have no moderator token, so their ballots may be missing from this backup. Assign a vote moderator or close/expose the results, then export again.`,
        );
      }

      // Fetch task templates (workspace + user scopes, localStorage-backed)
      const taskTemplates = getAllTemplates();

      const exportData = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        tasks: allTasks,
        scheduledReminders: allReminders,
        qolSurveyResponses: allQolSurveyResponses,
fertilizationBoard: fertilizationBoardState,
dreamBoard: dreamBoardState,
salaryBoard: salaryBoardState,
        sprintState,
        circles: allCircles,
        frameworks: allFrameworks,
        settings: settingsToExport,
        activeUserId: userId,
        allUserSettings,
        votes: allVotes,
        voteResponses: allVoteResponses,
        voteRankingSubmissions: allVoteRankingSubmissions,
        // Votes whose ballots could not be read are absent from this file, so
        // restore must not treat them as replaceable (that would delete stored
        // ballots the backup never contained).
        incompleteRankingVoteIds: unreadableRankingVotes.map(vote => vote.id),
        voteLoops: allVoteLoops,
        voteModerators: allVoteModerators,
        pomodoroSessions: allPomodoroSessions,
        taskTemplates,
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
      {isExporting ? t('data.exporting') : t('data.export')}
    </Button>
  );
};

export default DataExporter;
