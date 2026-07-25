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
// Stable i18n key identifying the onboarding welcome reminder. We match on
// this (locale-independent) instead of a fake taskId, because the reminders
// table has a FOREIGN KEY on taskId → tasks(id) and "welcome:onboarding" is
// not a real task. Welcome reminders are stored with taskId = undefined.
export const WELCOME_REMINDER_TITLE_KEY = 'notifications.welcome.title';
// Kept for backward-compat with legacy persisted reminders that used the
// sentinel as a taskId before the FK-safe fix.
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
            // Match by the stable titleKey; also check legacy taskId sentinel
            // for reminders persisted before the FK-safe fix.
            const isWelcome = (r: { titleKey?: string; taskId?: string }) =>
                r.titleKey === WELCOME_REMINDER_TITLE_KEY || r.taskId === WELCOME_REMINDER_KEY;
            const welcomeReminder = [...reminders, ...scheduledReminders].find(isWelcome);
            if (welcomeReminder) {
                dismissReminder(welcomeReminder.id);
            }
            return;
        }

        if (!userSettings.hasCompletedOnboarding && tasks.length === 0) {
            // Avoid duplicates if the locale changed: check both active and
            // scheduled reminders for our welcome identifier before adding.
            const isWelcome = (r: { titleKey?: string; taskId?: string }) =>
                r.titleKey === WELCOME_REMINDER_TITLE_KEY || r.taskId === WELCOME_REMINDER_KEY;
            const existingWelcome = [...reminders, ...scheduledReminders].some(isWelcome);
            if (!existingWelcome) {
                addReminder({
                    title: t(WELCOME_REMINDER_TITLE_KEY),
                    description: t('notifications.welcome.description'),
                    titleKey: WELCOME_REMINDER_TITLE_KEY,
                    descriptionKey: 'notifications.welcome.description',
                    persistent: true,
                    // No taskId: the welcome reminder is not tied to a real
                    // task, and the reminders table enforces a FK on taskId.
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
                    const titleKey = 'notifications.aging.title';
                    const descriptionKey = agingMessageKey(level);
                    const titleParams = { title: task.title };
                    addReminder({
                        title: t(titleKey, titleParams),
                        description: t(descriptionKey),
                        titleKey,
                        titleParams,
                        descriptionKey,
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
                        const titleKey = 'notifications.blocked.title';
                        const descriptionKey = 'notifications.blocked.description';
                        const titleParams = { title: task.title };
                        addReminder({
                            title: t(titleKey, titleParams),
                            description: t(descriptionKey),
                            titleKey,
                            titleParams,
                            descriptionKey,
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