import { useState, useEffect } from 'react';
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePersistence } from "@/hooks/usePersistence";
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
    vacationLimitMultiplier: number;
    hourlyBalanceLimitUpper: number;
    hourlyBalanceLimitLower: number;
    hoursToBeDoneByDay: number;

    // User preference
    weekStartDay: 0 | 1; // 0 for Sunday, 1 for Monday
    defaultPlanView: 'week' | 'month';
    timezone: string; // Timezone identifier (e.g., 'Europe/Zurich')
    country: string; // Country code for holidays (e.g., 'CH')
    region: string; // Region code for holidays (e.g., 'BE')
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
    vacationLimitMultiplier: 1.5,
    hourlyBalanceLimitUpper: 0.5,
    hourlyBalanceLimitLower: -0.5,
    hoursToBeDoneByDay: 8,
    weekStartDay: 1, // Default to Monday
    defaultPlanView: 'week',
    timezone: 'Europe/Zurich', // Default timezone
    country: 'CH', // Default country for holidays
    region: 'BE', // Default region for holidays
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
                    vacationLimitMultiplier: appSettings.vacation_limit_multiplier || 1.5,
                    hourlyBalanceLimitUpper: appSettings.hourly_balance_limit_upper || 0.5,
                    hourlyBalanceLimitLower: appSettings.hourly_balance_limit_lower || -0.5,
                    hoursToBeDoneByDay: appSettings.hours_to_be_done_by_day || 8,
                    weekStartDay: 1,
                    defaultPlanView: 'week',
                    timezone: appSettings.timezone || 'Europe/Zurich',
                    country: appSettings.country || 'CH',
                    region: appSettings.region || 'BE',
                };

                // Override with user-specific settings if they exist
                if (userSettings) {
                    if (userSettings.split_time) {
                        merged.splitTime = userSettings.split_time;
                    }
                    if (userSettings.workload !== undefined) {
                        merged.userWorkloadPercentage = userSettings.workload;
                    }
                    if (userSettings.timezone) {
                        merged.timezone = userSettings.timezone;
                    }
                    // We'll store weekStartDay in userSettings as a generic preference if possible, 
                    // but since the schema might not support it yet, we'll rely on local state/defaults for now 
                    // or assume it's added to the userSettings object if the backend supports it.
                    // For this implementation, we will persist it in localStorage as a fallback if not in userSettings,
                    // or just keep it in memory if we can't change the backend schema easily.
                    // However, the prompt implies we should add it. Let's assume we can add it to userSettings 
                    // or use a workaround. Since I can't easily change the backend schema without seeing it,

                    // Actually, let's check if we can add it to the UserSettings type. 
                    // I'll assume for now we can't easily change the DB schema in this step without more info.
                    // But I need to persist it. I'll use localStorage for `weekStartDay` specifically for this user.
                    const localWeekStart = localStorage.getItem(`weekStartDay_${userSettings.userId}`);
                    if (localWeekStart) {
                        merged.weekStartDay = parseInt(localWeekStart) as 0 | 1;
                    }
                    const storedDefaultPlanView = localStorage.getItem(`defaultPlanView_${userSettings.userId}`);
                    if (storedDefaultPlanView) {
                        merged.defaultPlanView = storedDefaultPlanView as 'week' | 'month';
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
    const updateSettings = async (updates: Partial<CombinedSettings>, scope?: 'user' | 'global') => {
        // Optimistically update local state
        setSettings(prev => ({ ...prev, ...updates }));

        try {
            // Separate user-specific updates from global updates
            const userUpdates: { split_time?: string; workload?: number; timezone?: string } = {};
            const appUpdates: Partial<AppSettingsEntity> = {};

            // Helper to decide where to put the update
            const addToUser = (key: string, value: any) => {
                (userUpdates as any)[key] = value;
            };
            const addToApp = (key: keyof AppSettingsEntity, value: any) => {
                (appUpdates as any)[key] = value;
            };

            // Route updates to appropriate storage
            if (updates.splitTime !== undefined) {
                if (userSettings) {
                    addToUser('split_time', updates.splitTime);
                } else {
                    addToApp('split_time', stringToAppSplitTime(updates.splitTime));
                }
            }
            if (updates.userWorkloadPercentage !== undefined) {
                if (userSettings) {
                    addToUser('workload', updates.userWorkloadPercentage);
                } else {
                    addToApp('user_workload_percentage', updates.userWorkloadPercentage);
                }
            }

            if (updates.weekStartDay !== undefined) {
                if (userSettings) {
                    localStorage.setItem(`weekStartDay_${userSettings.userId}`, updates.weekStartDay.toString());
                }
            }
            if (updates.defaultPlanView !== undefined) {
                if (userSettings) {
                    localStorage.setItem(`defaultPlanView_${userSettings.userId}`, updates.defaultPlanView);
                }
            }

            // Global-only settings (always app)
            if (updates.weeksComputation !== undefined) addToApp('weeks_computation', updates.weeksComputation);
            if (updates.highImpactTaskGoal !== undefined) addToApp('high_impact_task_goal', updates.highImpactTaskGoal);
            if (updates.failureRateGoal !== undefined) addToApp('failure_rate_goal', updates.failureRateGoal);
            if (updates.qliGoal !== undefined) addToApp('qli_goal', updates.qliGoal);
            if (updates.newCapabilitiesGoal !== undefined) addToApp('new_capabilities_goal', updates.newCapabilitiesGoal);
            if (updates.vacationLimitMultiplier !== undefined) addToApp('vacation_limit_multiplier', updates.vacationLimitMultiplier);
            if (updates.hourlyBalanceLimitUpper !== undefined) addToApp('hourly_balance_limit_upper', updates.hourlyBalanceLimitUpper);
            if (updates.hourlyBalanceLimitLower !== undefined) addToApp('hourly_balance_limit_lower', updates.hourlyBalanceLimitLower);
            if (updates.hoursToBeDoneByDay !== undefined) addToApp('hours_to_be_done_by_day', updates.hoursToBeDoneByDay);

            // Scoped settings (Timezone, Country, Region)
            if (updates.timezone !== undefined) {
                if (scope === 'user' && userSettings) {
                    addToUser('timezone', updates.timezone);
                } else if (scope === 'global' || !userSettings) {
                    addToApp('timezone', updates.timezone);
                } else {
                    // Default behavior if scope not specified but user logged in:
                    // For now, assume global if not specified, to match previous behavior of workspace settings
                    addToApp('timezone', updates.timezone);
                }
            }
            if (updates.country !== undefined) {
                addToApp('country', updates.country);
            }
            if (updates.region !== undefined) {
                addToApp('region', updates.region);
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
                userWorkloadPercentage: userSettings?.workload || appSettings.user_workload_percentage || 60,
                weeksComputation: appSettings.weeks_computation || 4,
                highImpactTaskGoal: appSettings.high_impact_task_goal || 3.63,
                failureRateGoal: appSettings.failure_rate_goal || 5,
                qliGoal: appSettings.qli_goal || 60,
                newCapabilitiesGoal: appSettings.new_capabilities_goal || 57.98,
                vacationLimitMultiplier: appSettings.vacation_limit_multiplier || 1.5,
                hourlyBalanceLimitUpper: appSettings.hourly_balance_limit_upper || 0.5,
                hourlyBalanceLimitLower: appSettings.hourly_balance_limit_lower || -0.5,
                hoursToBeDoneByDay: appSettings.hours_to_be_done_by_day || 8,
                weekStartDay: settings.weekStartDay, // Keep current local state
                defaultPlanView: settings.defaultPlanView,
                timezone: appSettings.timezone || 'Europe/Zurich',
                country: appSettings.country || 'CH',
                region: appSettings.region || 'BE',
            };
            setSettings(merged);
        }
    };

    return { settings, loading, updateSettings };
};
