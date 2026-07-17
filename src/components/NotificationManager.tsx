import React, { useEffect } from 'react';
import { useReminderStore } from '@/hooks/useReminders';
import { loadRemindersFromPersistence } from '@/hooks/useReminders';
import { useUserSettingsContext } from '@/context/UserSettingsContext';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useSettingsContext } from '@/context/SettingsContext';
import { addReminder } from '@/utils/reminders';
import type { Task } from '@/hooks/useTasks';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const BLOCKED_THRESHOLD_MS = 30 * 60 * 1000;
const AGING_REMINDER_PREFIX = 'aging:';
const BLOCKED_REMINDER_PREFIX = 'blocked:';

function getAgingLevel(task: Task, baseDays: number): 0 | 1 | 2 | 3 {
  if (!baseDays || baseDays <= 0) return 0;
  if (task.triageStatus === 'Done' || task.triageStatus === 'Dropped' || task.triageStatus === 'Archived') return 0;
  const timestamp = task.updatedAt ?? task.createdAt;
  if (!timestamp) return 0;
  const daysSinceUpdate = (Date.now() - timestamp) / MS_PER_DAY;
  if (daysSinceUpdate < 0) return 0;
  if (daysSinceUpdate < baseDays) return 0;
  if (daysSinceUpdate < baseDays * 2) return 1;
  if (daysSinceUpdate < baseDays * 3) return 2;
  return 3;
}

const AGING_MESSAGES: Record<number, string> = {
  1: 'This card is getting stale. Maybe time to act on it?',
  2: "This card hasn't moved in a while. Consider asking for support or reprioritizing.",
  3: 'This card has been idle for a long time. Is it still relevant? Consider dropping it or asking for help.',
};

export const NotificationManager: React.FC = () => {
    const { checkAndTriggerReminders, isNotified, markNotified, setUserId } = useReminderStore();
    const { userSettings, loading, completeOnboarding, userId } = useUserSettingsContext();
    const { tasks } = useAllTasks();
    const { settings } = useSettingsContext();
    const { dismissReminder, scheduledReminders } = useReminderStore();

    // 0. Sync userId + load persisted reminders when userId is available
    useEffect(() => {
        setUserId(userId || null);
        if (userId) {
            loadRemindersFromPersistence(userId);
        }
    }, [userId, setUserId]);

    // 1. Periodic check for scheduled reminders
    useEffect(() => {
        const interval = setInterval(() => {
            checkAndTriggerReminders();
        }, 60 * 1000);

        // Initial check on mount
        checkAndTriggerReminders();

        return () => clearInterval(interval);
    }, [checkAndTriggerReminders]);

    // 2. Handle Onboarding
    useEffect(() => {
        if (loading) return;

        if (!userSettings.hasCompletedOnboarding && tasks.length > 0) {
            completeOnboarding();
            const welcomeReminder = scheduledReminders.find(r => r.title === "Welcome to P3Fo!");
            if (welcomeReminder) {
                dismissReminder(welcomeReminder.id);
            }
            return;
        }

        if (!userSettings.hasCompletedOnboarding && tasks.length === 0) {
            addReminder({
                title: "Welcome to P3Fo!",
                description: "Don't forget to set up your first task.",
                persistent: true,
            });
        }
    }, [loading, userSettings.hasCompletedOnboarding, tasks.length, completeOnboarding, tasks, scheduledReminders, dismissReminder]);

    // 3. Condition-based triggers: aging transitions + blocked escalation
    useEffect(() => {
        if (loading || tasks.length === 0) return;

        const baseDays = settings.cardAgingBaseDays;
        const now = Date.now();

        for (const task of tasks) {
            if (task.triageStatus === 'Done' || task.triageStatus === 'Dropped' || task.triageStatus === 'Archived') continue;

            // Aging trigger
            const agingLevel = getAgingLevel(task, baseDays);
            if (agingLevel > 0) {
                const reminderKey = `${AGING_REMINDER_PREFIX}${task.id}:${agingLevel}`;
                if (!isNotified(reminderKey)) {
                    addReminder({
                        title: `Card aging: "${task.title}"`,
                        description: AGING_MESSAGES[agingLevel],
                        persistent: false,
                        taskId: task.id,
                    });
                    markNotified(reminderKey);
                }
            }

            // Blocked trigger
            if (task.triageStatus === 'Blocked' && task.blockedSince) {
                const blockedDuration = now - task.blockedSince;
                if (blockedDuration > BLOCKED_THRESHOLD_MS) {
                    const reminderKey = `${BLOCKED_REMINDER_PREFIX}${task.id}`;
                    if (!isNotified(reminderKey)) {
                        addReminder({
                            title: `Blocked: "${task.title}"`,
                            description: `You've been blocked for a while. Have you told someone? Consider asking for support or escalating.`,
                            persistent: false,
                            taskId: task.id,
                        });
                        markNotified(reminderKey);
                    }
                }
            }
        }
    }, [loading, tasks, settings.cardAgingBaseDays, isNotified, markNotified]);

    return null;
};