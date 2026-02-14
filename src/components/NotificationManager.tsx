import React, { useEffect } from 'react';
import { useReminderStore } from '@/hooks/useReminders';
import { useUserSettingsContext } from '@/context/UserSettingsContext';
import { useAllTasks } from '@/hooks/useAllTasks';
import { addReminder } from '@/utils/reminders';

export const NotificationManager: React.FC = () => {
    const { checkAndTriggerReminders } = useReminderStore();
    const { userSettings, loading, completeOnboarding } = useUserSettingsContext();
    const { tasks } = useAllTasks();
    const { dismissReminder, scheduledReminders } = useReminderStore();

    // 1. Periodic check for scheduled reminders
    useEffect(() => {
        const interval = setInterval(() => {
            checkAndTriggerReminders();
        }, 60 * 1000); // Check every minute

        // Initial check on mount
        checkAndTriggerReminders();

        return () => clearInterval(interval);
    }, [checkAndTriggerReminders]);

    // 2. Handle Onboarding
    useEffect(() => {
        if (loading) return;

        // Auto-complete onboarding if user already has tasks
        if (!userSettings.hasCompletedOnboarding && tasks.length > 0) {
            completeOnboarding();
            // Also try to find and dismiss the welcome reminder if it exists
            // We search in scheduled reminders (it's persistent)
            const welcomeReminder = scheduledReminders.find(r => r.title === "Welcome to P3Fo!");
            if (welcomeReminder) {
                dismissReminder(welcomeReminder.id);
            }
            return;
        }

        // Only show welcome message if truly new user (no tasks, no flag)
        if (!userSettings.hasCompletedOnboarding && tasks.length === 0) {
            // Check if we already have this reminder to avoid duplicates
            // The addReminder utility and store should also handle duplicates, but being explicit here helps.
            addReminder({
                title: "Welcome to P3Fo!",
                description: "Don't forget to set up your first task.",
                persistent: true,
                // No triggerDate means it triggers immediately
            });
        }
    }, [loading, userSettings.hasCompletedOnboarding, tasks.length, completeOnboarding, tasks, scheduledReminders, dismissReminder]);

    // Render nothing - this is a logic-only component
    return null;
};
