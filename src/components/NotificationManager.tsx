import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
// Stable key for the onboarding reminder, so we can find and dismiss it
// regardless of the current locale (the visible title is localized).
export const WELCOME_REMINDER_KEY = 'welcome:onboarding';

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

function agingMessageKey(level: 1 | 2 | 3): string {
  return `notifications.aging.level${level}`;
}

export const NotificationManager: React.FC = () => {
    const { t } = useTranslation();
    const { checkAndTriggerReminders, isNotified, markNotified, setUserId } = useReminderStore();
    const { userSettings, loading, completeOnboarding, userId } = useUserSettingsContext();
    const { tasks } = useAllTasks();
    const { settings } = useSettingsContext();
    const { dismissReminder, scheduledReminders, reminders } = useReminderStore();

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
            // Dismiss any welcome reminder (active or scheduled) regardless of locale.
            const welcomeReminder = [...reminders, ...scheduledReminders].find(
                r => r.taskId === WELCOME_REMINDER_KEY || r.title === t('notifications.welcome.title') || r.title === "Welcome to P3Fo!"
            );
            if (welcomeReminder) {
                dismissReminder(welcomeReminder.id);
            }
            return;
        }

        if (!userSettings.hasCompletedOnboarding && tasks.length === 0) {
            // Avoid duplicates if the locale changed: check both active and
            // scheduled reminders for our stable welcome key before adding.
            const existingWelcome = [...reminders, ...scheduledReminders].some(
                r => r.taskId === WELCOME_REMINDER_KEY
            );
            if (!existingWelcome) {
                addReminder({
                    title: t('notifications.welcome.title'),
                    description: t('notifications.welcome.description'),
                    persistent: true,
                    taskId: WELCOME_REMINDER_KEY,
                });
            }
        }
    }, [loading, userSettings.hasCompletedOnboarding, tasks.length, completeOnboarding, tasks, scheduledReminders, reminders, dismissReminder, t]);

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
                const level = agingLevel as 1 | 2 | 3;
                const reminderKey = `${AGING_REMINDER_PREFIX}${task.id}:${level}`;
                if (!isNotified(reminderKey)) {
                    addReminder({
                        title: t('notifications.aging.title', { title: task.title }),
                        description: t(agingMessageKey(level)),
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
                            title: t('notifications.blocked.title', { title: task.title }),
                            description: t('notifications.blocked.description'),
                            persistent: false,
                            taskId: task.id,
                        });
                        markNotified(reminderKey);
                    }
                }
            }
        }
    }, [loading, tasks, settings.cardAgingBaseDays, isNotified, markNotified, t]);

    return null;
};