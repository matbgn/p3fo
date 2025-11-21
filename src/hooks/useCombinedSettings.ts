import { useState, useEffect } from 'react';
import { useCurrentUser } from '@/context/UserContext';
import { usePersistence } from '@/lib/PersistenceProvider';
import { AppSettingsEntity } from '@/lib/persistence-types';

/**
 * Combined settings interface that merges global and user-specific settings
 */
export interface CombinedSettings {
    // User-specific or global with user override
    splitTime: string;  // HH:MM format (e.g., "13:00")
    userWorkloadPercentage: number;  // 0-100

    // Global only
    weeksComputation: number;
    highImpactTaskGoal: number;
    failureRateGoal: number;
    qliGoal: number;
    newCapabilitiesGoal: number;
}

/**
 * Convert AppSettings split_time number to string format
 * AppSettings uses format like 40 = 4:00 PM = 16:00
 * Formula: hours = floor(split_time / 10), minutes = (split_time % 10) * 6
 */
export function appSplitTimeToString(splitTime: number): string {
    const hours = Math.floor(splitTime / 10);
    const minutes = (splitTime % 10) * 6;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Convert string format to AppSettings split_time number
 */
export function stringToAppSplitTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 10 + Math.floor(minutes / 6);
}

const defaultCombinedSettings: CombinedSettings = {
    splitTime: '13:00',
    userWorkloadPercentage: 60,
    weeksComputation: 4,
    highImpactTaskGoal: 3.63,
    failureRateGoal: 5,
    qliGoal: 60,
    newCapabilitiesGoal: 57.98,
};

/**
 * Hook that provides unified settings by merging global AppSettings with user-specific UserSettings.
 * User settings take precedence over global settings for overlapping fields.
 */
export const useCombinedSettings = () => {
    const { userSettings, updateUserSettings } = useCurrentUser();
    const persistence = usePersistence();
    const [settings, setSettings] = useState<CombinedSettings>(defaultCombinedSettings);
    const [loading, setLoading] = useState(true);

    // Load and merge settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Load global app settings
                const appSettings = await persistence.getSettings();

                // Start with global settings
                const merged: CombinedSettings = {
                    // Convert app settings to combined format
                    splitTime: appSplitTimeToString(appSettings.split_time || 40),
                    userWorkloadPercentage: appSettings.user_workload_percentage || 60,
                    weeksComputation: appSettings.weeks_computation || 4,
                    highImpactTaskGoal: appSettings.high_impact_task_goal || 3.63,
                    failureRateGoal: appSettings.failure_rate_goal || 5,
                    qliGoal: appSettings.qli_goal || 60,
                    newCapabilitiesGoal: appSettings.new_capabilities_goal || 57.98,
                };

                // Override with user-specific settings if they exist
                if (userSettings) {
                    if (userSettings.split_time) {
                        merged.splitTime = userSettings.split_time;
                    }
                    if (userSettings.workload_percentage !== undefined) {
                        merged.userWorkloadPercentage = userSettings.workload_percentage;
                    }
                }

                setSettings(merged);
            } catch (error) {
                console.error('Error loading combined settings:', error);
                setSettings(defaultCombinedSettings);
            } finally {
                setLoading(false);
            }
        };

        loadSettings();
    }, [persistence, userSettings]);

    /**
     * Update settings. User-specific fields (splitTime, userWorkloadPercentage) are saved
     * to user settings. Global fields are saved to app settings.
     */
    const updateSettings = async (updates: Partial<CombinedSettings>) => {
        // Optimistically update local state
        setSettings(prev => ({ ...prev, ...updates }));

        try {
            // Separate user-specific updates from global updates
            const userUpdates: { split_time?: string; workload_percentage?: number } = {};
            const appUpdates: Partial<AppSettingsEntity> = {};

            // Route updates to appropriate storage
            if (updates.splitTime !== undefined) {
                if (userSettings) {
                    userUpdates.split_time = updates.splitTime;
                } else {
                    // Only update app settings if no user is logged in
                    appUpdates.split_time = stringToAppSplitTime(updates.splitTime);
                }
            }
            if (updates.userWorkloadPercentage !== undefined) {
                if (userSettings) {
                    userUpdates.workload_percentage = updates.userWorkloadPercentage;
                } else {
                    // Only update app settings if no user is logged in
                    appUpdates.user_workload_percentage = updates.userWorkloadPercentage;
                }
            }

            // Global-only settings
            if (updates.weeksComputation !== undefined) {
                appUpdates.weeks_computation = updates.weeksComputation;
            }
            if (updates.highImpactTaskGoal !== undefined) {
                appUpdates.high_impact_task_goal = updates.highImpactTaskGoal;
            }
            if (updates.failureRateGoal !== undefined) {
                appUpdates.failure_rate_goal = updates.failureRateGoal;
            }
            if (updates.qliGoal !== undefined) {
                appUpdates.qli_goal = updates.qliGoal;
            }
            if (updates.newCapabilitiesGoal !== undefined) {
                appUpdates.new_capabilities_goal = updates.newCapabilitiesGoal;
            }

            // Save user-specific updates if any
            if (Object.keys(userUpdates).length > 0 && userSettings) {
                await updateUserSettings({
                    ...userSettings,
                    ...userUpdates,
                });
            }

            // Save app settings updates if any
            if (Object.keys(appUpdates).length > 0) {
                const currentAppSettings = await persistence.getSettings();
                await persistence.updateSettings({
                    ...currentAppSettings,
                    ...appUpdates,
                });
            }
        } catch (error) {
            console.error('Error saving combined settings:', error);
            // Revert optimistic update on error
            const appSettings = await persistence.getSettings();
            const merged: CombinedSettings = {
                splitTime: userSettings?.split_time || appSplitTimeToString(appSettings.split_time || 40),
                userWorkloadPercentage: userSettings?.workload_percentage || appSettings.user_workload_percentage || 60,
                weeksComputation: appSettings.weeks_computation || 4,
                highImpactTaskGoal: appSettings.high_impact_task_goal || 3.63,
                failureRateGoal: appSettings.failure_rate_goal || 5,
                qliGoal: appSettings.qli_goal || 60,
                newCapabilitiesGoal: appSettings.new_capabilities_goal || 57.98,
            };
            setSettings(merged);
        }
    };

    return { settings, loading, updateSettings };
};
